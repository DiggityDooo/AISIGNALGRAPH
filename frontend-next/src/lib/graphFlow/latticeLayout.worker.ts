/// <reference lib="webworker" />
import {
  buildGraphFromLayoutInput,
  LAYOUT_ITERATIONS,
  latticeLayoutSettings,
  runForceAtlas2Layout,
  type LayoutRequest,
  type LatticeLayoutInput,
  type LatticeLayoutPositions,
  type WorkerResponse,
} from "./latticeLayout";

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const msg = event.data;
  try {
    if (msg.type !== "layout") return;

    const graph = buildGraphFromLayoutInput(msg.input);
    const iterations = msg.iterations ?? LAYOUT_ITERATIONS;
    const positions = runForceAtlas2Layout(graph, iterations);

    const response: WorkerResponse = {
      type: "layout",
      requestId: msg.requestId,
      positions,
    };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      type: "error",
      requestId: msg.requestId,
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};

export {};
