/** Gradually catch up with long output without abrupt speed changes. */
export function nextAutoScrollSpeed(
  currentSpeed: number,
  baseSpeed: number,
  distance: number,
  viewportHeight: number,
  elapsedSeconds: number,
) {
  const comfortableDistance = Math.max(240, viewportHeight * 0.5);
  const backlog = Math.min(1, Math.max(0,
    (distance - comfortableDistance) / Math.max(600, viewportHeight),
  ));
  const targetSpeed = baseSpeed * (1 + 0.75 * backlog);
  // Limit acceleration and braking to 22% of base speed per second.
  const maxChange = baseSpeed * 0.22 * elapsedSeconds;
  return currentSpeed + Math.max(-maxChange, Math.min(maxChange, targetSpeed - currentSpeed));
}
