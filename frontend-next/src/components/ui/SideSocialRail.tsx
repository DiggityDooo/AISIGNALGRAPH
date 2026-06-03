import { SIDE_RAIL_NAV } from "@/config/nav";

export default function SideSocialRail() {
  return (
    <aside className="side-rail hidden lg:flex" aria-label="Network links">
      {SIDE_RAIL_NAV.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="side-rail__node pointer-events-auto"
          title={item.label}
          aria-label={item.label}
        >
          <span>{item.short}</span>
        </a>
      ))}
    </aside>
  );
}
