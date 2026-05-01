import Link from "next/link";

export default function TopNav() {
  return (
    <nav className="fixed top-0 left-0 w-full z-50 p-6 flex justify-between items-center mix-blend-difference text-foreground">
      <div className="font-display font-bold text-xl tracking-[0.2em] uppercase text-primary">
        AISIGNALGRAPH
      </div>
      <div className="flex gap-8 font-mono text-sm uppercase tracking-widest text-muted">
        <Link href="/" className="hover:text-primary transition-colors duration-300">Home</Link>
        <Link href="/graph" className="hover:text-primary transition-colors duration-300">Graph</Link>
        <Link href="/stories" className="hover:text-primary transition-colors duration-300">Stories</Link>
        <Link href="/entities" className="hover:text-primary transition-colors duration-300">Entities</Link>
      </div>
    </nav>
  );
}
