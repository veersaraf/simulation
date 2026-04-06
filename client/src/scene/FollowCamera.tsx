// ============================================================
// FollowCamera — Third-person camera that orbits a followed agent.
// Smoothly lerps behind the agent, orbitable with mouse drag.
// Press Escape or click the "X" button to exit follow mode.
// ============================================================

import { useRef, useEffect, useCallback } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useWorldStore } from "../store/useWorldStore";

/** Offset from agent position: [right, up, behind] in agent-local space */
const FOLLOW_OFFSET = new THREE.Vector3(0, 6, 12);
const LOOK_OFFSET_Y = 1.2; // look at head height, not feet
const LERP_FACTOR = 3.0; // smoothing speed (higher = snappier)
const ORBIT_SENSITIVITY = 0.004;

export function FollowCamera({
  agentPositions,
}: {
  agentPositions: Record<string, [number, number, number]>;
}) {
  const { camera, gl } = useThree();
  const followAgent = useWorldStore((s) => s.followAgent);
  const setFollowAgent = useWorldStore((s) => s.setFollowAgent);

  // Orbit state — yaw around agent, pitch above
  const yaw = useRef(0);
  const pitch = useRef(0.3); // slight downward angle
  const isDragging = useRef(false);

  // Desired camera position (smoothed toward)
  const desiredPos = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());

  // Track whether we're actively following (to avoid fighting with FlyCamera)
  const active = !!followAgent && !!agentPositions[followAgent];

  // Escape key exits follow mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && followAgent) {
        setFollowAgent(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [followAgent, setFollowAgent]);

  // Mouse drag for orbit
  useEffect(() => {
    if (!active) return;

    const onMouseDown = (e: MouseEvent) => {
      // Only right-click or middle-click for orbit (left click selects agents)
      if (e.button === 2 || e.button === 1) {
        isDragging.current = true;
      }
    };
    const onMouseUp = () => {
      isDragging.current = false;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      yaw.current -= e.movementX * ORBIT_SENSITIVITY;
      pitch.current = Math.max(
        -0.2,
        Math.min(1.2, pitch.current - e.movementY * ORBIT_SENSITIVITY)
      );
    };
    const onContextMenu = (e: Event) => e.preventDefault();

    const el = gl.domElement;
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("mouseup", onMouseUp);
    el.addEventListener("mousemove", onMouseMove);
    el.addEventListener("contextmenu", onContextMenu);

    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("contextmenu", onContextMenu);
    };
  }, [active, gl]);

  // Scroll to zoom in/out
  useEffect(() => {
    if (!active) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scale = 1 + e.deltaY * 0.001;
      FOLLOW_OFFSET.multiplyScalar(Math.max(0.3, Math.min(3, scale)));
    };
    const el = gl.domElement;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [active, gl]);

  useFrame((_, delta) => {
    if (!active || !followAgent) return;

    const agentPos = agentPositions[followAgent];
    if (!agentPos) return;

    const target = new THREE.Vector3(agentPos[0], agentPos[1], agentPos[2]);

    // Compute orbital camera position
    const cosP = Math.cos(pitch.current);
    const sinP = Math.sin(pitch.current);
    const cosY = Math.cos(yaw.current);
    const sinY = Math.sin(yaw.current);

    const dist = FOLLOW_OFFSET.length();
    const offsetX = sinY * cosP * dist;
    const offsetY = sinP * dist;
    const offsetZ = cosY * cosP * dist;

    desiredPos.current.set(
      target.x + offsetX,
      target.y + offsetY + LOOK_OFFSET_Y,
      target.z + offsetZ
    );

    lookTarget.current.set(
      target.x,
      target.y + LOOK_OFFSET_Y,
      target.z
    );

    // Smooth lerp
    const t = 1 - Math.exp(-LERP_FACTOR * delta);
    camera.position.lerp(desiredPos.current, t);
    // Look at agent
    const currentLook = new THREE.Vector3();
    camera.getWorldDirection(currentLook);
    const idealLook = new THREE.Vector3()
      .subVectors(lookTarget.current, camera.position)
      .normalize();
    currentLook.lerp(idealLook, t);
    camera.lookAt(lookTarget.current);
  });

  return null;
}
