// Bounds are [minX, maxX, minY, maxY]. Reserve room for the robot's body.
export function boundaryState(bounds, position) {
  const [x, y] = position;
  const distance = Math.min(x - bounds[0], bounds[1] - x, y - bounds[2], bounds[3] - y);
  return { distance, level: distance <= 1 ? "stop" : distance <= 2 ? "warning" : "clear" };
}
