'use client';

import { useState, useEffect } from 'react';
import { capture } from '@/lib/posthog';

type Volume = '<1k' | '1k-10k' | '10k-100k' | '100k+';

interface FormState {
  name: string;
  work_email: string;
  company: string;
  role: string;
  expected_volume: Volume | '';
  use_case: string;
}

const INITIAL: FormState = {
  name: '',
  work_email: '',
  company: '',
  role: '',
  expected_volume: '',
  use_case: '',
};

export default function WaitlistForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the page view once the form mounts. We do this here rather
  // than in the parent so the analytics call is gated on the same
  // consent check the form submission uses.
  useEffect(() => {
    capture('for_business_view', { surface: '/for-business' });
  }, []);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (error) setError(null);
  };

  const valid =
    form.name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.work_email) &&
    form.company.trim().length >= 2 &&
    form.expected_volume !== '' &&
    form.use_case.trim().length >= 20;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;

    setSubmitting(true);
    setError(null);
    capture('for_business_submit_attempt', {
      volume: form.expected_volume,
    });

    // Gather UTM + referrer client-side. The endpoint receives them
    // as plain fields (not headers) so we don't need a separate
    // attribution endpoint.
    const params = new URLSearchParams(window.location.search);
    const payload = {
      ...form,
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
      referrer: document.referrer || null,
    };

    try {
      const res = await fetch('/api/for-business-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Submission failed. Please try again.');
      }
      setDone(true);
      capture('for_business_submit_success', {
        volume: form.expected_volume,
      });
    } catch (err: any) {
      setError(err?.message || 'Submission failed. Please try again.');
      capture('for_business_submit_error', {
        message: err?.message ?? 'unknown',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="m-business-form-success">
        <h3>Got it. We&apos;ll be in touch.</h3>
        <p>
          We respond to qualified use cases within five working days. If your stack or volume changes
          while you wait, reply to the confirmation email and update us.
        </p>
      </div>
    );
  }

  return (
    <form className="m-business-form" onSubmit={onSubmit} noValidate>
      <div className="m-business-form-row">
        <Field label="Name" required>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            autoComplete="name"
            required
          />
        </Field>
        <Field label="Work email" required>
          <input
            type="email"
            value={form.work_email}
            onChange={(e) => update('work_email', e.target.value)}
            autoComplete="email"
            required
          />
        </Field>
      </div>
      <div className="m-business-form-row">
        <Field label="Company" required>
          <input
            type="text"
            value={form.company}
            onChange={(e) => update('company', e.target.value)}
            autoComplete="organization"
            required
          />
        </Field>
        <Field label="Role">
          <input
            type="text"
            value={form.role}
            onChange={(e) => update('role', e.target.value)}
            autoComplete="organization-title"
            placeholder="Eng Lead, Head of Compliance, etc."
          />
        </Field>
      </div>
      <Field label="Expected monthly volume" required>
        <select
          value={form.expected_volume}
          onChange={(e) => update('expected_volume', e.target.value as Volume)}
          required
        >
          <option value="">Select…</option>
          <option value="<1k">Under 1,000 calls / month</option>
          <option value="1k-10k">1,000 to 10,000 / month</option>
          <option value="10k-100k">10,000 to 100,000 / month</option>
          <option value="100k+">Over 100,000 / month</option>
        </select>
      </Field>
      <Field
        label={`Use case (${form.use_case.trim().length}/20 minimum)`}
        required
      >
        <textarea
          rows={4}
          minLength={20}
          maxLength={1000}
          value={form.use_case}
          onChange={(e) => update('use_case', e.target.value)}
          placeholder="What product surface would call this engine? Who is the user? What are the 2 or 3 statutes you most need cited correctly?"
          required
        />
      </Field>

      {error && <p className="m-business-form-error" role="alert">{error}</p>}

      <button
        type="submit"
        className="m-business-form-submit"
        disabled={!valid || submitting}
      >
        {submitting ? 'Submitting…' : 'Get early access'}
      </button>
      <p className="m-business-form-fineprint">
        We&apos;ll only use this to talk to you about the API. No newsletter. Unsubscribe at any time.
      </p>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="m-business-field">
      <span>
        {label}
        {required && <em aria-label="required">*</em>}
      </span>
      {children}
    </label>
  );
}
