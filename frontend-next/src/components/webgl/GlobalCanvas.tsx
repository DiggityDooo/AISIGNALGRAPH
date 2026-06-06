"use client";

import { Canvas } from "@react-three/fiber";
import Scene from "./Scene";

export default function GlobalCanvas() {
  return (
    <div className="fixed inset-0 z-[-1] bg-transparent pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 60 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
        onCreated={({ gl, scene }) => {
          scene.background = null;
          gl.setClearColor(0x000000, 0);
        }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
