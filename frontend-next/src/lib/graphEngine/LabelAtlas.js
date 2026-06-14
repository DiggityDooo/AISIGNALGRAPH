/** Canvas texture atlas + billboarding sprites for node labels. */

export class LabelAtlas {
  constructor(scene, THREE) {
    this.scene = scene;
    this.THREE = THREE;
    this._canvas = document.createElement("canvas");
    this._canvas.width = 4096;
    this._canvas.height = 4096;
    this._ctx = this._canvas.getContext("2d");
    this._texture = new THREE.CanvasTexture(this._canvas);
    this._sprites = new Map();
    this._regions = new Map();
    this._nextY = 8;
    this._rowHeight = 0;
    this._cursorX = 8;
  }

  build(nodes) {
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    this._regions.clear();
    this._nextY = 8;
    this._rowHeight = 0;
    this._cursorX = 8;

    const important = nodes
      .filter((node) => (Number(node.importance) || 0) >= 2)
      .slice(0, 200);

    for (const node of important) {
      const label = String(node.label || node.id).slice(0, 48);
      this._ctx.font = "13px 'Inter', 'Segoe UI', sans-serif";
      const metrics = this._ctx.measureText(label);
      const width = Math.ceil(metrics.width) + 16;
      const height = 22;
      if (this._cursorX + width > this._canvas.width - 8) {
        this._cursorX = 8;
        this._nextY += this._rowHeight + 6;
        this._rowHeight = 0;
      }
      if (this._nextY + height > this._canvas.height - 8) {
        break;
      }
      const color = node.color || "#94a3b8";
      this._ctx.fillStyle = "rgba(5, 2, 2, 0.75)";
      this._ctx.fillRect(this._cursorX, this._nextY, width, height);
      this._ctx.fillStyle = color;
      this._ctx.fillText(label, this._cursorX + 8, this._nextY + 15);
      this._regions.set(node.id, {
        u: this._cursorX / this._canvas.width,
        v: 1 - (this._nextY + height) / this._canvas.height,
        w: width / this._canvas.width,
        h: height / this._canvas.height,
        width,
        height,
      });
      this._cursorX += width + 8;
      this._rowHeight = Math.max(this._rowHeight, height);
    }
    this._texture.needsUpdate = true;

    for (const [nodeId, region] of this._regions.entries()) {
      const material = new this.THREE.SpriteMaterial({
        map: this._texture,
        transparent: true,
        depthWrite: false,
        opacity: 0.9,
      });
      const sprite = new this.THREE.Sprite(material);
      sprite.scale.set(region.width * 0.5, region.height * 0.5, 1);
      sprite.visible = false;
      sprite.userData.nodeId = nodeId;
      this._sprites.set(nodeId, sprite);
      this.scene.add(sprite);
    }
  }

  setVisible(nodeId, visible) {
    const sprite = this._sprites.get(nodeId);
    if (sprite) {
      sprite.visible = visible;
    }
  }

  update(camera) {
    for (const sprite of this._sprites.values()) {
      if (!sprite.visible) {
        continue;
      }
      sprite.quaternion.copy(camera.quaternion);
    }
  }

  updateVisibility(nodePositions, camera, minImportance = 2, maxDist = 400) {
    const cam = camera.position;
    for (const [nodeId, sprite] of this._sprites.entries()) {
      const pos = nodePositions.get(nodeId);
      if (!pos) {
        sprite.visible = false;
        continue;
      }
      const dx = pos.x - cam.x;
      const dy = pos.y - cam.y;
      const dz = pos.z - cam.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      sprite.visible = dist < maxDist;
      if (sprite.visible) {
        sprite.position.set(pos.x, pos.y + 12, pos.z);
        const screenScale = Math.max(0.4, 1 - dist / maxDist);
        const region = this._regions.get(nodeId);
        if (region) {
          sprite.scale.set(region.width * 0.5 * screenScale, region.height * 0.5 * screenScale, 1);
        }
      }
    }
  }

  dispose() {
    for (const sprite of this._sprites.values()) {
      sprite.material.dispose();
      this.scene.remove(sprite);
    }
    this._texture.dispose();
    this._sprites.clear();
    this._regions.clear();
  }
}
