/** Marks nodes inside the camera frustum each frame. */

export class FrustumCuller {
  constructor(camera, spatialIndex, THREE) {
    this.camera = camera;
    this.spatialIndex = spatialIndex;
    this.THREE = THREE;
    this.visibleSet = new Set();
    this._matrix = new THREE.Matrix4();
    this._frustum = new THREE.Frustum();
  }

  update() {
    this._matrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._matrix);
    this.visibleSet = this.spatialIndex.getVisible(this._frustum);
  }

  isVisible(nodeId) {
    return this.visibleSet.has(nodeId);
  }

  get visibleCount() {
    return this.visibleSet.size;
  }
}
