"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePointerReactiveSurface } from "@/hooks/usePointerReactiveSurface";
import {
  loadSplineViewerScript,
  resolveSplineViewerUrl,
  type SplineViewerState,
  validateViewerUrl,
} from "@/lib/splineScene";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "spline-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          url?: string;
          loading?: "lazy" | "eager";
          "events-target"?: "global" | "local";
        },
        HTMLElement
      >;
    }
  }
}

type SplineSiteBackgroundProps = {
  onReady?: () => void;
};

export default function SplineSiteBackground({ onReady }: SplineSiteBackgroundProps) {
  usePointerReactiveSurface();

  const [portalReady, setPortalReady] = useState(false);
  const viewerRef = useRef<HTMLElement | null>(null);
  const [viewerUrl, setViewerUrl] = useState("");
  const [configReady, setConfigReady] = useState(false);
  const [viewerState, setViewerState] = useState<SplineViewerState>("idle");

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    resolveSplineViewerUrl()
      .then((url) => {
        if (!cancelled) {
          setViewerUrl(url);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setConfigReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!configReady) {
      return;
    }

    if (!viewerUrl) {
      setViewerState("failed");
      return;
    }

    let cancelled = false;
    setViewerState("loading");

    validateViewerUrl(viewerUrl)
      .then((isValid) => {
        if (cancelled) {
          return;
        }
        if (!isValid) {
          setViewerState("failed");
          return;
        }
        return loadSplineViewerScript().then(() => {
          if (!cancelled) {
            setViewerState("idle");
          }
        });
      })
      .catch(() => {
        if (!cancelled) {
          setViewerState("failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [configReady, viewerUrl]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewerState === "failed" || viewerState === "loading" || !viewerUrl) {
      return;
    }

    viewer.setAttribute("url", viewerUrl);
    viewer.setAttribute("loading", "lazy");
    viewer.setAttribute("events-target", "local");

    const hideWatermark = () => {
      const logo = viewer.shadowRoot?.querySelector("#logo");
      if (logo instanceof HTMLElement) {
        logo.style.display = "none";
      }
    };

    const markReady = () => {
      hideWatermark();
      setViewerState("ready");
      onReady?.();
    };

    hideWatermark();
    viewer.addEventListener("load", markReady);

    const logoTimer = window.setInterval(hideWatermark, 500);
    const logoStopTimer = window.setTimeout(() => {
      window.clearInterval(logoTimer);
    }, 10_000);

    return () => {
      viewer.removeEventListener("load", markReady);
      window.clearInterval(logoTimer);
      window.clearTimeout(logoStopTimer);
    };
  }, [onReady, viewerState, viewerUrl]);

  const showVoidLayer =
    !configReady ||
    !viewerUrl ||
    viewerState === "loading" ||
    viewerState === "failed";

  const showViewer =
    Boolean(viewerUrl) &&
    viewerState !== "failed" &&
    viewerState !== "loading";

  useEffect(() => {
    if (!showViewer) {
      return;
    }

    const nudgeViewerLayout = () => window.dispatchEvent(new Event("resize"));
    nudgeViewerLayout();
    const timers = [250, 1000, 2500].map((ms) =>
      window.setTimeout(nudgeViewerLayout, ms),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [showViewer, viewerUrl]);

  const layer = (
    <div
      className="spline-site-root overflow-hidden pointer-events-none"
      aria-hidden
      data-testid="spline-site-root"
      data-spline-state={viewerState}
    >
      {showVoidLayer && (
        <div className="spline-site-void absolute inset-0" data-testid="spline-site-void" />
      )}

      <div className="spline-site-stage">
        {showViewer && (
          <spline-viewer
            ref={viewerRef}
            url={viewerUrl}
            loading="lazy"
            events-target="local"
            className="spline-site-layer h-full w-full"
            data-testid="spline-viewer"
          />
        )}
      </div>

      <div className="spline-site-vignette absolute inset-0" />
      <div className="spline-site-ambient absolute inset-0" />
      <div className="spline-site-hero-fade absolute inset-x-0 bottom-0" aria-hidden />
    </div>
  );

  if (!portalReady) {
    return null;
  }

  return createPortal(layer, document.body);
}
