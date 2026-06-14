/** Single LineSegments buffer for all edges. */

const WEIGHT_COLORS = [
  { max: 1, color: [0x47 / 255, 0x55 / 255, 0x69 / 255], opacity: 0.15 },
  { max: 5, color: [0x64 / 255, 0x74 / 255, 0x8b / 255], opacity: 0.3 },
  { max: 20, color: [0x94 / 255, 0xa3 / 255, 0xb8 / 255], opacity: 0.5 },
  { max: Infinity, color: [0xcb / 255, 0xd5 / 255, 0xe1 / 255], opacity: 0.8 },
];

function weightColor(weight) {
  for (const band of WEIGHT_COLORS) {
    if (weight <= band.max) {
      return band;
    }
  }
  return WEIGHT_COLORS[WEIGHT_COLORS.length - 1];
}

export class EdgeRenderer {
  constructor(scene, THREE, maxEdges = 50000) {
    this.scene = scene;
    this.THREE = THREE;
    this.maxEdges = maxEdges;
    this._positions = new Float32Array(maxEdges * 6);
    this._colors = new Float32Array(maxEdges * 6);
    this._geometry = new THREE.BufferGeometry();
    this._geometry.setAttribute("position", new THREE.BufferAttribute(this._positions, 3));
    this._geometry.setAttribute("color", new THREE.BufferAttribute(this._colors, 3));
    this._material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
    });
    this._line = new THREE.LineSegments(this._geometry, this._material);
    this._edgeCount = 0;
    this.scene.add(this._line);
  }

  init(edges, nodePositions) {
    this._edgeCount = Math.min(edges.length, this.maxEdges);
    for (let index = 0; index < this._edgeCount; index += 1) {
      const edge = edges[index];
      const sourceId = edge.sourceId || edge.source;
      const targetId = edge.targetId || edge.target;
      const src = nodePositions.get(sourceId);
      const tgt = nodePositions.get(targetId);
      if (!src || !tgt) {
        continue;
      }
      const offset = index * 6;
      this._positions[offset] = src.x;
      this._positions[offset + 1] = src.y;
      this._positions[offset + 2] = src.z;
      this._positions[offset + 3] = tgt.x;
      this._positions[offset + 4] = tgt.y;
      this._positions[offset + 5] = tgt.z;
      const band = weightColor(Number(edge.weight) || 1);
      for (let channel = 0; channel < 2; channel += 1) {
        const colorOffset = offset + channel * 3;
        this._colors[colorOffset] = band.color[0];
        this._colors[colorOffset + 1] = band.color[1];
        this._colors[colorOffset + 2] = band.color[2];
      }
    }
    this._geometry.attributes.position.needsUpdate = true;
    this._geometry.attributes.color.needsUpdate = true;
    this.setVisibleCount(this._edgeCount);
  }

  updatePositions(nodePositions, edges) {
    for (let index = 0; index < this._edgeCount; index += 1) {
      const edge = edges[index];
      const sourceId = edge.sourceId || edge.source;
      const targetId = edge.targetId || edge.target;
      const src = nodePositions.get(sourceId);
      const tgt = nodePositions.get(targetId);
      if (!src || !tgt) {
        continue;
      }
      const offset = index * 6;
      this._positions[offset] = src.x;
      this._positions[offset + 1] = src.y;
      this._positions[offset + 2] = src.z;
      this._positions[offset + 3] = tgt.x;
      this._positions[offset + 4] = tgt.y;
      this._positions[offset + 5] = tgt.z;
    }
    this._geometry.attributes.position.needsUpdate = true;
  }

  setVisibleCount(count) {
    this._geometry.setDrawRange(0, Math.max(0, count) * 2);
  }

  updateVisibility(edges, visibleSet) {
    let visibleEdgeCount = 0;
    for (let index = 0; index < this._edgeCount; index += 1) {
      const edge = edges[index];
      const sourceId = edge.sourceId || edge.source;
      const targetId = edge.targetId || edge.target;
      if (visibleSet.has(sourceId) || visibleSet.has(targetId)) {
        visibleEdgeCount += 1;
      }
    }
    this.setVisibleCount(visibleEdgeCount);
  }

  dispose() {
    this._geometry.dispose();
    this._material.dispose();
    this.scene.remove(this._line);
  }
}
