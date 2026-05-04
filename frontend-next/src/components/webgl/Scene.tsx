"use client";

import { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";

export default function Scene() {
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const { mouse, viewport } = useThree();

  const particleCount = 200;
  
  // Generate random positions for particles
  const [positions, lines] = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    // Use a local random function to satisfy purity checks if needed, 
    // but here we just generate once inside useMemo.
    for (let i = 0; i < particleCount; i++) {
      // eslint-disable-next-line react-hooks/purity
      pos[i * 3] = (Math.random() - 0.5) * 20;     // x
      // eslint-disable-next-line react-hooks/purity
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20; // y
      // eslint-disable-next-line react-hooks/purity
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10 - 5; // z
    }

    // Connect some particles with lines
    const lineIndices = [];
    for (let i = 0; i < particleCount; i++) {
      for (let j = i + 1; j < particleCount; j++) {
        const dx = pos[i * 3] - pos[j * 3];
        const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
        const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (dist < 3) {
          lineIndices.push(i, j);
        }
      }
    }
    
    return [pos, new Uint16Array(lineIndices)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state, delta) => {
    if (pointsRef.current && linesRef.current) {
      // Slow rotation
      pointsRef.current.rotation.y -= delta * 0.05;
      pointsRef.current.rotation.x -= delta * 0.02;
      
      linesRef.current.rotation.y = pointsRef.current.rotation.y;
      linesRef.current.rotation.x = pointsRef.current.rotation.x;

      // Parallax effect based on mouse
      const targetX = (mouse.x * viewport.width) / 20;
      const targetY = (mouse.y * viewport.height) / 20;

      pointsRef.current.position.x += (targetX - pointsRef.current.position.x) * 0.02;
      pointsRef.current.position.y += (targetY - pointsRef.current.position.y) * 0.02;
      
      linesRef.current.position.x = pointsRef.current.position.x;
      linesRef.current.position.y = pointsRef.current.position.y;
    }
  });

  return (
    <group>
      <Points ref={pointsRef} positions={positions} stride={3} frustumCulled={false}>
        <PointMaterial
          transparent
          color="#FF2A4D"
          size={0.05}
          sizeAttenuation={true}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </Points>
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={positions.length / 3}
            array={positions}
            itemSize={3}
          />
          <bufferAttribute
            attach="index"
            count={lines.length}
            array={lines}
            itemSize={1}
          />
        </bufferGeometry>
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
