'use client';

import { useEffect } from 'react';

/**
 * Mounts once and wires up IntersectionObserver for all .hp-reveal elements
 * inside [data-homepage="true"]. Adds .hp-visible when they enter the viewport.
 * Respects prefers-reduced-motion — skips animations if set.
 */
export default function AnimInit() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const selector = '[data-homepage="true"] .hp-reveal';

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('hp-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    const els = document.querySelectorAll(selector);
    els.forEach((el) => observer.observe(el));

    // Also observe any elements added later (e.g. after hydration)
    const mutationObserver = new MutationObserver(() => {
      document.querySelectorAll(`${selector}:not(.hp-observed)`).forEach((el) => {
        el.classList.add('hp-observed');
        observer.observe(el);
      });
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return null;
}
