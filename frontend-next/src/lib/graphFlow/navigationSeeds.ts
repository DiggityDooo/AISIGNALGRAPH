import type { GraphApiNode, GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import { nodeTypeOf } from "@/lib/graphFlow/nodeColors";
import {
  SECTION_ORGANIZATIONS_ID,
  SECTION_THEMES_ID,
  SECTION_TIMELINE_ID,
  SYNTHETIC_ROOT_ID,
} from "@/lib/graphFlow/syntheticRoot";

/**
 * Hub children must be generalized, live-data anchors (years / labs /
 * topics) rather than `pickSeedIds(index.rootIds)` — in production every
 * in-degree-zero root is an orphan labor/job-market story (no `event_date`,
 * so no `year -> story` edge), not a meaningful top-level navigation item.
 * See docs/claude-graph-navigation-seeds-plan.md.
 */

const DEFAULT_SECTION_FAN_OUT = 3;
/** Separate (more generous) cap for stories shown under a single expanded
 * year/lab/topic — still bounded (no 80+ card dump), but distinct from how
 * many years/labs/topics a section itself attaches. */
const DEFAULT_STORY_FAN_OUT = 5;

/**
 * The API's `/api/graph` payload only ever exposes `type === "topic"` for
 * both genuine AI themes (Reasoning Models, Chip Wars, ...) and the ~49
 * "job-role-*" catalog entries (Cashier, Junior Software Engineer, ...) —
 * there's no separate `group`/`category` field to tell them apart (the
 * compact endpoint strips it). Filter on label/id text instead. The
 * alternation is grouped so `\b...\b` anchors every branch, not just the
 * first/last — otherwise "labor"/"career"/etc. would match as unanchored
 * substrings (e.g. wrongly excluding a topic titled "Collaborative AI").
 */
const JOB_ROLE_PATTERN =
  /\b(?:job[\s-]?role|labor|career|salary|hiring|layoff|displacement|workforce|employment)\b/i;

function isJobRoleTopic(node: GraphApiNode): boolean {
  return JOB_ROLE_PATTERN.test(node.label ?? "") || JOB_ROLE_PATTERN.test(node.id);
}

function importanceOf(node: GraphApiNode | undefined): number {
  return typeof node?.importance === "number" ? node.importance : 0;
}

/** Year labels are plain numeric strings ("2024") in practice; falls back to
 * 0 (sorts last) instead of NaN if a future label is ever non-numeric. */
function numericLabel(node: GraphApiNode): number {
  const parsed = Number(node.label);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** year -> story ids, from real `timeline` edges (source: year, target: story). */
function buildTimelineIndex(payload: GraphApiPayload): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const edge of payload.edges) {
    if (edge.flow_kind !== "timeline") continue;
    const list = index.get(edge.source);
    if (list) list.push(edge.target);
    else index.set(edge.source, [edge.target]);
  }
  return index;
}

/** lab/topic entity -> stories that mention it (`flow_kind: "mention"`, entity is the edge target). */
function buildMentionedByIndex(payload: GraphApiPayload): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const edge of payload.edges) {
    if (edge.flow_kind !== "mention" || !edge.source.startsWith("story:")) continue;
    const list = index.get(edge.target);
    if (list) list.push(edge.source);
    else index.set(edge.target, [edge.source]);
  }
  return index;
}

function rankByImportance(
  nodeById: ReadonlyMap<string, GraphApiNode>,
  ids: readonly string[],
): string[] {
  return [...ids].sort((a, b) => importanceOf(nodeById.get(b)) - importanceOf(nodeById.get(a)));
}

export function pickYearSeeds(payload: GraphApiPayload, limit: number): string[] {
  return payload.nodes
    .filter((node) => nodeTypeOf(node) === "year")
    .sort((a, b) => numericLabel(b) - numericLabel(a))
    .slice(0, limit)
    .map((node) => node.id);
}

function pickEntitySeeds(
  payload: GraphApiPayload,
  type: string,
  limit: number,
  mentionedBy: ReadonlyMap<string, string[]>,
  exclude?: (node: GraphApiNode) => boolean,
): string[] {
  return payload.nodes
    .filter((node) => nodeTypeOf(node) === type && !(exclude?.(node) ?? false))
    .sort((a, b) => {
      const byImportance = importanceOf(b) - importanceOf(a);
      if (byImportance !== 0) return byImportance;
      return (mentionedBy.get(b.id)?.length ?? 0) - (mentionedBy.get(a.id)?.length ?? 0);
    })
    .slice(0, limit)
    .map((node) => node.id);
}

/** Standalone helpers (each builds its own mention index) — fine for tests
 * and other one-off callers. `buildNavigationChildrenById` below builds the
 * index once and calls `pickEntitySeeds` directly instead of these, to
 * avoid scanning `payload.edges` three times for one overlay build. */
export function pickLabSeeds(payload: GraphApiPayload, limit: number): string[] {
  return pickEntitySeeds(payload, "lab", limit, buildMentionedByIndex(payload));
}

export function pickTopicSeeds(payload: GraphApiPayload, limit: number): string[] {
  return pickEntitySeeds(payload, "topic", limit, buildMentionedByIndex(payload), isJobRoleTopic);
}

export interface NavigationSection {
  id: string;
  label: string;
}

/** Order here is the order sections appear under the hub. */
export const NAVIGATION_SECTIONS: readonly NavigationSection[] = [
  { id: SECTION_TIMELINE_ID, label: "Timeline" },
  { id: SECTION_ORGANIZATIONS_ID, label: "Organizations" },
  { id: SECTION_THEMES_ID, label: "Themes" },
];

export interface NavigationOverlay {
  /** `index.childrenById` merged with hub -> sections, sections -> picks, and
   * year/lab/topic -> capped story children (overriding whatever the raw
   * mention/timeline-edge tree already had for those ids, since the BFS
   * spanning tree in graphTransform.ts can lose ~10% of real `timeline`
   * edges to `cyclicEdges` when a story is reachable via more than one
   * path — recomputing directly from the edge list here is correct where
   * reusing the tree would silently drop some of a year's real stories). */
  childrenById: Map<string, string[]>;
  /** Synthetic section nodes to merge into `nodeById` so they render as cards. */
  sectionNodes: Map<string, GraphApiNode>;
}

export const EMPTY_NAVIGATION_OVERLAY: Readonly<NavigationOverlay> = {
  childrenById: new Map(),
  sectionNodes: new Map(),
};

/**
 * Builds the hub -> sections -> (years | labs | topics) -> stories overlay.
 * `baseChildrenById` should be `index.childrenById` from
 * `buildGraphIndexFromPayload` — it's only used as the foundation the
 * overlay is merged onto (so deeper descent below a story, if any, is left
 * untouched); year/lab/topic children are always recomputed directly from
 * `payload.edges` here, not read from the base tree.
 */
export function buildNavigationChildrenById(
  payload: GraphApiPayload,
  nodeById: ReadonlyMap<string, GraphApiNode>,
  baseChildrenById: ReadonlyMap<string, string[]>,
  sectionFanOut = DEFAULT_SECTION_FAN_OUT,
  storyFanOut = DEFAULT_STORY_FAN_OUT,
): NavigationOverlay {
  const childrenById = new Map(baseChildrenById);
  const sectionNodes = new Map<string, GraphApiNode>();
  const mentionedBy = buildMentionedByIndex(payload);
  const timelineByYear = buildTimelineIndex(payload);

  const yearIds = pickYearSeeds(payload, sectionFanOut);
  const labIds = pickEntitySeeds(payload, "lab", sectionFanOut, mentionedBy);
  const topicIds = pickEntitySeeds(payload, "topic", sectionFanOut, mentionedBy, isJobRoleTopic);
  const sectionSeedIds: Record<string, string[]> = {
    [SECTION_TIMELINE_ID]: yearIds,
    [SECTION_ORGANIZATIONS_ID]: labIds,
    [SECTION_THEMES_ID]: topicIds,
  };

  childrenById.set(SYNTHETIC_ROOT_ID, NAVIGATION_SECTIONS.map((section) => section.id));
  for (const section of NAVIGATION_SECTIONS) {
    childrenById.set(section.id, sectionSeedIds[section.id]);
    sectionNodes.set(section.id, {
      id: section.id,
      label: section.label,
      node_type: "section",
      type: "section",
    });
  }

  for (const yearId of yearIds) {
    childrenById.set(
      yearId,
      rankByImportance(nodeById, timelineByYear.get(yearId) ?? []).slice(0, storyFanOut),
    );
  }
  for (const entityId of [...labIds, ...topicIds]) {
    childrenById.set(
      entityId,
      rankByImportance(nodeById, mentionedBy.get(entityId) ?? []).slice(0, storyFanOut),
    );
  }

  return { childrenById, sectionNodes };
}
