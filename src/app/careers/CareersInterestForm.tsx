'use client';

import { useState } from 'react';

type Status = 'idle' | 'submitting' | 'success' | 'error';

type SubmitResponse = {
  ok?: boolean;
  duplicated?: boolean;
  message?: string;
  error?: string;
};

export default function CareersInterestForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [serverMessage, setServerMessage] = useState<string>('');
  const [duplicated, setDuplicated] = useState<boolean>(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [roleOfInterest, setRoleOfInterest] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [why, setWhy] = useState('');
  const [availability, setAvailability] = useState('');
  const [ukBased, setUkBased] = useState<boolean>(true);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'submitting') return;

    setStatus('submitting');
    setServerMessage('');
    setDuplicated(false);

    try {
      const res = await fetch('/api/careers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          roleOfInterest: roleOfInterest || null,
          linkedinUrl: linkedinUrl.trim() || null,
          portfolioUrl: portfolioUrl.trim() || null,
          why: why.trim() || null,
          availability: availability || null,
          ukBased,
        }),
      });

      let data: SubmitResponse = {};
      try {
        data = (await res.json()) as SubmitResponse;
      } catch {
        /* non-JSON response — fall through to generic error */
      }

      if (!res.ok || !data.ok) {
        setStatus('error');
        setServerMessage(
          data.error ||
            'Something went wrong on our end. Please try again in a moment, or email hello@paybacker.co.uk directly.',
        );
        return;
      }

      setStatus('success');
      setDuplicated(Boolean(data.duplicated));
      setServerMessage(data.message || 'Thanks — your interest has been recorded.');
    } catch {
      setStatus('error');
      setServerMessage(
        'We couldn\u2019t reach the server. Please try again in a moment, or email hello@paybacker.co.uk directly.',
      );
    }
  }

  if (status === 'success') {
    return (
      <div className="bg-navy-900 border border-mint-400/40 rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint-400/15 text-mint-400"
          >
            &#10003;
          </span>
          <div>
            <h3 className="text-white font-semibold mb-1">
              {duplicated ? 'You\u2019re already on our list' : 'Thanks — you\u2019re on our list'}
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed mb-4">{serverMessage}</p>
            <p className="text-slate-400 text-xs">
              Anything else you want us to know? Email{' '}
              <a href="mailto:hello@paybacker.co.uk" className="text-mint-400 hover:text-mint-300">
                hello@paybacker.co.uk
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  const inputBase =
    'w-full rounded-xl bg-navy-900 border border-navy-700/60 px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-mint-400/60 focus:ring-2 focus:ring-mint-400/20 transition-colors';
  const labelBase = 'block text-sm font-medium text-slate-300 mb-2';

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label htmlFor="fullName" className={labelBase}>
            Full name <span className="text-mint-400">*</span>
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={120}
            className={inputBase}
            placeholder="Alex Morgan"
          />
        </div>
        <div>
          <label htmlFor="email" className={labelBase}>
            Email <span className="text-mint-400">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={180}
            className={inputBase}
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label htmlFor="roleOfInterest" className={labelBase}>
            Role of interest
          </label>
          <select
            id="roleOfInterest"
            name="roleOfInterest"
            value={roleOfInterest}
            onChange={(e) => setRoleOfInterest(e.target.value)}
            className={inputBase}
          >
            <option value="">Pick one (or &ldquo;open&rdquo;)</option>
            <option value="founding-engineer">Founding engineer</option>
            <option value="growth-marketer">Growth marketer</option>
            <option value="product-designer">Product designer</option>
            <option value="consumer-law-policy">Consumer law / policy lead</option>
            <option value="open">Open — something else</option>
          </select>
        </div>
        <div>
          <label htmlFor="availability" className={labelBase}>
            Availability
          </label>
          <select
            id="availability"
            name="availability"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            className={inputBase}
          >
            <option value="">When could you start?</option>
            <option value="now">Available now</option>
            <option value="1-month">Within a month</option>
            <option value="3-months">Within three months</option>
            <option value="exploring">Just exploring</option>
          </select>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label htmlFor="linkedinUrl" className={labelBase}>
            LinkedIn URL
          </label>
          <input
            id="linkedinUrl"
            name="linkedinUrl"
            type="url"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            maxLength={300}
            className={inputBase}
            placeholder="https://linkedin.com/in/\u2026"
          />
        </div>
        <div>
          <label htmlFor="portfolioUrl" className={labelBase}>
            Portfolio / GitHub URL
          </label>
          <input
            id="portfolioUrl"
            name="portfolioUrl"
            type="url"
            value={portfolioUrl}
            onChange={(e) => setPortfolioUrl(e.target.value)}
            maxLength={300}
            className={inputBase}
            placeholder="https://github.com/\u2026"
          />
        </div>
      </div>

      <div>
        <label htmlFor="why" className={labelBase}>
          Why Paybacker?
        </label>
        <textarea
          id="why"
          name="why"
          rows={4}
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          maxLength={2000}
          className={inputBase}
          placeholder="A few sentences on what you\u2019d bring, and why this problem matters to you."
        />
        <p className="mt-1 text-xs text-slate-500">{why.length}/2000</p>
      </div>

      <div className="flex items-start gap-3">
        <input
          id="ukBased"
          name="ukBased"
          type="checkbox"
          checked={ukBased}
          onChange={(e) => setUkBased(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-navy-600 bg-navy-900 text-mint-400 focus:ring-mint-400/40"
        />
        <label htmlFor="ukBased" className="text-sm text-slate-300 leading-relaxed">
          I&apos;m based in the UK (or have the right to work here).
          <span className="block text-xs text-slate-500">We&apos;re London-hybrid with a strong preference for UK time-zone overlap.</span>
        </label>
      </div>

      {status === 'error' && serverMessage && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {serverMessage}
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-mint-400 px-6 py-3 text-navy-950 font-semibold hover:bg-mint-300 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {status === 'submitting' ? 'Submitting\u2026' : 'Register interest'}
        </button>
        <p className="mt-3 text-xs text-slate-500">
          By submitting you agree to Paybacker contacting you about future roles. We&apos;ll never share your details with third parties. See our{' '}
          <a href="/privacy-policy" className="text-mint-400 hover:text-mint-300">privacy policy</a>.
        </p>
      </div>
    </form>
  );
}
