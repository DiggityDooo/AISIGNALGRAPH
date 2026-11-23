"use client";

import TopNav from "@/components/ui/TopNav";
import BackToTopButton from "@/components/ui/BackToTopButton";

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="site-skip-link" href="#main-content">Skip to content</a>
      <TopNav />
      {/* Page content only; fixed chrome (TopNav, BackToTop) and backgrounds sit outside this wrapper. */}
      <div id="main-content" tabIndex={-1} className="site-content relative z-10 w-full">{children}</div>
      <BackToTopButton />
    </>
  );
}
