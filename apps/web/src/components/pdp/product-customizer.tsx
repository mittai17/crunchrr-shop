"use client";

/**
 * 3D Product Customizer — React Three Fiber.
 * A stylized garment mock (torso + hood + sleeves + hem rib) built from
 * rounded primitives. Material color syncs to the selected colorway via
 * a tiny event bus; OrbitControls let the collector inspect the drop.
 */
import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { Product } from "@crunchrr/shared";
import { cn } from "@/lib/utils";

/* ------------------------- colorway sync bus ------------------------- */

const CHANNEL = "crunchrr:customizer-color";

export function broadcastColor(hex: string) {
  window.dispatchEvent(new CustomEvent<string>(CHANNEL, { detail: hex }));
}

/* ------------------------------ garment ------------------------------ */

function Garment({ color }: { color: string }) {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.85,
        metalness: 0.02,
      }),
    [color],
  );

  const rib = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color).multiplyScalar(0.82),
        roughness: 0.95,
      }),
    [color],
  );

  const print = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#F45B50"),
        roughness: 0.6,
      }),
    [],
  );

  return (
    <group position={[0, -0.4, 0]}>
      {/* Torso */}
      <RoundedBox args={[2.4, 3.0, 1.2]} radius={0.35} smoothness={6} position={[0, 0, 0]} material={material} castShadow />
      {/* Chest print */}
      <RoundedBox args={[1.05, 1.05, 0.08]} radius={0.06} smoothness={4} position={[0, 0.55, 0.62]} material={print} />
      {/* Hood */}
      <RoundedBox args={[1.5, 1.1, 1.0]} radius={0.4} smoothness={6} position={[0, 1.95, -0.12]} rotation={[0.35, 0, 0]} material={material} castShadow />
      {/* Left sleeve */}
      <RoundedBox args={[0.85, 2.5, 0.9]} radius={0.3} smoothness={6} position={[-1.55, 0.15, 0]} rotation={[0, 0, 0.16]} material={material} castShadow />
      {/* Right sleeve */}
      <RoundedBox args={[0.85, 2.5, 0.9]} radius={0.3} smoothness={6} position={[1.55, 0.15, 0]} rotation={[0, 0, -0.16]} material={material} castShadow />
      {/* Sleeve graphics */}
      <RoundedBox args={[0.5, 0.5, 0.06]} radius={0.05} smoothness={4} position={[-1.7, 0.6, 0.45]} rotation={[0, 0.15, 0.16]} material={print} />
      <RoundedBox args={[0.5, 0.5, 0.06]} radius={0.05} smoothness={4} position={[1.7, 0.6, 0.45]} rotation={[0, -0.15, -0.16]} material={print} />
      {/* Waist rib */}
      <RoundedBox args={[2.42, 0.4, 1.22]} radius={0.12} smoothness={4} position={[0, -1.55, 0]} material={rib} />
      {/* Cuffs */}
      <RoundedBox args={[0.87, 0.35, 0.92]} radius={0.12} smoothness={4} position={[-1.62, -1.05, 0]} rotation={[0, 0, 0.16]} material={rib} />
      <RoundedBox args={[0.87, 0.35, 0.92]} radius={0.12} smoothness={4} position={[1.62, -1.05, 0]} rotation={[0, 0, -0.16]} material={rib} />
    </group>
  );
}

/* ----------------------------- customizer ----------------------------- */

export function ProductCustomizer({ product }: { product: Product }) {
  const colorways = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of product.variants) {
      if (!map.has(v.colorway)) map.set(v.colorway, v.colorHex);
    }
    return Array.from(map.entries());
  }, [product]);

  const [color, setColor] = useState(colorways[0]?.[1] ?? "#F4F1EA");
  const [spin, setSpin] = useState(true);

  useEffect(() => {
    const handler = (e: Event) => {
      const hex = (e as CustomEvent<string>).detail;
      if (hex) setColor(hex);
    };
    window.addEventListener(CHANNEL, handler);
    return () => window.removeEventListener(CHANNEL, handler);
  }, []);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative h-full min-h-[420px] w-full flex-1">
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 0.6, 7.2], fov: 38 }}
          gl={{ antialias: true, alpha: true }}
        >
          <color attach="background" args={["#FAF8F6"]} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[4, 6, 5]} intensity={1.4} castShadow />
          <directionalLight position={[-5, 3, -4]} intensity={0.5} />
          <Garment color={color} />
          <ContactShadows position={[0, -2.35, 0]} opacity={0.28} scale={9} blur={2.6} far={4} />
          <OrbitControls
            autoRotate={spin}
            autoRotateSpeed={1.6}
            enablePan={false}
            minDistance={4.5}
            maxDistance={10}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 1.9}
          />
        </Canvas>

        <button
          type="button"
          onClick={() => setSpin((s) => !s)}
          className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-charcoal/80 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm"
        >
          <span className="material-symbols-outlined text-sm">
            {spin ? "pause" : "play_arrow"}
          </span>
          {spin ? "Auto-Rotate" : "Paused"}
        </button>

        <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-charcoal shadow-sm">
          Drag to orbit • Scroll to zoom
        </span>
      </div>

      {/* Colorway chips drive the 3D material */}
      <div className="flex flex-wrap items-center justify-center gap-2 pb-3">
        {colorways.map(([name, hex]) => (
          <button
            key={name}
            type="button"
            title={name}
            onClick={() => setColor(hex)}
            className={cn(
              "h-7 w-7 rounded-full ring-offset-2 transition-all",
              color === hex ? "ring-2 ring-brand" : "ring-1 ring-surface-subtle hover:scale-110",
            )}
            style={{ backgroundColor: hex }}
            aria-label={`Preview ${name}`}
          />
        ))}
        <span className="ml-1 font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-muted">
          Live 3D Preview
        </span>
      </div>
    </div>
  );
}
