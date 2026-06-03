"use client";

import TopNav from "@/components/ui/TopNav";
import SideSocialRail from "@/components/ui/SideSocialRail";
import BackToTopButton from "@/components/ui/BackToTopButton";
import AeruGlassAccent from "@/components/ui/AeruGlassAccent";

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      <SideSocialRail />
      <AeruGlassAccent />
      {/* Page content only; fixed chrome (TopNav, BackToTop) and backgrounds sit outside this wrapper. */}
      <div className="site-content relative z-10 w-full">{children}</div>
      <BackToTopButton />
    </>
  );
}
