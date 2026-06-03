const DEFAULT_POINTER_X = "72%";
const DEFAULT_POINTER_Y = "28%";

type PointerPercent = { x: number; y: number };

let subscriberCount = 0;
let rafId: number | null = null;
let latest: PointerPercent | null = null;
let pointerInside = true;

function writeCssVars(x: number, y: number) {
  const root = document.documentElement;
  root.style.setProperty("--pointer-x", `${x.toFixed(2)}%`);
  root.style.setProperty("--pointer-y", `${y.toFixed(2)}%`);
}

function resetCssVars() {
  const root = document.documentElement;
  root.style.setProperty("--pointer-x", DEFAULT_POINTER_X);
  root.style.setProperty("--pointer-y", DEFAULT_POINTER_Y);
}

function tick() {
  rafId = null;
  if (latest !== null && pointerInside) {
    writeCssVars(latest.x, latest.y);
  }
}

function scheduleWrite(x: number, y: number) {
  latest = { x, y };
  if (rafId === null) {
    rafId = window.requestAnimationFrame(tick);
  }
}

function handlePointerMove(event: PointerEvent) {
  if (event.pointerType !== "mouse") {
    return;
  }
  pointerInside = true;
  const x = (event.clientX / Math.max(window.innerWidth, 1)) * 100;
  const y = (event.clientY / Math.max(window.innerHeight, 1)) * 100;
  scheduleWrite(x, y);
}

function handlePointerLeave() {
  pointerInside = false;
  latest = null;
  resetCssVars();
}

function start() {
  if (subscriberCount > 0) {
    return;
  }
  resetCssVars();
  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("pointerleave", handlePointerLeave, { passive: true });
}

function stop() {
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerleave", handlePointerLeave);
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId);
    rafId = null;
  }
  latest = null;
  pointerInside = true;
  document.documentElement.style.removeProperty("--pointer-x");
  document.documentElement.style.removeProperty("--pointer-y");
}

/** Subscribe to shared pointer CSS vars (--pointer-x, --pointer-y). */
export function subscribePointerPosition(): () => void {
  subscriberCount += 1;
  if (subscriberCount === 1) {
    start();
  }
  return () => {
    subscriberCount -= 1;
    if (subscriberCount === 0) {
      stop();
    }
  };
}
