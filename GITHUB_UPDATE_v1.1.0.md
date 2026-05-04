# Release Notes: AISIGNALGRAPH v1.1.0 - The Dimensional Shift

We are excited to announce the first major stabilization and feature update for **AISIGNALGRAPH**. This release focuses on rebranding, high-fidelity 3D visualization, and significant performance overhead reduction.

## 🚀 New Features

### 🧊 Neural 3D Engine
The core of this update is the introduction of a high-performance Three.js rendering engine.
- **Dimensional Toggle:** Seamlessly switch between the classic 2D Sigma.js view and a new immersive 3D Neural Space.
- **Interactive Node Cloud:** Nodes are now fully interactable in 3D with raycasted hover labels and click-to-focus functionality.
- **Ego-Network Highlighting:** Clicking a node in 3D mode triggers a dynamic camera fly-to and isolates its immediate neighbors, dimming the rest of the network for focused intelligence gathering.
- **Atmospheric Rendering:** Implemented `FogExp2` falloff, sinusoidal breathing glows on node halos, and drifting point-light systems for a premium aesthetic.

### 🏷️ Universal Rebranding
- The platform has officially transitioned from "Gephi Lite" to **AISIGNALGRAPH**.
- All internal namespaces, console logs, and UI components have been updated for brand consistency.
- Updated Next.js/Hub build artifacts to ensure a unified identity across all sub-pages.

## ⚡ Performance & Optimization

### Zero-Lag Interaction
- **GPU Acceleration:** Refactored `premium.css` to use `will-change: transform` and removed CSS-based transitions on cursor-following elements to eliminate input latency.
- **Smart Resource Management:** The 2D Sigma renderer is now fully unloaded when entering 3D mode and reconstructing on exit, ensuring the browser only processes what is necessary.
- **Optimized Caching:** Implemented neighbor-set caching to allow for O(1) adjacency lookups during interaction.

## 🛠️ Bug Fixes
- Resolved a broken template literal syntax in the core graph logic.
- Fixed an issue where the detail pane would remain active after deselecting nodes.
- Synchronized the `node-visualizer-container` with real-time node selection data.

---
*For more information on the intelligence data within the graph, please refer to the `data/ai_master.md` authoritative source.*
