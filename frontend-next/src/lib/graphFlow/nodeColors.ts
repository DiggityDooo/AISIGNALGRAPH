/** Accent colors keyed by graph node type — shared across flow renderers. */
export const TYPE_COLOR: Record<string, string> = {
  root: "#94a3b8",
  section: "#e2e8f0",
  story: "#00e0ff",
  entity: "#7c5cff",
  lab: "#ff5c8a",
  model: "#34d399",
  person: "#fbbf24",
  risk: "#ef4444",
  topic: "#22d3ee",
  product: "#a78bfa",
  year: "#94a3b8",
  community: "#f97316",
  load_more: "#fb7185",
};

export function accentForType(type: string | undefined): string {
  if (type && TYPE_COLOR[type]) return TYPE_COLOR[type];
  return TYPE_COLOR.story;
}

/**
 * The API stamps `node_type` as a coarse "entity" | "story" bucket and puts
 * the real category (company/model/person/year/risk/topic/...) in `type` —
 * same shape /graph's getNodeSemanticType() reads, so prefer `type` first to
 * match its "biggest nodes first" behavior instead of collapsing every
 * non-story node to "entity".
 */
export function nodeTypeOf(node: { node_type?: string; type?: string }): string {
  if (typeof node.type === "string" && node.type) return node.type;
  if (typeof node.node_type === "string" && node.node_type) return node.node_type;
  return "story";
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim();
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized);
  if (!match) return null;
  return {
    r: Number.parseInt(match[1], 16),
    g: Number.parseInt(match[2], 16),
    b: Number.parseInt(match[3], 16),
  };
}

/** Higher importance → shorter animation duration (faster signal). */
export function signalDurationFromImportance(importance: number | undefined): number {
  const imp = typeof importance === "number" ? Math.max(0, Math.min(importance, 10)) : 0;
  return Math.max(0.35, 2.8 - imp * 0.25);
}

export function glowShadowForAccent(accentColor: string): string | undefined {
  const rgb = hexToRgb(accentColor);
  if (!rgb) return undefined;
  return `0 0 15px rgba(${rgb.r},${rgb.g},${rgb.b},0.4), 0 0 32px rgba(${rgb.r},${rgb.g},${rgb.b},0.18)`;
}
