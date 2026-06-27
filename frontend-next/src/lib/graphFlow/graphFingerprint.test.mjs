import test from "node:test";
import assert from "node:assert/strict";
import {
  graphPayloadFingerprint,
  graphTopologyFingerprint,
} from "./graphFingerprint.ts";

test("graphPayloadFingerprint includes node metadata changes", () => {
  const base = {
    nodes: [{ id: "a", label: "A", importance: 1 }],
    edges: [],
  };
  const changed = {
    nodes: [{ id: "a", label: "Updated", importance: 9 }],
    edges: [],
  };

  assert.notEqual(graphPayloadFingerprint(base), graphPayloadFingerprint(changed));
});

test("graphPayloadFingerprint is stable across object key order", () => {
  const first = {
    nodes: [{ id: "a", label: "A", importance: 1 }],
    edges: [{ source: "a", target: "b", flow_kind: "signal" }],
  };
  const second = {
    edges: [{ flow_kind: "signal", target: "b", source: "a" }],
    nodes: [{ importance: 1, label: "A", id: "a" }],
  };

  assert.equal(graphPayloadFingerprint(first), graphPayloadFingerprint(second));
});

test("graphPayloadFingerprint ignores position-only and envelope fields", () => {
  const base = {
    nodes: [{ id: "a", label: "A", importance: 1, x: 10, y: 20, degree: 3 }],
    edges: [{ source: "a", target: "b", flow_kind: "signal", weight: 4 }],
    status: "ok",
    message: "ready",
    communities: [{ id: "c1", label: "Cluster" }],
    timeline: { start: "2020-01", end: "2026-12" },
  };
  const shifted = {
    nodes: [{ id: "a", label: "A", importance: 1, x: 99, y: -5, in_degree: 9 }],
    edges: [{ source: "a", target: "b", flow_kind: "signal", weight_norm: 0.8 }],
    status: "degraded",
    message: "poll tick",
    communities: [{ id: "c2", label: "Other" }],
    timeline: { start: "2021-01", end: "2027-12" },
  };

  assert.equal(graphPayloadFingerprint(base), graphPayloadFingerprint(shifted));
});

test("graphTopologyFingerprint is stable when only metadata changes", () => {
  const base = {
    nodes: [{ id: "a", label: "A", importance: 1 }],
    edges: [{ source: "a", target: "b", flow_kind: "signal" }],
  };
  const relabeled = {
    nodes: [{ id: "a", label: "Renamed", importance: 9 }],
    edges: [{ source: "a", target: "b", flow_kind: "signal" }],
  };

  assert.equal(graphTopologyFingerprint(base), graphTopologyFingerprint(relabeled));
});

test("graphTopologyFingerprint changes when edges change", () => {
  const base = {
    nodes: [{ id: "a", label: "A" }],
    edges: [{ source: "a", target: "b", flow_kind: "signal" }],
  };
  const added = {
    nodes: [{ id: "a", label: "A" }, { id: "c", label: "C" }],
    edges: [
      { source: "a", target: "b", flow_kind: "signal" },
      { source: "a", target: "c", flow_kind: "mention" },
    ],
  };

  assert.notEqual(graphTopologyFingerprint(base), graphTopologyFingerprint(added));
});
