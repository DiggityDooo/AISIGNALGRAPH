  
**AISIGNALGRAPH**  
**IMPLEMENTATION GUIDE**

────────────────────────────────────────

*Obsidian-Style Force Graph  ·  Neural Network Overlays*

*Shader-Grade Futuristic UI  ·  WebGL Particle Systems*

Full Codex Implementation Spec — April 2026

# **0\. PROJECT OVERVIEW & MISSION BRIEF**

AISIGNALGRAPH is a local Flask-powered AI knowledge graph that ingests a master Markdown document of AI stories, parses them into structured nodes (labs, models, people, events, risks), and renders them as an interactive force-directed graph. This guide gives GPT-4.5 Codex every implementation detail needed to:

▸ Rebuild the graph engine using true Obsidian-style physics and link semantics

▸ Add neural-network-inspired visual overlays (pulsing signals, activation flows)

▸ Replace the current UI with a shader-grade futuristic interface (WebGL background, neon nodes, GLSL particles)

▸ Wire everything into the existing Flask \+ SQLite backend without breaking it

## **0.1 CURRENT STACK SNAPSHOT**

| Backend | Flask (Python) — app.py entry point |
| :---- | :---- |
| **Database** | SQLite — data/ai\_graph.db (stories, entities, edges, hubs) |
| **Frontend** | Jinja2 templates in webapp/templates/ |
| **Graph lib** | D3.js force simulation (current, basic) |
| **Data source** | /home/seanb/Documents/New Folder/AI\_Master\_Document\_2020\_2026.md |
| **Node types** | story, lab, model, product, person, risk, year, topic |

**⚡ NOTE:** Codex should treat this guide as the single source of truth. Do NOT invent new node types or change the SQLite schema columns — extend them only.

# **1\. HOW OBSIDIAN'S GRAPH VIEW WORKS**

Obsidian's graph is a force-directed graph built on D3-force. Understanding each component is essential before implementing it.

## **1.1 CORE FORCE SIMULATION COMPONENTS**

D3-force applies four simultaneous physics forces to every node on every animation tick:

### **FORCE 1 — forceLink (Edge Springs)**

Each edge between two nodes acts like a spring. The simulation tries to make the distance between linked nodes equal to the "link distance" value. Nodes with more connections get pulled closer together.

 // JavaScript — D3 forceLink  
d3.forceLink(edges)  
  .id(d \=\> d.id)  
  .distance(d \=\> {  
    // Obsidian-style: stronger relationship \= shorter distance  
    const weight \= d.weight || 1;  
    return 80 / Math.log(weight \+ 1);  
  })  
  .strength(d \=\> 0.3 \+ (d.weight \* 0.05))

### **FORCE 2 — forceManyBody (Node Repulsion)**

Every node repels every other node like charged particles. The strength is negative (repulsion). This prevents nodes from clustering on top of each other. Obsidian makes this configurable via the "Repel force" slider.

 // JavaScript — forceManyBody  
d3.forceManyBody()  
  .strength(d \=\> {  
    // Hub nodes (many connections) repel harder  
    const degree \= linksByNode\[d.id\]?.length || 0;  
    return \-(120 \+ degree \* 15);  
  })  
  .theta(0.9)          // Barnes-Hut approximation (0=exact, 1=fast)  
  .distanceMax(600)    // Cap repulsion radius for performance

### **FORCE 3 — forceCenter (Gravity)**

A weak centripetal force that pulls all nodes toward the center of the canvas. Without it, nodes drift off-screen. Obsidian uses a very weak center force (\~0.05) so the graph breathes naturally.

 // JavaScript — forceCenter  
d3.forceCenter(width / 2, height / 2\)  
  .strength(0.05)

### **FORCE 4 — forceCollide (Node Spacing)**

Prevents nodes from overlapping by giving each a collision radius. Critical for readability when node sizes vary.

 // JavaScript — forceCollide  
d3.forceCollide()  
  .radius(d \=\> nodeRadius(d) \+ 8\)   // \+8px padding  
  .strength(0.7)  
  .iterations(3)                    // Higher \= more accurate, slower

## **1.2 THE SIMULATION TICK LOOP**

D3-force updates node (x,y) positions each animation frame. Your render code runs inside the "tick" event and moves DOM/Canvas/WebGL elements to match. This is the heart of the graph — everything visual is driven by this loop.

 // JavaScript — Simulation Tick  
const simulation \= d3.forceSimulation(nodes)  
  .force("link",    forceLink)  
  .force("charge",  forceManyBody)  
  .force("center",  forceCenter)  
  .force("collide", forceCollide)  
  .alphaDecay(0.02)     // How fast simulation "cools" (0=never, 1=instant)  
  .velocityDecay(0.4)   // Friction — higher \= slower movement  
  .on("tick", render);  // Callback on every frame

function render() {  
  // Move edges  
  edgeElements  
    .attr("x1", d \=\> d.source.x)  
    .attr("y1", d \=\> d.source.y)  
    .attr("x2", d \=\> d.target.x)  
    .attr("y2", d \=\> d.target.y);

  // Move nodes  
  nodeElements  
    .attr("cx", d \=\> d.x)  
    .attr("cy", d \=\> d.y);  
}

## **1.3 NODE SIZING (OBSIDIAN DEGREE SCALING)**

In Obsidian, nodes grow larger based on how many connections (edges) they have. This immediately shows which concepts are "hubs." The radius scales with the square root of degree so very-high-degree nodes don't dominate too aggressively.

 // JavaScript — Node Degree Scaling  
function nodeRadius(d) {  
  const BASE \= 6;  
  const MAX  \= 32;  
  const degree \= linksByNode\[d.id\]?.length || 0;  
  return Math.min(BASE \+ Math.sqrt(degree) \* 3.5, MAX);  
}

// Build degree index before simulation starts  
const linksByNode \= {};  
edges.forEach(e \=\> {  
  (linksByNode\[e.source\] \= linksByNode\[e.source\] || \[\]).push(e);  
  (linksByNode\[e.target\] \= linksByNode\[e.target\] || \[\]).push(e);  
});

## **1.4 CAMERA: PAN \+ ZOOM**

Obsidian uses D3-zoom for pan/zoom. All node/edge positions are transformed by a single 2D matrix applied to the SVG root group. This is crucial for performance — only one transform is updated, not every element.

 // JavaScript — Pan & Zoom  
const zoom \= d3.zoom()  
  .scaleExtent(\[0.05, 8\])   // min/max zoom  
  .on("zoom", (event) \=\> {  
    rootGroup.attr("transform", event.transform);  
  });

svg.call(zoom);

// Programmatic zoom-to-fit on load  
function zoomToFit(padding \= 80\) {  
  const bounds \= rootGroup.node().getBBox();  
  const fullW  \= bounds.width  \+ padding \* 2;  
  const fullH  \= bounds.height \+ padding \* 2;  
  const scale  \= Math.min(width / fullW, height / fullH, 1);  
  const tx \= (width  \- scale \* (bounds.x \* 2 \+ bounds.width))  / 2;  
  const ty \= (height \- scale \* (bounds.y \* 2 \+ bounds.height)) / 2;  
  svg.transition().duration(800)  
    .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));  
}

## **1.5 NODE DRAG BEHAVIOR**

Dragging a node should "pin" it in place (fx/fy properties), heat the simulation back up so nearby nodes readjust, and release on mouseup. This is exactly how Obsidian handles drag.

 // JavaScript — Node Drag  
const drag \= d3.drag()  
  .on("start", (event, d) \=\> {  
    if (\!event.active) simulation.alphaTarget(0.3).restart();  
    d.fx \= d.x;   // Pin node  
    d.fy \= d.y;  
  })  
  .on("drag", (event, d) \=\> {  
    d.fx \= event.x;  
    d.fy \= event.y;  
  })  
  .on("end", (event, d) \=\> {  
    if (\!event.active) simulation.alphaTarget(0);  
    d.fx \= null;  // Unpin — node floats freely again  
    d.fy \= null;  
  });

## **1.6 EDGE TYPES & RELATIONSHIP WEIGHTS**

AISIGNALGRAPH has semantic edges (story→lab, story→model, model→person, etc.). Each edge type should have a different visual style AND a different spring strength. This mirrors Obsidian's tag-based link coloring.

| Edge Type | Color | Dash Pattern | Link Distance | Strength |
| :---- | :---- | :---- | :---- | :---- |
| story-\>lab | \#00F5FF | solid | 120px | 0.4 |
| story-\>model | \#A855F7 | solid | 100px | 0.5 |
| story-\>person | \#00FF88 | 4,4 dashed | 140px | 0.3 |
| story-\>risk | \#FF6B35 | 2,6 dashed | 160px | 0.2 |
| hub-\>any | \#64748B | 1,8 dotted | 200px | 0.1 |
| year-\>story | \#F59E0B | solid | 180px | 0.25 |

# **2\. NEURAL NETWORK VISUAL OVERLAYS**

Beyond static graph edges, AISIGNALGRAPH should simulate "signal propagation" — a visual metaphor for how information flows through the AI knowledge network. This is the key feature that elevates it from a knowledge graph to a neural-network-style visualization.

## **2.1 THE SIGNAL PULSE SYSTEM**

Signals are animated particles that travel along edges from source node to target node. They represent a story's influence propagating through connected entities. Implementation uses a custom animation loop separate from the D3 simulation.

 // JavaScript — Signal Pulse Class  
// Signal particle system — runs on Canvas overlay above SVG  
class SignalPulse {  
  constructor(sourceNode, targetNode, edgeType) {  
    this.source    \= sourceNode;  
    this.target    \= targetNode;  
    this.progress  \= 0;          // 0 \= at source, 1 \= at target  
    this.speed     \= 0.008 \+ Math.random() \* 0.006;  
    this.color     \= EDGE\_COLORS\[edgeType\] || "\#00F5FF";  
    this.size      \= 3 \+ Math.random() \* 2;  
    this.trail     \= \[\];         // Previous positions for motion blur  
    this.trailLen  \= 12;  
    this.alive     \= true;  
  }

  update() {  
    this.progress \+= this.speed;  
    // Lerp position along edge  
    const x \= this.source.x \+ (this.target.x \- this.source.x) \* this.progress;  
    const y \= this.source.y \+ (this.target.y \- this.source.y) \* this.progress;  
    this.trail.unshift({ x, y });  
    if (this.trail.length \> this.trailLen) this.trail.pop();  
    if (this.progress \>= 1\) {  
      this.alive \= false;  
      // Activate target node visually  
      activateNode(this.target);  
    }  
  }

  draw(ctx) {  
    // Draw motion trail  
    this.trail.forEach((p, i) \=\> {  
      const alpha  \= (1 \- i / this.trailLen) \* 0.8;  
      const radius \= this.size \* (1 \- i / this.trailLen);  
      ctx.beginPath();  
      ctx.arc(p.x, p.y, radius, 0, Math.PI \* 2);  
      ctx.fillStyle \= hexToRgba(this.color, alpha);  
      ctx.fill();  
    });  
    // Glow halo on head  
    if (this.trail.length \> 0\) {  
      const head \= this.trail\[0\];  
      const grad \= ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, this.size \* 4);  
      grad.addColorStop(0,   hexToRgba(this.color, 0.6));  
      grad.addColorStop(1,   hexToRgba(this.color, 0));  
      ctx.beginPath();  
      ctx.arc(head.x, head.y, this.size \* 4, 0, Math.PI \* 2);  
      ctx.fillStyle \= grad;  
      ctx.fill();  
    }  
  }  
}

## **2.2 NODE ACTIVATION ANIMATION**

When a signal arrives at a node, it triggers a "ripple activation" — an expanding ring that fades out, like a neuron firing. Use CSS custom property animation for this on SVG nodes.

 // JavaScript \+ CSS — Node Activation  
function activateNode(node) {  
  const el \= document.getElementById(\`node-${node.id}\`);  
  if (\!el) return;  
  // Create ripple ring  
  const ripple \= document.createElementNS("http://www.w3.org/2000/svg", "circle");  
  ripple.setAttribute("cx", node.x);  
  ripple.setAttribute("cy", node.y);  
  ripple.setAttribute("r",  nodeRadius(node));  
  ripple.setAttribute("fill", "none");  
  ripple.setAttribute("stroke", node.color);  
  ripple.setAttribute("stroke-width", "2");  
  ripple.classList.add("node-ripple");  
  svgRoot.appendChild(ripple);  
  // CSS animation handles expansion \+ fade  
  setTimeout(() \=\> ripple.remove(), 1200);  
  // Flash node brightness  
  el.style.filter \= \`brightness(3) drop-shadow(0 0 12px ${node.color})\`;  
  setTimeout(() \=\> el.style.filter \= "", 400);  
}

/\* CSS \*/  
@keyframes ripple-expand {  
  0%   { r: var(--base-r); opacity: 0.9; stroke-width: 2; }  
  100% { r: calc(var(--base-r) \+ 40px); opacity: 0; stroke-width: 0.5; }  
}  
.node-ripple { animation: ripple-expand 1.2s ease-out forwards; }

## **2.3 SIGNAL SPAWNING STRATEGY**

Signals should spawn automatically based on story recency and relationship density. Recent stories generate more signals. Use a Poisson process (random intervals) to avoid synchronization artifacts.

 // JavaScript — Signal Spawning  
function autoSpawnSignals() {  
  // Select weighted random edge to send signal along  
  const edge \= weightedRandomEdge(edges);  
  if (edge) {  
    const pulse \= new SignalPulse(  
      nodeById\[edge.source.id\],  
      nodeById\[edge.target.id\],  
      edge.type  
    );  
    activeSignals.push(pulse);  
  }  
  // Schedule next spawn — Poisson process  
  const nextDelay \= \-Math.log(1 \- Math.random()) \* 400; // avg 400ms  
  setTimeout(autoSpawnSignals, nextDelay);  
}

function weightedRandomEdge(edges) {  
  // Higher-weight edges are more likely to carry signals  
  const totalWeight \= edges.reduce((s, e) \=\> s \+ (e.weight || 1), 0);  
  let rand \= Math.random() \* totalWeight;  
  for (const edge of edges) {  
    rand \-= (edge.weight || 1);  
    if (rand \<= 0\) return edge;  
  }  
  return edges\[edges.length \- 1\];  
}

## **2.4 ATTENTION HEATMAP OVERLAY**

Inspired by transformer attention maps, nodes that participate in many active signals should glow brighter. Maintain an "attention score" per node that decays over time and increases when signals pass through it.

 // JavaScript — Attention Heatmap  
const attention \= {};   // nodeId \-\> score (0-1)  
const DECAY \= 0.97;     // Per-frame decay multiplier

// In animation loop:  
function updateAttention() {  
  // Decay all scores  
  Object.keys(attention).forEach(id \=\> {  
    attention\[id\] \*= DECAY;  
  });  
  // Boost scores for nodes currently being traversed  
  activeSignals.forEach(signal \=\> {  
    const srcId \= signal.source.id;  
    const tgtId \= signal.target.id;  
    attention\[srcId\] \= Math.min(1, (attention\[srcId\] || 0\) \+ 0.15);  
    attention\[tgtId\] \= Math.min(1, (attention\[tgtId\] || 0\) \+ 0.08);  
  });  
  // Apply to visual  
  nodeElements.each(function(d) {  
    const score \= attention\[d.id\] || 0;  
    const glow  \= score \* 20;  
    d3.select(this).style("filter",  
      \`drop-shadow(0 0 ${glow}px ${d.color}) brightness(${1 \+ score})\`  
    );  
  });  
}

# **3\. WEBGL SHADER BACKGROUND (shader.se AESTHETIC)**

shader.se is built entirely on WebGL/GLSL fragment shaders — animated mathematical noise fields rendered in real-time. The aesthetic: deep black/navy backgrounds, neon plasma flows, volumetric glow. Implement this as a full-screen WebGL canvas behind the graph.

## **3.1 CANVAS LAYER ARCHITECTURE**

The UI needs three stacked layers. This is the exact HTML structure Codex should generate:

 // HTML — Layer Stack  
\<div id="app-root"\>

  \<\!-- Layer 1: WebGL background shader (z-index: 0\) \--\>  
  \<canvas id="bg-shader" style="position:fixed; inset:0; z-index:0;  
           pointer-events:none;"\>\</canvas\>

  \<\!-- Layer 2: D3 graph SVG (z-index: 1\) \--\>  
  \<svg id="graph-svg" style="position:fixed; inset:0; z-index:1;  
        width:100%; height:100%;"\>\</svg\>

  \<\!-- Layer 3: Canvas for signal particles (z-index: 2\) \--\>  
  \<canvas id="signal-canvas" style="position:fixed; inset:0; z-index:2;  
           pointer-events:none;"\>\</canvas\>

  \<\!-- Layer 4: UI panels (z-index: 10\) \--\>  
  \<div id="ui-overlay" style="position:fixed; inset:0; z-index:10;  
       pointer-events:none;"\>  
    \<\!-- All UI panels go here with pointer-events:auto on children \--\>  
  \</div\>

\</div\>

## **3.2 THE VERTEX SHADER**

A simple pass-through vertex shader — all the magic happens in the fragment shader:

 // GLSL — Vertex Shader  
// Paste this directly into a \<script type="x-shader/x-vertex"\> tag  
attribute vec4 a\_position;  
void main() {  
  gl\_Position \= a\_position;  
}

## **3.3 THE FRAGMENT SHADER (Full Implementation)**

This shader creates a flowing plasma field with grid overlay — the signature shader.se look. Paste this exactly as-is into your fragment shader source string:

 // GLSL — Fragment Shader (Full)  
precision highp float;

uniform float u\_time;          // seconds elapsed  
uniform vec2  u\_resolution;    // canvas width, height  
uniform vec2  u\_mouse;         // normalized mouse pos (0-1)

// ── Noise functions ───────────────────────────────  
vec3 hash3(vec2 p) {  
  vec3 q \= vec3(dot(p, vec2(127.1, 311.7)),  
                dot(p, vec2(269.5, 183.3)),  
                dot(p, vec2(419.2, 371.9)));  
  return fract(sin(q) \* 43758.5453);  
}

float noise(vec2 p) {  
  vec2 i \= floor(p);  
  vec2 f \= fract(p);  
  vec2 u \= f \* f \* (3.0 \- 2.0 \* f);  
  return mix(mix(dot(hash3(i \+ vec2(0,0)).xy, f \- vec2(0,0)),  
                 dot(hash3(i \+ vec2(1,0)).xy, f \- vec2(1,0)), u.x),  
             mix(dot(hash3(i \+ vec2(0,1)).xy, f \- vec2(0,1)),  
                 dot(hash3(i \+ vec2(1,1)).xy, f \- vec2(1,1)), u.x), u.y);  
}

float fbm(vec2 p) {  
  float val \= 0.0;  
  float amp \= 0.5;  
  float freq \= 1.0;  
  for (int i \= 0; i \< 6; i++) {  
    val  \+= amp \* noise(p \* freq);  
    amp  \*= 0.5;  
    freq \*= 2.0;  
  }  
  return val;  
}

// ── Grid overlay ─────────────────────────────────  
float grid(vec2 uv, float spacing, float lineW) {  
  vec2 g \= fract(uv / spacing);  
  vec2 d \= min(g, 1.0 \- g);  
  return 1.0 \- smoothstep(0.0, lineW, min(d.x, d.y));  
}

void main() {  
  vec2 uv  \= gl\_FragCoord.xy / u\_resolution;  
  vec2 st  \= (gl\_FragCoord.xy \- 0.5 \* u\_resolution) / min(u\_resolution.x, u\_resolution.y);  
  float t  \= u\_time \* 0.12;

  // Plasma base — two layers of fbm warping each other  
  vec2 q  \= vec2(fbm(st \+ t), fbm(st \+ vec2(1.7, 9.2) \+ t \* 0.8));  
  vec2 r  \= vec2(fbm(st \+ 2.0 \* q \+ vec2(1.7, 9.2) \+ 0.15 \* t),  
                 fbm(st \+ 2.0 \* q \+ vec2(8.3, 2.8) \+ 0.12 \* t));  
  float f \= fbm(st \+ 2.0 \* r);

  // Color ramp — deep space navy → cyan → purple  
  vec3 col \= mix(  
    vec3(0.01, 0.04, 0.10),                 // deep navy  
    vec3(0.00, 0.95, 1.00),                 // neon cyan  
    clamp(f \* f \* 3.0, 0.0, 1.0)  
  );  
  col \= mix(col,  
    vec3(0.66, 0.33, 0.97),                 // electric purple  
    clamp(length(q) \* 0.5, 0.0, 1.0)  
  );

  // Mouse interaction — brighten near cursor  
  vec2 mouseUV \= u\_mouse \- uv;  
  float mDist  \= length(mouseUV);  
  col \+= vec3(0.0, 0.3, 0.5) \* smoothstep(0.3, 0.0, mDist) \* 0.4;

  // Grid overlay  
  float gridVal  \= grid(uv \* u\_resolution \* 0.015, 1.0, 0.04);  
  float gridVal2 \= grid(uv \* u\_resolution \* 0.003, 1.0, 0.04);  
  col \+= vec3(0.0, 0.5, 1.0) \* gridVal  \* 0.06;  
  col \+= vec3(0.0, 0.3, 0.6) \* gridVal2 \* 0.04;

  // Vignette  
  float vig \= 1.0 \- dot(st \* 0.8, st \* 0.8);  
  col \*= vig \* vig;

  // Tone map \+ gamma  
  col  \= col / (col \+ 0.3);  
  col  \= pow(col, vec3(0.75));

  gl\_FragColor \= vec4(col, 1.0);  
}

## **3.4 WEBGL BOOTSTRAP (Full JS)**

This is the complete WebGL initialization and render loop. Codex should drop this into webapp/static/js/shader.js:

 // JavaScript — WebGL Bootstrap  
(function initShader() {  
  const canvas \= document.getElementById("bg-shader");  
  const gl     \= canvas.getContext("webgl") || canvas.getContext("experimental-webgl");  
  if (\!gl) { canvas.style.background="\#050A14"; return; }

  function compile(type, src) {  
    const sh \= gl.createShader(type);  
    gl.shaderSource(sh, src);  
    gl.compileShader(sh);  
    if (\!gl.getShaderParameter(sh, gl.COMPILE\_STATUS))  
      throw gl.getShaderInfoLog(sh);  
    return sh;  
  }

  const prog \= gl.createProgram();  
  gl.attachShader(prog, compile(gl.VERTEX\_SHADER,   VERT\_SRC));  
  gl.attachShader(prog, compile(gl.FRAGMENT\_SHADER, FRAG\_SRC));  
  gl.linkProgram(prog);  
  gl.useProgram(prog);

  // Full-screen quad  
  const buf \= gl.createBuffer();  
  gl.bindBuffer(gl.ARRAY\_BUFFER, buf);  
  gl.bufferData(gl.ARRAY\_BUFFER,  
    new Float32Array(\[-1,-1, 1,-1, \-1,1, 1,1\]), gl.STATIC\_DRAW);  
  const posLoc \= gl.getAttribLocation(prog, "a\_position");  
  gl.enableVertexAttribArray(posLoc);  
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const uTime \= gl.getUniformLocation(prog, "u\_time");  
  const uRes  \= gl.getUniformLocation(prog, "u\_resolution");  
  const uMouse= gl.getUniformLocation(prog, "u\_mouse");  
  let mouse \= \[0.5, 0.5\];

  document.addEventListener("mousemove", e \=\> {  
    mouse \= \[e.clientX / window.innerWidth,  
             1 \- e.clientY / window.innerHeight\];  
  });

  function resize() {  
    canvas.width  \= window.innerWidth  \* devicePixelRatio;  
    canvas.height \= window.innerHeight \* devicePixelRatio;  
    canvas.style.width  \= window.innerWidth  \+ "px";  
    canvas.style.height \= window.innerHeight \+ "px";  
    gl.viewport(0, 0, canvas.width, canvas.height);  
  }  
  window.addEventListener("resize", resize);  
  resize();

  const start \= performance.now();  
  (function loop() {  
    const t \= (performance.now() \- start) / 1000;  
    gl.uniform1f(uTime,  t);  
    gl.uniform2f(uRes,   canvas.width, canvas.height);  
    gl.uniform2f(uMouse, mouse\[0\], mouse\[1\]);  
    gl.drawArrays(gl.TRIANGLE\_STRIP, 0, 4);  
    requestAnimationFrame(loop);  
  })();  
})()

# **4\. FUTURISTIC UI PANEL SYSTEM**

Every UI panel must follow the "glass morphism \+ neon" design language. Dark frosted panels with cyan/purple borders, monospace typography, glowing active states.

## **4.1 CSS DESIGN SYSTEM**

Define these CSS custom properties and base component styles in webapp/static/css/futuristic.css:

 // CSS — Design System  
:root {  
  \--bg:          \#050A14;  
  \--surface:     rgba(5, 15, 30, 0.75);  
  \--border:      rgba(0, 245, 255, 0.2);  
  \--border-glow: rgba(0, 245, 255, 0.5);  
  \--cyan:        \#00F5FF;  
  \--purple:      \#A855F7;  
  \--green:       \#00FF88;  
  \--orange:      \#FF6B35;  
  \--white:       \#F1F5F9;  
  \--gray:        \#64748B;  
  \--font-mono:   "JetBrains Mono", "Fira Code", "Courier New", monospace;  
  \--font-body:   "Inter", "Segoe UI", sans-serif;  
}

\* { box-sizing: border-box; margin: 0; padding: 0; }

body {  
  background: var(--bg);  
  color: var(--white);  
  font-family: var(--font-body);  
  overflow: hidden;  
}

/\* Glass panel ─────────────────────────── \*/  
.panel {  
  background: var(--surface);  
  border: 1px solid var(--border);  
  border-radius: 8px;  
  backdrop-filter: blur(16px) saturate(180%);  
  \-webkit-backdrop-filter: blur(16px) saturate(180%);  
  box-shadow:  
    0 0 0 1px rgba(0,245,255,0.05),  
    0 4px 32px rgba(0,0,0,0.5),  
    inset 0 1px 0 rgba(255,255,255,0.05);  
  transition: border-color 0.2s, box-shadow 0.2s;  
}  
.panel:hover {  
  border-color: var(--border-glow);  
  box-shadow: 0 0 20px rgba(0,245,255,0.1), 0 4px 32px rgba(0,0,0,0.5);  
}

/\* Neon text ────────────────────────────── \*/  
.neon-cyan   { color: var(--cyan);   text-shadow: 0 0 10px var(--cyan); }  
.neon-purple { color: var(--purple); text-shadow: 0 0 10px var(--purple); }  
.neon-green  { color: var(--green);  text-shadow: 0 0 10px var(--green); }

/\* Mono label ───────────────────────────── \*/  
.label {  
  font-family: var(--font-mono);  
  font-size: 11px;  
  letter-spacing: 0.12em;  
  text-transform: uppercase;  
  color: var(--gray);  
}

/\* HUD button ───────────────────────────── \*/  
.btn-hud {  
  font-family: var(--font-mono);  
  font-size: 12px;  
  letter-spacing: 0.08em;  
  color: var(--cyan);  
  background: rgba(0,245,255,0.05);  
  border: 1px solid rgba(0,245,255,0.3);  
  border-radius: 4px;  
  padding: 6px 14px;  
  cursor: pointer;  
  transition: all 0.15s;  
}  
.btn-hud:hover {  
  background: rgba(0,245,255,0.12);  
  border-color: var(--cyan);  
  box-shadow: 0 0 12px rgba(0,245,255,0.3);  
  color: \#fff;  
}  
.btn-hud:active { transform: scale(0.97); }

/\* Scrollbar ────────────────────────────── \*/  
::-webkit-scrollbar       { width: 4px; }  
::-webkit-scrollbar-track { background: transparent; }  
::-webkit-scrollbar-thumb { background: rgba(0,245,255,0.3); border-radius: 2px; }

## **4.2 HUD LAYOUT STRUCTURE**

AISIGNALGRAPH should have a HUD-style layout with four zones. Codex must wire all Flask routes into these panels:

 // HTML — HUD Layout  
\<\!-- TOP BAR: title \+ stats \+ global controls \--\>  
\<header id="hud-top" class="panel" style="  
  position:fixed; top:16px; left:50%; transform:translateX(-50%);  
  padding: 10px 24px; display:flex; align-items:center; gap:24px;  
  z-index:10; pointer-events:auto; white-space:nowrap;"\>

  \<span class="neon-cyan" style="font-family:var(--font-mono); font-size:16px;  
        font-weight:700; letter-spacing:0.15em;"\>AISIGNALGRAPH\</span\>

  \<div style="width:1px; height:24px; background:var(--border);"\>\</div\>

  \<span class="label"\>NODES \<span id="stat-nodes" class="neon-green"\>—\</span\>\</span\>  
  \<span class="label"\>EDGES \<span id="stat-edges" class="neon-green"\>—\</span\>\</span\>  
  \<span class="label"\>ACTIVE \<span id="stat-signals" class="neon-cyan"\>—\</span\>\</span\>

  \<div style="width:1px; height:24px; background:var(--border);"\>\</div\>

  \<button class="btn-hud" onclick="rebuildGraph()"\>⟳ REBUILD\</button\>  
  \<button class="btn-hud" onclick="toggleSimulation()"\>⏸ PAUSE\</button\>  
  \<button class="btn-hud" onclick="zoomToFit()"\>⊡ FIT\</button\>  
\</header\>

\<\!-- LEFT PANEL: search \+ filters \--\>  
\<aside id="hud-left" class="panel" style="  
  position:fixed; left:16px; top:72px; width:260px;  
  padding:16px; z-index:10; pointer-events:auto;"\>  
  \<\!-- search box, node type filters, edge type toggles \--\>  
\</aside\>

\<\!-- RIGHT PANEL: node detail / story viewer \--\>  
\<aside id="hud-right" class="panel" style="  
  position:fixed; right:16px; top:72px; width:340px; max-height:80vh;  
  overflow-y:auto; padding:20px; z-index:10; pointer-events:auto;  
  display:none;"\>  
  \<\!-- populated by JS when a node is clicked \--\>  
\</aside\>

\<\!-- BOTTOM BAR: timeline scrubber \+ year filter \--\>  
\<footer id="hud-bottom" class="panel" style="  
  position:fixed; bottom:16px; left:50%; transform:translateX(-50%);  
  padding:12px 24px; z-index:10; pointer-events:auto; display:flex;  
  align-items:center; gap:16px; min-width:500px;"\>  
  \<\!-- year range slider, cluster toggle, signal speed \--\>  
\</footer\>

## **4.3 NODE COLOR LEGEND**

Every node type maps to a specific neon color. Use these consistently in both the graph and all UI panels:

| Node Type | CSS Color | Hex | Visual Meaning |
| :---- | :---- | :---- | :---- |
| story | var(--cyan) | \#00F5FF | Core content node \- AI events & developments |
| lab | var(--purple) | \#A855F7 | Research lab / company (OpenAI, Anthropic...) |
| model | var(--green) | \#00FF88 | AI model (GPT-4, Claude, Gemini...) |
| person | \#F59E0B | \#F59E0B | Key individual (Altman, LeCun, Hinton...) |
| risk | var(--orange) | \#FF6B35 | Risk/concern (safety, regulation, bias...) |
| year | \#64748B | \#64748B | Temporal anchor node |
| topic | \#EC4899 | \#EC4899 | Topic hub (training, inference, policy...) |
| product | \#06B6D4 | \#06B6D4 | Commercial product release |

# **5\. FLASK BACKEND UPDATES**

The backend needs two new API routes and an update to the graph serialization. No schema changes required.

## **5.1 NEW ROUTE: /api/graph (JSON)**

The current backend likely returns the full graph via a Jinja template. Add a pure JSON API route for the JS graph engine:

 // Python — Flask API Route  
\# In webapp/routes.py or app.py

@app.route("/api/graph")  
def api\_graph():  
    conn \= get\_db()  
    nodes\_raw  \= conn.execute("SELECT \* FROM entities").fetchall()  
    edges\_raw  \= conn.execute("SELECT \* FROM relationships").fetchall()  
    stories    \= conn.execute("SELECT id, title, year, summary FROM stories").fetchall()

    nodes \= \[  
        {  
            "id":     n\["id"\],  
            "label":  n\["name"\],  
            "type":   n\["entity\_type"\],  
            "weight": n.get("mention\_count", 1),  
        }  
        for n in nodes\_raw  
    \]  
    \# Add story nodes  
    for s in stories:  
        nodes.append({  
            "id":    f"story\_{s\['id'\]}",  
            "label": s\["title"\]\[:40\],  
            "type":  "story",  
            "year":  s\["year"\],  
            "summary": s\["summary"\],  
        })

    edges \= \[  
        {  
            "source": e\["source\_id"\],  
            "target": e\["target\_id"\],  
            "type":   e\["relationship\_type"\],  
            "weight": e.get("weight", 1),  
        }  
        for e in edges\_raw  
    \]

    return jsonify({ "nodes": nodes, "edges": edges })

## **5.2 NEW ROUTE: /api/story/\<id\>**

When a user clicks a story node, fetch its full detail via AJAX instead of a page reload:

 // Python — Story Detail Route  
@app.route("/api/story/\<int:story\_id\>")  
def api\_story(story\_id):  
    conn \= get\_db()  
    story \= conn.execute(  
        "SELECT \* FROM stories WHERE id \= ?", (story\_id,)  
    ).fetchone()  
    if not story:  
        return jsonify({"error": "Not found"}), 404

    \# Get connected entities  
    ents \= conn.execute("""  
        SELECT e.name, e.entity\_type, r.relationship\_type  
        FROM relationships r  
        JOIN entities e ON e.id \= r.target\_id  
        WHERE r.source\_id \= ?  
    """, (f"story\_{story\_id}",)).fetchall()

    return jsonify({  
        "id":       story\["id"\],  
        "title":    story\["title"\],  
        "year":     story\["year"\],  
        "summary":  story\["summary"\],  
        "content":  story.get("content", ""),  
        "entities": \[dict(e) for e in ents\],  
    })

## **5.3 REBUILD ENDPOINT**

The "Rebuild from master document" button should call this endpoint asynchronously and stream progress back:

 // Python — SSE Rebuild Endpoint  
@app.route("/api/rebuild", methods=\["POST"\])  
def api\_rebuild():  
    def stream():  
        yield "data: {\\"status\\": \\"starting\\"}\\n\\n"  
        try:  
            from webapp.importer import rebuild\_from\_master  
            for progress in rebuild\_from\_master():  
                yield f"data: {json.dumps(progress)}\\n\\n"  
            yield "data: {\\"status\\": \\"done\\"}\\n\\n"  
        except Exception as e:  
            yield f"data: {{\\"status\\": \\"error\\", \\"msg\\": \\"{str(e)}\\"}}\\n\\n"  
    return Response(stream(), mimetype="text/event-stream")

# **6\. MAIN GRAPH.JS — FULL WIRING**

This is the complete skeleton of webapp/static/js/graph.js that Codex should produce. Every piece from sections 1-4 plugs into this structure.

 // JavaScript — graph.js Skeleton  
// graph.js — AISIGNALGRAPH neural force graph  
// Depends on: d3 v7, shader.js  
"use strict";

// ── Config ───────────────────────────────────────────────────────  
const CONFIG \= {  
  nodeBaseRadius:   6,  
  nodeMaxRadius:    32,  
  linkDistance:     100,  
  chargeStrength:  \-150,  
  centerStrength:   0.05,  
  alphaDecay:       0.02,  
  velocityDecay:    0.4,  
  signalSpawnRate:  400,     // ms average between spawns  
  maxSignals:       80,  
  attentionDecay:   0.97,  
};

const NODE\_COLORS \= {  
  story:   "\#00F5FF",  
  lab:     "\#A855F7",  
  model:   "\#00FF88",  
  person:  "\#F59E0B",  
  risk:    "\#FF6B35",  
  year:    "\#64748B",  
  topic:   "\#EC4899",  
  product: "\#06B6D4",  
};

// ── State ────────────────────────────────────────────────────────  
let nodes \= \[\], edges \= \[\], simulation, activeSignals \= \[\];  
let nodeById \= {}, linksByNode \= {}, attention \= {};  
let isPaused \= false;

// ── Init ─────────────────────────────────────────────────────────  
async function init() {  
  const data \= await fetch("/api/graph").then(r \=\> r.json());  
  nodes \= data.nodes.map(n \=\> ({ ...n, color: NODE\_COLORS\[n.type\] || "\#fff" }));  
  edges \= data.edges;

  // Build indexes  
  nodeById \= Object.fromEntries(nodes.map(n \=\> \[n.id, n\]));  
  edges.forEach(e \=\> {  
    (linksByNode\[e.source\] ||= \[\]).push(e);  
    (linksByNode\[e.target\] ||= \[\]).push(e);  
  });

  setupSVG();  
  buildSimulation();  
  startSignalSystem();  
  updateStats();  
}

// ── SVG Setup ────────────────────────────────────────────────────  
function setupSVG() {  
  const svg \= d3.select("\#graph-svg");  
  const root \= svg.append("g").attr("id", "graph-root");

  // Defs: glow filter \+ arrow markers  
  const defs \= svg.append("defs");  
  defs.append("filter").attr("id","glow")  
    .call(f \=\> {  
      f.append("feGaussianBlur").attr("stdDeviation","3").attr("result","blur");  
      f.append("feMerge").call(m \=\> {  
        m.append("feMergeNode").attr("in","blur");  
        m.append("feMergeNode").attr("in","SourceGraphic");  
      });  
    });

  // Edges  
  root.append("g").attr("id","edges-layer")  
    .selectAll("line")  
    .data(edges).enter()  
    .append("line")  
    .attr("stroke", e \=\> NODE\_COLORS\[e.type?.split("\_")\[0\]\] || "\#1E3A5F")  
    .attr("stroke-width", e \=\> 0.5 \+ (e.weight || 1\) \* 0.3)  
    .attr("stroke-opacity", 0.4)  
    .attr("stroke-dasharray", e \=\>  
      e.type?.includes("person") ? "4,4" :  
      e.type?.includes("risk")   ? "2,6" : "none"  
    );

  // Nodes  
  const nodeG \= root.append("g").attr("id","nodes-layer")  
    .selectAll("g")  
    .data(nodes).enter()  
    .append("g")  
    .attr("id", d \=\> \`node-${d.id}\`)
    .call(buildDrag())  
    .on("click", onNodeClick)  
    .on("mouseenter", onNodeHover)  
    .on("mouseleave", onNodeLeave);

  nodeG.append("circle")  
    .attr("r",    d \=\> nodeRadius(d))  
    .attr("fill", d \=\> d.color)  
    .attr("fill-opacity", 0.85)  
    .attr("filter", "url(\#glow)");

  nodeG.append("text")  
    .text(d \=\> d.label?.slice(0,20))  
    .attr("dy", d \=\> nodeRadius(d) \+ 14\)  
    .attr("text-anchor","middle")  
    .attr("font-size","10px")  
    .attr("font-family","var(--font-mono)")  
    .attr("fill","rgba(241,245,249,0.7)")  
    .style("pointer-events","none");

  svg.call(buildZoom(root));  
}

// ── Simulation ───────────────────────────────────────────────────  
function buildSimulation() {  
  const { width: W, height: H } \= document.getElementById("graph-svg").getBoundingClientRect();

  simulation \= d3.forceSimulation(nodes)  
    .force("link", d3.forceLink(edges)  
      .id(d \=\> d.id)  
      .distance(d \=\> CONFIG.linkDistance / Math.log((d.weight||1)+1))  
      .strength(d \=\> 0.3 \+ (d.weight||1) \* 0.04))  
    .force("charge", d3.forceManyBody()  
      .strength(d \=\> \-(120 \+ (linksByNode\[d.id\]?.length||0)\*15))  
      .distanceMax(600))  
    .force("center",  d3.forceCenter(W/2, H/2).strength(CONFIG.centerStrength))  
    .force("collide", d3.forceCollide().radius(d \=\> nodeRadius(d)+8).strength(0.7))  
    .alphaDecay(CONFIG.alphaDecay)  
    .velocityDecay(CONFIG.velocityDecay)  
    .on("tick", renderTick);  
}

function renderTick() {  
  d3.selectAll("\#edges-layer line")  
    .attr("x1",d=\>d.source.x).attr("y1",d=\>d.source.y)  
    .attr("x2",d=\>d.target.x).attr("y2",d=\>d.target.y);  
  d3.selectAll("\#nodes-layer g")  
    .attr("transform",d=\>\`translate(${d.x},${d.y})\`);  
}

// ── Expose globals ───────────────────────────────────────────────  
window.rebuildGraph      \= () \=\> fetch("/api/rebuild", {method:"POST"});  
window.toggleSimulation  \= () \=\> { isPaused ? simulation.restart() : simulation.stop(); isPaused \= \!isPaused; };  
window.zoomToFit         \= zoomToFitAll;

document.addEventListener("DOMContentLoaded", init);

# **7\. CODEX PROMPT STRATEGY**

Use these prompts in sequence with GPT-4.5 Codex. Each builds on the last. Always include the relevant section of this guide as system context.

## **PROMPT 1 — Backend API**

 // Codex Prompt 1  
SYSTEM: You are modifying a Flask app at webapp/routes.py.  
Add three new JSON routes:  
  GET  /api/graph        → returns {nodes:\[...\], edges:\[...\]}  
  GET  /api/story/\<id\>   → returns full story \+ linked entities  
  POST /api/rebuild      → streams SSE rebuild progress  
Use the existing get\_db() helper and SQLite schema.  
Do not change any existing routes.

## **PROMPT 2 — WebGL Shader**

 // Codex Prompt 2  
SYSTEM: Create webapp/static/js/shader.js  
It must: initialize a WebGL context on \#bg-shader canvas,  
compile the vertex and fragment shaders (provided below),  
run a render loop passing u\_time, u\_resolution, u\_mouse uniforms.  
Use the exact GLSL source from Section 3.3 of the implementation guide.  
No external libraries. Vanilla WebGL only.

## **PROMPT 3 — CSS System**

 // Codex Prompt 3  
SYSTEM: Create webapp/static/css/futuristic.css  
Implement the full design system from Section 4.1:  
CSS custom properties, .panel class, .btn-hud, .neon-\* classes,  
.label class, scrollbar styles.  
Also add the @keyframes ripple-expand animation from Section 2.2.  
Import JetBrains Mono from Google Fonts at the top.

## **PROMPT 4 — Graph Engine**

 // Codex Prompt 4  
SYSTEM: Create webapp/static/js/graph.js  
Implement the full D3 v7 force graph from Section 6\.  
Include: signal pulse system (Section 2.1-2.3),  
node activation ripples (Section 2.2),  
attention heatmap (Section 2.4),  
pan/zoom (Section 1.4), drag (Section 1.5),  
edge type styling (Section 1.6),  
nodeRadius() by degree (Section 1.3).  
Fetch data from /api/graph on DOMContentLoaded.

## **PROMPT 5 — HTML Template**

 // Codex Prompt 5  
SYSTEM: Rewrite webapp/templates/graph.html  
It must use the 4-layer canvas architecture (Section 3.1).  
Include the HUD layout (Section 4.2) with:  
  \- top bar: title, stats (node/edge/signal counts), 3 buttons  
  \- left panel: search input \+ filter checkboxes per node type  
  \- right panel: hidden by default, populated on node click via AJAX  
  \- bottom bar: year range slider (2020-2026), signal speed slider  
Load: futuristic.css, d3.v7.min.js, shader.js, graph.js  
in correct order. Extend base.html if it exists.

## **PROMPT 6 — Node Click Panel**

 // Codex Prompt 6  
SYSTEM: In graph.js, implement the onNodeClick() handler.  
When a story node is clicked:  
  \- Show the \#hud-right panel  
  \- Fetch /api/story/\<id\>  
  \- Render: title (neon-cyan), year badge, summary paragraph,  
    list of connected entities with colored type badges  
  \- Highlight the clicked node with a persistent glow ring  
  \- Dim all non-connected nodes to 20% opacity  
When the panel is closed, restore all node opacities.

# **8\. PERFORMANCE & EDGE CASES**

## **8.1 LARGE GRAPH PERFORMANCE**

▸ If node count \> 500: switch from SVG to Canvas renderer for nodes. Keep SVG only for edges.

▸ Use alphaMin(0.001) to let the simulation fully cool and stop ticking — avoids burning CPU on a stable graph.

▸ Signal particles: cap at CONFIG.maxSignals (80). Drop oldest when limit hit.

▸ forceCollide iterations should drop to 1 if FPS \< 30 (detect with performance.now() in tick).

▸ WebGL shader: use a low-res canvas (device pixel ratio capped at 1.5) — the blur from upscaling adds atmosphere.

## **8.2 MOBILE / TOUCH**

▸ Replace d3.drag() with Hammer.js pinch-zoom \+ pan gestures on mobile.

▸ Disable WebGL shader on mobile (check via navigator.maxTouchPoints \> 0 as a rough heuristic).

▸ Reduce CONFIG.maxSignals to 20 on mobile.

## **8.3 COMMON BUGS TO AVOID**

**⚡ NOTE:** D3 forceLink mutates edge objects — edges\[i\].source and edges\[i\].target become node objects after simulation starts, not IDs. Always use .id() accessor.

**⚡ NOTE:** WebGL canvas must be resized on window resize or the shader will stretch. Call resize() in the resize event listener.

**⚡ NOTE:** Canvas for signal particles must be manually cleared each frame with ctx.clearRect(0,0,w,h) or trails persist permanently.

**⚡ NOTE:** backdrop-filter (glass morphism) has poor performance on Firefox \< 103\. Add @supports fallback with solid background.

— END OF IMPLEMENTATION GUIDE —  
AISIGNALGRAPH  ·  DiggityDooo/AISIGNALGRAPH  ·  April 2026
