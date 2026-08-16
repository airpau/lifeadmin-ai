import './tools.css';

/**
 * Nested layout for /tools. Renders inside the (marketing) layout, so
 * `.m-land-root`, MarkNav and MarkFoot are already in place. This exists
 * only to scope the tools stylesheet to the tools routes.
 */
export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
