import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

async function sendTelegram(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (!token || !chatId) return;
  // Split long messages to stay under Telegram's 4096 char limit
  const chunks: string[] = [];
  for (let i = 0; i < message.length; i += 4000) {
    chunks.push(message.slice(i, i + 4000));
  }
  for (const chunk of chunks) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: Number(chatId),
          text: chunk,
          parse_mode: 'Markdown',
        }),
      });
    } catch (err) {
      console.error('[analyze-chatbot-gaps] Telegram send failed:', err);
    }
  }
}

/**
 * Weekly chatbot gap analysis cron.
 * Finds questions the chatbot could not answer confidently in the past week,
 * groups them by theme using Claude Haiku, and reports to Paul via Telegram.
 * This is product intelligence: what are users asking for that we do not have yet?
 *
 * Schedule: Monday 6am
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Fetch unanswered or low-confidence questions from the past week
  const { data: gaps, error: gapsErr } = await supabase
    .from('chatbot_question_log')
    .select('question, confidence, unanswered, created_at')
    .gte('created_at', weekAgo.toISOString())
    .or('unanswered.eq.true,confidence.lt.0.5')
    .order('created_at', { ascending: false })
    .limit(200);

  if (gapsErr) {
    console.error('[analyze-chatbot-gaps] DB fetch failed:', gapsErr.message);
    return NextResponse.json({ error: gapsErr.message }, { status: 500 });
  }

  // Also grab overall stats for context
  const [
    { count: totalQuestions },
    { count: unansweredCount },
    { count: lowConfidenceCount },
  ] = await Promise.all([
    supabase.from('chatbot_question_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', weekAgo.toISOString()),
    supabase.from('chatbot_question_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', weekAgo.toISOString())
      .eq('unanswered', true),
    supabase.from('chatbot_question_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', weekAgo.toISOString())
      .lt('confidence', 0.5),
  ]);

  if (!gaps || gaps.length === 0) {
    const msg = `*Paybacker Chatbot Weekly Gap Report*\n\nNo unanswered or low-confidence questions this week. The chatbot handled all ${totalQuestions || 0} questions confidently.`;
    await sendTelegram(msg);
    await supabase.from('business_log').insert({
      category: 'analytics',
      title: 'Weekly chatbot gap analysis: no gaps found',
      content: `Total questions: ${totalQuestions || 0}. No unanswered questions.`,
      created_by: 'analyze_chatbot_gaps_cron',
    });
    return NextResponse.json({ ok: true, gaps: 0, total: totalQuestions || 0 });
  }

  // Use Claude Haiku to group by theme and extract product insights
  const questionList = gaps.map(g => g.question).join('\n');

  const aiResponse = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are analysing chatbot questions that users asked but the bot could not answer confidently. These are questions from users of Paybacker, a UK consumer rights and savings platform.

Group these questions into themes. For each theme, identify:
1. The topic users are asking about
2. Whether this is a MISSING FEATURE (something Paybacker does not offer yet) or MISSING DOCUMENTATION (feature exists but bot needs better info about it)
3. How many questions fall into this theme

Return ONLY a JSON array:
[{"theme": "short theme name", "count": N, "type": "missing_feature|missing_docs", "example_questions": ["q1", "q2"], "recommendation": "one sentence on what to do"}]

Questions to analyse:
${questionList}`,
    }],
  });

  let themes: any[] = [];
  const content = aiResponse.content[0];
  if (content.type === 'text') {
    const raw = content.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        themes = JSON.parse(match[0]);
      } catch {
        themes = [];
      }
    }
  }

  // Build Telegram report
  const lines: string[] = [
    `*Paybacker Chatbot Weekly Gap Report*`,
    `Week ending: ${new Date().toLocaleDateString('en-GB')}`,
    ``,
    `*Overview:*`,
    `  Total questions: ${totalQuestions || 0}`,
    `  Unanswered: ${unansweredCount || 0}`,
    `  Low confidence: ${lowConfidenceCount || 0}`,
    `  Gap rate: ${totalQuestions ? Math.round(((gaps.length) / totalQuestions) * 100) : 0}%`,
    ``,
    `*Top themes where chatbot struggled:*`,
    ``,
  ];

  for (const t of themes.slice(0, 8)) {
    const icon = t.type === 'missing_feature' ? '🔴' : '🟡';
    lines.push(`${icon} *${t.theme}* (${t.count} questions)`);
    lines.push(`  Type: ${t.type === 'missing_feature' ? 'Missing feature' : 'Needs better docs'}`);
    lines.push(`  ${t.recommendation}`);
    if (t.example_questions?.length > 0) {
      lines.push(`  Example: "${t.example_questions[0]}"`);
    }
    lines.push('');
  }

  const missingFeatureCount = themes.filter(t => t.type === 'missing_feature').length;
  if (missingFeatureCount > 0) {
    lines.push(`*Action needed:* ${missingFeatureCount} theme(s) suggest missing features. Consider adding to the product roadmap.`);
  }

  await sendTelegram(lines.join('\n'));

  // Save to business_log
  await supabase.from('business_log').insert({
    category: 'analytics',
    title: 'Weekly chatbot gap analysis completed',
    content: `Total: ${totalQuestions || 0} questions. Gaps: ${gaps.length}. Themes identified: ${themes.length}. Missing features: ${missingFeatureCount}.`,
    created_by: 'analyze_chatbot_gaps_cron',
  });

  console.log(`[analyze-chatbot-gaps] Done. Gaps: ${gaps.length}, Themes: ${themes.length}`);
  return NextResponse.json({
    ok: true,
    total_questions: totalQuestions || 0,
    gaps_found: gaps.length,
    themes: themes.length,
    missing_features: missingFeatureCount,
  });
}
