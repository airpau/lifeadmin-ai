import type { Metadata } from "next";
import Link from "next/link";
import PublicNavbar from "@/components/PublicNavbar";

export const metadata: Metadata = {
  title: "Connect Paybacker to Claude Desktop",
  description:
    "Ask Claude Desktop natural-language questions about your Paybacker data — transactions, subscriptions, budgets and net worth. Read-only, Pro feature.",
  openGraph: {
    title: "Connect Paybacker to Claude Desktop",
    description:
      "Ask Claude Desktop natural-language questions about your Paybacker data — transactions, subscriptions, budgets and net worth.",
    url: "https://paybacker.co.uk/docs/claude-desktop",
    siteName: "Paybacker",
    type: "article",
  },
  twitter: {
    card: "summary",
    title: "Connect Paybacker to Claude Desktop",
    description:
      "Ask Claude Desktop natural-language questions about your Paybacker data — transactions, subscriptions, budgets and net worth.",
    images: ["/logo.png"],
  },
  alternates: {
    canonical: "https://paybacker.co.uk/docs/claude-desktop",
  },
};

const TOOLS: Array<{ name: string; blurb: string }> = [
  {
    name: "get_transactions",
    blurb:
      "All your bank transactions, newest first. Claude can filter by date range and category.",
  },
  {
    name: "get_subscriptions",
    blurb:
      "Every tracked subscription with monthly and annual totals so Claude can answer 'what am I spending on streaming?'.",
  },
  {
    name: "get_budget_summary",
    blurb:
      "This month's spending against each of your budget categories, with on-track / warning / over-budget status.",
  },
  {
    name: "get_net_worth_snapshot",
    blurb:
      "Assets minus liabilities, plus progress against each of your savings goals.",
  },
  {
    name: "get_open_disputes",
    blurb:
      "Every open complaint or dispute you've logged, including the amount being disputed.",
  },
  {
    name: "search_transactions",
    blurb:
      "Free-text search across descriptions and merchants — 'did I pay Netflix last month?', 'how much did I spend at Tesco?'.",
  },
];

const EXAMPLE_PROMPTS: string[] = [
  "How much did I spend on food and drink last month?",
  "Summarise my subscriptions, highest first, and flag anything I probably forgot about.",
  "Am I over budget on anything this month?",
  "How close am I to my holiday savings goal?",
  "Did I pay British Gas twice in March?",
  "List every open dispute and tell me the total amount I'm trying to recover.",
];

export default function ClaudeDesktopDocsPage() {
  return (
    <div className="min-h-screen bg-navy-950">
      <PublicNavbar />
      <div className="h-16" />

      <main className="container mx-auto px-4 md:px-6 py-10 md:py-16 max-w-3xl">
        {/* Hero */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-semibold tracking-wider uppercase text-mint-400 bg-mint-400/10 border border-mint-400/30 rounded-full px-3 py-1">
              Pro feature
            </span>
            <span className="text-xs text-slate-500">Beta</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
            Connect Paybacker to Claude Desktop
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed mb-4">
            Ask Claude natural-language questions about your own finances —
            transactions, subscriptions, budgets and net worth — without
            copying and pasting CSVs.
          </p>
          <p className="text-slate-400 leading-relaxed">
            Paybacker ships a small open-source MCP server that Claude Desktop
            can spawn locally. It reads your Paybacker data over HTTPS using a
            personal access token you mint yourself. Read-only — Claude cannot
            move money, cancel anything or change your account.
          </p>
        </div>

        {/* Prerequisites */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
            Before you start
          </h2>
          <ul className="space-y-3 text-slate-300">
            <li className="flex items-start gap-3">
              <span className="text-mint-400 mt-1">&#8226;</span>
              <span>
                <strong className="text-white">A Paybacker Pro plan.</strong>{" "}
                MCP access is a Pro-tier feature. You can{" "}
                <Link
                  href="/pricing"
                  className="text-mint-400 hover:text-mint-300 underline-offset-2 hover:underline"
                >
                  upgrade here
                </Link>
                .
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-mint-400 mt-1">&#8226;</span>
              <span>
                <strong className="text-white">Claude Desktop installed</strong>{" "}
                on macOS or Windows. Download it from{" "}
                <a
                  href="https://claude.ai/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-mint-400 hover:text-mint-300 underline-offset-2 hover:underline"
                >
                  claude.ai/download
                </a>
                .
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-mint-400 mt-1">&#8226;</span>
              <span>
                <strong className="text-white">Node.js 18 or later.</strong>{" "}
                Claude Desktop ships with its own Node runtime, so{" "}
                <code className="text-orange-300">npx</code> will work out of
                the box on most machines.
              </span>
            </li>
          </ul>
        </section>

        {/* Step 1 */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mint-400/10 border border-mint-400/40 text-mint-400 font-bold">
              1
            </span>
            <h2 className="text-2xl font-bold text-white font-[family-name:var(--font-heading)]">
              Mint a personal access token
            </h2>
          </div>
          <p className="text-slate-300 leading-relaxed mb-4">
            In Paybacker, open{" "}
            <Link
              href="/dashboard/settings/mcp"
              className="text-mint-400 hover:text-mint-300 underline-offset-2 hover:underline"
            >
              Settings &rarr; Claude Desktop (MCP)
            </Link>{" "}
            and click <strong className="text-white">Generate token</strong>.
            Give it a name like "MacBook" or "Work laptop" so you can tell
            tokens apart if you revoke one later.
          </p>
          <p className="text-slate-300 leading-relaxed mb-4">
            You&apos;ll see the token{" "}
            <strong className="text-white">exactly once</strong>. Copy it
            immediately — it starts with{" "}
            <code className="text-orange-300">pbk_</code>. Paybacker only
            stores a hash, so we can&apos;t show it to you again if you lose
            it (you&apos;d just revoke it and mint a new one).
          </p>
          <div className="bg-navy-900/60 border border-navy-700/50 rounded-2xl p-4 text-sm text-slate-400">
            Tokens expire after 180 days and you can have up to 10 active at
            once. Revoke any token instantly from the same settings page — the
            next Claude request using it will fail with a clear error.
          </div>
        </section>

        {/* Step 2 */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mint-400/10 border border-mint-400/40 text-mint-400 font-bold">
              2
            </span>
            <h2 className="text-2xl font-bold text-white font-[family-name:var(--font-heading)]">
              Run the one-command setup
            </h2>
          </div>
          <p className="text-slate-300 leading-relaxed mb-4">
            Open Terminal (macOS) or PowerShell (Windows) and run:
          </p>
          <pre className="bg-navy-900 border border-navy-700/50 rounded-2xl p-4 overflow-x-auto text-sm text-slate-200 mb-4">
            <code>npx @paybacker/mcp setup</code>
          </pre>
          <p className="text-slate-300 leading-relaxed mb-4">
            Paste the token when prompted. The setup script finds your Claude
            Desktop config file, adds a <code className="text-orange-300">paybacker</code>{" "}
            entry under <code className="text-orange-300">mcpServers</code>,
            and saves the token locally so Claude Desktop can spawn the server
            with it. It doesn&apos;t touch any of your other MCP servers.
          </p>
          <details className="bg-navy-900/60 border border-navy-700/50 rounded-2xl p-4 text-sm">
            <summary className="cursor-pointer text-slate-200 font-semibold">
              Prefer to edit the config yourself?
            </summary>
            <p className="text-slate-400 mt-3 mb-3">
              Add this block to{" "}
              <code className="text-orange-300">
                ~/Library/Application Support/Claude/claude_desktop_config.json
              </code>{" "}
              on Mac, or{" "}
              <code className="text-orange-300">
                %APPDATA%\Claude\claude_desktop_config.json
              </code>{" "}
              on Windows:
            </p>
            <pre className="bg-navy-950 border border-navy-700/50 rounded-xl p-3 overflow-x-auto text-xs text-slate-300">
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
        </section>

        {/* Step 3 */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mint-400/10 border border-mint-400/40 text-mint-400 font-bold">
              3
            </span>
            <h2 className="text-2xl font-bold text-white font-[family-name:var(--font-heading)]">
              Restart Claude Desktop
            </h2>
          </div>
          <p className="text-slate-300 leading-relaxed mb-4">
            Fully quit Claude Desktop (not just close the window) and reopen
            it. When it starts, it will spawn the Paybacker MCP server in the
            background.
          </p>
          <p className="text-slate-300 leading-relaxed">
            You can confirm it&apos;s connected by opening a new chat and
            looking for{" "}
            <strong className="text-white">&quot;paybacker&quot;</strong> in
            the tools menu. If you don&apos;t see it, see{" "}
            <a
              href="#troubleshooting"
              className="text-mint-400 hover:text-mint-300 underline-offset-2 hover:underline"
            >
              troubleshooting
            </a>{" "}
            below.
          </p>
        </section>

        {/* Step 4 */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mint-400/10 border border-mint-400/40 text-mint-400 font-bold">
              4
            </span>
            <h2 className="text-2xl font-bold text-white font-[family-name:var(--font-heading)]">
              Ask Claude about your money
            </h2>
          </div>
          <p className="text-slate-300 leading-relaxed mb-4">
            Open a new chat in Claude Desktop and try one of these:
          </p>
          <ul className="space-y-2 mb-4">
            {EXAMPLE_PROMPTS.map((p) => (
              <li
                key={p}
                className="bg-navy-900 border border-navy-700/50 rounded-xl px-4 py-3 text-slate-200 text-sm"
              >
                &ldquo;{p}&rdquo;
              </li>
            ))}
          </ul>
          <p className="text-slate-400 text-sm">
            Claude will ask for permission the first time it uses each
            Paybacker tool. You can approve each tool individually, or allow
            the whole server for the session.
          </p>
        </section>

        {/* What Claude can see */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
            What Claude can see
          </h2>
          <p className="text-slate-400 leading-relaxed mb-4 text-sm">
            Every tool is read-only. None of them can change, move, or delete
            anything in your Paybacker account.
          </p>
          <div className="space-y-3">
            {TOOLS.map((t) => (
              <div
                key={t.name}
                className="bg-navy-900 border border-navy-700/50 rounded-2xl p-4"
              >
                <code className="text-orange-300 font-semibold text-sm">
                  {t.name}
                </code>
                <p className="text-slate-300 text-sm mt-1 leading-relaxed">
                  {t.blurb}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Security */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
            Security notes
          </h2>
          <ul className="space-y-3 text-slate-300 text-sm">
            <li className="flex items-start gap-3">
              <span className="text-mint-400 mt-1">&#8226;</span>
              <span>
                <strong className="text-white">Your token stays on your machine.</strong>{" "}
                It&apos;s saved into the Claude Desktop config file and only
                sent back to <code className="text-orange-300">paybacker.co.uk</code>{" "}
                over HTTPS.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-mint-400 mt-1">&#8226;</span>
              <span>
                <strong className="text-white">We never see it in plaintext.</strong>{" "}
                Paybacker only stores a SHA-256 hash of the token and a short
                prefix so you can identify it in the UI.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-mint-400 mt-1">&#8226;</span>
              <span>
                <strong className="text-white">Revoke any time.</strong>{" "}
                Revoke from{" "}
                <Link
                  href="/dashboard/settings/mcp"
                  className="text-mint-400 hover:text-mint-300 underline-offset-2 hover:underline"
                >
                  Settings &rarr; Claude Desktop
                </Link>{" "}
                and the next Claude request will fail immediately.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-mint-400 mt-1">&#8226;</span>
              <span>
                <strong className="text-white">Pro-gated on every call.</strong>{" "}
                If your Pro subscription lapses, all tool calls start returning
                a clear "MCP access requires an active Pro plan" error.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-mint-400 mt-1">&#8226;</span>
              <span>
                <strong className="text-white">Open source.</strong> The{" "}
                <code className="text-orange-300">@paybacker/mcp</code> package
                is MIT-licensed and available on{" "}
                <a
                  href="https://github.com/airpau/paybacker-mcp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-mint-400 hover:text-mint-300 underline-offset-2 hover:underline"
                >
                  GitHub
                </a>{" "}
                — audit every line of code before you run it.
              </span>
            </li>
          </ul>
        </section>

        {/* Troubleshooting */}
        <section id="troubleshooting" className="mb-12 scroll-mt-24">
          <h2 className="text-2xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
            Troubleshooting
          </h2>
          <div className="space-y-4">
            <details className="bg-navy-900 border border-navy-700/50 rounded-2xl p-4">
              <summary className="cursor-pointer text-slate-200 font-semibold">
                Claude Desktop doesn&apos;t show the Paybacker tools
              </summary>
              <ul className="mt-3 space-y-2 text-sm text-slate-400">
                <li>&bull; Fully quit Claude Desktop (not just close the window) and reopen.</li>
                <li>
                  &bull; Open{" "}
                  <code className="text-orange-300">
                    ~/Library/Application Support/Claude/claude_desktop_config.json
                  </code>{" "}
                  and confirm the{" "}
                  <code className="text-orange-300">paybacker</code> entry is
                  there under <code className="text-orange-300">mcpServers</code>.
                </li>
                <li>
                  &bull; Check the file is valid JSON (a missing comma will stop
                  Claude loading any MCP server).
                </li>
                <li>
                  &bull; Re-run{" "}
                  <code className="text-orange-300">npx @paybacker/mcp setup</code>.
                </li>
              </ul>
            </details>
            <details className="bg-navy-900 border border-navy-700/50 rounded-2xl p-4">
              <summary className="cursor-pointer text-slate-200 font-semibold">
                Claude says &ldquo;Token revoked&rdquo; or &ldquo;Token expired&rdquo;
              </summary>
              <p className="mt-3 text-sm text-slate-400">
                Generate a new token from{" "}
                <Link
                  href="/dashboard/settings/mcp"
                  className="text-mint-400 hover:text-mint-300 underline-offset-2 hover:underline"
                >
                  Settings &rarr; Claude Desktop
                </Link>{" "}
                and run <code className="text-orange-300">npx @paybacker/mcp setup</code>{" "}
                again. Tokens expire after 180 days by default.
              </p>
            </details>
            <details className="bg-navy-900 border border-navy-700/50 rounded-2xl p-4">
              <summary className="cursor-pointer text-slate-200 font-semibold">
                Claude says &ldquo;MCP access requires an active Pro plan&rdquo;
              </summary>
              <p className="mt-3 text-sm text-slate-400">
                Your Paybacker subscription isn&apos;t currently Pro. You can{" "}
                <Link
                  href="/pricing"
                  className="text-mint-400 hover:text-mint-300 underline-offset-2 hover:underline"
                >
                  upgrade here
                </Link>
                . Your existing tokens will start working again immediately once
                Pro is active.
              </p>
            </details>
            <details className="bg-navy-900 border border-navy-700/50 rounded-2xl p-4">
              <summary className="cursor-pointer text-slate-200 font-semibold">
                Nothing happens when I run{" "}
                <code className="text-orange-300">npx @paybacker/mcp setup</code>
              </summary>
              <p className="mt-3 text-sm text-slate-400">
                Check your Node version with{" "}
                <code className="text-orange-300">node --version</code>. You
                need 18 or later. On macOS you can install Node with{" "}
                <a
                  href="https://brew.sh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-mint-400 hover:text-mint-300 underline-offset-2 hover:underline"
                >
                  Homebrew
                </a>{" "}
                (<code className="text-orange-300">brew install node</code>).
              </p>
            </details>
          </div>
        </section>

        {/* CTA */}
        <section className="mb-4 bg-gradient-to-br from-mint-400/10 via-navy-900 to-orange-500/10 border border-navy-700/50 rounded-3xl p-6 md:p-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3 font-[family-name:var(--font-heading)]">
            Ready to ask Claude about your money?
          </h2>
          <p className="text-slate-300 mb-6 max-w-md mx-auto">
            Upgrade to Pro, mint a token, and be chatting to your own
            transactions in under two minutes.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard/settings/mcp"
              className="inline-flex items-center justify-center rounded-full bg-mint-400 text-navy-950 font-semibold px-6 py-3 hover:bg-mint-300 transition-all"
            >
              Generate your token
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-navy-600 text-white font-semibold px-6 py-3 hover:bg-navy-800 transition-all"
            >
              See Pro pricing
            </Link>
          </div>
        </section>

        <p className="text-xs text-slate-500 text-center">
          Source code:{" "}
          <a
            href="https://github.com/airpau/paybacker-mcp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-white underline-offset-2 hover:underline"
          >
            github.com/airpau/paybacker-mcp
          </a>{" "}
          &middot; Published on npm as{" "}
          <a
            href="https://www.npmjs.com/package/@paybacker/mcp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-white underline-offset-2 hover:underline"
          >
            @paybacker/mcp
          </a>
        </p>
      </main>

      <footer className="container mx-auto px-4 md:px-6 py-8 border-t border-navy-700/50 mt-16">
        <div className="text-center text-slate-500 text-sm space-y-3">
          <div className="flex flex-wrap justify-center gap-4 md:gap-6">
            <Link href="/about" className="hover:text-white transition-all">
              About
            </Link>
            <Link href="/blog" className="hover:text-white transition-all">
              Blog
            </Link>
            <Link
              href="/privacy-policy"
              className="hover:text-white transition-all"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms-of-service"
              className="hover:text-white transition-all"
            >
              Terms of Service
            </Link>
            <Link href="/pricing" className="hover:text-white transition-all">
              Pricing
            </Link>
            <a
              href="mailto:hello@paybacker.co.uk"
              className="hover:text-white transition-all"
            >
              Contact
            </a>
          </div>
          <p>
            Need help? Email{" "}
            <a
              href="mailto:support@paybacker.co.uk"
              className="text-mint-400 hover:text-mint-300"
            >
              support@paybacker.co.uk
            </a>
          </p>
          <p>&copy; 2026 Paybacker LTD. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
