# Domain Docs: Hybrid Single + Multi-Context

This repo uses a **hybrid approach** to domain documentation:

## Layout

- **`CONTEXT.md`** (root) — Shared domain concepts, vocabulary, and high-level architecture
- **`CONTEXT-MAP.md`** (root) — Index mapping each module to its context file
- **Per-module `CONTEXT.md` files:**
  - `frontend-next/CONTEXT.md` — Frontend-specific domain (UI, state, components)
  - `scraper/CONTEXT.md` — Scraper-specific domain (sources, extraction, scheduling)
  - `webapp/CONTEXT.md` — Backend/webapp domain (routes, data models, storage)

## Consumer rules for agents

When a skill reads domain docs:

1. **Start with root `CONTEXT.md`** for shared vocabulary and high-level concepts
2. **Check `CONTEXT-MAP.md`** to find the relevant module context
3. **Read the module-specific `CONTEXT.md`** for details about that area

If a module context doesn't exist yet, the skill falls back to root context only.

## What belongs where

**Root `CONTEXT.md`:**
- Project goals and vision
- Shared domain terminology (e.g., "signal", "graph", "ingest")
- High-level architecture (how modules relate)
- Deployment and operational concerns

**Per-module `CONTEXT.md`:**
- Module-specific data models and vocabulary
- Key algorithms or workflows in that module
- Dependencies and integration points
- Module-specific decisions (ADRs can live here too)

## Updating

Edit these files directly; re-running the setup skill is only needed if you want to change the tracking method or context layout.
