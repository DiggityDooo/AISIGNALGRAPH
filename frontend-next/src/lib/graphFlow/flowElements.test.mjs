import test from "node:test";
import assert from "node:assert/strict";
import { buildFlowGraphElements } from "./flowElements.ts";

const samplePayload = {
  nodes: [
    { id: "root", label: "Root Story", type: "story", importance: 10, year: 2024 },
    { id: "child-a", label: "Child A", type: "entity", importance: 5, year: 2023 },
    { id: "child-b", label: "Child B", type: "topic", importance: 3, year: 2022 },
    { id: "grand", label: "Grandchild", type: "model", importance: 1, year: 2021 },
  ],
  edges: [
    { source: "root", target: "child-a" },
    { source: "root", target: "child-b" },
    { source: "child-a", target: "grand" },
  ],
};

test("buildFlowGraphElements adds a single synthetic hub connected to every true root", () => {
  const { nodes, edges } = buildFlowGraphElements(samplePayload);
  const hub = nodes.find((n) => n.id === "__root__");
  assert.ok(hub, "expected a synthetic __root__ hub node");
  assert.equal(hub.data.label, "AI Signal Graph");

  const hubEdges = edges.filter((e) => e.source === "__root__");
  assert.equal(hubEdges.length, 1);
  assert.equal(hubEdges[0].target, "root");
});

test("buildFlowGraphElements sizes cards by true graph degree", () => {
  const { nodes } = buildFlowGraphElements(samplePayload);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const root = byId.get("root");
  const grand = byId.get("grand");
  // root has 2 outgoing connections, grand has 1 incoming — root should render bigger.
  assert.ok(root.data.width > grand.data.width);
  assert.ok(root.data.height > grand.data.height);
});
