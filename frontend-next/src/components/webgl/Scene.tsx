"use client";

import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PointMaterial } from "@react-three/drei";
import * as THREE from "three";

const PARTICLE_COUNT = 200;
const SPHERE_RADIUS = 9;

const PHYSICS = {
  turbulence: 1.1,
  repulsion: 3.5,
  repulsionRadius: 1.6,
  damping: 0.988,
  minDrift: 0.12,
  maxSpeed: 1.25,
  boundarySoftness: 0.35,
};

// Simple seedable Linear Congruential Generator (LCG)
function createRandom(seed = 12345) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function randomInSphere(radius: number, rand: () => number): [number, number, number] {
  const u = rand();
  const v = rand();
  const theta = Math.PI * 2 * u;
  const phi = Math.acos(2 * v - 1);
  const r = radius * Math.cbrt(rand());
  const sinPhi = Math.sin(phi);
  return [r * sinPhi * Math.cos(theta), r * sinPhi * Math.sin(theta), r * Math.cos(phi)];
}

export default function Scene() {
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const simulationRef = useRef<{
    positions: Float32Array;
    velocities: Float32Array;
    seeds: Float32Array;
    lines: Uint16Array;
  } | null>(null);

  useEffect(() => {
    const rand = createRandom(12345);
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const [x, y, z] = randomInSphere(SPHERE_RADIUS * (0.55 + rand() * 0.45), rand);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const speed = 0.15 + rand() * 0.55;
      const dir = randomInSphere(1, rand);
      velocities[i * 3] = dir[0] * speed;
      velocities[i * 3 + 1] = dir[1] * speed;
      velocities[i * 3 + 2] = dir[2] * speed;

      seeds[i] = rand() * Math.PI * 2;
    }

    const lineIndices: number[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      for (let j = i + 1; j < PARTICLE_COUNT; j++) {
        const dx = positions[i * 3] - positions[j * 3];
        const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < 9) {
          lineIndices.push(i, j);
        }
      }
    }

    const lines = new Uint16Array(lineIndices);

    simulationRef.current = {
      positions,
      velocities,
      seeds,
      lines,
    };

    const points = pointsRef.current;
    const lineSegs = linesRef.current;
    if (points && lineSegs) {
      points.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      points.geometry.computeBoundingSphere();

      lineSegs.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      lineSegs.geometry.setIndex(new THREE.BufferAttribute(lines, 1));
      lineSegs.geometry.computeBoundingSphere();
    }
  }, []);

  const { mouse, viewport } = useThree();

  useFrame((state, delta) => {
    const points = pointsRef.current;
    const lines = linesRef.current;
    const sim = simulationRef.current;
    if (!points || !lines || !sim) return;

    const dt = Math.min(delta, 0.033);
    const t = state.clock.elapsedTime;
    const { positions, velocities, seeds } = sim;
    const {
      turbulence,
      repulsion,
      repulsionRadius,
      damping,
      minDrift,
      maxSpeed,
      boundarySoftness,
    } = PHYSICS;
    const repulsionRadiusSq = repulsionRadius * repulsionRadius;
    const boundary = SPHERE_RADIUS * 1.05;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      let fx = 0;
      let fy = 0;
      let fz = 0;
      const px = positions[i3];
      const py = positions[i3 + 1];
      const pz = positions[i3 + 2];
      const seed = seeds[i];

      fx += Math.sin(t * 0.7 + seed) * turbulence;
      fy += Math.cos(t * 0.9 + seed * 1.7) * turbulence;
      fz += Math.sin(t * 0.55 + seed * 2.3) * turbulence * 0.85;

      for (let j = i + 1; j < PARTICLE_COUNT; j++) {
        const j3 = j * 3;
        const dx = px - positions[j3];
        const dy = py - positions[j3 + 1];
        const dz = pz - positions[j3 + 2];
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > repulsionRadiusSq || distSq < 1e-6) continue;

        const dist = Math.sqrt(distSq);
        const push = (repulsion * (1 - dist / repulsionRadius)) / dist;
        const nx = dx * push;
        const ny = dy * push;
        const nz = dz * push;
        fx += nx;
        fy += ny;
        fz += nz;
        velocities[j3] -= nx * dt;
        velocities[j3 + 1] -= ny * dt;
        velocities[j3 + 2] -= nz * dt;
      }

      const distFromCenter = Math.sqrt(px * px + py * py + pz * pz);
      if (distFromCenter > boundary) {
        const overshoot = distFromCenter - boundary;
        const nx = px / distFromCenter;
        const ny = py / distFromCenter;
        const nz = pz / distFromCenter;
        fx -= nx * overshoot * boundarySoftness;
        fy -= ny * overshoot * boundarySoftness;
        fz -= nz * overshoot * boundarySoftness;
      }

      let vx = (velocities[i3] + fx * dt) * damping;
      let vy = (velocities[i3 + 1] + fy * dt) * damping;
      let vz = (velocities[i3 + 2] + fz * dt) * damping;

      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (speed < minDrift) {
        const kick = minDrift / Math.max(speed, 1e-4);
        vx *= kick;
        vy *= kick;
        vz *= kick;
        vx += (Math.random() - 0.5) * 0.08;
        vy += (Math.random() - 0.5) * 0.08;
        vz += (Math.random() - 0.5) * 0.08;
      } else if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        vx *= scale;
        vy *= scale;
        vz *= scale;
      }

      velocities[i3] = vx;
      velocities[i3 + 1] = vy;
      velocities[i3 + 2] = vz;
      positions[i3] = px + vx * dt;
      positions[i3 + 1] = py + vy * dt;
      positions[i3 + 2] = pz + vz * dt;
    }

    const pointAttr = points.geometry.attributes.position;
    const lineAttr = lines.geometry.attributes.position;
    if (pointAttr) pointAttr.needsUpdate = true;
    if (lineAttr) lineAttr.needsUpdate = true;

    points.rotation.y -= dt * 0.05;
    points.rotation.x -= dt * 0.02;
    lines.rotation.y = points.rotation.y;
    lines.rotation.x = points.rotation.x;

    const targetX = (mouse.x * viewport.width) / 20;
    const targetY = (mouse.y * viewport.height) / 20;
    points.position.x += (targetX - points.position.x) * 0.02;
    points.position.y += (targetY - points.position.y) * 0.02;
    lines.position.x = points.position.x;
    lines.position.y = points.position.y;
  });

  return (
    <group>
      <points ref={pointsRef} frustumCulled={false}>
        <bufferGeometry />
        <PointMaterial
          transparent
          color="#FF2A4D"
          size={0.05}
          sizeAttenuation={true}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <lineSegments ref={linesRef}>
        <bufferGeometry />
        <lineBasicMaterial
          color="#800015"
          transparent
          opacity={0.15}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}
