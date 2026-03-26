import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateUATDocument } from '@/lib/generate-uat-template';
import { Packer } from 'docx';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { projectName = 'Paybacker', version = '1.0', testDate = new Date().toLocaleDateString('en-GB') } = body;

    // Generate the Word document
    const doc = generateUATDocument({
      projectName,
      version,
      testDate,
    });

    // Convert to buffer
    const buffer = await Packer.toBuffer(doc);

    // Return the document as a downloadable file
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="Paybacker-UAT-TestPlan-${new Date().toISOString().split('T')[0]}.docx"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error generating UAT template:', error);
    return NextResponse.json(
      { error: 'Failed to generate UAT template' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Generate with default parameters
    const doc = generateUATDocument({
      projectName: 'Paybacker',
      version: '1.0',
      testDate: new Date().toLocaleDateString('en-GB'),
    });

    // Convert to buffer
    const buffer = await Packer.toBuffer(doc);

    // Return the document as a downloadable file
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="Paybacker-UAT-TestPlan-${new Date().toISOString().split('T')[0]}.docx"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error generating UAT template:', error);
    return NextResponse.json(
      { error: 'Failed to generate UAT template' },
      { status: 500 }
    );
  }
}