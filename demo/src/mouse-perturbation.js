const finitePoint = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export class MousePerturbation {
  constructor() {
    this.active = false;
    this.magnitude = 0;
  }
  begin(body, worldPoint, data) {
    this.clear(data);
    if (
      !Number.isInteger(body) ||
      body <= 0 ||
      body >= data.xpos.length / 3 ||
      !finitePoint(worldPoint)
    )
      throw Error("Choose a robot body and a finite grab point.");
    const offset = worldPoint.map((v, i) => v - data.xpos[body * 3 + i]),
      r = data.xmat,
      a = body * 9;
    this.localPoint = [0, 1, 2].map(
      (i) => r[a + i] * offset[0] + r[a + 3 + i] * offset[1] + r[a + 6 + i] * offset[2],
    );
    this.body = body;
    this.target = worldPoint.slice();
    this.previous = worldPoint.slice();
    this.active = true;
  }
  move(target) {
    if (!finitePoint(target)) throw Error("Drag target must be finite.");
    this.target = target.slice();
  }
  point(data) {
    if (!this.active) return null;
    const a = this.body * 9,
      r = data.xmat,
      p = this.localPoint;
    return [0, 1, 2].map(
      (i) =>
        data.xpos[this.body * 3 + i] +
        r[a + 3 * i] * p[0] +
        r[a + 3 * i + 1] * p[1] +
        r[a + 3 * i + 2] * p[2],
    );
  }
  apply(data, dt) {
    data.xfrc_applied.fill(0);
    if (!this.active) return;
    const point = this.point(data);
    const force = point.map(
      (v, i) => 200 * (this.target[i] - v) - (12 * (v - this.previous[i])) / dt,
    );
    this.previous = point;
    const length = Math.hypot(...force),
      scale = length > 150 ? 150 / length : 1;
    force.forEach((v, i) => {
      force[i] = v * scale;
    });
    this.magnitude = Math.min(length, 150);
    const lever = point.map((v, i) => v - data.xipos[this.body * 3 + i]),
      torque = cross(lever, force);
    // MuJoCo xfrc_applied uses world force then torque about the body's COM.
    data.xfrc_applied.set([...force, ...torque], this.body * 6);
  }
  clear(data) {
    this.active = false;
    this.magnitude = 0;
    data?.xfrc_applied?.fill(0);
  }
}
