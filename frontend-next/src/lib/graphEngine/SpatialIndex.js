/** Octree for 3D spatial queries (frustum + radius). */

class OctreeNode {
  constructor(center, halfSize, depth = 0, maxDepth = 8, maxItems = 8) {
    this.center = center;
    this.halfSize = halfSize;
    this.depth = depth;
    this.maxDepth = maxDepth;
    this.maxItems = maxItems;
    this.items = [];
    this.children = null;
  }

  clear() {
    this.items = [];
    this.children = null;
  }

  insert(item) {
    if (!this._contains(item)) {
      return false;
    }
    if (this.children === null && (this.items.length < this.maxItems || this.depth >= this.maxDepth)) {
      this.items.push(item);
      return true;
    }
    if (this.children === null) {
      this._subdivide();
    }
    for (const child of this.children) {
      if (child.insert(item)) {
        return true;
      }
    }
    this.items.push(item);
    return true;
  }

  query(frustum) {
    const results = [];
    this._queryFrustum(frustum, results);
    return results;
  }

  queryRadius(center, radius) {
    const radiusSq = radius * radius;
    const results = [];
    this._queryRadius(center, radiusSq, results);
    return results;
  }

  _contains(item) {
    const { x, y, z } = item;
    const { x: cx, y: cy, z: cz } = this.center;
    const h = this.halfSize;
    return x >= cx - h && x <= cx + h && y >= cy - h && y <= cy + h && z >= cz - h && z <= cz + h;
  }

  _subdivide() {
    const { x, y, z } = this.center;
    const h = this.halfSize / 2;
    const d = this.depth + 1;
    this.children = [
      new OctreeNode({ x: x - h, y: y - h, z: z - h }, h, d, this.maxDepth, this.maxItems),
      new OctreeNode({ x: x + h, y: y - h, z: z - h }, h, d, this.maxDepth, this.maxItems),
      new OctreeNode({ x: x - h, y: y + h, z: z - h }, h, d, this.maxDepth, this.maxItems),
      new OctreeNode({ x: x + h, y: y + h, z: z - h }, h, d, this.maxDepth, this.maxItems),
      new OctreeNode({ x: x - h, y: y - h, z: z + h }, h, d, this.maxDepth, this.maxItems),
      new OctreeNode({ x: x + h, y: y - h, z: z + h }, h, d, this.maxDepth, this.maxItems),
      new OctreeNode({ x: x - h, y: y + h, z: z + h }, h, d, this.maxDepth, this.maxItems),
      new OctreeNode({ x: x + h, y: y + h, z: z + h }, h, d, this.maxDepth, this.maxItems),
    ];
    const carry = this.items;
    this.items = [];
    for (const item of carry) {
      let placed = false;
      for (const child of this.children) {
        if (child.insert(item)) {
          placed = true;
          break;
        }
      }
      if (!placed) {
        this.items.push(item);
      }
    }
  }

  _queryFrustum(frustum, results) {
    if (!this._intersectsFrustum(frustum)) {
      return;
    }
    for (const item of this.items) {
      if (frustum.containsPoint({ x: item.x, y: item.y, z: item.z })) {
        results.push(item);
      }
    }
    if (this.children) {
      for (const child of this.children) {
        child._queryFrustum(frustum, results);
      }
    }
  }

  _queryRadius(center, radiusSq, results) {
    if (!this._intersectsSphere(center, radiusSq)) {
      return;
    }
    for (const item of this.items) {
      const dx = item.x - center.x;
      const dy = item.y - center.y;
      const dz = item.z - center.z;
      if (dx * dx + dy * dy + dz * dz <= radiusSq) {
        results.push(item);
      }
    }
    if (this.children) {
      for (const child of this.children) {
        child._queryRadius(center, radiusSq, results);
      }
    }
  }

  _intersectsFrustum(frustum) {
    const { x: cx, y: cy, z: cz } = this.center;
    const h = this.halfSize;
    const min = { x: cx - h, y: cy - h, z: cz - h };
    const max = { x: cx + h, y: cy + h, z: cz + h };
    for (let i = 0; i < 6; i += 1) {
      const plane = frustum.planes[i];
      const px = plane.normal.x > 0 ? max.x : min.x;
      const py = plane.normal.y > 0 ? max.y : min.y;
      const pz = plane.normal.z > 0 ? max.z : min.z;
      if (plane.normal.x * px + plane.normal.y * py + plane.normal.z * pz + plane.constant < 0) {
        return false;
      }
    }
    return true;
  }

  _intersectsSphere(center, radiusSq) {
    const { x: cx, y: cy, z: cz } = this.center;
    const h = this.halfSize;
    const dx = Math.max(Math.abs(center.x - cx) - h, 0);
    const dy = Math.max(Math.abs(center.y - cy) - h, 0);
    const dz = Math.max(Math.abs(center.z - cz) - h, 0);
    return dx * dx + dy * dy + dz * dz <= radiusSq;
  }
}

export class SpatialIndex {
  constructor(worldSize = 2000) {
    this.worldSize = worldSize;
    this.root = new OctreeNode({ x: 0, y: 0, z: 0 }, worldSize / 2);
  }

  rebuild(nodes) {
    this.root.clear();
    this.root = new OctreeNode({ x: 0, y: 0, z: 0 }, this.worldSize / 2);
    for (const node of nodes) {
      this.root.insert(node);
    }
  }

  getVisible(frustum) {
    return new Set(this.root.query(frustum).map((item) => item.id));
  }

  getNear(worldPos, radius) {
    return this.root.queryRadius(worldPos, radius);
  }
}
