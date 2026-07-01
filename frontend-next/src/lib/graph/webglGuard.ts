/**
 * Shared WebGL context-loss guard for graph surfaces (Sigma, Three.js).
 *
 * Mobile GPUs drop contexts under memory pressure. Without a handler the
 * page keeps a dead black canvas (perceived as a crash). Callers decide the
 * recovery policy (rebuild once, then surface an error); this module only
 * normalizes binding: `preventDefault()` (required so the browser allows
 * restoration) and one listener per canvas.
 */

const BOUND_FLAG = "contextLossBound";

/**
 * Attach a `webglcontextlost` handler to every canvas under `host` that is
 * not already guarded. Safe to call repeatedly after re-mounts — canvases
 * are tagged via a data attribute so listeners are never doubled.
 */
export function bindWebglContextLossHandler(
  host: HTMLElement,
  onContextLost: (event: Event) => void,
): void {
  const canvases = host.querySelectorAll("canvas");
  canvases.forEach((canvas) => {
    if (canvas.dataset[BOUND_FLAG] === "true") {
      return;
    }
    canvas.dataset[BOUND_FLAG] = "true";
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      onContextLost(event);
    });
  });
}

/**
 * Dev-only invariant from the single-WebGL-context policy: the site-wide
 * constellation canvas must never be mounted alongside a graph renderer.
 */
export function assertSingleWebglSurface(): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  if (document.querySelector(".constellation-layer canvas")) {
    console.error(
      "Graph WebGL policy violation: site-wide GlobalCanvas is mounted alongside the graph renderer. " +
        "Graph routes must be excluded in ClientShellEffects.tsx.",
    );
  }
}
