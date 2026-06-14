/**
 * High-performance Three.js graph engine: InstancedMesh nodes, batched edges,
 * octree culling, LOD, layout worker, label atlas.
 */
import { NodeRenderer } from "./NodeRenderer.js";
import { EdgeRenderer } from "./EdgeRenderer.js";
import { LabelAtlas } from "./LabelAtlas.js";
import { SpatialIndex } from "./SpatialIndex.js";
import { FrustumCuller } from "./FrustumCuller.js";
import { LODManager } from "./LODManager.js";
import { createLayoutWorker } from "./LayoutWorker.js";

const LAYOUT_CACHE_KEY = "aisignalgraph-layout-v1";

export class GraphEngine {
  constructor(options = {}) {
    this.container = options.container;
    this.onNodeClick = options.onNodeClick;
    this.onNodeHover = options.onNodeHover;
    this.ready = false;
    this._destroyed = false;
    this._THREE = null;
    this._renderer = null;
    this._scene = null;
    this._camera = null;
    this._controls = null;
    this._nodeRenderer = null;
    this._edgeRenderer = null;
    this._labelAtlas = null;
    this._spatialIndex = null;
    this._frustumCuller = null;
    this._lodManager = null;
    this._worker = null;
    this._nodes = [];
    this._edges = [];
    this._nodePositions = new Map();
    this._baseScales = new Map();
    this._frameCount = 0;
    this._fps = 60;
    this._fpsTimer = performance.now();
    this._adaptiveQuality = 1;
    this._animFrameId = null;
    this._raycaster = null;
    this._mouse = null;
    this._hoveredNode = null;
    this._nodeIndexList = [];
    this._filteredNodeIds = null;
    this._resizeObserver = null;
  }

  async init(graphPayload) {
    if (!this.container) {
      return false;
    }

    const THREE = await import("three");
    const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
    this._THREE = THREE;

    this.dispose();

    const rect = this.container.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050202, 0.0018);

    const camera = new THREE.PerspectiveCamera(60, width / height, 1, 10000);
    camera.position.set(0, 0, 350);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio * this._adaptiveQuality, 2));
    renderer.setClearColor(0x050202, 1);
    this.container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.8;
    controls.minDistance = 30;
    controls.maxDistance = 2000;

    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const pointLight = new THREE.PointLight(0xff4258, 2, 1200);
    pointLight.position.set(0, 100, 200);
    scene.add(pointLight);

    this._scene = scene;
    this._camera = camera;
    this._renderer = renderer;
    this._controls = controls;
    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();

    const nodes = (graphPayload.nodes || []).map((node) => ({
      ...node,
      type: node.semanticType || node.type || node.node_type || "entity",
    }));
    const edges = graphPayload.edges || [];
    const positions = graphPayload.positions || new Map();

    this._nodes = nodes;
    this._edges = edges;
    this._nodeIndexList = nodes.map((node) => node.id);

    const renderNodes = nodes.map((node) => {
      const pos = positions.get(node.id) || { x: node.x || 0, y: node.y || 0, z: node.z || 0 };
      return { ...node, x: pos.x, y: pos.y, z: pos.z };
    });

    for (const node of renderNodes) {
      this._nodePositions.set(node.id, { x: node.x, y: node.y, z: node.z });
    }

    this._nodeRenderer = new NodeRenderer(scene, THREE);
    this._nodeRenderer.init(renderNodes);
    this._baseScales = this._nodeRenderer.getBaseScales();

    this._edgeRenderer = new EdgeRenderer(scene, THREE);
    this._edgeRenderer.init(edges, this._nodePositions);

    this._labelAtlas = new LabelAtlas(scene, THREE);
    this._labelAtlas.build(renderNodes);

    this._spatialIndex = new SpatialIndex(4000);
    this._spatialIndex.rebuild(
      renderNodes.map((node) => ({ id: node.id, x: node.x, y: node.y, z: node.z })),
    );

    this._frustumCuller = new FrustumCuller(camera, this._spatialIndex, THREE);
    this._lodManager = new LODManager(camera, this._nodeRenderer);

    this._bindEvents(renderer.domElement);
    this._startLayoutWorker(renderNodes, edges, positions);
    this._renderLoop();

    this.ready = true;
    return true;
  }

  _bindEvents(domElement) {
    const onMove = (event) => {
      const rect = domElement.getBoundingClientRect();
      this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this._pickHover();
    };
    const onClick = () => {
      if (this._hoveredNode && this.onNodeClick) {
        const node = this._nodes.find((item) => item.id === this._hoveredNode);
        if (node) {
          this.onNodeClick(node);
        }
      }
    };
    const onResize = () => {
      const rect = this.container.getBoundingClientRect();
      const width = Math.max(rect.width, 1);
      const height = Math.max(rect.height, 1);
      this._camera.aspect = width / height;
      this._camera.updateProjectionMatrix();
      this._renderer.setSize(width, height);
    };

    domElement.addEventListener("mousemove", onMove);
    domElement.addEventListener("click", onClick);
    window.addEventListener("resize", onResize);
    this._resizeObserver = new ResizeObserver(onResize);
    this._resizeObserver.observe(this.container);
    this._eventCleanup = () => {
      domElement.removeEventListener("mousemove", onMove);
      domElement.removeEventListener("click", onClick);
      window.removeEventListener("resize", onResize);
      this._resizeObserver?.disconnect();
    };
  }

  _pickHover() {
    if (!this._frustumCuller) {
      return;
    }
    this._raycaster.setFromCamera(this._mouse, this._camera);
    let closest = null;
    let closestDist = Infinity;
    for (const nodeId of this._frustumCuller.visibleSet) {
      const pos = this._nodePositions.get(nodeId);
      if (!pos) {
        continue;
      }
      const dx = pos.x - this._raycaster.ray.origin.x;
      const dy = pos.y - this._raycaster.ray.origin.y;
      const dz = pos.z - this._raycaster.ray.origin.z;
      const projection =
        dx * this._raycaster.ray.direction.x +
        dy * this._raycaster.ray.direction.y +
        dz * this._raycaster.ray.direction.z;
      if (projection < 0) {
        continue;
      }
      const px = this._raycaster.ray.origin.x + this._raycaster.ray.direction.x * projection - pos.x;
      const py = this._raycaster.ray.origin.y + this._raycaster.ray.direction.y * projection - pos.y;
      const pz = this._raycaster.ray.origin.z + this._raycaster.ray.direction.z * projection - pos.z;
      const distSq = px * px + py * py + pz * pz;
      const pickRadius = (this._baseScales.get(nodeId) || 4) * 4;
      if (distSq < pickRadius * pickRadius && distSq < closestDist) {
        closestDist = distSq;
        closest = nodeId;
      }
    }
    if (closest !== this._hoveredNode) {
      this._hoveredNode = closest;
      if (closest) {
        this._nodeRenderer.highlight(closest);
      } else {
        this._nodeRenderer.unhighlightAll();
      }
      if (this.onNodeHover) {
        const node = closest ? this._nodes.find((item) => item.id === closest) : null;
        this.onNodeHover(node);
      }
    }
  }

  _startLayoutWorker(nodes, edges, existingPositions) {
    const worker = createLayoutWorker();
    if (!worker) {
      return;
    }
    this._worker = worker;

    const cacheKey = `${LAYOUT_CACHE_KEY}:${nodes.length}:${edges.length}`;
    let restored = false;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        for (const [nodeId, pos] of Object.entries(parsed)) {
          if (this._nodePositions.has(nodeId)) {
            this._nodePositions.set(nodeId, pos);
            this._nodeRenderer.updatePosition(nodeId, pos.x, pos.y, pos.z);
          }
        }
        this._nodeRenderer.flush();
        this._edgeRenderer.updatePositions(this._nodePositions, this._edges);
        restored = true;
      }
    } catch {
      restored = false;
    }

    if (restored) {
      return;
    }

    const hasPositions = existingPositions && existingPositions.size > 0;
    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === "tick" && message.positions) {
        for (let i = 0; i < this._nodeIndexList.length; i += 1) {
          const offset = i * 3;
          const nodeId = this._nodeIndexList[i];
          const x = message.positions[offset];
          const y = message.positions[offset + 1];
          const z = message.positions[offset + 2];
          this._nodePositions.set(nodeId, { x, y, z });
          this._nodeRenderer.updatePosition(nodeId, x, y, z);
        }
        this._nodeRenderer.flush();
        this._edgeRenderer.updatePositions(this._nodePositions, this._edges);
      }
      if (message.type === "cache" && message.positions) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(message.positions));
        } catch {
          // storage full — ignore
        }
      }
    };

    if (!hasPositions) {
      worker.postMessage({
        type: "init",
        nodes: nodes.map((node) => ({
          id: node.id,
          x: node.x,
          y: node.y,
          z: node.z,
          importance: node.importance,
        })),
        edges: edges.map((edge) => ({
          source: edge.sourceId || edge.source,
          target: edge.targetId || edge.target,
          weight: edge.weight || 1,
        })),
      });
    }
  }

  _renderLoop() {
    if (this._destroyed) {
      return;
    }
    this._animFrameId = requestAnimationFrame(() => this._renderLoop());

    this._frameCount += 1;
    const now = performance.now();
    if (this._frameCount % 60 === 0) {
      this._fps = 60000 / (now - this._fpsTimer);
      this._fpsTimer = now;
      this._adaptQuality();
    }

    this._controls.update();

    if (this._frameCount % 3 === 0) {
      this._frustumCuller.update();
      const visible = this._applyEraFilter(this._frustumCuller.visibleSet);
      this._lodManager.update(this._nodePositions, visible, this._baseScales);
      this._edgeRenderer.updateVisibility(this._edges, visible);
      this._labelAtlas.updateVisibility(this._nodePositions, this._camera);
    }

    this._labelAtlas.update(this._camera);
    this._nodeRenderer.flush();
    this._renderer.render(this._scene, this._camera);
  }

  _applyEraFilter(visibleSet) {
    if (!this._filteredNodeIds) {
      return visibleSet;
    }
    const filtered = new Set();
    for (const nodeId of visibleSet) {
      if (this._filteredNodeIds.has(nodeId)) {
        filtered.add(nodeId);
      }
    }
    return filtered;
  }

  _adaptQuality() {
    if (this._fps < 25 && this._adaptiveQuality > 0.5) {
      this._adaptiveQuality = Math.max(0.5, this._adaptiveQuality - 0.1);
      this._renderer.setPixelRatio(window.devicePixelRatio * this._adaptiveQuality);
    } else if (this._fps > 55 && this._adaptiveQuality < 1) {
      this._adaptiveQuality = Math.min(1, this._adaptiveQuality + 0.05);
      this._renderer.setPixelRatio(window.devicePixelRatio * this._adaptiveQuality);
    }
  }

  focusNode(nodeId) {
    const pos = this._nodePositions.get(nodeId);
    if (!pos || !this._camera || !this._controls) {
      return;
    }
    const THREE = this._THREE;
    const target = new THREE.Vector3(pos.x, pos.y, pos.z);
    const camTarget = target.clone().add(new THREE.Vector3(0, 0, 80));
    const startPos = this._camera.position.clone();
    const startTarget = this._controls.target.clone();
    const startTime = performance.now();
    const duration = 800;

    const step = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - (1 - t) ** 3;
      this._camera.position.lerpVectors(startPos, camTarget, ease);
      this._controls.target.lerpVectors(startTarget, target, ease);
      this._controls.update();
      if (t < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }

  filterByEra(allowedNodeIds) {
    this._filteredNodeIds = allowedNodeIds ? new Set(allowedNodeIds) : null;
  }

  filterByYear(_from, _to) {
    // Client applies year filter via node set passed to filterByEra.
  }

  resetFilter() {
    this._filteredNodeIds = null;
  }

  getFps() {
    return Math.round(this._fps);
  }

  getDomElement() {
    return this._renderer?.domElement ?? null;
  }

  dispose() {
    this._destroyed = true;
    if (this._animFrameId !== null) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    this._eventCleanup?.();
    this._worker?.terminate();
    this._worker = null;
    this._nodeRenderer?.dispose();
    this._edgeRenderer?.dispose();
    this._labelAtlas?.dispose();
    this._controls?.dispose();
    this._renderer?.dispose();
    if (this.container) {
      this.container.innerHTML = "";
    }
    this._scene = null;
    this._camera = null;
    this._renderer = null;
    this._controls = null;
    this.ready = false;
    this._destroyed = false;
  }
}
