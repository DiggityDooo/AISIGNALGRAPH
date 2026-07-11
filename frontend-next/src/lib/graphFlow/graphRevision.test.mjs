import test from "node:test";
import assert from "node:assert/strict";
import { compareGraphRevision } from "./graphRevision.ts";

const base = {
  nodes: [{ id: "a", label: "A", importance: 1 }],
  edges: [{ source: "a", target: "b", flow_kind: "signal" }],
};

test("compareGraphRevision treats first load as changed", () => {
  const result = compareGraphRevision(null, base);
  assert.equal(result.payloadChanged, true);
  assert.equal(result.topologyChanged, true);
  assert.ok(result.revision);
  assert.ok(result.topologyRevision);
});

test("compareGraphRevision is unchanged for identical payloads", () => {
  const first = compareGraphRevision(null, base);
  const second = compareGraphRevision(
    { revision: first.revision, topologyRevision: first.topologyRevision },
    base,
  );
  assert.equal(second.payloadChanged, false);
  assert.equal(second.topologyChanged, false);
});

test("compareGraphRevision flags metadata-only changes as payload but not topology", () => {
  const previous = compareGraphRevision(null, base);
  const relabeled = {
    nodes: [{ id: "a", label: "Renamed", importance: 9 }],
    edges: [{ source: "a", target: "b", flow_kind: "signal" }],
  };
  const result = compareGraphRevision(
    { revision: previous.revision, topologyRevision: previous.topologyRevision },
    relabeled,
  );
  assert.equal(result.payloadChanged, true);
  assert.equal(result.topologyChanged, false);
});

test("compareGraphRevision flags edge changes as topology changes", () => {
  const previous = compareGraphRevision(null, base);
  const added = {
    nodes: [{ id: "a", label: "A", importance: 1 }, { id: "c", label: "C" }],
    edges: [
      { source: "a", target: "b", flow_kind: "signal" },
      { source: "a", target: "c", flow_kind: "mention" },
    ],
  };
  const result = compareGraphRevision(
    { revision: previous.revision, topologyRevision: previous.topologyRevision },
    added,
  );
  assert.equal(result.payloadChanged, true);
  assert.equal(result.topologyChanged, true);
});
