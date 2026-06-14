import test from "node:test";
import assert from "node:assert/strict";
import { graphPayloadFingerprint } from "./graphFingerprint.ts";

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
