---
title: Lattice graph — node-focus camera NaN guard + subtle node float
state: ready-for-agent
created: 2026-09-08
---

## Issue 1: clicking a node zooms the camera into black space

Clicking a node in the /graph Lattice view sometimes sends the camera into
empty space with no way back. Root cause: non-finite (NaN) node positions
reach the camera animation.

- 3D (`GraphEngine.js` `focusNode`): tweens the camera/controls target toward
  `pos.x/y/z` with no finiteness check. NaN sources: `_startLayoutWorker`
  tick handler copies worker positions verbatim; localStorage cache restore
  copies parsed positions verbatim; `init`'s
  `positions.get(node.id) || {x: node.x || 0, ...}` lets a truthy `{x: NaN}`
  object through.
- Sigma 2D (`latticeRenderer.ts` `applyFocus`): passes `nodeAttrs.x/y`
  straight into `camera.animate()`; `computeFocusRatio` guards but the
  animate call itself doesn't. NaN appears in live attrs when ForceAtlas2
  diverges on the progressive path.

## Issue 2: lattice nodes should gently float

The Sigma 2D lattice should have a subtle idle drift — nodes floating
slightly around their laid-out positions, cheap enough to never hurt frame
rate. 3D engine intentionally excluded (see report: worker tick stream
fights per-frame offsets, and per-frame edge-geometry rebuilds are not
cheap).
