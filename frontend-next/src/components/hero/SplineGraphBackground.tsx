"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadSplineViewerScript,
  resolveSplineGraphEmbed,
  type SplineGraphEmbed,
  type SplineGraphMode,
  type SplineViewerState,
} from "@/lib/splineScene";

type SplineGraphBackgroundProps = {
  mode: SplineGraphMode;
};

export default function SplineGraphBackground({ mode }: SplineGraphBackgroundProps) {
  const viewerRef = useRef<HTMLElement | null>(null);
  const [embed, setEmbed] = useState<SplineGraphEmbed | null>(null);
  const [configReady, setConfigReady] = useState(false);
  const [viewerState, setViewerState] = useState<SplineViewerState>("idle");

  useEffect(() => {
    let cancelled = false;
    setConfigReady(false);
    setEmbed(null);
    setViewerState("idle");

    resolveSplineGraphEmbed(mode)
      .then((resolved) => {
        if (!cancelled) {
          setEmbed(resolved);
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

    if (!embed) {
      queueMicrotask(() => {
        if (!cancelled) {
          setViewerState("failed");
        }
      });
      return () => {
        cancelled = true;
      };
    }

    if (embed.embedKind === "iframe") {
      queueMicrotask(() => {
        if (!cancelled) {
          setViewerState("ready");
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

    loadSplineViewerScript()
      .then(() => {
        if (!cancelled) {
          setViewerState("idle");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setViewerState("failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [configReady, embed]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (
      !viewer ||
      embed?.embedKind !== "viewer" ||
      viewerState === "failed" ||
      viewerState === "loading" ||
      !embed.embedUrl
    ) {
      return;
    }

    viewer.setAttribute("url", embed.embedUrl);
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
  }, [embed, viewerState]);

  const showVoidLayer =
    !configReady ||
    !embed ||
    (embed.embedKind === "viewer" &&
      (viewerState === "loading" || viewerState === "failed"));

  const showIframe = embed?.embedKind === "iframe" && viewerState === "ready";
  const showViewer =
    embed?.embedKind === "viewer" &&
    viewerState !== "failed" &&
    viewerState !== "loading";

  useEffect(() => {
    if (!showViewer && !showIframe) {
      return;
    }

    const nudgeViewerLayout = () => window.dispatchEvent(new Event("resize"));
    nudgeViewerLayout();
    const timers = [250, 1000].map((ms) => window.setTimeout(nudgeViewerLayout, ms));

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [showViewer, showIframe, embed?.embedUrl]);

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden
      data-testid="spline-graph-root"
      data-spline-graph-mode={mode}
      data-spline-state={viewerState}
      data-spline-embed={embed?.embedKind ?? "none"}
    >
      {showVoidLayer && (
        <div className="absolute inset-0 bg-[#050202]" data-testid="spline-graph-void" />
      )}

      {showIframe && (
        <iframe
          src={embed.embedUrl}
          title=""
          tabIndex={-1}
          className="h-full w-full border-0 opacity-60"
          data-testid="spline-graph-iframe"
        />
      )}

      {showViewer && (
        <spline-viewer
          ref={viewerRef}
          url={embed.embedUrl}
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
