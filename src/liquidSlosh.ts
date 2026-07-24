import * as THREE from 'three';

export type CupTiltController = {
  update: (deltaSeconds: number) => void;
  reset: () => void;
  dispose: () => void;
};

export function createCupTiltController(
  canvas: HTMLCanvasElement,
  model: THREE.Group,
): CupTiltController {
  const baseYaw = model.rotation.y;
  const currentTilt = new THREE.Vector2(model.rotation.x, model.rotation.z);
  const targetTilt = currentTilt.clone();
  const tiltVelocity = new THREE.Vector2();
  const tiltDelta = new THREE.Vector2();
  const maxTilt = 0.28;
  const basePointLocal = new THREE.Vector3(0, -1.1, 0);
  const baseAnchorWorld = model.localToWorld(basePointLocal.clone());
  const transformedBasePoint = new THREE.Vector3();
  let dragging = false;
  let activePointerId: number | null = null;
  let previousX = 0;
  let previousY = 0;

  function clampTarget(): void {
    if (targetTilt.length() > maxTilt) targetTilt.setLength(maxTilt);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    dragging = true;
    activePointerId = event.pointerId;
    previousX = event.clientX;
    previousY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
    canvas.focus({ preventScroll: true });
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging || event.pointerId !== activePointerId) return;
    const deltaX = event.clientX - previousX;
    const deltaY = event.clientY - previousY;
    previousX = event.clientX;
    previousY = event.clientY;

    targetTilt.x += deltaY * 0.0042;
    targetTilt.y += deltaX * 0.0042;
    clampTarget();
    event.preventDefault();
  }

  function stopDragging(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) return;
    dragging = false;
    activePointerId = null;
    canvas.classList.remove('is-dragging');
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  function reset(): void {
    targetTilt.set(0, 0);
  }

  function onKeyDown(event: KeyboardEvent): void {
    const step = 0.055;
    switch (event.key) {
      case 'ArrowUp':
        targetTilt.x -= step;
        break;
      case 'ArrowDown':
        targetTilt.x += step;
        break;
      case 'ArrowLeft':
        targetTilt.y -= step;
        break;
      case 'ArrowRight':
        targetTilt.y += step;
        break;
      case 'Home':
      case 'r':
      case 'R':
        reset();
        break;
      default:
        return;
    }
    clampTarget();
    event.preventDefault();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', stopDragging);
  canvas.addEventListener('pointercancel', stopDragging);
  canvas.addEventListener('dblclick', reset);
  canvas.addEventListener('keydown', onKeyDown);

  return {
    update(deltaSeconds: number): void {
      const delta = THREE.MathUtils.clamp(deltaSeconds, 0, 1 / 30);
      const stiffness = 30;
      const damping = 8.5;

      tiltDelta.copy(targetTilt).sub(currentTilt);
      tiltVelocity.addScaledVector(tiltDelta, stiffness * delta);
      tiltVelocity.multiplyScalar(Math.exp(-damping * delta));
      currentTilt.addScaledVector(tiltVelocity, delta);

      model.rotation.set(currentTilt.x, baseYaw, currentTilt.y, 'YXZ');
      transformedBasePoint.copy(basePointLocal).multiply(model.scale).applyQuaternion(model.quaternion);
      model.position.copy(baseAnchorWorld).sub(transformedBasePoint);
    },
    reset,
    dispose(): void {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', stopDragging);
      canvas.removeEventListener('pointercancel', stopDragging);
      canvas.removeEventListener('dblclick', reset);
      canvas.removeEventListener('keydown', onKeyDown);
    },
  };
}
