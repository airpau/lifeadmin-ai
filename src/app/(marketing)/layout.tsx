import { MarkNav, MarkFoot } from '@/app/blog/_shared';
import './styles.css';

/**
 * Layout for the 11 /(marketing)/* SEO landing pages.
 *
 * Wraps children in `.m-land-root` so the scoped stylesheet applies,
 * and uses the same MarkNav/MarkFoot as the blog + marketing hub.
 * Individual page bodies render via `<LandingPage data={...} />`.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="m-land-root">
      <MarkNav />
      {children}
      <MarkFoot />
    </div>
  );
}
