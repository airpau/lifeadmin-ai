'use client';

/**
 * Mobile product mocks — phone-width-friendly static cards.
 *
 * The full demos in `./demos.tsx` are hand-tuned at a native 980x612 and
 * scaled down with `transform: scale()` on small screens, which renders
 * their text at ~3px on a 390px phone. These components are the mobile
 * replacements: authored responsively (width 100%, rem sizes, minimum
 * font size 12px), CSS-only (no rAF loops), and styled with the same
 * visual language (colours, type, chips) as the desktop demos.
 *
 * All figures are illustrative fixtures, consistent with the desktop
 * demo fixtures. No fabricated savings claims beyond what the demos
 * already show. Styles live in `./styles.css` under the `.pbm-` prefix,
 * scoped inside `.m-v2-root`.
 */

export function MoneyHubMobileMock() {
  const kpis = [
    { label: 'Income', value: '£2,940', tone: 'mint' },
    { label: 'Spent', value: '£2,213', tone: 'ink' },
    { label: 'Savings rate', value: '24%', tone: 'orange' },
  ];
  const cats = [
    { label: 'Bills', value: '£684', pct: 62, colour: '#06B6D4' },
    { label: 'Groceries', value: '£412', pct: 41, colour: '#3B82F6' },
    { label: 'Transport', value: '£238', pct: 26, colour: '#8B5CF6' },
    { label: 'Subscriptions', value: '£176', pct: 19, colour: '#F59E0B' },
  ];
  const bills = [
    { name: 'Thames Water', due: 'Due 22nd', value: '£44.84' },
    { name: 'ManyPets', due: 'Due 2nd', value: '£50.42' },
    { name: 'Patreon', due: 'Due 3rd', value: '£8.00' },
  ];
  return (
    <div className="pbm-card" role="img" aria-label="Money Hub preview: income, spending and expected bills in one view">
      <div className="pbm-head">
        <span className="pbm-head__title">Money Hub</span>
        <span className="pbm-chip pbm-chip--mint">
          <span className="pbm-dot pbm-dot--pulse" aria-hidden="true" />
          Synced
        </span>
      </div>
      <div className="pbm-kpis">
        {kpis.map((k) => (
          <div className="pbm-kpi" key={k.label}>
            <span className="pbm-kpi__label">{k.label}</span>
            <span className={`pbm-kpi__value pbm-kpi__value--${k.tone}`}>{k.value}</span>
          </div>
        ))}
      </div>
      <div className="pbm-bars">
        {cats.map((c) => (
          <div className="pbm-bar" key={c.label}>
            <div className="pbm-bar__row">
              <span className="pbm-bar__label">{c.label}</span>
              <span className="pbm-bar__value">{c.value}</span>
            </div>
            <div className="pbm-bar__track">
              <span
                className="pbm-bar__fill"
                style={{ width: `${c.pct}%`, background: c.colour }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="pbm-strip">
        <span className="pbm-strip__label">Expected bills</span>
        <div className="pbm-strip__rows">
          {bills.map((b) => (
            <div className="pbm-strip__row" key={b.name}>
              <span className="pbm-strip__name">{b.name}</span>
              <span className="pbm-strip__due">{b.due}</span>
              <span className="pbm-strip__amt">{b.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SubscriptionsMobileMock() {
  const rows = [
    { name: 'Virgin Media', meta: 'Broadband + TV', value: '£50.00', chip: { text: '↑ price rise', tone: 'red' } },
    { name: 'Spotify', meta: 'Music', value: '£11.99', chip: null },
    { name: 'Netflix', meta: 'Streaming', value: '£17.99', chip: null },
    { name: 'Aviva', meta: 'Car insurance', value: '£23.40', chip: null },
  ];
  return (
    <div className="pbm-card" role="img" aria-label="Subscriptions preview: recurring charges with a price rise flagged and one cancellation started">
      <div className="pbm-head">
        <span className="pbm-head__title">Subscriptions</span>
        <span className="pbm-chip pbm-chip--mint">1 cancellation started</span>
      </div>
      <div className="pbm-scan">
        <span className="pbm-scan__label">Scanning your bank for recurring charges</span>
        <div className="pbm-scan__track">
          <span className="pbm-scan__fill" />
        </div>
      </div>
      <div className="pbm-rows">
        {rows.map((r) => (
          <div className="pbm-row" key={r.name}>
            <div className="pbm-row__meta">
              <span className="pbm-row__name">{r.name}</span>
              <span className="pbm-row__sub">{r.meta}</span>
            </div>
            {r.chip && (
              <span className={`pbm-chip pbm-chip--${r.chip.tone}`}>{r.chip.text}</span>
            )}
            <span className="pbm-row__amt">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DisputesMobileMock() {
  return (
    <div className="pbm-card" role="img" aria-label="Disputes preview: a drafted letter citing the Consumer Rights Act with an expected refund of £312">
      <div className="pbm-head">
        <span className="pbm-head__title">Dispute letter</span>
        <span className="pbm-chip pbm-chip--mint">
          <span className="pbm-dot pbm-dot--pulse" aria-hidden="true" />
          Draft ready
        </span>
      </div>
      <div className="pbm-letter">
        <p className="pbm-letter__text">
          Dear Virgin Media,
          <br />
          I am writing to dispute the £12 increase applied to my monthly bill
          without adequate notice. Under the legislation cited below, I request
          a full refund of the charges billed in error&hellip;
        </p>
        <span className="pbm-chip pbm-chip--law">Consumer Rights Act 2015, s.49</span>
        <div className="pbm-letter__refund">
          <span>Expected refund</span>
          <strong>£312</strong>
        </div>
      </div>
      <div className="pbm-btn-row">
        <span className="pbm-btn pbm-btn--mint">Copy letter</span>
        <span className="pbm-btn pbm-btn--ghost">Link email thread</span>
      </div>
    </div>
  );
}

export function PocketAgentMobileMock() {
  return (
    <div className="pbm-card pbm-card--chat" role="img" aria-label="Pocket Agent preview: a WhatsApp chat answering a spending question and flagging a dispute reply">
      <div className="pbm-head">
        <span className="pbm-head__title">
          <span className="pbm-wa-dot" aria-hidden="true" />
          Pocket Agent · WhatsApp
        </span>
        <span className="pbm-chip pbm-chip--mint">
          <span className="pbm-dot pbm-dot--pulse" aria-hidden="true" />
          Online
        </span>
      </div>
      <div className="pbm-chat">
        <div className="pbm-bubble pbm-bubble--user">How much on food this month?</div>
        <div className="pbm-bubble pbm-bubble--bot">
          £412 across 23 transactions, 12% under your budget.
        </div>
        <div className="pbm-bubble pbm-bubble--alert">
          <span className="pbm-bubble__tag">Alert</span>
          E.ON replied to your dispute 2 minutes ago.
        </div>
      </div>
    </div>
  );
}
