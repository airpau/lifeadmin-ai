/**
 * Route-level loading state for /auth/login and /auth/signup.
 *
 * This previously rendered a full-screen dark slab (slate-950 gradient with
 * text-slate-400) while the auth pages themselves are light. Every navigation
 * from the marketing site therefore flashed a near-black screen carrying dim
 * grey "Loading..." text, then flipped to white — which reads as a broken or
 * hung page rather than a fast one, and made the transition feel far longer
 * than it measured.
 *
 * It is now a skeleton of the destination: same background, same card, same
 * proportions. The eye has nothing to re-adjust to when the real page lands,
 * so the transition reads as instant even when the network is not.
 *
 * aria-busy + a polite live region so a screen reader announces the wait
 * rather than reading a wall of empty boxes.
 */
import '../auth.css';

export default function Loading() {
  return (
    <div className="auth-skeleton" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="auth-skeleton__wrap">
        <div className="auth-skeleton__brand sk" />
        <div className="auth-skeleton__title sk" />
        <div className="auth-skeleton__sub sk" />
        <div className="auth-skeleton__card">
          <div className="auth-skeleton__btn sk" />
          <div className="auth-skeleton__btn sk" />
          <div className="auth-skeleton__divider sk" />
          <div className="auth-skeleton__label sk" />
          <div className="auth-skeleton__input sk" />
          <div className="auth-skeleton__label sk" />
          <div className="auth-skeleton__input sk" />
          <div className="auth-skeleton__submit sk" />
        </div>
      </div>
    </div>
  );
}
