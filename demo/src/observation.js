// Quaternion convention throughout is MuJoCo wxyz; histories oldest first.
export const conjugate = (q) => [q[0], -q[1], -q[2], -q[3]];
export function multiply(a, b) {
  const [w, x, y, z] = a,
    [v, i, j, k] = b;
  return [
    w * v - x * i - y * j - z * k,
    w * i + x * v + y * k - z * j,
    w * j - x * k + y * v + z * i,
    w * k + x * j - y * i + z * v,
  ];
}
export function rotate(q, v) {
  return multiply(multiply(q, [0, ...v]), conjugate(q)).slice(1);
}
export function normalized(q) {
  const n = Math.hypot(...q);
  if (!Number.isFinite(n) || n < 1e-9) throw Error("Invalid quaternion");
  return q.map((x) => x / n);
}
export function rot6d(q) {
  const [w, x, y, z] = normalized(q);
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - z * w),
    2 * (x * y + z * w),
    1 - 2 * (x * x + z * z),
    2 * (x * z - y * w),
    2 * (y * z + x * w),
  ];
}
export class ObservationBuilder {
  constructor(config) {
    this.config = config;
    this.reset();
  }
  reset() {
    this.histories = null;
  }
  build(motion, index, state) {
    for (const [key, size] of [
      ["quat", 4],
      ["gyro", 3],
      ["q", 29],
      ["dq", 29],
      ["action", 29],
    ]) {
      if (state[key]?.length !== size || !state[key].every(Number.isFinite))
        throw Error(`Expected finite ${key}[${size}]`);
    }
    const q = normalized(state.quat),
      indices = this.config.offsets.map((o) =>
        Math.max(0, Math.min(motion.rootPos.length - 1, index + o)),
      );
    const first = indices[0],
      refq = normalized(motion.rootQuat[first]),
      obs = [];
    for (const i of indices.slice(1))
      obs.push(
        ...rotate(
          conjugate(refq),
          motion.rootPos[i].map((v, k) => v - motion.rootPos[first][k]),
        ),
      );
    for (const i of indices)
      obs.push(...rot6d(multiply(conjugate(q), normalized(motion.rootQuat[i]))));
    for (const i of indices) obs.push(...motion.jointPos[i]);
    for (const i of indices) obs.push(motion.rootPos[i][2]);
    for (const i of indices)
      obs.push(...rotate(conjugate(normalized(motion.rootQuat[i])), [0, 0, -1]));
    const values = [
      state.gyro,
      rotate(conjugate(q), [0, 0, -1]),
      state.q.map((v, i) => v - this.config.defaultPose[i]),
      state.dq,
      state.action,
    ];
    if (!this.histories)
      this.histories = values.map((v) =>
        Array.from({ length: this.config.history }, () => Array.from(v)),
      );
    else
      values.forEach((v, i) => {
        this.histories[i].shift();
        this.histories[i].push(Array.from(v));
      });
    for (const hist of this.histories) for (const frame of hist) obs.push(...frame);
    if (obs.length !== 1473 || !obs.every(Number.isFinite))
      throw Error("Invalid observation: expected 1473 finite values");
    return Float32Array.from(obs);
  }
}
