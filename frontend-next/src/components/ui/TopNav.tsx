"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HEADER_CTA, PRIMARY_NAV } from "@/config/nav";

function isNavActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function TopNav() {
  const pathname = usePathname();

  return (
    <header className="site-header fixed top-0 left-0 w-full z-50 px-4 md:px-8 pt-5 pointer-events-none">
      <div className="relative mx-auto flex items-center justify-center min-h-[52px]">
        <Link
          href="/"
          className="site-header__brand pointer-events-auto font-display font-bold text-lg md:text-xl tracking-[0.2em] uppercase text-primary absolute left-0"
        >
          AISIGNALGRAPH
        </Link>

        <nav
          className="nav-pill pointer-events-auto hidden sm:flex items-center gap-1 md:gap-2 px-2 py-1.5"
          aria-label="Primary"
        >
          {PRIMARY_NAV.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-pill__link${active ? " nav-pill__link--active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href={HEADER_CTA.href}
          className="header-cta glass-pill glass-pill--primary pointer-events-auto absolute right-0"
        >
          {HEADER_CTA.label}
        </Link>
      </div>
    </header>
  );
}
