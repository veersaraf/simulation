// ============================================================
// AgentMesh — Humanoid with smooth movement, persistent task
// indicator, speech bubbles, and click-to-follow
// ============================================================

import { useRef, useState, useEffect, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useWorldStore } from "../store/useWorldStore";

interface Props {
  agentId: string;
  position: [number, number, number];
  color: string;
}

const AGENT_COLORS: Record<string, string> = {
  alice: "#e91e63",
  bob: "#2196f3",
};

const LERP_SPEED = 1.8;
const SPEECH_DURATION = 6000;

// Action -> emoji/label mapping
const ACTION_LABELS: Record<string, { icon: string; label: string }> = {
  chop_wood: { icon: "\u{1fa93}", label: "Chopping wood" },
  gather_fruit: { icon: "\u{1fad0}", label: "Gathering fruit" },
  gather_stones: { icon: "\u{1faa8}", label: "Collecting stones" },
  gather_clay: { icon: "\u{1f3fa}", label: "Digging clay" },
  fish: { icon: "\u{1f3a3}", label: "Fishing" },
  eat: { icon: "\u{1f37d}", label: "Eating" },
  build_campfire: { icon: "\u{1f525}", label: "Building fire" },
  build_shelter: { icon: "\u{1f3e0}", label: "Building shelter" },
  build_wall: { icon: "\u{1f9f1}", label: "Building wall" },
  plant_crop: { icon: "\u{1f331}", label: "Planting" },
  harvest_crop: { icon: "\u{1f33e}", label: "Harvesting" },
  move: { icon: "\u{1f6b6}", label: "Walking" },
  sleep: { icon: "\u{1f634}", label: "Sleeping" },
  rest: { icon: "\u{1f4a4}", label: "Resting" },
};

export function AgentMesh({ agentId, position, color }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const currentPos = useRef(new THREE.Vector3(...position));
  const targetPos = useRef(new THREE.Vector3(...position));
  const isMoving = useRef(false);
  const bodyRef = useRef<THREE.Mesh>(null);

  const agentColor = AGENT_COLORS[agentId] || color;

  // Store selectors
  const speech = useWorldStore((s) => s.agentSpeech[agentId]);
  const task = useWorldStore((s) => s.agentTasks[agentId]);
  const followAgent = useWorldStore((s) => s.followAgent);
  const setFollowAgent = useWorldStore((s) => s.setFollowAgent);

  const isFollowed = followAgent === agentId;

  // Local state for timed speech bubble
  const [visibleSpeech, setVisibleSpeech] = useState<string | null>(null);

  // Show speech bubble when new speech arrives
  useEffect(() => {
    if (!speech) return;
    const msg =
      speech.message.length > 80
        ? speech.message.slice(0, 77) + "..."
        : speech.message;
    setVisibleSpeech(msg);
    const timer = setTimeout(() => setVisibleSpeech(null), SPEECH_DURATION);
    return () => clearTimeout(timer);
  }, [speech]);

  // Resolve task label
  const taskInfo = task
    ? ACTION_LABELS[task.action] || {
        icon: "\u26a1",
        label: task.action.replace(/_/g, " "),
      }
    : null;

  // Update target when position prop changes (zone change)
  useEffect(() => {
    const newTarget = new THREE.Vector3(...position);
    if (!newTarget.equals(targetPos.current)) {
      targetPos.current.copy(newTarget);
      isMoving.current = true;
    }
  }, [position]);

  // Click handler — toggle follow
  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      setFollowAgent(isFollowed ? null : agentId);
    },
    [agentId, isFollowed, setFollowAgent]
  );

  // Smooth movement + idle animation
  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    const group = groupRef.current;

    if (isMoving.current) {
      const dist = currentPos.current.distanceTo(targetPos.current);
      if (dist < 0.05) {
        currentPos.current.copy(targetPos.current);
        isMoving.current = false;
      } else {
        const step = Math.min(LERP_SPEED * delta, dist);
        const dir = new THREE.Vector3()
          .subVectors(targetPos.current, currentPos.current)
          .normalize();
        currentPos.current.addScaledVector(dir, step);
      }
      // Walking bob
      const walkBob = Math.sin(clock.elapsedTime * 8) * 0.12;
      group.position.set(
        currentPos.current.x,
        currentPos.current.y + walkBob,
        currentPos.current.z
      );
      // Face direction of movement
      const lookDir = new THREE.Vector3().subVectors(
        targetPos.current,
        currentPos.current
      );
      if (lookDir.lengthSq() > 0.001) {
        group.rotation.y = Math.atan2(lookDir.x, lookDir.z);
      }
    } else {
      // Idle bob
      const idleBob =
        Math.sin(
          clock.elapsedTime * 2 + (agentId === "bob" ? Math.PI : 0)
        ) * 0.1;
      group.position.set(
        currentPos.current.x,
        currentPos.current.y + idleBob,
        currentPos.current.z
      );
    }

    // Action arm swing when working
    if (bodyRef.current && taskInfo && task?.action !== "sleep" && task?.action !== "rest") {
      const swing = Math.sin(clock.elapsedTime * 6) * 0.15;
      bodyRef.current.rotation.x = swing;
    } else if (bodyRef.current) {
      bodyRef.current.rotation.x *= 0.9; // ease back to neutral
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Body — clickable */}
      <mesh
        ref={bodyRef}
        position={[0, 0.6, 0]}
        castShadow
        onClick={handleClick}
      >
        <capsuleGeometry args={[0.25, 0.6, 4, 6]} />
        <meshStandardMaterial color={agentColor} flatShading />
      </mesh>
      {/* Head — clickable */}
      <mesh position={[0, 1.2, 0]} castShadow onClick={handleClick}>
        <sphereGeometry args={[0.2, 6, 5]} />
        <meshStandardMaterial color="#ffe0b2" flatShading />
      </mesh>

      {/* Selection ring when followed */}
      {isFollowed && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.6, 0.8, 24]} />
          <meshBasicMaterial color={agentColor} transparent opacity={0.5} />
        </mesh>
      )}

      {/* Name label */}
      <Html
        position={[0, 1.8, 0]}
        center
        distanceFactor={30}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            background: agentColor,
            color: "white",
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "'Inter', system-ui, sans-serif",
            whiteSpace: "nowrap",
            textTransform: "capitalize",
            cursor: "pointer",
          }}
        >
          {agentId}
        </div>
      </Html>

      {/* Persistent task indicator — always visible while agent is occupied */}
      {taskInfo && (
        <Html
          position={[0, 2.2, 0]}
          center
          distanceFactor={30}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              background: "rgba(0,0,0,0.75)",
              color: "#ffcc80",
              padding: "3px 10px",
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 500,
              fontFamily: "'Inter', system-ui, sans-serif",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 14 }}>{taskInfo.icon}</span>
            <span>{taskInfo.label}</span>
            {task!.hours >= 0.5 && (
              <span
                style={{
                  fontSize: 9,
                  opacity: 0.6,
                  marginLeft: 2,
                }}
              >
                {task!.hours}h
              </span>
            )}
          </div>
        </Html>
      )}

      {/* Speech bubble */}
      {visibleSpeech && (
        <Html
          position={[0, taskInfo ? 2.7 : 2.4, 0]}
          center
          distanceFactor={30}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.95)",
              color: "#1a1a1a",
              padding: "6px 12px",
              borderRadius: 10,
              borderBottomLeftRadius: 2,
              fontSize: 11,
              fontFamily: "'Inter', system-ui, sans-serif",
              maxWidth: 220,
              lineHeight: 1.4,
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              wordWrap: "break-word",
              animation: "fadeInUp 0.3s ease-out",
            }}
          >
            {visibleSpeech}
          </div>
        </Html>
      )}
    </group>
  );
}
