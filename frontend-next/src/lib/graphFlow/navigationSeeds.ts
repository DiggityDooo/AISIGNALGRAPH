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

function isJobRoleTopic(node: GraphApiNode): boolean {
  return node.category === "job_role";
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
  customLimits: Record<string, number> = {},
): NavigationOverlay {
  const childrenById = new Map(baseChildrenById);
  const sectionNodes = new Map<string, GraphApiNode>();
  const mentionedBy = buildMentionedByIndex(payload);
  const timelineByYear = buildTimelineIndex(payload);

  const allYearIds = payload.nodes
    .filter((node) => nodeTypeOf(node) === "year")
    .sort((a, b) => numericLabel(b) - numericLabel(a))
    .map((node) => node.id);

  const allLabIds = payload.nodes
    .filter((node) => nodeTypeOf(node) === "lab")
    .sort((a, b) => {
      const byImportance = importanceOf(b) - importanceOf(a);
      if (byImportance !== 0) return byImportance;
      return (mentionedBy.get(b.id)?.length ?? 0) - (mentionedBy.get(a.id)?.length ?? 0);
    })
    .map((node) => node.id);

  const allTopicIds = payload.nodes
    .filter((node) => nodeTypeOf(node) === "topic" && !isJobRoleTopic(node))
    .sort((a, b) => {
      const byImportance = importanceOf(b) - importanceOf(a);
      if (byImportance !== 0) return byImportance;
      return (mentionedBy.get(b.id)?.length ?? 0) - (mentionedBy.get(a.id)?.length ?? 0);
    })
    .map((node) => node.id);

  const yearLimit = customLimits[SECTION_TIMELINE_ID] ?? sectionFanOut;
  const labLimit = customLimits[SECTION_ORGANIZATIONS_ID] ?? sectionFanOut;
  const topicLimit = customLimits[SECTION_THEMES_ID] ?? sectionFanOut;

  const yearIds = allYearIds.slice(0, yearLimit);
  const labIds = allLabIds.slice(0, labLimit);
  const topicIds = allTopicIds.slice(0, topicLimit);

  const sectionSeedIds: Record<string, string[]> = {
    [SECTION_TIMELINE_ID]: yearIds,
    [SECTION_ORGANIZATIONS_ID]: labIds,
    [SECTION_THEMES_ID]: topicIds,
  };

  childrenById.set(SYNTHETIC_ROOT_ID, NAVIGATION_SECTIONS.map((section) => section.id));

  for (const section of NAVIGATION_SECTIONS) {
    const seeds = [...sectionSeedIds[section.id]];
    let totalCount = 0;
    let limit = 0;
    if (section.id === SECTION_TIMELINE_ID) {
      totalCount = allYearIds.length;
      limit = yearLimit;
    } else if (section.id === SECTION_ORGANIZATIONS_ID) {
      totalCount = allLabIds.length;
      limit = labLimit;
    } else if (section.id === SECTION_THEMES_ID) {
      totalCount = allTopicIds.length;
      limit = topicLimit;
    }

    if (totalCount > limit) {
      const loadMoreId = `load-more:section:${section.id}`;
      seeds.push(loadMoreId);
      sectionNodes.set(loadMoreId, {
        id: loadMoreId,
        label: `Load More (+${totalCount - limit})`,
        node_type: "load_more",
        type: "load_more",
      });
    }

    childrenById.set(section.id, seeds);
    sectionNodes.set(section.id, {
      id: section.id,
      label: section.label,
      node_type: "section",
      type: "section",
    });
  }

  for (const yearId of yearIds) {
    const allStories = rankByImportance(nodeById, timelineByYear.get(yearId) ?? []);
    const limit = customLimits[yearId] ?? storyFanOut;
    const stories = allStories.slice(0, limit);
    if (allStories.length > limit) {
      const loadMoreId = `load-more:story:${yearId}`;
      stories.push(loadMoreId);
      sectionNodes.set(loadMoreId, {
        id: loadMoreId,
        label: `Load More (+${allStories.length - limit})`,
        node_type: "load_more",
        type: "load_more",
      });
    }
    childrenById.set(yearId, stories);
  }

  for (const entityId of [...labIds, ...topicIds]) {
    const allStories = rankByImportance(nodeById, mentionedBy.get(entityId) ?? []);
    const limit = customLimits[entityId] ?? storyFanOut;
    const stories = allStories.slice(0, limit);
    if (allStories.length > limit) {
      const loadMoreId = `load-more:story:${entityId}`;
      stories.push(loadMoreId);
      sectionNodes.set(loadMoreId, {
        id: loadMoreId,
        label: `Load More (+${allStories.length - limit})`,
        node_type: "load_more",
        type: "load_more",
      });
    }
    childrenById.set(entityId, stories);
  }

  return { childrenById, sectionNodes };
}
