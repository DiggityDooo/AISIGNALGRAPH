"use client";

import { usePathname } from "next/navigation";
import { HERO_ROUTES } from "@/config/nav";
import SideSocialRail from "@/components/ui/SideSocialRail";
import AeruGlassAccent from "@/components/ui/AeruGlassAccent";
import TopNav from "@/components/ui/TopNav";
import BackToTopButton from "@/components/ui/BackToTopButton";

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const showHeroChrome = HERO_ROUTES.has(usePathname());
  return (
    <>
      <a className="site-skip-link" href="#main-content">Skip to content</a>
      <TopNav />
      {showHeroChrome && <><SideSocialRail /><AeruGlassAccent /></>}
      {/* Page content only; fixed chrome (TopNav, BackToTop) and backgrounds sit outside this wrapper. */}
      <div id="main-content" tabIndex={-1} className="site-content relative z-10 w-full">{children}</div>
      <BackToTopButton />
    </>
  );
}
