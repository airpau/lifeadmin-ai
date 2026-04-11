import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.GITHUB_WEBHOOK_SECRET || process.env.CRON_SECRET;
  
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { branch, errors } = await request.json();
    if (!branch || !errors) {
      return NextResponse.json({ error: 'Missing branch or errors in payload' }, { status: 400 });
    }

    const task = `CRITICAL FIX REQUIRED: Your previous code commit on branch '${branch}' failed to compile. The build checker returned these TypeScript errors:\n\n\`\`\`\n${errors}\n\`\`\`\n\nPlease locate the source of these errors within your recent changes and provide the corrected code.`;

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';
    
    // We send this to the developer agent async
    const res = await fetch(`${baseUrl}/api/developer/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CRON_SECRET}`
      },
      body: JSON.stringify({
        task,
        patchBranch: branch,
        context: 'SELF_HEALING_LOOP'
      })
    });
    
    const result = await res.json();
    return NextResponse.json({ ok: true, forwardedToAgent: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
