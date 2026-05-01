import { motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";
import { MouseEvent } from "react";
import Link from "next/link";

export default function BentoCard({ 
  title, 
  value, 
  description,
  href,
  className = "" 
}: { 
  title: string; 
  value: string; 
  description?: string;
  href?: string;
  className?: string; 
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);

  const rotateX = useMotionTemplate`${mouseYSpring}deg`;
  const rotateY = useMotionTemplate`${mouseXSpring}deg`;

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    
    const width = rect.width;
    const height = rect.height;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    
    x.set(xPct * 20); // Max rotation 10deg
    y.set(yPct * -20);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  const content = (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
      }}
      className={`glass-panel p-6 flex flex-col justify-center items-center gap-2 group transition-shadow duration-300 hover:shadow-[0_0_30px_rgba(255,42,77,0.3)] hover:border-primary/50 cursor-pointer ${className}`}
    >
      <div 
        style={{ transform: "translateZ(30px)" }} 
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted group-hover:text-foreground transition-colors"
      >
        {title}
      </div>
      <div 
        style={{ transform: "translateZ(50px)" }} 
        className="font-display text-4xl font-bold text-foreground group-hover:text-primary transition-colors drop-shadow-[0_0_10px_rgba(255,42,77,0)] group-hover:drop-shadow-[0_0_10px_rgba(255,42,77,0.8)] text-center"
      >
        {value}
      </div>
      {description && (
        <div 
          style={{ transform: "translateZ(20px)" }} 
          className="font-mono text-[10px] text-muted text-center mt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        >
          {description}
        </div>
      )}
    </motion.div>
  );

  if (href) {
    return <Link href={href} className="contents">{content}</Link>;
  }

  return content;
}
