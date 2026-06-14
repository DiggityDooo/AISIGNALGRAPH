"use client";

type GraphErrorBannerProps = {
  message: string;
  onRetry: () => void;
};

export default function GraphErrorBanner({ message, onRetry }: GraphErrorBannerProps) {
  if (!message) {
    return null;
  }

  return (
    <div className="absolute top-24 left-1/2 z-[70] w-[min(92vw,36rem)] -translate-x-1/2 rounded border border-red-500/40 bg-black/90 p-4 shadow-lg backdrop-blur-md">
      <p className="font-mono text-[10px] uppercase tracking-widest text-red-400">Neural link failed</p>
      <p className="mt-2 font-mono text-xs text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="glass-panel mt-4 px-3 py-2 font-mono text-[10px] uppercase tracking-wider hover:bg-primary/10"
      >
        Retry
      </button>
    </div>
  );
}
