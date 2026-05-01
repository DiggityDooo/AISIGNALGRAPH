# Implementation Plan: Animated Neural Node Visualizer for CodeX

This document outlines the technical strategy for integrating a dynamic, 3D-animated node visualizer into the AISIGNALGRAPH intelligence dashboard.

## 1. Objective
To enhance the User Experience (UX) by providing a visual anchor in the detail pane. This "Neural Sphere" will animate when a node is selected, reflecting its identity, importance, and connection status through color and motion.

## 2. Component Architecture

### A. Structural Layer (`webapp/templates/dashboard.html`)
A dedicated container will be inserted into the `hud-right` section.

```html
<div id="node-visualizer-container" class="node-visualizer-container">
    <div class="neural-sphere">
        <div class="sphere-core"></div>
        <div class="sphere-orbit sphere-orbit--1"></div>
        <div class="sphere-orbit sphere-orbit--2"></div>
        <div class="sphere-orbit sphere-orbit--3"></div>
    </div>
</div>
```

### B. Styling & Animation Layer (`webapp/static/gephi_lite.css`)
Using CSS 3D transforms to create a premium visual effect.

**Key Animation Specs:**
- **Core Glow**: Radial gradient pulse effect.
- **Orbital Rotation**: 
  - Orbit 1: X-axis (8s duration, linear)
  - Orbit 2: Y-axis (12s duration, linear)
  - Orbit 3: Diagonal (10s duration, linear)
- **Glassmorphism**: 
  - `backdrop-filter: blur(12px)`
  - `background: rgba(255, 255, 255, 0.05)`

### C. Logic Layer (`webapp/static/graph.js`)
Update the `inspectNode(node)` function to synchronize the visualizer.

```javascript
function updateVisualizer(node) {
    const container = document.getElementById('node-visualizer-container');
    if (!container) return;

    // 1. Get Node Color
    const colorKey = node.semanticType || node.node_type || "entity";
    const color = CONFIG.nodeColors[colorKey] || "#3793ff";

    // 2. Apply CSS Variables
    container.style.setProperty('--node-glow-color', color);
    
    // 3. Trigger "Select" Animation
    container.classList.remove('node-selected-active');
    void container.offsetWidth; // Force Reflow
    container.classList.add('node-selected-active');
}
```

## 3. Implementation Workflow

| Step | Task | Target File |
| :--- | :--- | :--- |
| 1 | Inject HTML container into Detail Pane | `dashboard.html` |
| 2 | Define 3D animations and sphere styles | `gephi_lite.css` |
| 3 | Connect `inspectNode` to the visualizer logic | `graph.js` |
| 4 | Add "Selection Pulse" sound effect (Optional) | `graph.js` |

## 4. Design Aesthetics (Premium Requirements)
- **Zero-Latency**: Ensure animations are hardware-accelerated (`will-change: transform`).
- **Dynamic Sizing**: The sphere diameter should scale based on the node's `importance` score.
- **Visual Harmony**: The glow must bloom outward using `box-shadow` and `filter: blur`.

---
*Created for AISIGNALGRAPH Protocol v2.0*
