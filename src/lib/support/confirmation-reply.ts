/**
 * Confirmation-reply handler.
 *
 * Called by every inbound channel (email, telegram, chatbot, eventually
 * whatsapp) when a user replies on a ticket whose status is
 * 'awaiting_user_confirmation'. Classifies the sentiment and routes:
 *
 *   positive  → mark resolved, thank user, founder Telegram ✅
 *   negative  → reset ticket to in_progress + re-escalate to Builder
 *               (with verbatim feedback as new escalation_summary so
 *                builder-pickup picks it up as iteration N+1)
 *   unclear   → ask one clarifying question. If we've already asked once
 *               (metadata.confirmation_clarify_count >= 1), escalate to
 *               founder for manual triage rather than nagging the user.
 *
 * Returns a structured result so the calling channel can send the right
 * acknowledgement message back to the user via their native transport.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { classifyConfirmationReply, ConfirmationSentiment } from './confirmation-classifier';

export interface ConfirmationHandlerResult {
  handled: boolean;
  outcome: 'resolved' | 'reescalated' | 'clarify_requested' | 'escalated_to_founder' | 'not_applicable';
  reply_to_user: string | null;
  ticket_number: string | null;
  classification: ConfirmationSentiment | null;
}

interface TicketRow {
  id: string;
  ticket_number: string | null;
  status: string;
  subject: string;
  source: string;
  metadata: Record<string, unknown> | null;
}

const POSITIVE_REPLY = (ref: string): string =>
  `Brilliant — glad to hear it's sorted. I'll close ${ref} now. If you spot anything else, just reply and we'll re-open it.`;

const NEGATIVE_REPLY = (ref: string): string =>
  `Sorry that didn't fix it. I've re-opened ${ref} and our developer is taking another look. We'll come back to you with another fix shortly.`;

const CLARIFY_REPLY = (ref: string): string =>
  `Just to confirm — is the original issue on ${ref} now resolved? Reply *yes* if it's working, or *no* (with what's still wrong) if not.`;

const ESCALATE_REPLY = (ref: string): string =>
  `Thanks for the reply — I've flagged ${ref} for our team to review personally and someone will be in touch.`;

async function notifyFounderTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(chatId),
        text: text.slice(0, 3800),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Check whether a ticket is awaiting user confirmation. Used to short-circuit
 * default reply handling in inbound channels.
 */
export function isAwaitingConfirmation(status: string | null | undefined): boolean {
  return status === 'awaiting_user_confirmation';
}

/**
 * Process a user reply on an awaiting_user_confirmation ticket.
 *
 * @returns ConfirmationHandlerResult with reply_to_user that the calling
 *          channel should send back to the user.
 */
export async function handleConfirmationReply(
  supabase: SupabaseClient,
  ticket: TicketRow,
  userReply: string,
): Promise<ConfirmationHandlerResult> {
  if (!isAwaitingConfirmation(ticket.status)) {
    return {
      handled: false,
      outcome: 'not_applicable',
      reply_to_user: null,
      ticket_number: ticket.ticket_number,
      classification: null,
    };
  }
  const ref = ticket.ticket_number || ticket.id.slice(0, 8).toUpperCase();
  const classification = await classifyConfirmationReply(userReply);
  const meta = (ticket.metadata || {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  if (classification === 'positive') {
    // Close the loop — user confirmed the fix.
    await supabase
      .from('support_tickets')
      .update({
        status: 'resolved',
        resolved_at: now,
        metadata: {
          ...meta,
          user_confirmation_at: now,
          user_confirmation_text: userReply.slice(0, 500),
          user_confirmation_classification: 'positive',
        },
        updated_at: now,
      })
      .eq('id', ticket.id);

    await supabase.from('business_log').insert({
      category: 'win',
      title: `Ticket ${ref} confirmed fixed by user`,
      content: `User reply: "${userReply.slice(0, 200)}". Builder fix landed and user confirmed it works. Ticket auto-closed.`,
      created_by: 'confirmation-reply',
    });

    await notifyFounderTelegram(
      `✅ <b>User confirmed fix — ticket closed</b>\n${ref}: ${ticket.subject}\nUser reply: <i>"${userReply.slice(0, 200)}"</i>`,
    );

    return {
      handled: true,
      outcome: 'resolved',
      reply_to_user: POSITIVE_REPLY(ref),
      ticket_number: ref,
      classification,
    };
  }

  if (classification === 'negative') {
    // Re-escalate. Reset to in_progress, mark for Human Required (Riley's
    // escalation marker), and stuff the user's verbatim feedback into
    // escalation_summary so builder-pickup uses it as the iteration N+1 prompt.
    const priorIter = (meta.iteration as number | undefined) ?? 1;
    const priorFixType =
      (meta.fix_type as string | undefined) ||
      (meta.escalation_fix_type as string | undefined) ||
      'code_fix';

    await supabase
      .from('support_tickets')
      .update({
        status: 'in_progress',
        assigned_to: 'Human Required',
        resolved_at: null,
        metadata: {
          ...meta,
          fix_type: priorFixType,
          escalation_fix_type: priorFixType,
          // Verbatim user feedback drives Builder's next iteration.
          escalation_summary: `User reports fix did not work: "${userReply.slice(0, 1000)}"`,
          escalation_priority: 'high',
          last_user_reply_at: now,
          last_user_negative_at: now,
          confirmation_negative_count: ((meta.confirmation_negative_count as number | undefined) || 0) + 1,
          iteration: priorIter + 1,
        },
        updated_at: now,
      })
      .eq('id', ticket.id);

    await supabase.from('business_log').insert({
      category: 'escalation',
      title: `Ticket ${ref} — user reports fix did not work, re-escalating to Builder`,
      content: `User feedback: "${userReply.slice(0, 500)}". Set status=in_progress + assigned_to=Human Required so builder-pickup picks it up next 30-min cycle as iteration ${priorIter + 1}.`,
      created_by: 'confirmation-reply',
    });

    await notifyFounderTelegram(
      `🔁 <b>User reports still broken — re-escalating to Builder</b>\n${ref}: ${ticket.subject}\nIteration: ${priorIter + 1}\n\nUser feedback:\n<i>"${userReply.slice(0, 600)}"</i>`,
    );

    return {
      handled: true,
      outcome: 'reescalated',
      reply_to_user: NEGATIVE_REPLY(ref),
      ticket_number: ref,
      classification,
    };
  }

  // unclear — ask once, then escalate to founder if still unclear.
  const clarifyCount = (meta.confirmation_clarify_count as number | undefined) || 0;
  if (clarifyCount >= 1) {
    // Already asked once; bail to founder.
    await supabase
      .from('support_tickets')
      .update({
        status: 'in_progress',
        assigned_to: 'Human Required',
        metadata: {
          ...meta,
          confirmation_escalated_to_founder_at: now,
          confirmation_clarify_count: clarifyCount + 1,
          last_user_reply_at: now,
        },
        updated_at: now,
      })
      .eq('id', ticket.id);

    await notifyFounderTelegram(
      `⚠️ <b>Confirmation reply unclear ×2 — needs human review</b>\n${ref}: ${ticket.subject}\nLatest user reply: <i>"${userReply.slice(0, 400)}"</i>`,
    );

    return {
      handled: true,
      outcome: 'escalated_to_founder',
      reply_to_user: ESCALATE_REPLY(ref),
      ticket_number: ref,
      classification,
    };
  }

  // First unclear reply — ask one clarifying question, stay in
  // awaiting_user_confirmation so the next reply gets re-classified.
  await supabase
    .from('support_tickets')
    .update({
      metadata: {
        ...meta,
        confirmation_clarify_count: clarifyCount + 1,
        last_user_reply_at: now,
      },
      updated_at: now,
    })
    .eq('id', ticket.id);

  return {
    handled: true,
    outcome: 'clarify_requested',
    reply_to_user: CLARIFY_REPLY(ref),
    ticket_number: ref,
    classification,
  };
}
