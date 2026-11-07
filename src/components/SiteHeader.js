"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Live Scores" },
  { href: "/login", label: "Sign in" },
];

// Top bar shown on every page. Keeping sign-in on its own page leaves the
// home page free for scores.
export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" href="/" aria-label="UW Score Tracker home">
          <span className="brand-mark" aria-hidden="true">UW</span>
          <span className="brand-name">Score Tracker</span>
        </Link>
        <nav className="site-nav" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="site-nav-link"
              aria-current={pathname === link.href ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
