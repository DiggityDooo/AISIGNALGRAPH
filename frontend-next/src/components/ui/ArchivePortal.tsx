import Link from "next/link";
import { motion } from "framer-motion";

export default function ArchivePortal({ 
  title, 
  subtitle,
  stats,
  href,
  align = "left" 
}: { 
  title: string; 
  subtitle: string;
  stats: string;
  href?: string;
  align?: "left" | "right";
}) {
  const portal = (
    <motion.div 
      className="relative w-64 h-64 rounded-full border-[1px] border-primary/30 flex items-center justify-center overflow-hidden glass-panel group/portal cursor-pointer"
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute inset-2 rounded-full border border-dashed border-primary/40 group-hover/portal:border-primary/80 transition-colors"
      />
      <motion.div 
        animate={{ rotate: -360 }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        className="absolute inset-6 rounded-full border border-dotted border-secondary/60 group-hover/portal:border-secondary transition-colors"
      />
      
      {/* Search / Center Content */}
      <div className="z-10 flex flex-col items-center text-center p-4">
        <span className="font-mono text-[10px] text-muted mb-2 tracking-widest uppercase group-hover/portal:text-foreground transition-colors">{subtitle}</span>
        <div className="bg-void/80 border border-primary/40 group-hover/portal:border-primary rounded-full px-4 py-2 flex items-center gap-2 backdrop-blur-xl transition-all">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <span className="font-mono text-xs text-foreground uppercase">Search</span>
        </div>
      </div>
      
      {/* Glow */}
      <div className="absolute inset-0 bg-radial-gradient from-primary/10 to-transparent pointer-events-none group-hover/portal:from-primary/20 transition-all" />
    </motion.div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className={`relative flex flex-col gap-4 ${align === "right" ? "items-end text-right" : "items-start text-left"}`}
    >
      <h3 className="font-display text-2xl tracking-widest text-foreground">{title}</h3>
      
      {href ? <Link href={href}>{portal}</Link> : portal}
      
      <div className="font-mono text-xs text-primary uppercase tracking-widest flex items-center gap-2">
        <span className="w-8 h-[1px] bg-primary"></span>
        {stats}
      </div>
    </motion.div>
  );
}
