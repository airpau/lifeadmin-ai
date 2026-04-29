'use client';

export default function CookieSettingsButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event('open-cookie-settings'))}
      className="hover:text-white transition-all"
    >
      Cookie Settings
    </button>
  );
}
