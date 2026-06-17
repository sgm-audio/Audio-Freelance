"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

function Waveform() {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const count = 64;

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (i / count - 0.5) * 12;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = 0;
    }
    return pos;
  }, [count]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      const phase = (i / count) * Math.PI * 4 + t * 0.8;
      const height = Math.sin(phase) * 0.3 + Math.sin(phase * 1.7) * 0.15 + Math.sin(phase * 3.2) * 0.07;
      dummy.position.set((i / count - 0.5) * 12, height * 1.5, 0);
      dummy.scale.set(0.12, Math.max(0.05, height + 0.4) * 2.5, 0.12);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <boxGeometry />
      <meshStandardMaterial color="#4a7dff" transparent opacity={0.6} />
    </instancedMesh>
  );
}

function Grid() {
  return (
    <gridHelper args={[16, 12, "#2a2a3a", "#1a1a2a"]} position={[0, -2, -2]} />
  );
}

export default function AudioVis() {
  return (
    <div className="h-48 rounded-lg overflow-hidden bg-card border border-border">
      <Canvas camera={{ position: [0, 2, 8], fov: 50 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 10, 5]} intensity={0.8} />
        <Waveform />
        <Grid />
      </Canvas>
    </div>
  );
}
