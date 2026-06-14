/// <reference lib="webworker" />
import {
  buildGraphIndexFromPayload,
  buildTreeFromPayload,
} from "./graphTransform";

type WorkerRequest =
  | { type: "buildTree"; requestId: string; payload: { nodes: unknown[]; edges: unknown[] } }
  | { type: "buildIndex"; requestId: string; payload: { nodes: unknown[]; edges: unknown[] } };

type WorkerResponse =
  | { type: "buildTree"; requestId: string; result: ReturnType<typeof buildTreeFromPayload> }
  | { type: "buildIndex"; requestId: string; result: ReturnType<typeof buildGraphIndexFromPayload> }
  | { type: "error"; requestId: string; message: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === "buildTree") {
      const result = buildTreeFromPayload(msg.payload as Parameters<typeof buildTreeFromPayload>[0]);
      const response: WorkerResponse = { type: "buildTree", requestId: msg.requestId, result };
      self.postMessage(response);
      return;
    }
    if (msg.type === "buildIndex") {
      const result = buildGraphIndexFromPayload(msg.payload as Parameters<typeof buildGraphIndexFromPayload>[0]);
      const response: WorkerResponse = { type: "buildIndex", requestId: msg.requestId, result };
      self.postMessage(response);
      return;
    }
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
