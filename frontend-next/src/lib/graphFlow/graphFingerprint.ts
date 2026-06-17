import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";

/**
 * Stable revision key for graph payloads. Node metadata matters because labels,
 * colors, and importance-driven animation all derive from it even when node
 * IDs and edge endpoints are unchanged.
 */
export function graphPayloadFingerprint(payload: GraphApiPayload): string {
  let primary = 0x811c9dc5;
  let secondary = 0x9e3779b9;

  const write = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      primary = Math.imul(primary ^ code, 0x01000193);
      secondary = Math.imul(secondary ^ code, 0x85ebca6b);
    }
  };

  const visit = (value: unknown): void => {
    if (value === null) {
      write("null;");
      return;
    }
    if (Array.isArray(value)) {
      write(`[${value.length}:`);
      for (const item of value) visit(item);
      write("];");
      return;
    }

    switch (typeof value) {
      case "boolean":
        write(value ? "b1;" : "b0;");
        return;
      case "number":
        write(`n${String(value)};`);
        return;
      case "string":
        write(`s${value.length}:${value};`);
        return;
      case "object": {
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record).sort();
        write(`{${keys.length}:`);
        for (const key of keys) {
          visit(key);
          visit(record[key]);
        }
        write("};");
        return;
      }
      case "undefined":
        write("u;");
        return;
      default:
        write(`${typeof value}:${String(value)};`);
    }
  };

  visit(payload);
  return `v2:${payload.nodes.length}:${payload.edges.length}:${(primary >>> 0)
    .toString(16)
    .padStart(8, "0")}${(secondary >>> 0).toString(16).padStart(8, "0")}`;
}
