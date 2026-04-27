/**
 * Builds the right "Open in Email" URL based on what we know about the user.
 *
 * Priority order:
 *
 *   1. Gmail web compose — used when the user has a Google OAuth connection
 *      OR their account email is @gmail.com / @googlemail.com. Opens in
 *      Gmail web in a new tab. Works regardless of the OS default mail
 *      handler (which is the bug we're fixing — macOS routes mailto: to
 *      Mac Mail even when the user lives entirely in Gmail).
 *
 *   2. Outlook web compose — Microsoft 365 / Outlook.com users.
 *      Same idea: bypass the OS handler.
 *
 *   3. mailto: — fallback for everything else (uses the OS default).
 *
 * Thread-aware drafting (loading the letter as a reply in an existing
 * Watchdog-linked thread) requires the gmail.compose / gmail.modify scope
 * which we don't currently request. The compose URL approach below opens
 * a fresh compose window in Gmail; the user copies/pastes nothing — the
 * subject + body are pre-filled. To draft INTO an existing thread we'd
 * need /api/gmail/draft-reply which calls users.drafts.create with the
 * thread id. Tracked as a follow-up — for now this fixes the immediate
 * "wrong app launches" problem.
 */

export type EmailComposeContext = {
  /** Recipient email address. Optional — Gmail compose works without one. */
  to?: string | null;
  /** Pre-filled subject line. */
  subject: string;
  /** Pre-filled body. Plain text only — Gmail web compose ignores HTML in
   *  the body querystring and renders \n as line breaks. */
  body: string;
};

export type EmailComposeProvider = 'gmail' | 'outlook' | 'mailto';

export interface EmailComposeRoute {
  url: string;
  provider: EmailComposeProvider;
  /** Whether this URL should open in a new tab (Gmail/Outlook web) or
   *  hand off to the OS via mailto. */
  newTab: boolean;
}

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);
const OUTLOOK_DOMAINS = new Set([
  'outlook.com', 'hotmail.com', 'live.com',
  'msn.com', 'outlook.co.uk', 'hotmail.co.uk',
]);

function emailDomain(addr: string | null | undefined): string {
  if (!addr) return '';
  const at = addr.indexOf('@');
  return at < 0 ? '' : addr.slice(at + 1).toLowerCase();
}

/**
 * Pick the right compose URL.
 *
 * @param ctx        recipient + subject + body
 * @param signals    everything we know that hints at which client to use:
 *                     - userEmail: the user's account email
 *                     - hasGoogleConnection: true if /dashboard/profile shows
 *                       a Gmail connection. Stronger signal than userEmail
 *                       (a user can have a Gmail OAuth connection even when
 *                       their Paybacker account is on a non-Gmail address).
 *                     - hasOutlookConnection: same idea for Microsoft Graph.
 */
export function pickEmailCompose(
  ctx: EmailComposeContext,
  signals: {
    userEmail?: string | null;
    hasGoogleConnection?: boolean;
    hasOutlookConnection?: boolean;
  },
): EmailComposeRoute {
  const subject = encodeURIComponent(ctx.subject ?? '');
  const body = encodeURIComponent(ctx.body ?? '');
  const to = encodeURIComponent(ctx.to ?? '');

  const looksLikeGmail = !!signals.hasGoogleConnection
    || GMAIL_DOMAINS.has(emailDomain(signals.userEmail));
  const looksLikeOutlook = !looksLikeGmail
    && (!!signals.hasOutlookConnection
        || OUTLOOK_DOMAINS.has(emailDomain(signals.userEmail)));

  if (looksLikeGmail) {
    // view=cm forces compose mode; fs=1 makes the dialog full-screen
    // (otherwise it opens as the small bottom-right popup which can be
    // missed on a busy inbox).
    let url = `https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`;
    if (to) url += `&to=${to}`;
    return { url, provider: 'gmail', newTab: true };
  }

  if (looksLikeOutlook) {
    // Outlook web compose endpoint. The deep-link spec is undocumented but
    // stable since 2019: subject + body querystring fields populate the
    // compose form. `path=/mail/action/compose` tells Outlook to open
    // directly into compose mode (rather than the inbox).
    let url = `https://outlook.live.com/mail/0/deeplink/compose?subject=${subject}&body=${body}`;
    if (to) url += `&to=${to}`;
    return { url, provider: 'outlook', newTab: true };
  }

  // Fallback: mailto: hands off to the OS. Gives Mac Mail / Thunderbird /
  // whatever the user has configured. Better than nothing.
  let url = `mailto:${to}?subject=${subject}&body=${body}`;
  return { url, provider: 'mailto', newTab: false };
}
