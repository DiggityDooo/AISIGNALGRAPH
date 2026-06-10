"use client";

type SplineHeroPosterProps = {
  hidden?: boolean;
};

export default function SplineHeroPoster({ hidden = false }: SplineHeroPosterProps) {
  return (
    <div
      className={`spline-site-poster${hidden ? " spline-site-poster--hidden" : ""}`}
      aria-hidden
      data-testid="spline-hero-poster"
    >
      <div className="spline-site-void absolute inset-0" />
      <div className="spline-site-vignette absolute inset-0" />
      <div className="spline-site-ambient absolute inset-0" />
      <div className="spline-site-hero-fade absolute inset-x-0 bottom-0" aria-hidden />
    </div>
  );
}
