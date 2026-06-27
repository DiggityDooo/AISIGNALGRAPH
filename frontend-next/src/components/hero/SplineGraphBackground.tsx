"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadSplineViewerScript,
  resolveSplineGraphViewerUrl,
  type SplineGraphMode,
  type SplineViewerState,
  validateViewerUrl,
} from "@/lib/splineScene";

type SplineGraphBackgroundProps = {
  mode: SplineGraphMode;
};

export default function SplineGraphBackground({ mode }: SplineGraphBackgroundProps) {
  const viewerRef = useRef<HTMLElement | null>(null);
  const [viewerUrl, setViewerUrl] = useState("");
  const [configReady, setConfigReady] = useState(false);
  const [viewerState, setViewerState] = useState<SplineViewerState>("idle");

  useEffect(() => {
    let cancelled = false;
    setConfigReady(false);
    setViewerUrl("");
    setViewerState("idle");

    resolveSplineGraphViewerUrl(mode)
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
  }, [mode]);

  useEffect(() => {
    if (!configReady) {
      return undefined;
    }

    let cancelled = false;

    if (!viewerUrl) {
      queueMicrotask(() => {
        if (!cancelled) {
          setViewerState("failed");
        }
      });
      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => {
      if (!cancelled) {
        setViewerState("loading");
      }
    });

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
  }, [viewerState, viewerUrl]);

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
    const timers = [250, 1000].map((ms) => window.setTimeout(nudgeViewerLayout, ms));

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [showViewer, viewerUrl]);

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden
      data-testid="spline-graph-root"
      data-spline-graph-mode={mode}
      data-spline-state={viewerState}
    >
      {showVoidLayer && (
        <div className="absolute inset-0 bg-[#050202]" data-testid="spline-graph-void" />
      )}

      {showViewer && (
        <spline-viewer
          ref={viewerRef}
          url={viewerUrl}
          loading="lazy"
          events-target="local"
          className="h-full w-full opacity-60"
          data-testid="spline-graph-viewer"
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-[#050202]/40 via-transparent to-[#050202]/80" />
    </div>
  );
}
