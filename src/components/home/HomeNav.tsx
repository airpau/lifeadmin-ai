'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function HomeNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <nav
      className="hp-nav"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: scrolled ? 'rgba(17,19,24,0.9)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
        transition: 'background-color 0.3s ease, backdrop-filter 0.3s ease',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
      }}
    >
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '72px',
      }}>
        {/* Logo */}
        <Link
          href="/"
          style={{
            color: '#ffffff',
            fontWeight: 800,
            fontSize: '20px',
            letterSpacing: '-0.5px',
            textDecoration: 'none',
            fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif',
          }}
        >
          Paybacker
        </Link>

        {/* Desktop links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }} className="hp-nav-links">
          {[
            { label: 'Features', href: '/#features' },
            { label: 'Pricing', href: '/pricing' },
            { label: 'Blog', href: '/blog' },
          ].map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              style={{
                color: 'rgba(255,255,255,0.75)',
                fontWeight: 500,
                fontSize: '15px',
                textDecoration: 'none',
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#34d399')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.75)')}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="/auth/login"
            style={{
              color: 'rgba(255,255,255,0.7)',
              fontWeight: 500,
              fontSize: '14px',
              textDecoration: 'none',
            }}
            className="hp-nav-login"
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            style={{
              backgroundColor: '#f59e0b',
              color: '#0f172a',
              fontWeight: 700,
              padding: '10px 22px',
              borderRadius: '9999px',
              fontSize: '14px',
              textDecoration: 'none',
              transition: 'background-color 0.2s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#d97706')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
          >
            Get started free
          </Link>

          {/* Mobile hamburger */}
          <button
            aria-label="Toggle menu"
            onClick={() => setMenuOpen(v => !v)}
            className="hp-hamburger"
            style={{
              display: 'none',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: '#fff',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              {menuOpen ? (
                <>
                  <line x1="4" y1="4" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <line x1="18" y1="4" x2="4" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <line x1="3" y1="11" x2="19" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <line x1="3" y1="16" x2="19" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{
          background: '#111318',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '16px 24px 24px',
        }}>
          {[
            { label: 'Features', href: '/#features' },
            { label: 'Pricing', href: '/pricing' },
            { label: 'Blog', href: '/blog' },
            { label: 'Sign in', href: '/auth/login' },
          ].map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              onClick={() => setMenuOpen(false)}
              style={{
                display: 'block',
                color: 'rgba(255,255,255,0.8)',
                fontWeight: 500,
                fontSize: '16px',
                textDecoration: 'none',
                padding: '12px 0',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/auth/signup"
            onClick={() => setMenuOpen(false)}
            style={{
              display: 'block',
              marginTop: '16px',
              backgroundColor: '#f59e0b',
              color: '#0f172a',
              fontWeight: 700,
              padding: '14px',
              borderRadius: '12px',
              fontSize: '15px',
              textDecoration: 'none',
              textAlign: 'center',
            }}
          >
            Get started free
          </Link>
        </div>
      )}
    </nav>
  );
}
