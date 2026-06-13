# Context & Objective
We are rebuilding the frontend architecture for **AISIGNALGRAPH** using **React Flow** (@xyflow/react). The user has requested a highly structured, left-to-right interactive node graph. 

The visual setup must match a specific design: Custom "document card" nodes with colored left borders, connected by smooth Bezier curves with directional arrows, arranged in a clean left-to-right hierarchy. To prevent DOM rendering lag with our large dataset (1k+ nodes, 6k+ edges), the graph must be "user-driven"—meaning it utilizes progressive disclosure (expanding nodes on click) rather than loading the entire network at once.

**Goal:** Implement custom React Flow nodes, integrate an auto-layout engine for the left-to-right hierarchy, and build the interactive logic for users to explore the graph dynamically.

# Phase 1: Custom "Document Card" Nodes
1. **Component Design:** Create a custom React Flow node component named `DocumentCardNode`.
2. **Styling:** The node should look like a small document or file card.
   - Background: Solid white with a subtle drop shadow (`bg-white shadow-md rounded-md`).
   - Left Border: A distinct, thick colored bar on the left edge (the color must be passed dynamically via `data.statusColor` or `data.type`, e.g., red, green, blue, yellow, purple).
   - Content: A small icon or title at the top, followed by skeleton text lines (thin gray horizontal bars) to represent content.
3. **Handles:** Place a `Target` handle on the exact left middle, and a `Source` handle on the exact right middle to enforce left-to-right visual flow.

# Phase 2: Directed Auto-Layout Engine
1. **Layout Integration:** Integrate a graph layout algorithm (e.g., `dagre` or `elkjs`) to automatically calculate node positions. 
2. **Configuration:** - Rank Direction: `LR` (Left-to-Right).
   - Node Separation: Ensure generous vertical and horizontal padding so edges don't overlap excessively.
3. **Triggering:** The layout engine should run automatically whenever new nodes are added to the canvas, animating the nodes smoothly into their new structured positions to maintain that "physics/fluid" feel.

# Phase 3: User-Driven Progressive Disclosure (Performance Fix)
1. **Initial State:** Do not load the entire `ai_graph.db` dataset. Start the graph with only the Root Node (or a core set of 3-5 starting nodes).
2. **Interaction (Expand/Collapse):** - Add an `onNodeDoubleClick` (or a small "+" button on the node) event handler.
   - When triggered, fetch or reveal the immediate *children* of that specific node from the dataset.
   - Add these new child nodes and their connecting edges to the React Flow state, and immediately re-run the `dagre`/`elkjs` auto-layout to organize the newly expanded tree.
3. **Edge Styling:** Use React Flow's `SmoothStep` or `Bezier` edge types. Include an arrow marker at the end of every edge (`markerEnd`).

# Phase 4: UI / Canvas Controls
1. **Background:** Use React Flow's `Background` component with a light grid or dot pattern.
2. **Controls:** Include the standard `Controls` and `MiniMap` components.
3. **Cleanup:** Ensure the old `GraphFlowCanvas` and `gephi_lite.css` logic is entirely removed. The layout should be controlled strictly by React Flow and Tailwind.

# Execution
Please build the `DocumentCardNode` component first, verify its styling matches the card/color-bar spec, and then implement the `dagre` layout and click-to-expand logic.