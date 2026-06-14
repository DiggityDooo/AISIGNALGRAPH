# Project: AISIGNALGRAPH Frontend Perfection

## Architecture
- **Tech Stack**: Next.js 16 (App Router), React 19, TypeScript, TailwindCSS, D3, Three.js / React Three Fiber, Playwright (E2E).
- **Core Components**:
  - `ClientShellEffects`: Renders global backgrounds and WebGL constellation layers.
  - `ForceTree`: D3-based interactive force simulation graph of neural connections.
  - `Scene`: React Three Fiber WebGL canvas for interactive 3D particle drift.
  - `KineticText`: Split-text animation component for page headings.
  - `BackToTopButton`: Scroll helper leveraging Lenis smooth scroll.

## Code Layout
- `frontend-next/src/app`: Application pages (Home, Stories, Entities, Graph).
- `frontend-next/src/components`: UI modules, WebGL layout, D3 visualizations.
- `frontend-next/e2e`: Playwright tests, analysis artifact output.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | R1. Lint & Compiler Fixes | Eliminate synchronous `setState` in `useEffect` for `BackToTopButton`, `ClientShellEffects`, `ForceTree`. Address purity/immutability in `Scene.tsx`. | None | PLANNED |
| 2 | R2. Heading E2E Fixes | Update `KineticText.tsx` with `.sr-only` span and `aria-hidden="true"` on animated words. | None | PLANNED |
| 3 | Verification & Gate | Run `npm run lint` and `npm run test:e2e` to verify correctness and pass forensic audit. | M1, M2 | PLANNED |

## Interface Contracts
### `KineticText` Component
- **Props**: `{ text: string }`
- **Behavior**: Accessible hidden rendering of complete heading string; aria-hidden animation rendering.
