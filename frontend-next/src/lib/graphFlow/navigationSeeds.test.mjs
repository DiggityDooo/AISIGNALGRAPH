import test from "node:test";
import assert from "node:assert/strict";
import {
  NAVIGATION_SECTIONS,
  buildNavigationChildrenById,
  pickLabSeeds,
  pickTopicSeeds,
  pickYearSeeds,
} from "./navigationSeeds.ts";
import {
  SECTION_ORGANIZATIONS_ID,
  SECTION_THEMES_ID,
  SECTION_TIMELINE_ID,
  SYNTHETIC_ROOT_ID,
} from "./syntheticRoot.ts";

/** Mirrors the real /api/graph shape: stories are roots, years/labs/topics
 * are reached only via mention/timeline edges, never as in-degree-zero
 * roots themselves. */
const samplePayload = {
  nodes: [
    // Orphan labor stories — in-degree zero, must never become hub children.
    { id: "story:job-cashier", label: "Cashier", type: "story", importance: 5 },
    { id: "story:job-junior-swe", label: "Junior Software Engineer", type: "story", importance: 5 },

    // Years
    { id: "entity:year-2026", label: "2026", type: "year", importance: 5 },
    { id: "entity:year-2025", label: "2025", type: "year", importance: 5 },
    { id: "entity:year-2024", label: "2024", type: "year", importance: 5 },

    // Labs
    { id: "entity:openai", label: "OpenAI", type: "lab", importance: 5 },
    { id: "entity:anthropic", label: "Anthropic", type: "lab", importance: 5 },
    { id: "entity:small-lab", label: "Small Lab", type: "lab", importance: 2 },

    // Topics — including job-role catalog entries that must be excluded.
    { id: "entity:reasoning", label: "Reasoning Models", type: "topic", importance: 5 },
    { id: "entity:chips", label: "Chip Wars", type: "topic", importance: 5 },
    { id: "entity:job-role-cashier", label: "Cashier", type: "topic", importance: 4 },
    { id: "entity:job-role-junior-swe", label: "Junior Software Engineer", type: "topic", importance: 4 },

    // Real stories that get linked to years/labs/topics via edges.
    { id: "story:2024-gpt5", label: "GPT-5 launches", type: "story", importance: 5, year: 2024 },
    { id: "story:2024-claude4", label: "Claude 4 launches", type: "story", importance: 3, year: 2024 },
    { id: "story:2025-o4", label: "o4 launches", type: "story", importance: 4, year: 2025 },
  ],
  edges: [
    // Timeline edges: year -> story.
    { source: "entity:year-2024", target: "story:2024-gpt5", flow_kind: "timeline" },
    { source: "entity:year-2024", target: "story:2024-claude4", flow_kind: "timeline" },
    { source: "entity:year-2025", target: "story:2025-o4", flow_kind: "timeline" },

    // Mention edges: story -> entity.
    { source: "story:2024-gpt5", target: "entity:openai", flow_kind: "mention" },
    { source: "story:2024-gpt5", target: "entity:reasoning", flow_kind: "mention" },
    { source: "story:2024-claude4", target: "entity:anthropic", flow_kind: "mention" },
    { source: "story:2025-o4", target: "entity:openai", flow_kind: "mention" },
    { source: "story:2025-o4", target: "entity:chips", flow_kind: "mention" },

    // Orphan labor stories mention their own job-role topic — must not leak
    // into Themes or anywhere else reachable from the navigation overlay.
    { source: "story:job-cashier", target: "entity:job-role-cashier", flow_kind: "mention" },
    { source: "story:job-junior-swe", target: "entity:job-role-junior-swe", flow_kind: "mention" },
  ],
};

const baseChildrenById = new Map([
  ["entity:year-2024", ["story:2024-gpt5", "story:2024-claude4"]],
  ["entity:year-2025", ["story:2025-o4"]],
  ["entity:year-2026", []],
]);
const nodeById = new Map(samplePayload.nodes.map((node) => [node.id, node]));

test("pickYearSeeds sorts years descending by label", () => {
  const seeds = pickYearSeeds(samplePayload, 10);
  assert.deepEqual(seeds, ["entity:year-2026", "entity:year-2025", "entity:year-2024"]);
});

test("pickLabSeeds ranks labs by importance, never picks stories or topics", () => {
  const seeds = pickLabSeeds(samplePayload, 2);
  assert.deepEqual(seeds, ["entity:openai", "entity:anthropic"]);
});

test("pickTopicSeeds excludes job-role catalog entries", () => {
  const seeds = pickTopicSeeds(samplePayload, 10);
  assert.ok(seeds.includes("entity:reasoning"));
  assert.ok(seeds.includes("entity:chips"));
  assert.ok(!seeds.includes("entity:job-role-cashier"));
  assert.ok(!seeds.includes("entity:job-role-junior-swe"));
});

test("hub children are exactly the three navigation sections, never story ids", () => {
  const overlay = buildNavigationChildrenById(samplePayload, nodeById, baseChildrenById, 5);
  const hubChildren = overlay.childrenById.get(SYNTHETIC_ROOT_ID);
  assert.deepEqual(hubChildren, [SECTION_TIMELINE_ID, SECTION_ORGANIZATIONS_ID, SECTION_THEMES_ID]);
  for (const id of hubChildren) {
    assert.ok(!id.startsWith("story:"));
  }
});

test("expanding section:timeline yields only year nodes from the live payload", () => {
  const overlay = buildNavigationChildrenById(samplePayload, nodeById, baseChildrenById, 5);
  const timelineChildren = overlay.childrenById.get(SECTION_TIMELINE_ID);
  assert.ok(timelineChildren.length > 0);
  for (const id of timelineChildren) {
    const node = nodeById.get(id);
    assert.equal(node.type, "year");
  }
});

test("expanding a year yields its real story children via existing year -> story edges", () => {
  const overlay = buildNavigationChildrenById(samplePayload, nodeById, baseChildrenById, 5);
  assert.deepEqual(overlay.childrenById.get("entity:year-2024"), [
    "story:2024-gpt5",
    "story:2024-claude4",
  ]);
});

test("expanding a lab yields stories that mention it, ranked by importance", () => {
  const overlay = buildNavigationChildrenById(samplePayload, nodeById, baseChildrenById, 5);
  assert.deepEqual(overlay.childrenById.get("entity:openai"), [
    "story:2024-gpt5",
    "story:2025-o4",
  ]);
});

test("regression: Junior Software Engineer is not reachable from the hub or any section", () => {
  const overlay = buildNavigationChildrenById(samplePayload, nodeById, baseChildrenById, 5);
  const reachable = new Set();
  const queue = [SYNTHETIC_ROOT_ID];
  while (queue.length > 0) {
    const id = queue.shift();
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const childId of overlay.childrenById.get(id) ?? []) queue.push(childId);
  }
  assert.ok(!reachable.has("story:job-junior-swe"));
  assert.ok(!reachable.has("entity:job-role-junior-swe"));
});

test("section nodes are synthetic and labeled for every NAVIGATION_SECTIONS entry", () => {
  const overlay = buildNavigationChildrenById(samplePayload, nodeById, baseChildrenById, 5);
  assert.equal(overlay.sectionNodes.size, NAVIGATION_SECTIONS.length);
  for (const section of NAVIGATION_SECTIONS) {
    const node = overlay.sectionNodes.get(section.id);
    assert.equal(node.label, section.label);
    assert.equal(node.type, "section");
  }
});

test("fan-out cap limits how many years/labs/topics each section attaches", () => {
  const overlay = buildNavigationChildrenById(samplePayload, nodeById, baseChildrenById, 1);
  assert.equal(overlay.childrenById.get(SECTION_TIMELINE_ID).length, 1);
  assert.equal(overlay.childrenById.get(SECTION_ORGANIZATIONS_ID).length, 1);
  assert.equal(overlay.childrenById.get(SECTION_THEMES_ID).length, 1);
});

test("fan-out cap also limits a single year's attached stories (no 80+ card dump)", () => {
  const busyYearPayload = {
    nodes: [
      { id: "entity:year-2024", label: "2024", type: "year", importance: 5 },
      { id: "story:s1", label: "Story 1", type: "story", importance: 5 },
      { id: "story:s2", label: "Story 2", type: "story", importance: 4 },
      { id: "story:s3", label: "Story 3", type: "story", importance: 3 },
    ],
    edges: [
      { source: "entity:year-2024", target: "story:s1", flow_kind: "timeline" },
      { source: "entity:year-2024", target: "story:s2", flow_kind: "timeline" },
      { source: "entity:year-2024", target: "story:s3", flow_kind: "timeline" },
    ],
  };
  const overlay = buildNavigationChildrenById(
    busyYearPayload,
    new Map(busyYearPayload.nodes.map((node) => [node.id, node])),
    new Map(),
    1,
    1,
  );
  assert.deepEqual(overlay.childrenById.get(SECTION_TIMELINE_ID), ["entity:year-2024"]);
  assert.equal(overlay.childrenById.get("entity:year-2024").length, 1);
  assert.equal(overlay.childrenById.get("entity:year-2024")[0], "story:s1");
});

test("year children come from real timeline edges, not a possibly-incomplete base tree", () => {
  // Mirrors the real-world bug: graphTransform's BFS spanning tree can lose
  // a genuine `timeline` edge to cyclicEdges if the story was reachable via
  // a different edge first. baseChildrenById here is deliberately wrong/
  // stale to prove year children are recomputed from payload.edges, not
  // read from the (possibly lossy) base tree.
  const payload = {
    nodes: [
      { id: "entity:year-2024", label: "2024", type: "year", importance: 5 },
      { id: "story:s1", label: "Story 1", type: "story", importance: 5 },
    ],
    edges: [{ source: "entity:year-2024", target: "story:s1", flow_kind: "timeline" }],
  };
  const staleBaseChildrenById = new Map([["entity:year-2024", []]]);
  const overlay = buildNavigationChildrenById(
    payload,
    new Map(payload.nodes.map((node) => [node.id, node])),
    staleBaseChildrenById,
    5,
    5,
  );
  assert.deepEqual(overlay.childrenById.get("entity:year-2024"), ["story:s1"]);
});

test("isJobRoleTopic regex anchors every alternative, not just the first/last", () => {
  const genuineTheme = {
    id: "entity:collaborative-ai",
    label: "Collaborative AI",
    type: "topic",
    importance: 5,
  };
  const payload = {
    nodes: [genuineTheme],
    edges: [],
  };
  const seeds = pickTopicSeeds(payload, 10);
  assert.ok(
    seeds.includes(genuineTheme.id),
    "a label merely containing the substring 'labor' (as in 'Collaborative') must not be excluded",
  );
});
