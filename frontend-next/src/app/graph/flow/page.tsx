"use client";

import { useEffect } from "react";

// /graph/flow is consolidated into /graph?view=flow. This shim preserves the
// old URL so direct links and the video walkthrough keep working. A client
// redirect is used (rather than next.config `redirects`) because this app is a
// static export, where server-side redirects are not applied.
export default function GraphFlowRedirect() {
  useEffect(() => {
    window.location.replace("/graph?view=flow");
  }, []);

  return (
    <div className="relative w-full h-screen bg-[#050202] flex items-center justify-center">
      <p className="font-mono text-sm text-muted uppercase tracking-widest animate-pulse">
        Redirecting to lattice…
      </p>
    </div>
  );
}
