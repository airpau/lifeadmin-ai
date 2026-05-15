/**
 * /unsubscribe — public success page that the unsubscribe API redirects to.
 * No auth, no account-data leakage. Just a clear message.
 */

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ ok?: string }>;
}

export default async function UnsubscribePage({ searchParams }: Props) {
  const params = await searchParams;
  const ok = params.ok === '1';

  return (
    <main
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        fontFamily:
          "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
        color: '#0B1220',
      }}
    >
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 16 }}>
          {ok ? 'You’re unsubscribed' : 'Unsubscribe link not recognised'}
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: '#374151' }}>
          {ok
            ? 'You won’t receive any more nurture emails from us. We’re sorry to see you go — if you ever change your mind, you can sign up at paybacker.co.uk anytime.'
            : 'That unsubscribe link doesn’t look valid or has already been used. If you’re still receiving emails you don’t want, please reply to any of them and a real person will sort it out.'}
        </p>
        <p style={{ marginTop: 32 }}>
          <a
            href="https://paybacker.co.uk"
            style={{ color: '#059669', fontWeight: 600, textDecoration: 'none' }}
          >
            Back to paybacker.co.uk
          </a>
        </p>
      </div>
    </main>
  );
}
