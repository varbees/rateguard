"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Points, PointMaterial, Line } from "@react-three/drei";
import * as THREE from "three";

/**
 * 3D Network Graph Component
 * Creates an animated particle network with connecting lines
 * Used as a background element in the hero section
 */

interface NetworkGraphProps {
  count?: number; // Number of particles
}

export function NetworkGraph({ count = 1000 }: NetworkGraphProps) {
  const pointsRef = useRef<THREE.Points>(null);

  // Generate particle positions and colors
  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    // Use a seeded random for deterministic results
    const seededRandom = (seed: number) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // Random positions in a sphere (seeded)
      const radius = seededRandom(i * 3 + 1) * 25 + 10;
      const theta = seededRandom(i * 3 + 2) * Math.PI * 2;
      const phi = seededRandom(i * 3 + 3) * Math.PI;

      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);

      // Blue gradient colors
      colors[i3] = 0.3 + seededRandom(i * 3 + 4) * 0.3; // R
      colors[i3 + 1] = 0.5 + seededRandom(i * 3 + 5) * 0.3; // G
      colors[i3 + 2] = 0.9 + seededRandom(i * 3 + 6) * 0.1; // B
    }

    return { positions, colors };
  }, [count]);

  // Generate connections between nearby particles
  const connections = useMemo(() => {
    const lines: Array<[THREE.Vector3, THREE.Vector3]> = [];
    const maxDistance = 8; // Maximum distance for connections
    const maxConnections = 100; // Limit number of connections

    for (let i = 0; i < count && lines.length < maxConnections; i++) {
      const i3 = i * 3;
      const p1 = new THREE.Vector3(
        positions[i3],
        positions[i3 + 1],
        positions[i3 + 2]
      );

      for (let j = i + 1; j < count && lines.length < maxConnections; j++) {
        const j3 = j * 3;
        const p2 = new THREE.Vector3(
          positions[j3],
          positions[j3 + 1],
          positions[j3 + 2]
        );

        const distance = p1.distanceTo(p2);
        if (distance < maxDistance) {
          lines.push([p1, p2]);
        }
      }
    }

    return lines;
  }, [positions, count]);

  // Animate rotation
  useFrame((state, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.x += delta * 0.05;
      pointsRef.current.rotation.y += delta * 0.075;
    }
  });

  return (
    <>
      {/* Particle points */}
      <Points ref={pointsRef} positions={positions}>
        <PointMaterial
          transparent
          vertexColors
          size={0.15}
          sizeAttenuation={true}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </Points>

      {/* Connection lines */}
      {connections.map((line, i) => (
        <Line
          key={i}
          points={line}
          color="#3b82f6"
          lineWidth={0.5}
          transparent
          opacity={0.2}
        />
      ))}
    </>
  );
}

/**
 * Simple animated particles without connections
 * Lighter weight alternative
 */
export function ParticleField({ count = 500 }: NetworkGraphProps) {
  const pointsRef = useRef<THREE.Points>(null);

  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 50;
      positions[i3 + 1] = (Math.random() - 0.5) * 50;
      positions[i3 + 2] = (Math.random() - 0.5) * 50;
    }

    return positions;
  }, [count]);

  useFrame((state, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.x += delta * 0.1;
      pointsRef.current.rotation.y += delta * 0.15;
    }
  });

  return (
    <Points ref={pointsRef} positions={particles}>
      <PointMaterial
        transparent
        color="#3b82f6"
        size={0.1}
        sizeAttenuation={true}
        depthWrite={false}
        opacity={0.6}
      />
    </Points>
  );
}
