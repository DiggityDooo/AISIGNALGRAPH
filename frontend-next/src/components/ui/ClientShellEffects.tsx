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

/**
 * Graph routes own their WebGL context (Sigma/Three). Mounting the site-wide
 * R3F constellation canvas alongside them doubles GPU contexts and exhausts
 * weak mobile GPUs (context loss / tab crash), so it is excluded here.
 */
const GRAPH_ROUTE_PREFIX = "/graph";

export default function ClientShellEffects() {
  const pathname = usePathname();
  const showSplineBackground = SPLINE_BACKGROUND_ROUTES.has(pathname);
  const isGraphRoute = pathname === GRAPH_ROUTE_PREFIX || pathname.startsWith(`${GRAPH_ROUTE_PREFIX}/`);
  const [mountSpline, setMountSpline] = useState(false);
  const [posterHidden, setPosterHidden] = useState(false);

  useEffect(() => {
    if (!showSplineBackground) {
      return undefined;
    }

    const cancelPaint = scheduleAfterFirstPaint(() => setMountSpline(true));

    return () => {
      cancelPaint();
      setMountSpline(false);
      setPosterHidden(false);
    };
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
      {!isGraphRoute && (
        <div className="constellation-layer" aria-hidden>
          <GlobalCanvas />
        </div>
      )}
      <CustomCursor />
    </>
  );
}
