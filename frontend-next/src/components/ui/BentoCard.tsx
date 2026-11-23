"use client";

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import type { MouseEvent } from "react";

export default function BentoCard({
  title,
  value,
  description,
  href,
  metadata,
  className = "",
}: {
  title: string;
  value: string;
  description?: string;
  href: string;
  metadata?: string;
  className?: string;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);
  const rotateX = useMotionTemplate`${mouseYSpring}deg`;
  const rotateY = useMotionTemplate`${mouseXSpring}deg`;
  const reduceMotion = useReducedMotion();

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (reduceMotion) return;
    const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
    x.set(((event.clientX - left) / width - 0.5) * 20);
    y.set(((event.clientY - top) / height - 0.5) * -20);
  };

  // Record details are Flask documents, outside the static Next router.
  return (
    <a href={href} className={`record-card grid min-h-min grid-rows-[minmax(min-content,1fr)] rounded-2xl ${className}`}>
      <motion.div
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { x.set(0); y.set(0); }}
        style={reduceMotion ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
        className={`glass-panel p-6 min-h-min flex flex-col justify-center items-center gap-2 group
          text-center wrap-anywhere transition-shadow duration-300 hover:shadow-[0_0_30px_rgba(255,42,77,0.3)]
          hover:border-primary/50`}
      >
        <span style={{ transform: "translateZ(30px)" }}
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          {title.replaceAll("-", " ")}
        </span>
        <h2 style={{ transform: "translateZ(50px)" }}
          className="font-display text-2xl lg:text-3xl font-bold text-foreground group-hover:text-primary transition-colors">
          {value}
        </h2>
        {description && <p style={{ transform: "translateZ(20px)" }}
          className="font-mono text-xs leading-relaxed text-muted mt-2">
          {description}
        </p>}
        {metadata && <small className="directory-card-meta">{metadata}</small>}
      </motion.div>
    </a>
  );
}
