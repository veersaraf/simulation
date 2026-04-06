// ============================================================
// FlyCamera — GTA director-mode free-roam camera
// Pointer lock on click, WASD + mouse look, Space/Ctrl up/down
// ============================================================

import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useWorldStore } from "../store/useWorldStore";

const BASE_SPEED = 0.4;
const SPRINT_MULTIPLIER = 2.5;
const MOUSE_SENSITIVITY = 0.002;
const ZOOM_SENSITIVITY = 0.05;

export function FlyCamera() {
  const { camera, gl } = useThree();
  const followAgent = useWorldStore((s) => s.followAgent);
  const keys = useRef(new Set<string>());
  const euler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
  const isLocked = useRef(false);

  useEffect(() => {
    // Initialize euler from camera
    euler.current.setFromQuaternion(camera.quaternion, "YXZ");

    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
    };

    const onClick = () => {
      // Don't lock pointer when following an agent
      if (useWorldStore.getState().followAgent) return;
      gl.domElement.requestPointerLock();
    };

    const onPointerLockChange = () => {
      isLocked.current = document.pointerLockElement === gl.domElement;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      camera.position.addScaledVector(dir, -e.deltaY * ZOOM_SENSITIVITY);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked.current || useWorldStore.getState().followAgent) return;
      euler.current.y -= e.movementX * MOUSE_SENSITIVITY;
      euler.current.x -= e.movementY * MOUSE_SENSITIVITY;
      // Clamp vertical look to prevent flipping
      euler.current.x = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, euler.current.x)
      );
      camera.quaternion.setFromEuler(euler.current);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    gl.domElement.addEventListener("click", onClick);
    gl.domElement.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      gl.domElement.removeEventListener("click", onClick);
      gl.domElement.removeEventListener("wheel", onWheel);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, [camera, gl]);

  useFrame(() => {
    // Disabled when following an agent
    if (followAgent) return;
    const k = keys.current;
    if (k.size === 0) return;

    const speed = k.has("ShiftLeft") || k.has("ShiftRight")
      ? BASE_SPEED * SPRINT_MULTIPLIER
      : BASE_SPEED;

    const direction = new THREE.Vector3();

    // Forward/back (camera's forward projected onto XZ)
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    // Strafe (camera's right)
    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    if (k.has("KeyW")) direction.add(forward);
    if (k.has("KeyS")) direction.sub(forward);
    if (k.has("KeyA")) direction.sub(right);
    if (k.has("KeyD")) direction.add(right);
    if (k.has("Space")) direction.y += 1;
    if (k.has("ControlLeft") || k.has("ControlRight")) direction.y -= 1;

    if (direction.lengthSq() > 0) {
      direction.normalize().multiplyScalar(speed);
      camera.position.add(direction);
    }
  });

  return null;
}
