/** Web Worker: lightweight 3D force layout (no Three.js). */

let nodes = [];
let edges = [];
let positions = null;
let velocities = null;
let pinned = new Set();
let alpha = 1;
let tickCounter = 0;
let running = false;
let config = {
  repulsion: 120,
  linkDistance: 80,
  centerStrength: 0.02,
  damping: 0.85,
};

function nodeIndex(nodeId) {
  return nodes.findIndex((node) => node.id === nodeId);
}

function simulateStep() {
  if (!positions || nodes.length === 0) {
    return;
  }

  const n = nodes.length;
  for (let i = 0; i < n; i += 1) {
    if (pinned.has(nodes[i].id)) {
      continue;
    }
    let fx = 0;
    let fy = 0;
    let fz = 0;
    const ix = i * 3;
    const massI = 1 + (Number(nodes[i].importance) || 1) * 0.4;

    for (let j = 0; j < n; j += 1) {
      if (i === j) {
        continue;
      }
      const jx = j * 3;
      let dx = positions[ix] - positions[jx];
      let dy = positions[ix + 1] - positions[jx + 1];
      let dz = positions[ix + 2] - positions[jx + 2];
      const distSq = dx * dx + dy * dy + dz * dz + 0.01;
      const dist = Math.sqrt(distSq);
      const force = (config.repulsion * alpha) / distSq;
      fx += (dx / dist) * force;
      fy += (dy / dist) * force;
      fz += (dz / dist) * force;
    }

    fx -= positions[ix] * config.centerStrength;
    fy -= positions[ix + 1] * config.centerStrength;
    fz -= positions[ix + 2] * config.centerStrength * 0.5;

    for (const edge of edges) {
      const sourceIdx = nodeIndex(edge.source);
      const targetIdx = nodeIndex(edge.target);
      if (sourceIdx < 0 || targetIdx < 0) {
        continue;
      }
      const otherIdx = sourceIdx === i ? targetIdx : targetIdx === i ? sourceIdx : -1;
      if (otherIdx < 0) {
        continue;
      }
      const ox = otherIdx * 3;
      let dx = positions[ox] - positions[ix];
      let dy = positions[ox + 1] - positions[ix + 1];
      let dz = positions[ox + 2] - positions[ix + 2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
      const weight = Math.max(Number(edge.weight) || 1, 1);
      const targetDist = config.linkDistance / weight;
      const force = ((dist - targetDist) * 0.05 * alpha) / massI;
      fx += (dx / dist) * force;
      fy += (dy / dist) * force;
      fz += (dz / dist) * force;
    }

    velocities[ix] = (velocities[ix] + fx) * config.damping;
    velocities[ix + 1] = (velocities[ix + 1] + fy) * config.damping;
    velocities[ix + 2] = (velocities[ix + 2] + fz) * config.damping;
    positions[ix] += velocities[ix];
    positions[ix + 1] += velocities[ix + 1];
    positions[ix + 2] += velocities[ix + 2];
  }

  alpha *= 0.99;
  tickCounter += 1;
  if (tickCounter % 3 === 0) {
    self.postMessage({ type: "tick", positions: Array.from(positions) });
  }
  if (alpha < 0.001) {
    running = false;
    const cache = {};
    for (let i = 0; i < nodes.length; i += 1) {
      const offset = i * 3;
      cache[nodes[i].id] = {
        x: positions[offset],
        y: positions[offset + 1],
        z: positions[offset + 2],
      };
    }
    self.postMessage({ type: "stable" });
    self.postMessage({ type: "cache", positions: cache });
  }
}

function tickLoop() {
  if (!running) {
    return;
  }
  simulateStep();
  setTimeout(tickLoop, 16);
}

self.onmessage = (event) => {
  const message = event.data;
  switch (message.type) {
    case "init": {
      nodes = message.nodes || [];
      edges = message.edges || [];
      config = { ...config, ...(message.config || {}) };
      positions = new Float32Array(nodes.length * 3);
      velocities = new Float32Array(nodes.length * 3);
      pinned = new Set();
      for (let i = 0; i < nodes.length; i += 1) {
        const offset = i * 3;
        positions[offset] = Number(nodes[i].x) || (Math.random() - 0.5) * 200;
        positions[offset + 1] = Number(nodes[i].y) || (Math.random() - 0.5) * 200;
        positions[offset + 2] = Number(nodes[i].z) || ((i % 2 === 0 ? 1 : -1) * (i % 20));
      }
      alpha = 1;
      tickCounter = 0;
      running = true;
      tickLoop();
      break;
    }
    case "pin": {
      pinned.add(message.nodeId);
      const idx = nodeIndex(message.nodeId);
      if (idx >= 0) {
        const offset = idx * 3;
        positions[offset] = message.x;
        positions[offset + 1] = message.y;
        positions[offset + 2] = message.z;
      }
      break;
    }
    case "unpin": {
      pinned.delete(message.nodeId);
      break;
    }
    case "reheat": {
      alpha = 0.3;
      running = true;
      tickLoop();
      break;
    }
    case "stop": {
      running = false;
      break;
    }
    default:
      break;
  }
};
