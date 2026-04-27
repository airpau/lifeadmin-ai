'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  getConsent,
  setConsent,
  hasConsentBeenGiven,
  acceptAll,
  rejectAll,
  type ConsentPreferences,
} from '@/lib/consent';

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [prefs, setPrefs] = useState({ analytics: false, marketing: false, functional: false });
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasConsentBeenGiven()) {
      setVisible(true);
    }
  }, []);

  // While the banner is visible, reserve bottom padding on the body equal
  // to the banner's height so the banner can't sit over auth submit buttons,
  // checkout CTAs, or any sticky bottom action. Without this, fixed-bottom
  // overlay intercepts clicks at typical viewport heights (caught by e2e
  // suite and surfaced as A8 in UX_AUDIT.md).
  useEffect(() => {
    if (!visible) {
      document.body.style.paddingBottom = '';
      return;
    }
    // Measure the outer fixed wrapper (not the inner card) so the reserved
    // padding includes the wrapper's p-4 vertical padding — otherwise we
    // under-reserve by ~32px and controls near the viewport bottom can still
    // sit under the banner on small screens. Codex P2 finding on PR #333.
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const apply = () => {
      const h = wrapper.offsetHeight;
      document.body.style.paddingBottom = `${h}px`;
    };
    apply();

    // Re-measure if banner content changes (preferences view is taller)
    const ro = new ResizeObserver(apply);
    ro.observe(wrapper);
    return () => {
      ro.disconnect();
      document.body.style.paddingBottom = '';
    };
  }, [visible, showPreferences]);

  // Listen for "open cookie settings" events from footer link
  useEffect(() => {
    function handleOpen() {
      const existing = getConsent();
      if (existing) setPrefs({ analytics: existing.analytics, marketing: existing.marketing, functional: existing.functional });
      setShowPreferences(true);
      setVisible(true);
    }
    window.addEventListener('open-cookie-settings', handleOpen);
    return () => window.removeEventListener('open-cookie-settings', handleOpen);
  }, []);

  function handleAcceptAll() {
    acceptAll();
    setVisible(false);
    window.dispatchEvent(new Event('consent-updated'));
  }

  function handleRejectAll() {
    rejectAll();
    setVisible(false);
    window.dispatchEvent(new Event('consent-updated'));
  }

  function handleSavePreferences() {
    setConsent(prefs);
    setVisible(false);
    setShowPreferences(false);
    window.dispatchEvent(new Event('consent-updated'));
  }

  if (!visible) return null;

  return (
    <div ref={wrapperRef} className="fixed bottom-0 inset-x-0 z-[9999] p-4" role="region" aria-label="Cookie consent">
      <div className="max-w-2xl mx-auto card shadow-2xl p-6">
        {!showPreferences ? (
          <>
            <p className="text-sm text-slate-700 mb-4">
              We use cookies to improve your experience and analyse how our site is used.
              You can accept all cookies, reject non-essential ones, or manage your preferences.
              See our <Link href="/cookie-policy" className="text-mint-400 underline hover:text-mint-300">Cookie Policy</Link> for details.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleAcceptAll}
                className="bg-mint-400 hover:bg-mint-500 text-navy-950 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all"
              >
                Accept All
              </button>
              <button
                onClick={handleRejectAll}
                className="bg-slate-100 hover:bg-slate-100 text-slate-700 text-sm font-medium px-5 py-2.5 rounded-xl border border-navy-600 transition-all"
              >
                Reject All
              </button>
              <button
                onClick={() => setShowPreferences(true)}
                className="text-slate-500 hover:text-slate-900 text-sm font-medium px-5 py-2.5 transition-all"
              >
                Manage Preferences
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-slate-900 font-semibold mb-4">Cookie Preferences</h3>
            <div className="space-y-3 mb-5">
              <label className="flex items-center justify-between p-3 bg-slate-100 rounded-xl">
                <div>
                  <span className="text-sm text-slate-900 font-medium">Essential</span>
                  <p className="text-xs text-slate-500 mt-0.5">Required for login and basic functionality. Cannot be disabled.</p>
                </div>
                <input type="checkbox" checked disabled className="accent-mint-400 w-4 h-4" />
              </label>
              <label className="flex items-center justify-between p-3 bg-slate-100 rounded-xl cursor-pointer">
                <div>
                  <span className="text-sm text-slate-900 font-medium">Analytics</span>
                  <p className="text-xs text-slate-500 mt-0.5">Help us understand how you use Paybacker (PostHog, Google Analytics).</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.analytics}
                  onChange={(e) => setPrefs(p => ({ ...p, analytics: e.target.checked }))}
                  className="accent-mint-400 w-4 h-4"
                />
              </label>
              <label className="flex items-center justify-between p-3 bg-slate-100 rounded-xl cursor-pointer">
                <div>
                  <span className="text-sm text-slate-900 font-medium">Marketing</span>
                  <p className="text-xs text-slate-500 mt-0.5">Used for ads and referral tracking (Meta Pixel, Awin).</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.marketing}
                  onChange={(e) => setPrefs(p => ({ ...p, marketing: e.target.checked }))}
                  className="accent-mint-400 w-4 h-4"
                />
              </label>
              <label className="flex items-center justify-between p-3 bg-slate-100 rounded-xl cursor-pointer">
                <div>
                  <span className="text-sm text-slate-900 font-medium">Functional</span>
                  <p className="text-xs text-slate-500 mt-0.5">Enhanced features like chat and personalisation.</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.functional}
                  onChange={(e) => setPrefs(p => ({ ...p, functional: e.target.checked }))}
                  className="accent-mint-400 w-4 h-4"
                />
              </label>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSavePreferences}
                className="bg-mint-400 hover:bg-mint-500 text-navy-950 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all"
              >
                Save Preferences
              </button>
              <button
                onClick={handleAcceptAll}
                className="bg-slate-100 hover:bg-slate-100 text-slate-700 text-sm font-medium px-5 py-2.5 rounded-xl border border-navy-600 transition-all"
              >
                Accept All
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
