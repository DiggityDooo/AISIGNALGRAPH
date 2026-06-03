"use client";

import dynamic from "next/dynamic";

const SplineSiteBackground = dynamic(
  () => import("@/components/hero/SplineSiteBackground"),
  { ssr: false },
);

const GlobalCanvas = dynamic(() => import("@/components/webgl/GlobalCanvas"), {
  ssr: false,
});

const CustomCursor = dynamic(() => import("@/components/ui/CustomCursor"), {
  ssr: false,
});

export default function ClientShellEffects() {
  return (
    <>
      <SplineSiteBackground />
      <div className="constellation-layer" aria-hidden>
        <GlobalCanvas />
      </div>
      <CustomCursor />
    </>
  );
}
