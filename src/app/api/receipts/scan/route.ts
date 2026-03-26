import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Accepted: JPEG, PNG, WebP, PDF' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB' },
        { status: 400 }
      );
    }

    // Read file as buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');

    // Determine file extension
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    };
    const ext = extMap[file.type] || 'jpg';
    const timestamp = Date.now();
    const storagePath = `receipts/${user.id}/${timestamp}.${ext}`;

    // Upload to Supabase Storage (media bucket)
    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('media')
      .getPublicUrl(storagePath);
    const imageUrl = urlData.publicUrl;

    // Send to Claude Vision for extraction
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const extractionPrompt = 'Extract from this receipt/bill: provider_name, total_amount (number only, no currency symbol), date (YYYY-MM-DD), receipt_type (bill/receipt/invoice/statement), line_items (array of {description, amount}), reference_number. Return ONLY valid JSON, no other text.';

    // Build content blocks - PDFs use document type, images use image type
    const contentBlocks: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

    if (file.type === 'application/pdf') {
      contentBlocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64Image,
        },
      });
    } else {
      const imageMimeType = file.type as 'image/jpeg' | 'image/png' | 'image/webp';
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMimeType,
          data: base64Image,
        },
      });
    }

    contentBlocks.push({
      type: 'text',
      text: extractionPrompt,
    });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: contentBlocks,
      }],
    });

    // Parse Claude's response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    let extractedData;
    try {
      // Strip any markdown code fences if present
      const cleaned = responseText.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
      extractedData = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse Claude response:', responseText);
      return NextResponse.json(
        { error: 'Failed to extract data from receipt. Please try a clearer image.' },
        { status: 422 }
      );
    }

    // Save to scanned_receipts table
    const { data: receipt, error: insertError } = await supabase
      .from('scanned_receipts')
      .insert({
        user_id: user.id,
        image_url: imageUrl,
        extracted_data: extractedData,
        provider_name: extractedData.provider_name || null,
        amount: extractedData.total_amount ? parseFloat(extractedData.total_amount) : null,
        receipt_date: extractedData.date || null,
        receipt_type: extractedData.receipt_type || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to save receipt' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: receipt.id,
      image_url: imageUrl,
      provider_name: extractedData.provider_name,
      amount: extractedData.total_amount,
      receipt_date: extractedData.date,
      receipt_type: extractedData.receipt_type,
      line_items: extractedData.line_items,
      reference_number: extractedData.reference_number,
      extracted_data: extractedData,
    });
  } catch (error: unknown) {
    console.error('Receipt scan error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
