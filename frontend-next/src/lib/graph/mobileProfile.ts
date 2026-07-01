/**
 * Device-tier quality profile for the graph surfaces.
 *
 * Mobile GPUs crash (WebGL context loss) under the desktop configuration:
 * full devicePixelRatio framebuffers, decorative canvas layers, continuous
 * label rendering and the legacy per-node-mesh 3D scene. Every graph surface
 * (graph.js, SigmaLatticeGraph) reads this single profile instead of
 * sniffing the device itself.
 */

export interface GraphQualityProfile {
  /** True on coarse-pointer / small-viewport / low-memory devices. */
  isLowTier: boolean;
  /** Upper bound applied to window.devicePixelRatio for all graph canvases. */
  maxDpr: number;
  /** Continuous Sigma label pass — off on low tier, labels appear on focus. */
  renderLabels: boolean;
  /** Legacy Three.js 3D toggle availability. */
  enable3d: boolean;
  /** Decorative background particle canvas (flow-canvas-bg). */
  enableBackgroundFlow: boolean;
  /** Decorative neural-sphere CSS visualizer. */
  enableNeuralSphere: boolean;
  /** Sigma labelDensity override. */
  labelDensity: number;
  /** Sigma labelRenderedSizeThreshold override. */
  labelRenderedSizeThreshold: number;
  /** ForceAtlas2 iteration budget for the lattice layout. */
  layoutIterations: number;
}

const MOBILE_MAX_WIDTH_PX = 767;
const LOW_MEMORY_GB = 4;

const DESKTOP_PROFILE: GraphQualityProfile = {
  isLowTier: false,
  maxDpr: 2,
  renderLabels: true,
  enable3d: true,
  enableBackgroundFlow: true,
  enableNeuralSphere: true,
  labelDensity: 0.08,
  labelRenderedSizeThreshold: 10,
  layoutIterations: 120,
};

const MOBILE_PROFILE: GraphQualityProfile = {
  isLowTier: true,
  maxDpr: 1.5,
  renderLabels: false,
  enable3d: false,
  enableBackgroundFlow: false,
  enableNeuralSphere: false,
  labelDensity: 0.04,
  labelRenderedSizeThreshold: 14,
  layoutIterations: 60,
};

function detectLowTier(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const smallViewport = window.matchMedia(
    `(max-width: ${MOBILE_MAX_WIDTH_PX}px)`,
  ).matches;
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  const lowMemory = typeof memory === "number" && memory <= LOW_MEMORY_GB;
  return coarsePointer || smallViewport || lowMemory;
}

/** Resolve the quality profile for the current device. SSR-safe (desktop). */
export function getGraphQualityProfile(): GraphQualityProfile {
  return detectLowTier() ? MOBILE_PROFILE : DESKTOP_PROFILE;
}

/** DPR helper honoring the profile cap. */
export function cappedDevicePixelRatio(profile: GraphQualityProfile): number {
  if (typeof window === "undefined") {
    return 1;
  }
  return Math.min(window.devicePixelRatio || 1, profile.maxDpr);
}
