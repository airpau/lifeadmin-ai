import type { Metadata } from 'next';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import CareersInterestForm from './CareersInterestForm';

export const metadata: Metadata = {
  title: 'Careers at Paybacker — Help build fair consumer finance in the UK',
  description:
    "We're not hiring publicly yet, but we're collecting expressions of interest for the roles we plan to open. Founding-team early, London-hybrid, remote-friendly.",
  openGraph: {
    title: 'Careers at Paybacker — Help build fair consumer finance in the UK',
    description:
      "We're not hiring publicly yet, but we're collecting expressions of interest for the roles we plan to open. Founding-team early, London-hybrid, remote-friendly.",
    url: 'https://paybacker.co.uk/careers',
    siteName: 'Paybacker',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Careers at Paybacker',
    description:
      "We're collecting expressions of interest for upcoming roles. Founding-team early, London-hybrid, remote-friendly.",
    images: ['/logo.png'],
  },
  alternates: {
    canonical: 'https://paybacker.co.uk/careers',
  },
};

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-navy-950">
      <PublicNavbar />
      <div className="h-16" />

      <main className="container mx-auto px-4 md:px-6 py-10 md:py-16 max-w-3xl">
        {/* Hero */}
        <div className="mb-10">
          <span className="inline-block px-3 py-1 rounded-full border border-mint-400/30 bg-mint-400/10 text-mint-400 text-xs font-semibold uppercase tracking-wider mb-4">
            Expressing interest — not hiring publicly yet
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
            Help us build the consumer finance tool the UK deserves
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed mb-4">
            Paybacker is a small, founder-led team on a mission: give every UK household the legal and AI muscle to stop being overcharged. We&apos;re building in the open, shipping weekly, and looking for people who want in early.
          </p>
          <p className="text-lg text-slate-400 leading-relaxed">
            We&apos;re not running a public recruitment process yet — but if any of the roles below sound like you, drop your details and we&apos;ll be in touch the moment we start hiring.
          </p>
        </div>

        {/* What we value */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
            What we care about
          </h2>
          <div className="grid gap-4">
            <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-1">Ship something a real person uses this week</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                We prefer scrappy-and-shipped to polished-and-stuck. If you&apos;ve never pushed something to production in under a week, this probably isn&apos;t the team for you.
              </p>
            </div>
            <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-1">Care about the user, not the stack</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Our users are UK households being quietly overcharged. Every decision starts from their experience — not which framework is trendy this month.
              </p>
            </div>
            <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-1">Own outcomes, not tickets</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Small team, big scope. You&apos;ll pick up work that isn&apos;t in your job title and see it through — and we&apos;ll back you when you do.
              </p>
            </div>
          </div>
        </section>

        {/* Roles we're thinking about */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
            Roles we&apos;re thinking about
          </h2>
          <p className="text-slate-400 leading-relaxed mb-5 text-sm">
            Rough descriptions — we haven&apos;t written formal JDs yet. Tell us which feels closest and we&apos;ll tailor the conversation when we&apos;re ready.
          </p>
          <div className="grid gap-4">
            <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-1">Founding engineer (full-stack)</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Next.js + Supabase + Claude. You&apos;ll own major surfaces of the product end-to-end. Bonus if you&apos;ve worked with Open Banking, email ingestion, or LLM pipelines.
              </p>
            </div>
            <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-1">Growth marketer</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Performance + content + SEO across Google, Reddit and influencer partnerships. You get excited by a conversion funnel and a spreadsheet of CAC targets.
              </p>
            </div>
            <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-1">Product designer</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Consumer-facing fintech design. You&apos;ll shape how millions of ordinary people understand their own money — no MBAs, no jargon, no dark patterns.
              </p>
            </div>
            <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-1">Consumer law / policy lead</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                You know the Consumer Rights Act 2015, Ofcom / Ofgem codes and UK261 well enough to help tune the AI&apos;s legal reasoning. Paralegal, policy or regulatory background welcome.
              </p>
            </div>
            <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-1">Open — something else?</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Support, ops, data, community — if you think you&apos;d add something and it isn&apos;t on this list, tell us.
              </p>
            </div>
          </div>
        </section>

        {/* How we work */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
            How we work
          </h2>
          <div className="bg-navy-900 border border-mint-400/30 rounded-2xl p-5">
            <ul className="space-y-3 text-slate-300 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-mint-400 mt-1">&#8226;</span>
                <span>
                  <strong className="text-white">London-hybrid, remote-friendly.</strong>{' '}
                  We expect UK-based where possible for day-to-day overlap, but the default is async.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-mint-400 mt-1">&#8226;</span>
                <span>
                  <strong className="text-white">Equity from day one.</strong>{' '}
                  Early joiners get meaningful ownership. We&apos;d rather be a small team that wins than a big one that shipwrecks.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-mint-400 mt-1">&#8226;</span>
                <span>
                  <strong className="text-white">We use the tools we trust.</strong>{' '}
                  Claude, Next.js 15, Supabase, Stripe, Resend, Yapily. No legacy stack — just the sharpest tools we can point at the problem.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-mint-400 mt-1">&#8226;</span>
                <span>
                  <strong className="text-white">Founder-led but not founder-bottlenecked.</strong>{' '}
                  Paul leads from the front, but the first engineering, design and marketing hires will own their surfaces completely.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* Form */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
            Register your interest
          </h2>
          <p className="text-slate-400 leading-relaxed mb-6 text-sm">
            Takes less than a minute. We&apos;ll only get in touch once — when we&apos;re hiring for something that fits.
          </p>
          <CareersInterestForm />
        </section>

        {/* Footer note */}
        <p className="text-slate-500 text-xs leading-relaxed">
          Paybacker is an equal-opportunity employer. We welcome applicants from every background and commit to reading every expression of interest we receive. If you have specific accessibility needs for how you&apos;d like us to get in touch, mention it in the &ldquo;why you&apos;re interested&rdquo; box and we&apos;ll accommodate.
        </p>
      </main>

      <footer className="container mx-auto px-4 md:px-6 py-8 border-t border-navy-700/50 mt-16">
        <div className="text-center text-slate-500 text-sm space-y-3">
          <div className="flex flex-wrap justify-center gap-4 md:gap-6">
            <Link href="/about" className="hover:text-white transition-all">About</Link>
            <Link href="/blog" className="hover:text-white transition-all">Blog</Link>
            <Link href="/privacy-policy" className="hover:text-white transition-all">Privacy Policy</Link>
            <Link href="/terms-of-service" className="hover:text-white transition-all">Terms of Service</Link>
            <Link href="/pricing" className="hover:text-white transition-all">Pricing</Link>
            <a href="mailto:hello@paybacker.co.uk" className="hover:text-white transition-all">Contact</a>
          </div>
          <p>&copy; 2026 Paybacker LTD. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
