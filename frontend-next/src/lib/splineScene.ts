export type SplineSceneConfig = {
  viewerUrl?: string;
  sceneUrl?: string;
};

export type SplineGraphMode = "treeFlow" | "lattice";

export type SplineGraphSceneConfig = {
  treeFlow?: SplineSceneConfig;
  lattice?: SplineSceneConfig;
};

export type SplineViewerState = "idle" | "loading" | "ready" | "failed";

/** Run work after first paint so LCP can settle on static hero assets. */
export function scheduleAfterFirstPaint(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let cancelled = false;
  const run = () => {
    if (!cancelled) {
      callback();
    }
  };

  const outerFrame = requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(run, { timeout: 2500 });
      } else {
        globalThis.setTimeout(run, 1);
      }
    });
  });

  return () => {
    cancelled = true;
    cancelAnimationFrame(outerFrame);
  };
}

const SPLINE_VIEWER_SCRIPT =
  "https://unpkg.com/@splinetool/viewer@1.9.82/build/spline-viewer.js";

const BUILD_TIME_VIEWER_URL =
  process.env.NEXT_PUBLIC_SPLINE_SCENE_URL?.trim() ?? "";

const PROD_SCENE_CONFIG_PATH = "/static/spline-scene.json";
const DEV_SCENE_CONFIG_PATH = "/spline-scene.json";
const PROD_GRAPH_SCENE_CONFIG_PATH = "/static/spline-graph-scene.json";
const DEV_GRAPH_SCENE_CONFIG_PATH = "/spline-graph-scene.json";

const VIEWER_CODE_RE = /\.splinecode(?:\?.*)?$/i;
const PUBLIC_SPLINE_RE = /my\.spline\.design/i;
const PROD_SPLINE_RE = /prod\.spline\.design/i;

export function getSplineViewerScriptUrl(): string {
  return SPLINE_VIEWER_SCRIPT;
}

export function deriveViewerUrlFromPublicUrl(publicUrl: string): string | null {
  const trimmed = publicUrl.trim();
  if (!PUBLIC_SPLINE_RE.test(trimmed)) {
    return null;
  }

  try {
    const slug = new URL(trimmed).pathname.split("/").filter(Boolean).pop() ?? "";
    const dash = slug.lastIndexOf("-");
    if (dash <= 0 || dash >= slug.length - 1) {
      return null;
    }
    const sceneId = slug.slice(dash + 1);
    return `https://prod.spline.design/${sceneId}/scene.splinecode`;
  } catch {
    return null;
  }
}

export function normalizeViewerUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  if (VIEWER_CODE_RE.test(trimmed)) {
    return trimmed;
  }

  if (PUBLIC_SPLINE_RE.test(trimmed)) {
    return deriveViewerUrlFromPublicUrl(trimmed) ?? "";
  }

  if (PROD_SPLINE_RE.test(trimmed)) {
    return trimmed.endsWith("/")
      ? `${trimmed}scene.splinecode`
      : `${trimmed.replace(/\/+$/, "")}/scene.splinecode`;
  }

  return trimmed;
}

export function resolveViewerUrlFromConfig(config: SplineSceneConfig): string {
  const directViewer = config.viewerUrl?.trim() ?? "";
  if (directViewer) {
    return normalizeViewerUrl(directViewer);
  }

  const legacyScene = config.sceneUrl?.trim() ?? "";
  if (!legacyScene) {
    return "";
  }

  return normalizeViewerUrl(legacyScene);
}

async function fetchSceneConfig(path: string): Promise<SplineSceneConfig | null> {
  try {
    const response = await fetch(path, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as SplineSceneConfig;
  } catch {
    return null;
  }
}

function resolveGraphViewerUrlFromBundle(
  config: SplineGraphSceneConfig | null,
  mode: SplineGraphMode,
): string {
  if (!config) {
    return "";
  }

  const modeConfig = config[mode];
  return modeConfig ? resolveViewerUrlFromConfig(modeConfig) : "";
}

export async function resolveSplineGraphViewerUrl(
  mode: SplineGraphMode,
): Promise<string> {
  const prodConfig = (await fetchSceneConfig(
    PROD_GRAPH_SCENE_CONFIG_PATH,
  )) as SplineGraphSceneConfig | null;
  const prodUrl = resolveGraphViewerUrlFromBundle(prodConfig, mode);
  if (prodUrl) {
    return prodUrl;
  }

  if (process.env.NODE_ENV === "development") {
    const devConfig = (await fetchSceneConfig(
      DEV_GRAPH_SCENE_CONFIG_PATH,
    )) as SplineGraphSceneConfig | null;
    return resolveGraphViewerUrlFromBundle(devConfig, mode);
  }

  return "";
}

export async function resolveSplineViewerUrl(): Promise<string> {
  if (BUILD_TIME_VIEWER_URL) {
    return normalizeViewerUrl(BUILD_TIME_VIEWER_URL);
  }

  const prodConfig = await fetchSceneConfig(PROD_SCENE_CONFIG_PATH);
  const prodUrl = prodConfig ? resolveViewerUrlFromConfig(prodConfig) : "";
  if (prodUrl) {
    return prodUrl;
  }

  if (process.env.NODE_ENV === "development") {
    const devConfig = await fetchSceneConfig(DEV_SCENE_CONFIG_PATH);
    return devConfig ? resolveViewerUrlFromConfig(devConfig) : "";
  }

  return "";
}

export async function validateViewerUrl(viewerUrl: string): Promise<boolean> {
  if (!viewerUrl) {
    return false;
  }

  try {
    const response = await fetch(viewerUrl, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function loadSplineViewerScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (customElements.get("spline-viewer")) {
    return Promise.resolve();
  }

  const scriptUrl = getSplineViewerScriptUrl();
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${scriptUrl}"]`,
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
    script.src = scriptUrl;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener(
      "error",
      () => reject(new Error("Spline viewer failed to load")),
      { once: true },
    );
    document.head.appendChild(script);
  });
}
