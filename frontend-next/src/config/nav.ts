export const PRIMARY_NAV = [
  { href: "/", label: "Home" },
  { href: "/graph", label: "Graph" },
  { href: "/stories", label: "Stories" },
  { href: "/entities", label: "Entities" },
] as const;

export const SIDE_RAIL_NAV = [
  { href: "/graph", label: "Graph", short: "G" },
  { href: "/stories", label: "Stories", short: "S" },
  { href: "/entities", label: "Entities", short: "E" },
  { href: "#archives", label: "Archives", short: "A" },
] as const;

export const HEADER_CTA = { href: "/graph", label: "Enter Signal" } as const;
