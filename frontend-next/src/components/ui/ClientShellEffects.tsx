"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

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

const SPLINE_BACKGROUND_ROUTES = new Set(["/", "/stories", "/entities"]);

export default function ClientShellEffects() {
  const pathname = usePathname();
  const showSplineBackground = SPLINE_BACKGROUND_ROUTES.has(pathname);

  return (
    <>
      {showSplineBackground && <SplineSiteBackground />}
      <div className="constellation-layer" aria-hidden>
        <GlobalCanvas />
      </div>
      <CustomCursor />
    </>
  );
}
