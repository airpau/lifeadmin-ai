import type { Metadata } from 'next';
import Link from 'next/link';
import { MarkNav, MarkFoot } from '@/app/blog/_shared';
import '../../(marketing)/styles.css';
import './docs.css';

export const metadata: Metadata = {
  title: 'Connect Paybacker to your desktop AI assistant',
  description:
    'Ask your desktop AI assistant natural-language questions about your Paybacker data — transactions, subscriptions, budgets and net worth. Read-only, Pro feature.',
  openGraph: {
    title: 'Connect Paybacker to your desktop AI assistant',
    description:
      'Ask your desktop AI assistant natural-language questions about your Paybacker data — transactions, subscriptions, budgets and net worth.',
    url: 'https://paybacker.co.uk/docs/paybacker-assistant',
    siteName: 'Paybacker',
    type: 'article',
  },
  twitter: {
    card: 'summary',
    title: 'Connect Paybacker to your desktop AI assistant',
    description:
      'Ask your desktop AI assistant natural-language questions about your Paybacker data — transactions, subscriptions, budgets and net worth.',
    images: ['/logo.png'],
  },
  alternates: {
    canonical: 'https://paybacker.co.uk/docs/paybacker-assistant',
  },
};

const TOOLS: Array<{ name: string; blurb: string }> = [
  {
    name: 'get_transactions',
    blurb:
      'All your bank transactions, newest first. Your assistant can filter by date range and category.',
  },
  {
    name: 'get_subscriptions',
    blurb:
      "Every tracked subscription with monthly and annual totals so your assistant can answer 'what am I spending on streaming?'.",
  },
  {
    name: 'get_budget_summary',
    blurb:
      "This month's spending against each of your budget categories, with on-track / warning / over-budget status.",
  },
  {
    name: 'get_net_worth_snapshot',
    blurb:
      'Assets minus liabilities, plus progress against each of your savings goals.',
  },
  {
    name: 'get_open_disputes',
    blurb:
      "Every open complaint or dispute you've logged, including the amount being disputed.",
  },
  {
    name: 'search_transactions',
    blurb:
      "Free-text search across descriptions and merchants — 'did I pay Netflix last month?', 'how much did I spend at Tesco?'.",
  },
];

const EXAMPLE_PROMPTS: string[] = [
  'How much did I spend on food and drink last month?',
  'Summarise my subscriptions, highest first, and flag anything I probably forgot about.',
  'Am I over budget on anything this month?',
  'How close am I to my holiday savings goal?',
  'Did I pay British Gas twice in March?',
  "List every open dispute and tell me the total amount I'm trying to recover.",
];

export default function PaybackerAssistantDocsPage() {
  return (
    <div className="m-land-root">
      <MarkNav />
      <main>
        <div className="wrap">
          <section className="land-hero" style={{ paddingBottom: 32 }}>
            <span className="badge">
              Pro feature
              <span className="beta-pill">Beta</span>
            </span>
            <h1>Connect Paybacker to your desktop AI assistant</h1>
            <p className="subtitle">
              Ask natural-language questions about your own finances — transactions,
              subscriptions, budgets and net worth — without copying and pasting CSVs.
            </p>
          </section>

          <section className="prose-section" style={{ paddingTop: 24 }}>
            <div className="rights-card">
              <div className="prose-body" style={{ margin: 0 }}>
                <p>
                  Paybacker ships a small open-source MCP server that any MCP-compatible
                  desktop AI app can spawn locally. It reads your Paybacker data over HTTPS
                  using a personal access token you mint yourself. Read-only — your assistant
                  cannot move money, cancel anything or change your account.
                </p>
              </div>
            </div>
          </section>

          <section className="prose-section">
            <div className="rights-card">
              <h2>Before you start</h2>
              <ul className="rights-list">
                <li>
                  <strong>A Paybacker Pro plan.</strong> The Paybacker Assistant is a Pro-tier
                  feature. You can{' '}
                  <Link
                    href="/pricing"
                    style={{
                      color: 'var(--accent-mint-deep)',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    upgrade here
                  </Link>
                  .
                </li>
                <li>
                  <strong>An MCP-compatible desktop AI app</strong> installed on macOS or
                  Windows. Any desktop AI client that supports the open{' '}
                  <a
                    href="https://modelcontextprotocol.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--accent-mint-deep)',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Model Context Protocol
                  </a>{' '}
                  will work.
                </li>
                <li>
                  <strong>Node.js 18 or later.</strong> Most desktop AI apps ship with their
                  own Node runtime, so <code className="doc-code-inline">npx</code> will work
                  out of the box on most machines.
                </li>
              </ul>
            </div>
          </section>

          <section className="prose-section">
            <h2 style={{ textAlign: 'center' }}>Setup in four steps</h2>

            <div className="doc-step">
              <div className="doc-step-head">
                <div className="doc-step-num">1</div>
                <h2>Mint a personal access token</h2>
              </div>
              <p>
                In Paybacker, open{' '}
                <Link href="/dashboard/settings/mcp">
                  Settings → Paybacker Assistant (MCP)
                </Link>{' '}
                and click <strong>Generate token</strong>. Give it a name like
                &quot;MacBook&quot; or &quot;Work laptop&quot; so you can tell tokens apart
                if you revoke one later.
              </p>
              <p>
                You&apos;ll see the token <strong>exactly once</strong>. Copy it immediately
                — it starts with <code className="doc-code-inline">pbk_</code>. Paybacker
                only stores a hash, so we can&apos;t show it to you again if you lose it
                (you&apos;d just revoke it and mint a new one).
              </p>
              <div className="doc-note">
                Tokens expire after 180 days and you can have up to 10 active at once. Revoke
                any token instantly from the same settings page — the next request using it
                will fail with a clear error.
              </div>
            </div>

            <div className="doc-step">
              <div className="doc-step-head">
                <div className="doc-step-num">2</div>
                <h2>Run the one-command setup</h2>
              </div>
              <p>Open Terminal (macOS) or PowerShell (Windows) and run:</p>
              <pre className="doc-code">
                <code>npx @paybacker/mcp setup</code>
              </pre>
              <p>
                Paste the token when prompted. The setup script finds your AI app&apos;s MCP
                config file, adds a <code className="doc-code-inline">paybacker</code> entry
                under <code className="doc-code-inline">mcpServers</code>, and saves the
                token locally so your assistant can spawn the server with it. It doesn&apos;t
                touch any of your other MCP servers.
              </p>
              <details className="troubleshoot" style={{ marginTop: 12 }}>
                <summary>Prefer to edit the config yourself?</summary>
                <p>
                  Add this block to your AI desktop app&apos;s MCP config file (check your
                  app&apos;s docs for the exact path):
                </p>
                <pre
                  className="doc-code doc-code-small"
                  style={{ marginTop: 12, marginBottom: 0 }}
                >
                  <code>{`{
  "mcpServers": {
    "paybacker": {
      "command": "npx",
      "args": ["-y", "@paybacker/mcp"],
      "env": {
        "PAYBACKER_TOKEN": "pbk_YOUR_TOKEN_HERE"
      }
    }
  }
}`}</code>
                </pre>
              </details>
            </div>

            <div className="doc-step">
              <div className="doc-step-head">
                <div className="doc-step-num">3</div>
                <h2>Restart your AI desktop app</h2>
              </div>
              <p>
                Fully quit the app (not just close the window) and reopen it. When it starts,
                it will spawn the Paybacker MCP server in the background.
              </p>
              <p>
                You can confirm it&apos;s connected by opening a new chat and looking for{' '}
                <strong>&quot;paybacker&quot;</strong> in the tools menu. If you don&apos;t
                see it, see <a href="#troubleshooting">troubleshooting</a> below.
              </p>
            </div>

            <div className="doc-step">
              <div className="doc-step-head">
                <div className="doc-step-num">4</div>
                <h2>Ask Paybacker about your money</h2>
              </div>
              <p>Open a new chat in your AI desktop app and try one of these:</p>
              <div className="tool-list" style={{ marginBottom: 14 }}>
                {EXAMPLE_PROMPTS.map((p) => (
                  <div key={p} className="tool-card">
                    <p style={{ fontStyle: 'italic' }}>&ldquo;{p}&rdquo;</p>
                  </div>
                ))}
              </div>
              <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
                Your assistant will ask for permission the first time it uses each Paybacker
                tool. You can approve each tool individually, or allow the whole server for
                the session.
              </p>
            </div>
          </section>

          <section className="prose-section">
            <h2 style={{ textAlign: 'center' }}>What your assistant can see</h2>
            <p
              style={{
                textAlign: 'center',
                maxWidth: 640,
                margin: '0 auto 24px',
                color: 'var(--text-secondary)',
                fontSize: 15,
              }}
            >
              Every tool is read-only. None of them can change, move, or delete anything in
              your Paybacker account.
            </p>
            <div className="tool-list">
              {TOOLS.map((t) => (
                <div key={t.name} className="tool-card">
                  <code>{t.name}</code>
                  <p>{t.blurb}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="prose-section">
            <div className="rights-card">
              <h2>Security notes</h2>
              <ul className="rights-list">
                <li>
                  <strong>Your token stays on your machine.</strong> It&apos;s saved into
                  your AI app&apos;s MCP config file and only sent back to{' '}
                  <code className="doc-code-inline">paybacker.co.uk</code> over HTTPS.
                </li>
                <li>
                  <strong>We never see it in plaintext.</strong> Paybacker only stores a
                  SHA-256 hash of the token and a short prefix so you can identify it in the
                  UI.
                </li>
                <li>
                  <strong>Revoke any time.</strong> Revoke from{' '}
                  <Link
                    href="/dashboard/settings/mcp"
                    style={{
                      color: 'var(--accent-mint-deep)',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Settings → Paybacker Assistant
                  </Link>{' '}
                  and the next request will fail immediately.
                </li>
                <li>
                  <strong>Pro-gated on every call.</strong> If your Pro subscription lapses,
                  all tool calls start returning a clear &quot;MCP access requires an active
                  Pro plan&quot; error.
                </li>
                <li>
                  <strong>Open source.</strong> The{' '}
                  <code className="doc-code-inline">@paybacker/mcp</code> package is
                  MIT-licensed and available on{' '}
                  <a
                    href="https://github.com/airpau/paybacker-mcp"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--accent-mint-deep)',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    GitHub
                  </a>{' '}
                  — audit every line of code before you run it.
                </li>
              </ul>
            </div>
          </section>

          <section
            id="troubleshooting"
            className="prose-section"
            style={{ scrollMarginTop: 96 }}
          >
            <h2 style={{ textAlign: 'center' }}>Troubleshooting</h2>
            <div className="troubleshoot-list">
              <details className="troubleshoot">
                <summary>My AI app doesn&apos;t show the Paybacker tools</summary>
                <ul>
                  <li>Fully quit the app (not just close the window) and reopen.</li>
                  <li>
                    Open your app&apos;s MCP config file and confirm the{' '}
                    <code className="doc-code-inline">paybacker</code> entry is there under{' '}
                    <code className="doc-code-inline">mcpServers</code>.
                  </li>
                  <li>
                    Check the file is valid JSON (a missing comma will stop the app loading
                    any MCP server).
                  </li>
                  <li>
                    Re-run{' '}
                    <code className="doc-code-inline">npx @paybacker/mcp setup</code>.
                  </li>
                </ul>
              </details>
              <details className="troubleshoot">
                <summary>
                  Your assistant says &ldquo;Token revoked&rdquo; or &ldquo;Token
                  expired&rdquo;
                </summary>
                <p>
                  Generate a new token from{' '}
                  <Link href="/dashboard/settings/mcp">
                    Settings → Paybacker Assistant
                  </Link>{' '}
                  and run <code className="doc-code-inline">npx @paybacker/mcp setup</code>{' '}
                  again. Tokens expire after 180 days by default.
                </p>
              </details>
              <details className="troubleshoot">
                <summary>
                  Your assistant says &ldquo;MCP access requires an active Pro plan&rdquo;
                </summary>
                <p>
                  Your Paybacker subscription isn&apos;t currently Pro. You can{' '}
                  <Link href="/pricing">upgrade here</Link>. Your existing tokens will start
                  working again immediately once Pro is active.
                </p>
              </details>
              <details className="troubleshoot">
                <summary>
                  Nothing happens when I run{' '}
                  <code className="doc-code-inline">npx @paybacker/mcp setup</code>
                </summary>
                <p>
                  Check your Node version with{' '}
                  <code className="doc-code-inline">node --version</code>. You need 18 or
                  later. On macOS you can install Node with{' '}
                  <a
                    href="https://brew.sh"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Homebrew
                  </a>{' '}
                  (<code className="doc-code-inline">brew install node</code>).
                </p>
              </details>
            </div>
          </section>

          <section className="prose-section">
            <div className="final-cta">
              <h2>Ready to ask Paybacker about your money?</h2>
              <p>
                Upgrade to Pro, mint a token, and be chatting to your own transactions in
                under two minutes.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/dashboard/settings/mcp" className="btn btn-mint btn-lg">
                  Generate your token
                </Link>
                <Link
                  href="/pricing"
                  className="btn btn-lg"
                  style={{
                    background: 'transparent',
                    color: 'var(--text-on-ink)',
                    border: '1px solid rgba(255,255,255,0.25)',
                  }}
                >
                  See Pro pricing
                </Link>
              </div>
            </div>
          </section>

          <p className="doc-footnote">
            Source code:{' '}
            <a
              href="https://github.com/airpau/paybacker-mcp"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/airpau/paybacker-mcp
            </a>{' '}
            · Published on npm as{' '}
            <a
              href="https://www.npmjs.com/package/@paybacker/mcp"
              target="_blank"
              rel="noopener noreferrer"
            >
              @paybacker/mcp
            </a>
          </p>
        </div>
      </main>
      <MarkFoot />
    </div>
  );
}
