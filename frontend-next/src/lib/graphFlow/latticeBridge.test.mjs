import test from "node:test";
import assert from "node:assert/strict";
import { buildLatticeFocusHref } from "./latticeBridge.ts";

test("buildLatticeFocusHref encodes node IDs and defaults to 3D", () => {
  assert.equal(
    buildLatticeFocusHref("node/with spaces"),
    "/graph?focus=node%2Fwith+spaces&mode=3d",
  );
});

test("buildLatticeFocusHref can target the 2D lattice", () => {
  assert.equal(buildLatticeFocusHref("node-a", { mode3d: false }), "/graph?focus=node-a");
});
