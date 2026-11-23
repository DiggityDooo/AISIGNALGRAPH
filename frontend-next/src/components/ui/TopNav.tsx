"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { HEADER_CTA, PRIMARY_NAV } from "@/config/nav";

function isNavActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
}

export default function TopNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);

  return (
    <header className="site-header fixed top-0 left-0 w-full z-50 px-4 md:px-8 pt-5 pointer-events-none"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          toggle.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <div className="site-header__inner relative mx-auto min-h-[52px]">
        <Link href="/" onClick={() => setOpen(false)}
          className="site-header__brand pointer-events-auto font-display font-bold uppercase text-primary"
        >
          AISIGNALGRAPH
        </Link>

        <button className="site-header__toggle nav-pill pointer-events-auto" type="button"
          ref={toggle} aria-expanded={open} aria-controls="site-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close" : "Menu"}
        </button>

        <nav id="site-navigation" data-open={open}
          className="site-header__navigation nav-pill pointer-events-auto" aria-label="Primary"
        >
          {PRIMARY_NAV.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href}
                className={`nav-pill__link${active ? " nav-pill__link--active" : ""}`}
                aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link href={HEADER_CTA.href} onClick={() => setOpen(false)}
          className="header-cta glass-pill glass-pill--primary pointer-events-auto"
        >
          {HEADER_CTA.label}
        </Link>
      </div>
    </header>
  );
}
