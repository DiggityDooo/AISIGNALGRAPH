"use client";

import { useEffect, useRef, useState } from "react";
import { usePointerReactiveSurface } from "@/hooks/usePointerReactiveSurface";

const SPLINE_VIEWER_SCRIPT =
  "https://unpkg.com/@splinetool/viewer/build/spline-viewer.js";

const BUILD_TIME_SCENE_URL =
  process.env.NEXT_PUBLIC_SPLINE_SCENE_URL?.trim() ?? "";

const PROD_SCENE_CONFIG_PATH = "/static/spline-scene.json";
const DEV_SCENE_CONFIG_PATH = "/spline-scene.json";

type EmbedState = "idle" | "loading" | "ready" | "failed";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "spline-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          url?: string;
          "events-target"?: "global" | "local";
        },
        HTMLElement
      >;
    }
  }
}

function isPublicSplineIframeUrl(url: string): boolean {
  return /my\.spline\.design/i.test(url);
}

function normalizeIframeUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return trimmed;
  }
  if (/\/embed$/i.test(trimmed)) {
    return `${trimmed}/`;
  }
  return `${trimmed}/embed/`;
}

function loadSplineViewerScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (customElements.get("spline-viewer")) {
    return Promise.resolve();
  }
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${SPLINE_VIEWER_SCRIPT}"]`,
  );
  if (existing?.dataset.loaded === "true") {
    return Promise.resolve();
  }
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = SPLINE_VIEWER_SCRIPT;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error("Spline viewer failed to load")));
    document.head.appendChild(script);
  });
}

async function fetchSceneConfig(path: string): Promise<string> {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    return "";
  }
  const payload = (await response.json()) as { sceneUrl?: string };
  return payload.sceneUrl?.trim() ?? "";
}

async function resolveSceneUrl(): Promise<string> {
  if (BUILD_TIME_SCENE_URL) {
    return BUILD_TIME_SCENE_URL;
  }

  const prodUrl = await fetchSceneConfig(PROD_SCENE_CONFIG_PATH);
  if (prodUrl) {
    return prodUrl;
  }

  if (process.env.NODE_ENV === "development") {
    return fetchSceneConfig(DEV_SCENE_CONFIG_PATH);
  }

  return "";
}

export default function SplineSiteBackground() {
  usePointerReactiveSurface();

  const viewerRef = useRef<HTMLElement | null>(null);
  const [sceneUrl, setSceneUrl] = useState("");
  const [configReady, setConfigReady] = useState(false);
  const [embedState, setEmbedState] = useState<EmbedState>("idle");

  const useIframeEmbed = isPublicSplineIframeUrl(sceneUrl);
  const useViewerEmbed = Boolean(sceneUrl) && !useIframeEmbed;

  useEffect(() => {
    let cancelled = false;
    resolveSceneUrl()
      .then((url) => {
        if (!cancelled) {
          setSceneUrl(url);
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
    if (!configReady || !sceneUrl) {
      return;
    }

    if (useIframeEmbed) {
      setEmbedState("loading");
      return;
    }

    if (!useViewerEmbed) {
      return;
    }

    let cancelled = false;
    setEmbedState("loading");
    loadSplineViewerScript()
      .then(() => {
        if (!cancelled) {
          setEmbedState("idle");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEmbedState("failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [configReady, sceneUrl, useIframeEmbed, useViewerEmbed]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !useViewerEmbed || embedState === "failed") {
      return;
    }
    const markLoaded = () => setEmbedState("ready");
    viewer.addEventListener("load", markLoaded);
    return () => viewer.removeEventListener("load", markLoaded);
  }, [embedState, useViewerEmbed, sceneUrl]);

  const showVoidLayer = !configReady || !sceneUrl || embedState !== "ready";

  const showViewer =
    useViewerEmbed && embedState !== "failed" && embedState !== "loading";

  return (
    <div className="spline-site-root fixed inset-0 z-[-1] overflow-hidden pointer-events-none" aria-hidden>
      {showVoidLayer && <div className="spline-site-void absolute inset-0" />}

      {useIframeEmbed && (
        <iframe
          title="AISIGNALGRAPH 3D atmosphere"
          src={normalizeIframeUrl(sceneUrl)}
          className="spline-site-iframe absolute inset-0 h-full w-full border-0"
          loading="eager"
          allow="autoplay; fullscreen"
          onLoad={() => setEmbedState("ready")}
        />
      )}

      {showViewer && (
        <spline-viewer
          ref={viewerRef}
          url={sceneUrl}
          events-target="global"
          className="spline-site-layer absolute inset-0 h-full w-full"
        />
      )}

      <div className="spline-site-vignette absolute inset-0" />
      <div className="spline-site-ambient absolute inset-0" />
    </div>
  );
}
