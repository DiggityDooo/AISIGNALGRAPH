"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import SplineHeroPoster from "@/components/hero/SplineHeroPoster";
import { scheduleAfterFirstPaint } from "@/lib/splineScene";

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
  const [mountSpline, setMountSpline] = useState(false);
  const [posterHidden, setPosterHidden] = useState(false);

  useEffect(() => {
    if (!showSplineBackground) {
      setMountSpline(false);
      setPosterHidden(false);
      return;
    }

    setMountSpline(false);
    setPosterHidden(false);
    return scheduleAfterFirstPaint(() => setMountSpline(true));
  }, [showSplineBackground]);

  return (
    <>
      {showSplineBackground && (
        <>
          <SplineHeroPoster hidden={posterHidden} />
          {mountSpline && (
            <SplineSiteBackground onReady={() => setPosterHidden(true)} />
          )}
        </>
      )}
      <div className="constellation-layer" aria-hidden>
        <GlobalCanvas />
      </div>
      <CustomCursor />
    </>
  );
}
