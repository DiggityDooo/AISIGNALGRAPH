/** Factory for the layout Web Worker. */

export function createLayoutWorker() {
  if (typeof Worker === "undefined") {
    return null;
  }
  try {
    return new Worker(new URL("./LayoutWorker.worker.js", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}
