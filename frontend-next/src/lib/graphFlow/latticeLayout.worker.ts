/// <reference lib="webworker" />
import {
  buildGraphFromLayoutInput,
  clampLayoutIterations,
  runForceAtlas2Layout,
  type LayoutRequest,
  type WorkerResponse,
} from "./latticeLayout";

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
  try {
    if (msg.type !== "layout") return;

    const graph = buildGraphFromLayoutInput(msg.input);
    const iterations = clampLayoutIterations(msg.iterations);
    const positions = runForceAtlas2Layout(graph, iterations);

    const response: WorkerResponse = {
      type: "layout",
      requestId,
      positions,
    };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      type: "error",
      requestId,
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};

export {};

export {};
