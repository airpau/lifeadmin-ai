/**
 * Morning digest email — combines price increase alerts and renewal reminders
 * into one email per user sent at 9am UTC.
 *
 * Design: dark navy (#0a1628) background, mint (#34d399) accents, white text.
 * Layout: fully table-based for Apple Mail + Outlook compatibility.
 */

export interface DigestPriceAlert {
  merchantNormalized: string;
  oldAmount: number;
  newAmount: number;
  increasePct: number;
  annualImpact: number;
}

export interface DigestRenewal {
  provider_name: string;
  amount: number;
  category: string | null;
  next_billing_date: string;
  billing_cycle: string;
  contract_type?: string | null;
  provider_type?: string | null;
  daysUntil: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toFixed(2); }

function urgencyColor(days: number): string {
  if (days <= 7) return '#f87171';
  if (days <= 14) return '#fb923c';
  return '#60a5fa';
}

function urgencyLabel(days: number): string {
  if (days <= 7) return 'Due in 7 days';
  if (days <= 14) return 'Due in 14 days';
  return 'Due in 30 days';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

// ─── section builders ─────────────────────────────────────────────────────────

function priceAlertRows(alerts: DigestPriceAlert[]): string {
  return alerts.map(a => `
    <tr>
      <td style="padding: 0 0 12px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
               bgcolor="#1a0f0f" style="background-color:#1a0f0f;border-radius:8px;">
          <tr>
            <td style="padding:14px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;">
                    ${a.merchantNormalized}
                  </td>
                  <td align="right"
                      style="font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#f87171;">
                    +${a.increasePct}%
                  </td>
                </tr>
                <tr>
                  <td style="font-family:Arial,sans-serif;font-size:12px;color:#94a3b8;padding-top:6px;">
                    &pound;${fmt(a.oldAmount)} &rarr;
                    <span style="color:#f87171;">&pound;${fmt(a.newAmount)}</span>
                  </td>
                  <td align="right"
                      style="font-family:Arial,sans-serif;font-size:12px;color:#94a3b8;padding-top:6px;">
                    +&pound;${fmt(a.annualImpact)}/yr
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:10px;">
                    <a href="https://paybacker.co.uk/dashboard/complaints?company=${encodeURIComponent(a.merchantNormalized)}&issue=${encodeURIComponent(`price increase from £${fmt(a.oldAmount)} to £${fmt(a.newAmount)}`)}"
                       style="font-family:Arial,sans-serif;font-size:12px;color:#34d399;text-decoration:underline;">
                      Write complaint letter &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join('');
}

function renewalRows(renewals: DigestRenewal[]): string {
  const sorted = [...renewals].sort((a, b) => a.daysUntil - b.daysUntil);
  return sorted.map(r => {
    const color = urgencyColor(r.daysUntil);
    const label = urgencyLabel(r.daysUntil);
    return `
    <tr>
      <td style="padding:0 0 8px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
               bgcolor="#0d1e3a" style="background-color:#0d1e3a;border-radius:8px;">
          <tr>
            <td style="padding:14px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;">
                    ${r.provider_name}
                  </td>
                  <td align="right"
                      style="font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;">
                    &pound;${fmt(r.amount)}
                  </td>
                </tr>
                <tr>
                  <td style="font-family:Arial,sans-serif;font-size:11px;color:#94a3b8;padding-top:4px;">
                    ${r.category || 'subscription'} &middot; ${formatDate(r.next_billing_date)}
                  </td>
                  <td align="right"
                      style="font-family:Arial,sans-serif;font-size:11px;padding-top:4px;">
                    <span style="background-color:${color}22;color:${color};
                                 padding:2px 8px;border-radius:4px;font-weight:bold;">
                      ${label}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }).join('');
}

// ─── main builder ─────────────────────────────────────────────────────────────

export function buildMorningDigestEmail(
  userName: string,
  priceAlerts: DigestPriceAlert[],
  renewals: DigestRenewal[],
): { subject: string; html: string } {
  const hasPriceAlerts = priceAlerts.length > 0;
  const hasRenewals = renewals.length > 0;
  const totalAnnualImpact = priceAlerts.reduce((s, a) => s + a.annualImpact, 0);

  // Subject line
  let subject: string;
  if (hasPriceAlerts && hasRenewals) {
    subject = `Morning update: ${priceAlerts.length} price ${priceAlerts.length === 1 ? 'increase' : 'increases'} + ${renewals.length} upcoming ${renewals.length === 1 ? 'renewal' : 'renewals'}`;
  } else if (hasPriceAlerts) {
    subject = priceAlerts.length === 1
      ? `Price increase: ${priceAlerts[0].merchantNormalized} went up ${priceAlerts[0].increasePct}%`
      : `${priceAlerts.length} price increases detected — costing you £${fmt(totalAnnualImpact)} extra/year`;
  } else {
    const urgent = renewals.filter(r => r.daysUntil <= 7);
    subject = urgent.length > 0
      ? `${renewals.length} ${renewals.length === 1 ? 'subscription renews' : 'subscriptions renew'} in ${urgent[0].daysUntil} days`
      : `Heads up: ${renewals.length} upcoming ${renewals.length === 1 ? 'renewal' : 'renewals'}`;
  }

  const priceSection = hasPriceAlerts ? `
    <!-- Price Increases Section -->
    <tr>
      <td style="padding-bottom:8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="padding-bottom:12px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td bgcolor="#f871711a"
                      style="background-color:#f871711a;border-radius:6px;padding:6px 14px;">
                    <span style="font-family:Arial,sans-serif;font-size:12px;
                                 font-weight:bold;color:#f87171;text-transform:uppercase;
                                 letter-spacing:0.06em;">
                      Price ${priceAlerts.length === 1 ? 'Increase' : 'Increases'} Detected
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${priceAlertRows(priceAlerts)}
          ${hasPriceAlerts && totalAnnualImpact > 0 ? `
          <tr>
            <td style="font-family:Arial,sans-serif;font-size:13px;color:#94a3b8;
                       padding:4px 0 16px;">
              These increases cost you an extra
              <strong style="color:#f87171;">&pound;${fmt(totalAnnualImpact)}/year</strong>.
              You may be able to dispute or switch.
            </td>
          </tr>` : ''}
        </table>
      </td>
    </tr>` : '';

  const hasSubscriptionRenewals = renewals.some(r => {
    const ct = (r.contract_type || '').toLowerCase();
    const pt = (r.provider_type || '').toLowerCase();
    const cat = (r.category || '').toLowerCase();
    return !['loan','mortgage','lease'].includes(ct)
        && !['loan','mortgage','credit_card'].includes(pt)
        && !['loan','mortgage','credit_card','finance','debt'].includes(cat);
  });

  const renewalSection = hasRenewals ? `
    <!-- Renewal Reminders Section -->
    <tr>
      <td style="padding-bottom:8px;${hasPriceAlerts ? 'padding-top:8px;border-top:1px solid #1e3a5f;' : ''}">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="padding-bottom:12px;${hasPriceAlerts ? 'padding-top:16px;' : ''}">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td bgcolor="#34d3991a"
                      style="background-color:#34d3991a;border-radius:6px;padding:6px 14px;">
                    <span style="font-family:Arial,sans-serif;font-size:12px;
                                 font-weight:bold;color:#34d399;text-transform:uppercase;
                                 letter-spacing:0.06em;">
                      Upcoming Renewals
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${renewalRows(renewals)}
          ${hasSubscriptionRenewals ? `
          <tr>
            <td style="padding-top:12px;">
              <a href="https://paybacker.co.uk/dashboard/deals"
                 style="font-family:Arial,sans-serif;font-size:13px;color:#34d399;
                        text-decoration:underline;">
                Check for better deals before they renew &rarr;
              </a>
            </td>
          </tr>` : ''}
        </table>
      </td>
    </tr>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#0a1628;">
  <!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0"
    width="100%" bgcolor="#0a1628"><tr><td><![endif]-->
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
         bgcolor="#0a1628" style="background-color:#0a1628;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" width="600"
               style="max-width:600px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <span style="font-family:Arial,sans-serif;font-size:24px;font-weight:bold;
                           color:#ffffff;letter-spacing:-0.5px;">
                Pay<span style="color:#34d399;">backer</span>
              </span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td bgcolor="#0f2035" style="background-color:#0f2035;border-radius:16px;
                                         padding:28px 28px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">

                <!-- Greeting -->
                <tr>
                  <td style="font-family:Arial,sans-serif;font-size:15px;color:#e2e8f0;
                             line-height:1.5;padding-bottom:20px;">
                    Hi ${userName},<br>here is your morning financial update.
                  </td>
                </tr>

                ${priceSection}
                ${renewalSection}

                <!-- Primary CTA -->
                <tr>
                  <td align="center" style="padding-top:20px;">
                    <a href="https://paybacker.co.uk/dashboard"
                       style="display:inline-block;background-color:#34d399;
                              color:#0a1628;font-family:Arial,sans-serif;font-size:14px;
                              font-weight:bold;padding:14px 36px;border-radius:10px;
                              text-decoration:none;">
                      Open Dashboard
                    </a>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center"
                      style="font-family:Arial,sans-serif;font-size:11px;color:#475569;
                             line-height:1.8;">
                    Paybacker LTD &middot;
                    <a href="https://paybacker.co.uk" style="color:#475569;">paybacker.co.uk</a>
                    <br>
                    <a href="https://paybacker.co.uk/dashboard/profile"
                       style="color:#34d399;text-decoration:none;">Manage email preferences</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
  <!--[if mso | IE]></td></tr></table><![endif]-->
</body>
</html>`;

  return { subject, html };
}
