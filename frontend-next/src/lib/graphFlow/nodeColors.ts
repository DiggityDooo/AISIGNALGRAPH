/** Accent colors keyed by graph node type — shared across flow renderers. */
export const TYPE_COLOR: Record<string, string> = {
  root: "#94a3b8",
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
};

export function accentForType(type: string | undefined): string {
  if (type && TYPE_COLOR[type]) return TYPE_COLOR[type];
  return TYPE_COLOR.story;
}

export function nodeTypeOf(node: { node_type?: string; type?: string }): string {
  if (typeof node.node_type === "string" && node.node_type) return node.node_type;
  if (typeof node.type === "string" && node.type) return node.type;
  return "story";
}
