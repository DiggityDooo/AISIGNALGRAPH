/** Distance-based level of detail for instanced nodes. */

export const LOD_LEVELS = [
  { maxDist: 300, scale: 1.0 },
  { maxDist: 600, scale: 0.7 },
  { maxDist: 1000, scale: 0.4 },
  { maxDist: 1500, scale: 0.2 },
  { maxDist: Infinity, scale: 0.0 },
];

export class LODManager {
  constructor(camera, nodeRenderer) {
    this.camera = camera;
    this.nodeRenderer = nodeRenderer;
    this.LOD_LEVELS = LOD_LEVELS;
    this._cameraPos = { x: 0, y: 0, z: 0 };
  }

  update(nodePositions, visibleSet, baseScales) {
    this._cameraPos.x = this.camera.position.x;
    this._cameraPos.y = this.camera.position.y;
    this._cameraPos.z = this.camera.position.z;

    for (const nodeId of visibleSet) {
      const pos = nodePositions.get(nodeId);
      if (!pos) {
        continue;
      }
      const dx = pos.x - this._cameraPos.x;
      const dy = pos.y - this._cameraPos.y;
      const dz = pos.z - this._cameraPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let levelScale = 0;
      for (const level of this.LOD_LEVELS) {
        if (dist <= level.maxDist) {
          levelScale = level.scale;
          break;
        }
      }
      const base = baseScales.get(nodeId) ?? 1;
      if (levelScale <= 0) {
        this.nodeRenderer.setVisibility(nodeId, false);
      } else {
        this.nodeRenderer.setVisibility(nodeId, true);
        this.nodeRenderer.setScale(nodeId, base * levelScale);
      }
    }
  }
}
