/** InstancedMesh renderer — one mesh per node semantic type. */

const TYPE_SPECS = {
  lab: { geometry: "sphere", radius: 6, color: 0x4f8ef7, emissive: 0x1a3d7a },
  model: { geometry: "sphere", radius: 5, color: 0xa855f7, emissive: 0x4a1a6a },
  person: { geometry: "sphere", radius: 4, color: 0x22c55e, emissive: 0x0f4a1f },
  product: { geometry: "box", radius: 8, color: 0xf59e0b, emissive: 0x7a4a00 },
  topic: { geometry: "octahedron", radius: 5, color: 0x64748b, emissive: 0x2a3040 },
  risk: { geometry: "cylinder", radius: 4, color: 0xef4444, emissive: 0x6a0a0a },
  story: { geometry: "sphere", radius: 5, color: 0xff4258, emissive: 0x6a1020 },
  year: { geometry: "tetrahedron", radius: 5, color: 0x06b6d4, emissive: 0x023a47 },
  entity: { geometry: "sphere", radius: 4, color: 0x94a3b8, emissive: 0x3a4050 },
  community: { geometry: "sphere", radius: 4, color: 0x94a3b8, emissive: 0x3a4050 },
  default: { geometry: "sphere", radius: 4, color: 0x94a3b8, emissive: 0x3a4050 },
};

const MATRIX_POOL_SIZE = 50;

function resolveType(nodeType) {
  return TYPE_SPECS[nodeType] ? nodeType : "default";
}

export class NodeRenderer {
  constructor(scene, THREE, maxNodes = 10000) {
    this.scene = scene;
    this.THREE = THREE;
    this.maxNodes = maxNodes;
    this._meshes = {};
    this._nodeIndexMap = new Map();
    this._matrixPool = Array.from({ length: MATRIX_POOL_SIZE }, () => new THREE.Matrix4());
    this._poolIndex = 0;
    this._dirtyMeshes = new Set();
    this._highlightedId = null;
    this._positions = new Map();
  }

  _borrowMatrix() {
    const matrix = this._matrixPool[this._poolIndex % MATRIX_POOL_SIZE];
    this._poolIndex += 1;
    return matrix;
  }

  _createGeometry(spec) {
    const THREE = this.THREE;
    switch (spec.geometry) {
      case "box":
        return new THREE.BoxGeometry(spec.radius, spec.radius, spec.radius);
      case "octahedron":
        return new THREE.OctahedronGeometry(spec.radius);
      case "cylinder":
        return new THREE.CylinderGeometry(spec.radius, spec.radius, spec.radius * 2, 6);
      case "tetrahedron":
        return new THREE.TetrahedronGeometry(spec.radius);
      default:
        return new THREE.SphereGeometry(spec.radius, 8, 8);
    }
  }

  init(nodes) {
    const byType = new Map();
    for (const node of nodes) {
      const type = resolveType(node.type || node.semanticType || "entity");
      if (!byType.has(type)) {
        byType.set(type, []);
      }
      byType.get(type).push(node);
    }

    for (const [type, typeNodes] of byType.entries()) {
      const spec = TYPE_SPECS[type] || TYPE_SPECS.default;
      const geometry = this._createGeometry(spec);
      const material = new this.THREE.MeshPhongMaterial({
        color: spec.color,
        emissive: spec.emissive,
        emissiveIntensity: 0.6,
        shininess: 80,
        transparent: true,
        opacity: 0.92,
      });
      const mesh = new this.THREE.InstancedMesh(geometry, material, Math.max(typeNodes.length, 1));
      mesh.frustumCulled = false;
      mesh.count = typeNodes.length;
      this.scene.add(mesh);
      this._meshes[type] = mesh;

      typeNodes.forEach((node, index) => {
        const importance = Number(node.importance) || 1;
        const baseScale = 0.5 + Math.min(importance, 5) * 0.3;
        this._nodeIndexMap.set(node.id, { type, instanceIndex: index, baseScale, visible: true });
        this._positions.set(node.id, { x: node.x || 0, y: node.y || 0, z: node.z || 0 });
        const matrix = this._borrowMatrix();
        matrix.makeTranslation(node.x || 0, node.y || 0, node.z || 0);
        matrix.scale(new this.THREE.Vector3(baseScale, baseScale, baseScale));
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this._dirtyMeshes.add(mesh);
    }
  }

  getBaseScales() {
    const scales = new Map();
    for (const [nodeId, meta] of this._nodeIndexMap.entries()) {
      scales.set(nodeId, meta.baseScale);
    }
    return scales;
  }

  updatePosition(nodeId, x, y, z) {
    const meta = this._nodeIndexMap.get(nodeId);
    if (!meta) {
      return;
    }
    this._positions.set(nodeId, { x, y, z });
    const scale = meta.visible ? meta.currentScale ?? meta.baseScale : 0;
    this._writeMatrix(nodeId, meta, scale);
  }

  setScale(nodeId, scale) {
    const meta = this._nodeIndexMap.get(nodeId);
    if (!meta) {
      return;
    }
    meta.currentScale = scale;
    const applied = meta.visible ? scale : 0;
    this._writeMatrix(nodeId, meta, applied);
  }

  _writeMatrix(nodeId, meta, scale) {
    const mesh = this._meshes[meta.type];
    const pos = this._positions.get(nodeId);
    if (!mesh || !pos) {
      return;
    }
    const matrix = this._borrowMatrix();
    matrix.compose(
      new this.THREE.Vector3(pos.x, pos.y, pos.z),
      new this.THREE.Quaternion(),
      new this.THREE.Vector3(scale, scale, scale),
    );
    mesh.setMatrixAt(meta.instanceIndex, matrix);
    this._dirtyMeshes.add(mesh);
  }

  setVisibility(nodeId, visible) {
    const meta = this._nodeIndexMap.get(nodeId);
    if (!meta) {
      return;
    }
    meta.visible = visible;
    this.setScale(nodeId, visible ? meta.currentScale ?? meta.baseScale : 0);
  }

  highlight(nodeId) {
    this._highlightedId = nodeId;
    for (const [id, meta] of this._nodeIndexMap.entries()) {
      const mesh = this._meshes[meta.type];
      if (!mesh) {
        continue;
      }
      const material = mesh.material;
      material.emissiveIntensity = id === nodeId ? 1.4 : 0.35;
    }
  }

  unhighlightAll() {
    this._highlightedId = null;
    for (const mesh of Object.values(this._meshes)) {
      mesh.material.emissiveIntensity = 0.6;
    }
  }

  flush() {
    for (const mesh of this._dirtyMeshes) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    this._dirtyMeshes.clear();
  }

  dispose() {
    for (const mesh of Object.values(this._meshes)) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.scene.remove(mesh);
    }
    this._meshes = {};
    this._nodeIndexMap.clear();
  }
}
