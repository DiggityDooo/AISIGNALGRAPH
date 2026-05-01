"use strict";

async function loadLegacyGraph() {
  const existing = document.querySelector('script[data-aisg-legacy="1"]');
  if (existing) {
    return;
  }
  const script = document.createElement("script");
  script.src = "/static/graph.js";
  script.defer = true;
  script.dataset.aisgLegacy = "1";
  document.head.appendChild(script);
}

function preferredEngine() {
  const url = new URL(window.location.href);
  const query = url.searchParams.get("engine");
  if (query === "legacy" || query === "v2") {
    return query;
  }
  const local = window.localStorage.getItem("aisg-engine");
  if (local === "legacy" || local === "v2") {
    return local;
  }
  return "v2";
}

async function bootstrap() {
  const root = document.getElementById("app-root");
  if (!root) {
    return;
  }

  const engine = preferredEngine();
  if (engine === "legacy") {
    await loadLegacyGraph();
    return;
  }

  try {
    const module = await import("/static/graph2/main.js");
    await module.bootstrapGraphV2();
    window.__AISG_ENGINE = "v2";
  } catch (error) {
    console.error("AISIGNALGRAPH v2 failed. Falling back to legacy graph.js.", error);
    window.__AISG_ENGINE = "legacy-fallback";
    await loadLegacyGraph();
  }
}

bootstrap();

