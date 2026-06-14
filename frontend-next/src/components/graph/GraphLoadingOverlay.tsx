"use client";

import { motion, AnimatePresence } from "framer-motion";
import KineticText from "@/components/ui/KineticText";

type GraphLoadingOverlayProps = {
  isLoaded: boolean;
  progress: number;
  status: string;
};

export default function GraphLoadingOverlay({ isLoaded, progress, status }: GraphLoadingOverlayProps) {
  return (
    <AnimatePresence>
      {!isLoaded && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[60] bg-[#050202] flex flex-col items-center justify-center p-8"
        >
          <div className="max-w-xl w-full flex flex-col items-center gap-12">
            <div className="relative w-48 h-48">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 border-2 border-primary/20 border-t-primary rounded-full"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-mono text-xl text-primary font-bold">{progress}%</span>
              </div>
            </div>
            <div className="text-center flex flex-col gap-4">
              <h1 className="font-display text-4xl font-bold uppercase tracking-widest text-foreground">
                <KineticText text="Neural Lattice" />
              </h1>
              <p className="font-mono text-sm text-primary animate-pulse tracking-widest uppercase">{status}</p>
            </div>
            <div className="w-full h-[2px] bg-white/5 relative overflow-hidden">
              <motion.div
                className="absolute inset-0 bg-primary"
                initial={{ x: "-100%" }}
                animate={{ x: `${progress - 100}%` }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
