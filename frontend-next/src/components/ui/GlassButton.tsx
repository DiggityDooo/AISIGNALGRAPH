import Link from "next/link";
import { motion } from "framer-motion";

export default function GlassButton({
  children,
  primary = false,
  glassPill = false,
  href,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  primary?: boolean;
  glassPill?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const variantClass = glassPill
    ? primary
      ? "glass-pill glass-pill--primary"
      : "glass-pill"
    : primary
      ? "bg-primary/20 border-primary text-white shadow-[0_0_15px_rgba(255,0,60,0.6)]"
      : "bg-white/5 border-white/20 text-foreground hover:border-primary/50";

  const content = (
    <motion.button
      whileHover="hover"
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`relative overflow-hidden px-8 py-3 rounded-full font-mono text-sm tracking-widest uppercase transition-all duration-300 backdrop-blur-md border cursor-pointer hover:scale-105 ${variantClass} ${className}`}
    >
      <span className="relative z-10">{children}</span>
      {!glassPill && (
        <motion.div
          variants={{
            hover: { x: ["-100%", "200%"] },
          }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 z-0 w-1/2 h-full bg-gradient-to-r from-transparent via-primary/50 to-transparent skew-x-[-20deg]"
        />
      )}
    </motion.button>
  );

  if (href) {
    return (
      <Link href={href} className="contents">
        {content}
      </Link>
    );
  }

  return content;
}
