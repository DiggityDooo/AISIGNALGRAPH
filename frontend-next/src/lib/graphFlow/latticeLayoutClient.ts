import type {
  LatticeLayoutInput,
  LatticeLayoutPositions,
  LayoutRequest,
  WorkerResponse,
} from "./latticeLayout";
export type { LayoutRequest, WorkerResponse } from "./latticeLayout";

export interface LayoutClient {
  /** Run the layout for `input`, resolving with positions. Rejects on worker
   * error, unreadable message, or abort. */
  run(
    input: LatticeLayoutInput,
    signal: AbortSignal,
    iterations: number,
  ): Promise<LatticeLayoutPositions>;
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

/**
 * Real adapter seam for lattice layout. The default client runs ForceAtlas2 in
 * a Web Worker; the transport (worker vs. main-thread) is swappable behind the
 * `LayoutClient` interface without touching callers.
 */
export function createLayoutClient(): LayoutClient {
  const worker = createLayoutWorker();

  return {
    run(input, signal, iterations) {
      if (!worker) {
        return Promise.reject(new Error("layout worker unavailable"));
      }
      const requestId = crypto.randomUUID();
      return new Promise<LatticeLayoutPositions>((resolve, reject) => {
        const cleanup = () => {
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
          worker.removeEventListener("messageerror", onMessageError);
          signal.removeEventListener("abort", onAbort);
        };
        const onMessage = (event: MessageEvent<WorkerResponse>) => {
          const data = event.data;
          if (data.requestId !== requestId) return;
          cleanup();
          if (data.type === "error") reject(new Error(data.message ?? "layout worker error"));
          else resolve(data.positions);
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
          reject(new DOMException("Lattice layout cancelled", "AbortError"));
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        worker.addEventListener("message", onMessage);
        worker.addEventListener("error", onError);
        worker.addEventListener("messageerror", onMessageError);
        signal.addEventListener("abort", onAbort, { once: true });
        try {
          worker.postMessage({ type: "layout", requestId, input, iterations } as LayoutRequest);
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
    },
  };
}
