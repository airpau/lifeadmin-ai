import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf', 'application/octet-stream'];

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

    // Determine actual type - iOS sometimes sends wrong MIME or empty
    let fileType = file.type;
    const fileName = file.name?.toLowerCase() || '';
    if (!fileType || fileType === 'application/octet-stream') {
      if (fileName.endsWith('.pdf')) fileType = 'application/pdf';
      else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) fileType = 'image/jpeg';
      else if (fileName.endsWith('.png')) fileType = 'image/png';
      else if (fileName.endsWith('.webp')) fileType = 'image/webp';
      else if (fileName.endsWith('.heic') || fileName.endsWith('.heif')) fileType = 'image/jpeg'; // HEIC gets converted
      else fileType = 'image/jpeg'; // Default fallback
    }
    // Treat HEIC as JPEG for Claude (iOS converts on upload)
    if (fileType === 'image/heic' || fileType === 'image/heif') fileType = 'image/jpeg';

    if (!ALLOWED_TYPES.includes(fileType) && !fileType.startsWith('image/')) {
      return NextResponse.json(
        { error: `File type "${fileType}" not supported. Upload JPEG, PNG, or PDF.` },
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
    const ext = extMap[fileType] || 'jpg';
    const timestamp = Date.now();
    const storagePath = `receipts/${user.id}/${timestamp}.${ext}`;

    // Upload to Supabase Storage (optional - don't block scan if it fails)
    const admin = getAdmin();
    let imageUrl = '';
    try {
      const { error: uploadError } = await admin.storage
        .from('media')
        .upload(storagePath, buffer, {
          contentType: fileType,
          upsert: true,
        });

      if (!uploadError) {
        const { data: urlData } = admin.storage
          .from('media')
          .getPublicUrl(storagePath);
        imageUrl = urlData.publicUrl;
      } else {
        console.error('Storage upload error (non-blocking):', uploadError.message);
      }
    } catch (storageErr: any) {
      console.error('Storage error (non-blocking):', storageErr.message);
    }

    // Send to Claude Vision for extraction
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const extractionPrompt = 'Extract from this receipt/bill: provider_name, total_amount (number only, no currency symbol), date (YYYY-MM-DD), receipt_type (bill/receipt/invoice/statement), line_items (array of {description, amount}), reference_number. Return ONLY valid JSON, no other text.';

    // Build content blocks - PDFs use document type, images use image type
    const contentBlocks: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

    if (fileType === 'application/pdf') {
      contentBlocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64Image,
        },
      });
    } else {
      const imageMimeType = fileType as 'image/jpeg' | 'image/png' | 'image/webp';
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

    // Save to scanned_receipts table (non-blocking)
    let receiptId = null;
    try {
      const { data: receipt } = await admin
        .from('scanned_receipts')
        .insert({
          user_id: user.id,
          image_url: imageUrl || 'pending',
          extracted_data: extractedData,
          provider_name: extractedData.provider_name || null,
          amount: extractedData.total_amount ? parseFloat(extractedData.total_amount) : null,
          receipt_date: extractedData.date || null,
          receipt_type: extractedData.receipt_type || null,
        })
        .select('id')
        .single();
      receiptId = receipt?.id;
    } catch (dbErr: any) {
      console.error('DB save error (non-blocking):', dbErr.message);
    }

    // Always return the extracted data regardless of storage/DB success
    return NextResponse.json({
      id: receiptId,
      image_url: imageUrl || null,
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
