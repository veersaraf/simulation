// ============================================================
// ZoneLabel — Floating HTML label above each zone
// ============================================================

import { Html } from "@react-three/drei";
import type { Zone } from "../store/useWorldStore";

interface Props {
  zone: Zone;
  position: [number, number, number];
}

export function ZoneLabel({ zone, position }: Props) {
  const labelY = position[1] + zone.elevation * 1.5 + 0.5 + zone.elevation * 3 + 2;

  return (
    <Html
      position={[position[0], labelY, position[2]]}
      center
      distanceFactor={40}
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          background: "rgba(0, 0, 0, 0.6)",
          color: "white",
          padding: "4px 10px",
          borderRadius: "6px",
          fontSize: "13px",
          fontFamily: "'Inter', system-ui, sans-serif",
          whiteSpace: "nowrap",
          fontWeight: 500,
          letterSpacing: "0.02em",
          userSelect: "none",
        }}
      >
        {zone.name}
      </div>
    </Html>
  );
}
