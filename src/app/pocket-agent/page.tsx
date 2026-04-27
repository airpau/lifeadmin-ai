/**
 * /pocket-agent — public-facing explainer + setup guide for the
 * Paybacker Pocket Agent on WhatsApp and Telegram.
 *
 * No auth required. Intended as the canonical "how do I connect this?"
 * page that the WhatsApp webhook can link to, and that any user who
 * Googles "paybacker pocket agent" lands on.
 */

import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pocket Agent — Paybacker on WhatsApp & Telegram',
  description:
    'Talk to your Paybacker financial assistant on WhatsApp or Telegram. Track subscriptions, dispute unfair bills, and recover money — all from your phone.',
};

export default function PocketAgentPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="max-w-4xl mx-auto px-4 md:px-8 pt-12 md:pt-20 pb-12">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-600 font-semibold mb-3">
          Paybacker Pocket Agent
        </p>
        <h1 className="text-3xl md:text-5xl font-bold text-slate-900 leading-tight mb-4">
          Your Paybacker, on WhatsApp or Telegram.
        </h1>
        <p className="text-base md:text-lg text-slate-600 max-w-2xl mb-8">
          Ask anything about your money — &ldquo;show my subs&rdquo;, &ldquo;write a complaint letter to EE&rdquo;,
          &ldquo;is anything renewing this week?&rdquo; — and get back a real answer
          grounded in your bank data, plus a Paybacker action you can take in one tap.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/auth/signup"
            className="inline-flex items-center justify-center px-5 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
          >
            Get started — it&apos;s free
          </Link>
          <Link
            href="/dashboard/settings/whatsapp"
            className="inline-flex items-center justify-center px-5 py-3 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50"
          >
            Already a member? Connect now
          </Link>
        </div>
      </section>

      {/* Channel comparison */}
      <section className="max-w-4xl mx-auto px-4 md:px-8 py-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Pick your channel</h2>
        <p className="text-sm text-slate-600 mb-6">
          You can have one Pocket Agent channel active at a time — Telegram <em>or</em> WhatsApp.
          Connecting one disconnects the other automatically. Email and push notifications run alongside whichever channel you pick.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded-2xl p-6 bg-white">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-slate-900">Telegram</h3>
              <span className="text-xs uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">Free, all plans</span>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Available on every Paybacker plan. Search <strong>@paybacker_bot</strong> on Telegram, tap Start, paste your link code from the dashboard.
            </p>
            <Link
              href="/dashboard/settings/telegram"
              className="text-sm text-emerald-600 hover:underline font-semibold"
            >
              Set up Telegram →
            </Link>
          </div>
          <div className="border border-slate-200 rounded-2xl p-6 bg-white">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-slate-900">WhatsApp</h3>
              <span className="text-xs uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Pro only</span>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Part of Paybacker Pro (£9.99/mo). Talk to your agent on the messaging app you already use most.
            </p>
            <Link
              href="/dashboard/settings/whatsapp"
              className="text-sm text-emerald-600 hover:underline font-semibold"
            >
              Set up WhatsApp →
            </Link>
          </div>
        </div>
      </section>

      {/* WhatsApp setup steps */}
      <section className="max-w-4xl mx-auto px-4 md:px-8 py-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">How to connect WhatsApp</h2>
        <ol className="space-y-4">
          {[
            {
              n: 1,
              title: 'Sign in to Paybacker',
              body: (
                <>
                  Go to <Link href="/auth/login" className="text-emerald-600 underline">paybacker.co.uk</Link> and sign in with your account. Don&apos;t have one yet?
                  <Link href="/auth/signup" className="text-emerald-600 underline ml-1">Sign up free</Link>
                  &nbsp;— takes about 30 seconds.
                </>
              ),
            },
            {
              n: 2,
              title: 'Make sure you\'re on Pro',
              body: (
                <>
                  WhatsApp Pocket Agent is included with Paybacker Pro because every WhatsApp template costs us money on Meta&apos;s side. On Free or Essential? Use the Telegram Pocket Agent instead — same intelligence, no per-message cost on either side.{' '}
                  <Link href="/pricing" className="text-emerald-600 underline">See pricing →</Link>
                </>
              ),
            },
            {
              n: 3,
              title: 'Generate a link code',
              body: (
                <>
                  In your dashboard, go to <strong>Profile → Pocket Agent → WhatsApp → Set up</strong>, or open{' '}
                  <Link href="/dashboard/settings/whatsapp" className="text-emerald-600 underline">/dashboard/settings/whatsapp</Link>{' '}
                  directly. Tap <em>Generate link code</em> — you&apos;ll get a 6-character code valid for 10 minutes.
                </>
              ),
            },
            {
              n: 4,
              title: 'Send the code from WhatsApp',
              body: (
                <>
                  Tap the <em>Open WhatsApp</em> button (or message <strong>+44 7883 318406</strong> from your phone) with the code in the form: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">LINK ABC123</code>. We learn your phone number from the message — no need to type it in.
                </>
              ),
            },
            {
              n: 5,
              title: 'You\'re in',
              body: (
                <>
                  Within 5 seconds the dashboard flips to <em>Connected</em> and your agent replies on WhatsApp. Reply <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">STOP</code> any time to opt out. We&apos;ll also save your verified number to your profile if it wasn&apos;t there already.
                </>
              ),
            },
          ].map((step) => (
            <li key={step.n} className="flex gap-4 bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-semibold text-sm">
                {step.n}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-slate-900 mb-1">{step.title}</div>
                <div className="text-sm text-slate-600 leading-relaxed">{step.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* What can you ask */}
      <section className="max-w-4xl mx-auto px-4 md:px-8 py-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">What you can ask</h2>
        <p className="text-sm text-slate-600 mb-6">
          The same agent is on both channels. Some examples:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            '"Show my subscriptions and what I spend on each"',
            '"Write a complaint letter to EE about the price hike"',
            '"What\'s due to be paid this week?"',
            '"Send me a morning summary at 9am every day"',
            '"How much have I saved with Paybacker?"',
            '"Reply to OneStream that I\'m available any day except Friday"',
            '"Set a budget of £400 for groceries"',
            '"Quiet hours from 11pm to 7am"',
          ].map((q) => (
            <div key={q} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-700">
              {q}
            </div>
          ))}
        </div>
      </section>

      {/* Privacy / control */}
      <section className="max-w-4xl mx-auto px-4 md:px-8 py-8 pb-20">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">You stay in control</h2>
        <ul className="space-y-2 text-sm text-slate-600 leading-relaxed">
          <li>• Reply <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">STOP</code> any time to opt out — instant, irreversible until you re-link.</li>
          <li>• Tweak which alerts go where in <Link href="/dashboard/settings/notifications" className="text-emerald-600 underline">Notification preferences</Link> — quiet hours apply to all phone-buzz channels.</li>
          <li>• Set custom schedules: &ldquo;send the morning summary at 9am&rdquo;, &ldquo;remind me 60 days before contracts end&rdquo;, &ldquo;budget alerts only when I&apos;m over 90%&rdquo;.</li>
          <li>• Switching channels (Telegram → WhatsApp or back) takes one tap from the Pocket Agent card on your profile.</li>
          <li>• Your bank data and dispute history never leave Paybacker — the agent reads them at message time and replies with the answer, nothing is shared with Meta beyond the message text you read.</li>
        </ul>
      </section>
    </main>
  );
}
