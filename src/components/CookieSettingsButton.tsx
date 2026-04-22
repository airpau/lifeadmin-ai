'use client';

export default function CookieSettingsButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event('open-cookie-settings'))}
      className="hover:text-slate-900 transition-all"
    >
      Cookie Settings
    </button>
  );
}
