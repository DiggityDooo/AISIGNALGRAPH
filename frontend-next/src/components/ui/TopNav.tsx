"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { PRIMARY_NAV } from "@/config/nav";

export default function TopNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);

  return (
    <header className="site-header masthead" onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        toggle.current?.focus();
      }
    }} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <div className="masthead-inner">
        <Link href="/" className="wordmark" onClick={() => setOpen(false)} aria-label="AI Signal Graph home">
          <span className="signal-mark" aria-hidden="true"><i/><i/><i/></span>
          AI<span>SIGNAL</span>GRAPH
        </Link>
        <button type="button" className="menu-toggle" ref={toggle}
          aria-controls="site-navigation" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Close" : "Menu"} <span aria-hidden="true">{open ? "×" : "≡"}</span>
        </button>
        <nav id="site-navigation" className="masthead-nav" data-open={open} aria-label="Primary">
          {PRIMARY_NAV.map(({ href, label }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
            return <Link key={href} href={href} aria-current={active ? "page" : undefined}
              onClick={() => setOpen(false)} className="nav-pill__link">{label}</Link>;
          })}
        </nav>
      </div>
    </header>
  );
}
