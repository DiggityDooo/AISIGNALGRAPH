import Link from "next/link";
import { motion } from "framer-motion";

export default function GlassButton({ 
  children, 
  primary = false,
  href,
  onClick
}: { 
  children: React.ReactNode, 
  primary?: boolean,
  href?: string,
  onClick?: () => void
}) {
  const content = (
    <motion.button
      whileHover="hover"
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`relative overflow-hidden px-8 py-3 rounded-full font-mono text-sm tracking-widest uppercase transition-all duration-300 backdrop-blur-md border cursor-pointer ${
        primary 
          ? "bg-primary/20 border-primary text-white shadow-[0_0_20px_rgba(255,42,77,0.4)]" 
          : "bg-white/5 border-white/20 text-foreground hover:border-primary/50"
      }`}
    >
      <span className="relative z-10">{children}</span>
      <motion.div
        variants={{
          hover: { x: ["-100%", "200%"] },
        }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 z-0 w-1/2 h-full bg-gradient-to-r from-transparent via-primary/50 to-transparent skew-x-[-20deg]"
      />
    </motion.button>
  );

  if (href) {
    return <Link href={href} className="contents">{content}</Link>;
  }

  return content;
}
