'use client';

// ConnectionHub — the single most prominent setup surface on the
// dashboard overview. Connecting a bank and an email are the two
// actions that unlock everything else (subscription detection, price
// rise alerts, inbox refund scanning), yet they used to live in a
// small right-rail card that phone users only reached after 1200px of
// scrolling. This hub renders full-width near the top of the overview
// whenever either connection is missing, and disappears entirely once
// both are done.
//
// Deliberately dumb: connection state and the bank picker opener are
// passed in as props so the dashboard page keeps sole ownership of
// data fetching and modal state. Email OAuth starts are plain links,
// rendered directly here:
//   Gmail   → /api/auth/google    (tier cap enforced server-side)
//   Outlook → /api/auth/microsoft (canonical Outlook route: same tier
//             cap as Gmail plus a not-configured guard; the older
//             /api/outlook/auth route has neither)

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Building2, CheckCircle2, Mail } from 'lucide-react';

interface ConnectionHubProps {
  bankConnected: boolean;
  emailConnected: boolean;
  /** Number of bank connections currently syncing (status === 'active'). */
  activeBankCount: number;
  /** Opens the BankPickerModal owned by the dashboard page. */
  onConnectBank: () => void;
}

const tileStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid var(--divider)',
  borderRadius: 12,
  padding: '18px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minWidth: 0,
};

const tileIconStyle = (bg: string): CSSProperties => ({
  width: 40,
  height: 40,
  borderRadius: 10,
  background: bg,
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

const providerBtnStyle: CSSProperties = {
  flex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '11px 12px',
  background: '#fff',
  border: '1px solid var(--divider)',
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--text)',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

const providerBadgeStyle = (bg: string): CSSProperties => ({
  width: 16,
  height: 16,
  borderRadius: 4,
  background: bg,
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  fontWeight: 800,
  flexShrink: 0,
});

function ConnectedBadge({ detail }: { detail: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        background: 'var(--mint-wash)',
        border: '1px solid #86EFAC',
        borderRadius: 9,
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--mint-deep)',
        alignSelf: 'flex-start',
      }}
    >
      <CheckCircle2 className="h-4 w-4" style={{ flexShrink: 0 }} />
      Connected
      <span style={{ fontWeight: 500, color: 'var(--text-2)' }}>{detail}</span>
    </div>
  );
}

export default function ConnectionHub({
  bankConnected,
  emailConnected,
  activeBankCount,
  onConnectBank,
}: ConnectionHubProps) {
  // Both done: the hub has served its purpose. Defensive guard so a
  // stray render with both flags true never shows an empty shell.
  if (bankConnected && emailConnected) return null;

  const connectedCount = (bankConnected ? 1 : 0) + (emailConnected ? 1 : 0);

  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        padding: '22px 24px',
        background: 'linear-gradient(135deg, var(--mint-wash), #D1FAE5)',
        border: '1px solid #86EFAC',
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-.015em', color: 'var(--text)' }}>
          Start finding money in 2 minutes
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Setup: {connectedCount} of 2 connected. Connect both so nothing gets missed.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
        }}
      >
        {/* ── Bank tile ─────────────────────────────────────────── */}
        <div style={tileStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={tileIconStyle('var(--mint-deep)')}>
              <Building2 className="h-5 w-5" />
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--text)' }}>
              Connect your bank
            </div>
          </div>
          {bankConnected ? (
            <ConnectedBadge
              detail={`${activeBankCount || 1} bank${(activeBankCount || 1) === 1 ? '' : 's'} linked`}
            />
          ) : (
            <button
              onClick={onConnectBank}
              style={{
                alignSelf: 'flex-start',
                padding: '12px 18px',
                background: 'var(--mint-deep)',
                color: '#fff',
                border: 0,
                borderRadius: 9,
                fontSize: 13.5,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <Building2 className="h-4 w-4" /> Connect bank
            </button>
          )}
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>
            Read-only via Open Banking (FCA-authorised). We can only look, never touch.
          </p>
        </div>

        {/* ── Email tile ────────────────────────────────────────── */}
        <div style={tileStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={tileIconStyle('var(--orange)')}>
              <Mail className="h-5 w-5" />
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--text)' }}>
              Connect your email
            </div>
          </div>
          {emailConnected ? (
            <ConnectedBadge detail="Inbox scanning live" />
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a href="/api/auth/google?returnPath=/dashboard" style={providerBtnStyle}>
                  <span style={providerBadgeStyle('#EA4335')}>G</span> Gmail
                </a>
                <a href="/api/auth/microsoft?returnPath=/dashboard" style={providerBtnStyle}>
                  <span style={providerBadgeStyle('#0078D4')}>O</span> Outlook
                </a>
              </div>
              <Link
                href="/dashboard/profile?connect_email=true"
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--mint-deep)', textDecoration: 'none' }}
              >
                Other providers (Yahoo, iCloud, BT, Sky) →
              </Link>
            </>
          )}
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>
            We scan for overcharges, price rises and refund opportunities.
          </p>
        </div>
      </div>
    </div>
  );
}
