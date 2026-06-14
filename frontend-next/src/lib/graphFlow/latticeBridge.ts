/** Build the Neural Lattice URL that triggers a camera fly-to [SC-4]. */
export function buildLatticeFocusHref(
  nodeId: string,
  options?: { mode3d?: boolean },
): string {
  const params = new URLSearchParams();
  params.set("focus", nodeId);
  if (options?.mode3d !== false) params.set("mode", "3d");
  return `/graph?${params.toString()}`;
}
