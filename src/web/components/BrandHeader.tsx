/**
 * Branded page header.
 * A generic Flatirons-inspired mark (not the official city logo) with the
 * municipal wordmark and the independent-demo qualification. An optional
 * `right` slot hosts page-level controls (for example the demo-clock toggle).
 */
import type { ReactNode } from "react";

export function BrandHeader({
  title,
  subtitle = "Independent developer demo",
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="brand-bar">
      <div className="brand-inner">
        <span className="brand-mark" aria-hidden="true">
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative mark; the adjacent wordmark conveys the name. */}
          <svg viewBox="0 0 76 40" width="44" height="23" focusable="false">
            <path
              d="M2 38 L15 11 L23 24 L35 2 L47 22 L57 10 L74 38 Z"
              fill="currentColor"
            />
          </svg>
        </span>
        <span className="brand-text">
          <span className="brand-name">{title}</span>
          <span className="brand-sub">{subtitle}</span>
        </span>
        {right ?? <span className="brand-badge">Demo</span>}
      </div>
    </header>
  );
}
