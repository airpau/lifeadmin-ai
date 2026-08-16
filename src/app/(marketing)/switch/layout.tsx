import './switch.css';

/**
 * Nested layout for /switch. Renders inside the (marketing) layout, so
 * `.m-land-root`, MarkNav and MarkFoot are already in place. This exists
 * only to scope the switch stylesheet to the switch routes.
 */
export default function SwitchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
