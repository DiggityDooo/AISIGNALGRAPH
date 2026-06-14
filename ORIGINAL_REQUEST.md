# Original User Request

## Initial Request — 2026-06-13T19:31:29Z

# Teamwork Project Prompt — Launched

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview

Perfect the AISIGNALGRAPH frontend codebase by resolving React 19 / Next 16 compiler and linting errors, fixing heading visibility detection in Playwright E2E tests, and ensuring full standard compliance.

Working directory: /home/seanb/Documents/December 2023
Integrity mode: development

## Requirements

### R1. Resolve React 19 / Next 16 Linting & Compiler Violations
Fix all ES Lint errors and warnings in the frontend codebase to conform to the strict React 19 compiler guidelines:
- Eliminate synchronous `setState` calls inside `useEffect` bodies in [BackToTopButton.tsx](file:///home/seanb/Documents/December%202023/frontend-next/src/components/ui/BackToTopButton.tsx), [ClientShellEffects.tsx](file:///home/seanb/Documents/December%202023/frontend-next/src/components/ui/ClientShellEffects.tsx), and [ForceTree.tsx](file:///home/seanb/Documents/December%202023/frontend-next/src/components/visualization/ForceTree.tsx).
- Fix purity and immutability violations in [Scene.tsx](file:///home/seanb/Documents/December%202023/frontend-next/src/components/webgl/Scene.tsx) by moving array creation/randomization outside of the render phase (e.g. into `useRef` or static scope) and avoiding mutation of state/hook-returned values.

### R2. Fix Heading Text Visibility in E2E Tests
Fix the layout/rendering of [KineticText.tsx](file:///home/seanb/Documents/December%202023/frontend-next/src/components/ui/KineticText.tsx) so that Playwright's `getByRole("heading")` correctly matches the full text. 
- Use an accessibility-friendly approach: render the full text inside an `.sr-only` class span for screen readers and tests, and set `aria-hidden="true"` on the animated individual word/character spans.

## Acceptance Criteria

### Lint & Compile Check
- [ ] Running `npm run lint` inside `frontend-next/` passes with 0 errors.

### E2E Verification
- [ ] Running `npm run test:e2e` inside `frontend-next/` passes with all 10 tests green.
- [ ] The generated [analysis.md](file:///home/seanb/Documents/December%202023/frontend-next/e2e/artifacts/analysis.md) shows `expectedHeading: pass` for all 4 check routes (home, stories, entities, graph).
