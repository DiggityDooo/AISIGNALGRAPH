/** Single hub all three /flow modes fan out from, matching the regular graph's feel. */
export const SYNTHETIC_ROOT_ID = "__root__";
export const SYNTHETIC_ROOT_LABEL = "AI Signal Graph";

/**
 * Synthetic navigation-section anchors the hub fans out to in Tree/Flow.
 * Stable regardless of which raw nodes are in-degree-zero "roots" in any
 * given corpus — see navigationSeeds.ts.
 */
export const SECTION_TIMELINE_ID = "section:timeline";
export const SECTION_ORGANIZATIONS_ID = "section:organizations";
export const SECTION_THEMES_ID = "section:themes";
