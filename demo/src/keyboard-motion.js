import { yawQuaternion } from "./motion-sequence.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, target, step) => v + clamp(target - v, -step, step);
const mix = (a, b, t) => a + (b - a) * t;
const copy = (s) => ({ ...s, xy: s.xy.slice(), joints: s.joints.slice() });
// Extract one stride and remove the small residual mismatch at its seam.
export function gaitCycle(clip, start, end) {
  const n = end - start;
  const joints = clip.jointPos
    .slice(start, end)
    .map((q, i) =>
      q.map((v, k) => v - (i / n) * (clip.jointPos[end][k] - clip.jointPos[start][k])),
    );
  const heights = clip.rootPos
    .slice(start, end)
    .map((p, i) => p[2] - (i / n) * (clip.rootPos[end][2] - clip.rootPos[start][2]));
  const q = yawQuaternion(clip.rootQuat[start]),
    yaw = 2 * Math.atan2(q[3], q[0]);
  const delta = clip.rootPos[end].map((v, k) => v - clip.rootPos[start][k]);
  return {
    joints,
    heights,
    period: n / 50,
    speed: Math.abs((Math.cos(yaw) * delta[0] + Math.sin(yaw) * delta[1]) / (n / 50)),
  };
}
export class KeyboardMotion {
  constructor(config, forward, backward) {
    this.config = config;
    this.forward = gaitCycle(forward, 52, 103);
    this.backward = gaitCycle(backward, 51, 126);
    this.input = { move: 0, turn: 0 };
  }
  setInput(move, turn) {
    this.input = { move: clamp(move, -1, 1), turn: clamp(turn, -1, 1) };
  }
  clear() {
    this.setInput(0, 0);
  }
  begin(frame) {
    const q = yawQuaternion(frame.rootQuat);
    this.state = {
      xy: frame.rootPos.slice(0, 2),
      yaw: 2 * Math.atan2(q[3], q[0]),
      phase: 0,
      move: 0,
      turn: 0,
      weight: 0,
      joints: frame.jointPos.slice(),
      z: frame.rootPos[2],
    };
  }
  tick(state) {
    const s = copy(state),
      dt = this.config.controlDt;
    s.move = approach(s.move, this.input.move, dt * 1.4);
    s.turn = approach(s.turn, this.input.turn, dt * 2);
    const weight = Math.max(Math.abs(s.move), Math.abs(s.turn) * 0.65);
    s.weight = approach(s.weight, weight, dt * 1.5);
    const cycle = s.move < -0.02 ? this.backward : this.forward;
    s.phase = (s.phase + dt / cycle.period) % 1;
    const f = s.phase * cycle.joints.length,
      i = Math.floor(f),
      j = (i + 1) % cycle.joints.length,
      t = f - i;
    const a = 1 - Math.exp(-dt / 0.08);
    s.joints = s.joints.map((v, k) =>
      mix(
        v,
        mix(this.config.defaultPose[k], mix(cycle.joints[i][k], cycle.joints[j][k], t), s.weight),
        a,
      ),
    );
    s.z = mix(
      s.z,
      mix(this.config.defaultRootPos[2], mix(cycle.heights[i], cycle.heights[j], t), s.weight),
      a,
    );
    s.yaw += s.turn * 0.35 * dt;
    const speed = s.move * cycle.speed;
    s.xy[0] += Math.cos(s.yaw) * speed * dt;
    s.xy[1] += Math.sin(s.yaw) * speed * dt;
    return s;
  }
  frame(s = this.state) {
    return {
      jointPos: s.joints.slice(),
      rootPos: [...s.xy, s.z],
      rootQuat: [Math.cos(s.yaw / 2), 0, 0, Math.sin(s.yaw / 2)],
    };
  }
  // Preview future inputs without advancing the committed command state.
  preview(count) {
    const frames = [];
    let s = copy(this.state);
    for (let i = 0; i < count; i++) {
      s = this.tick(s);
      frames.push(this.frame(s));
    }
    return frames;
  }
  advance() {
    this.state = this.tick(this.state);
    return this.frame();
  }
  rebase(xy) {
    this.state.xy = xy.slice();
  }
}
