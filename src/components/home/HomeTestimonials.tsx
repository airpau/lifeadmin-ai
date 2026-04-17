const TESTIMONIALS = [
  {
    initials: 'SB',
    name: 'Sarah B.',
    date: 'March 2026',
    quote: 'I had no idea I was still paying for a gym membership I cancelled two years ago. Paybacker found it instantly and drafted a refund letter. Got £180 back within a week.',
    color: '#34d399',
  },
  {
    initials: 'JM',
    name: 'James M.',
    date: 'March 2026',
    quote: 'The dispute letter for my energy bill was honestly better than anything I could have written myself. British Gas settled within 10 days. Absolutely worth it.',
    color: '#f59e0b',
  },
  {
    initials: 'PK',
    name: 'Priya K.',
    date: 'February 2026',
    quote: 'Finally something that makes me feel in control of my finances. The Money Hub shows me exactly where every pound is going and the budget alerts actually work.',
    color: '#818cf8',
  },
  {
    initials: 'TC',
    name: 'Tom C.',
    date: 'March 2026',
    quote: 'Used Paybacker to fight a parking charge that was clearly wrong. The appeal letter cited the exact BPA code of practice and the charge was cancelled. Free tier did the job.',
    color: '#34d399',
  },
  {
    initials: 'AO',
    name: 'Aisha O.',
    date: 'April 2026',
    quote: 'The Pocket Agent in Telegram is genuinely impressive. I asked how much I spent on coffee last month and got a full breakdown in seconds. It feels like having a finance assistant in my pocket.',
    color: '#f59e0b',
  },
];

export default function HomeTestimonials() {
  return (
    <section
      style={{
        background: '#f8fafc',
        padding: 'clamp(64px, 8vw, 96px) 0',
        overflow: 'hidden',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{ color: '#34d399', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
            Social proof
          </p>
          <h2 style={{
            fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif',
            fontSize: 'clamp(28px, 5vw, 40px)',
            fontWeight: 800,
            color: '#0f172a',
            letterSpacing: '-0.03em',
          }}>
            What our users say
          </h2>
        </div>
      </div>

      {/* Scroll carousel */}
      <div
        style={{
          display: 'flex',
          gap: '20px',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          paddingLeft: 'max(24px, calc((100vw - 1152px) / 2))',
          paddingRight: '24px',
          paddingBottom: '16px',
          scrollbarWidth: 'none',
        }}
      >
        {TESTIMONIALS.map((t, i) => (
          <div
            key={i}
            style={{
              flexShrink: 0,
              width: 'min(360px, 80vw)',
              scrollSnapAlign: 'start',
              background: '#ffffff',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {/* Stars */}
            <div style={{ display: 'flex', gap: '3px' }}>
              {[1, 2, 3, 4, 5].map(s => (
                <svg key={s} width="14" height="14" viewBox="0 0 14 14" fill="#f59e0b" aria-hidden="true">
                  <path d="M7 1L8.5 5H13L9.5 7.5L11 11L7 8.5L3 11L4.5 7.5L1 5H5.5L7 1Z" />
                </svg>
              ))}
            </div>

            {/* Quote */}
            <p style={{ color: '#334155', fontSize: '15px', lineHeight: 1.65, flex: 1 }}>
              &ldquo;{t.quote}&rdquo;
            </p>

            {/* Author */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: `${t.color}22`,
                border: `2px solid ${t.color}44`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: t.color,
                fontWeight: 700,
                fontSize: '12px',
                flexShrink: 0,
              }}>
                {t.initials}
              </div>
              <div>
                <p style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>{t.name}</p>
                <p style={{ fontSize: '12px', color: '#94a3b8' }}>{t.date}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Scroll hint */}
      <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '12px', marginTop: '16px' }}>
        Swipe to read more
      </p>
    </section>
  );
}
