'use client';

import { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (!hasConsentBeenGiven()) {
      setVisible(true);
    }
  }, []);

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
    <div className="fixed bottom-0 inset-x-0 z-[9999] p-4">
      <div className="max-w-2xl mx-auto bg-navy-900 border border-navy-700 rounded-2xl shadow-2xl p-6">
        {!showPreferences ? (
          <>
            <p className="text-sm text-slate-300 mb-4">
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
                className="bg-navy-800 hover:bg-navy-700 text-slate-300 text-sm font-medium px-5 py-2.5 rounded-xl border border-navy-600 transition-all"
              >
                Reject All
              </button>
              <button
                onClick={() => setShowPreferences(true)}
                className="text-slate-400 hover:text-white text-sm font-medium px-5 py-2.5 transition-all"
              >
                Manage Preferences
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-white font-semibold mb-4">Cookie Preferences</h3>
            <div className="space-y-3 mb-5">
              <label className="flex items-center justify-between p-3 bg-navy-800 rounded-xl">
                <div>
                  <span className="text-sm text-white font-medium">Essential</span>
                  <p className="text-xs text-slate-400 mt-0.5">Required for login and basic functionality. Cannot be disabled.</p>
                </div>
                <input type="checkbox" checked disabled className="accent-mint-400 w-4 h-4" />
              </label>
              <label className="flex items-center justify-between p-3 bg-navy-800 rounded-xl cursor-pointer">
                <div>
                  <span className="text-sm text-white font-medium">Analytics</span>
                  <p className="text-xs text-slate-400 mt-0.5">Help us understand how you use Paybacker (PostHog, Google Analytics).</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.analytics}
                  onChange={(e) => setPrefs(p => ({ ...p, analytics: e.target.checked }))}
                  className="accent-mint-400 w-4 h-4"
                />
              </label>
              <label className="flex items-center justify-between p-3 bg-navy-800 rounded-xl cursor-pointer">
                <div>
                  <span className="text-sm text-white font-medium">Marketing</span>
                  <p className="text-xs text-slate-400 mt-0.5">Used for ads and referral tracking (Meta Pixel, Awin).</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.marketing}
                  onChange={(e) => setPrefs(p => ({ ...p, marketing: e.target.checked }))}
                  className="accent-mint-400 w-4 h-4"
                />
              </label>
              <label className="flex items-center justify-between p-3 bg-navy-800 rounded-xl cursor-pointer">
                <div>
                  <span className="text-sm text-white font-medium">Functional</span>
                  <p className="text-xs text-slate-400 mt-0.5">Enhanced features like chat and personalisation.</p>
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
                className="bg-navy-800 hover:bg-navy-700 text-slate-300 text-sm font-medium px-5 py-2.5 rounded-xl border border-navy-600 transition-all"
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
