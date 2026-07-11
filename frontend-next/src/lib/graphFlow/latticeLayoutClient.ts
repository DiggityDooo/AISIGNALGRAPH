import type {
  LatticeLayoutInput,
  LatticeLayoutPositions,
  LayoutRequest,
  WorkerResponse,
} from "./latticeLayout";

export interface LayoutClient {
  /** Run the layout for `input`, resolving with positions. Rejects on worker
   * error, unreadable message, or abort. */
  run(
    input: LatticeLayoutInput,
    signal: AbortSignal,
    iterations: number,
  ): Promise<LatticeLayoutPositions>;
  /** Terminate the underlying worker (if any). Safe to call more than once. */
  dispose(): void;
}

function createLayoutWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./latticeLayout.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return null;
  }
}

/** Keep only finite x/y positions so bad worker payloads cannot poison layout or localStorage. */
export function sanitizeLayoutPositions(raw: unknown): LatticeLayoutPositions {
  if (!raw || typeof raw !== "object") return {};
  const out: LatticeLayoutPositions = {};
  for (const [id, pos] of Object.entries(raw as Record<string, unknown>)) {
    if (!pos || typeof pos !== "object") continue;
    const x = (pos as { x?: unknown }).x;
    const y = (pos as { y?: unknown }).y;
    if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
      out[id] = { x, y };
    }
  }
  return out;
}

/**
 * Real adapter seam for lattice layout. The default client runs ForceAtlas2 in
 * a Web Worker; the transport (worker vs. main-thread) is swappable behind the
 * `LayoutClient` interface without touching callers.
 */
export function createLayoutClient(): LayoutClient {
  let worker = createLayoutWorker();

  const ensureWorker = (): Worker | null => {
    if (!worker) worker = createLayoutWorker();
    return worker;
  };

  return {
    run(input, signal, iterations) {
      const active = ensureWorker();
      if (!active) {
        return Promise.reject(new Error("layout worker unavailable"));
      }
      const requestId = crypto.randomUUID();
      return new Promise<LatticeLayoutPositions>((resolve, reject) => {
        const cleanup = () => {
          active.removeEventListener("message", onMessage);
          active.removeEventListener("error", onError);
          active.removeEventListener("messageerror", onMessageError);
          signal.removeEventListener("abort", onAbort);
        };
        const onMessage = (event: MessageEvent<WorkerResponse>) => {
          const data = event.data;
          if (!data || data.requestId !== requestId) return;
          cleanup();
          if (data.type === "error") {
            reject(new Error(data.message ?? "layout worker error"));
            return;
          }
          resolve(sanitizeLayoutPositions(data.positions));
        };
        const onError = (event: ErrorEvent) => {
          cleanup();
          reject(event.error instanceof Error ? event.error : new Error(event.message));
        };
        const onMessageError = () => {
          cleanup();
          reject(new Error("Lattice layout worker returned an unreadable message"));
        };
        const onAbort = () => {
          cleanup();
          // Stop in-flight ForceAtlas2; next run recreates the worker.
          active.terminate();
          if (worker === active) worker = null;
          reject(new DOMException("Lattice layout cancelled", "AbortError"));
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        active.addEventListener("message", onMessage);
        active.addEventListener("error", onError);
        active.addEventListener("messageerror", onMessageError);
        signal.addEventListener("abort", onAbort, { once: true });
        try {
          active.postMessage({ type: "layout", requestId, input, iterations } as LayoutRequest);
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
    },
  };
}
