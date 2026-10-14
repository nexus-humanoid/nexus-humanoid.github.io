import { multiply, conjugate, rotate, normalized } from "./observation.js";
const fields = ["jointPos", "rootPos", "rootQuat"];
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export function yawQuaternion(q) {
  const [w, x, y, z] = normalized(q),
    yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  return [Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)];
}
export function slerp(a, b, t) {
  a = normalized(a);
  b = normalized(b);
  let dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  if (dot < 0) {
    b = b.map((v) => -v);
    dot = -dot;
  }
  if (dot > 0.9995) return normalized(lerp(a, b, t));
  const angle = Math.acos(Math.min(1, dot)),
    den = Math.sin(angle);
  return a.map((v, i) => (Math.sin((1 - t) * angle) * v + Math.sin(t * angle) * b[i]) / den);
}
export function alignMotion(motion, anchor) {
  const delta = multiply(
      yawQuaternion(anchor.rootQuat),
      conjugate(yawQuaternion(motion.rootQuat[0])),
    ),
    p0 = motion.rootPos[0];
  return {
    jointPos: motion.jointPos.map((row) => row.slice()),
    rootQuat: motion.rootQuat.map((q) => normalized(multiply(delta, q))),
    rootPos: motion.rootPos.map((p) => {
      const result = rotate(
        delta,
        p.map((v, i) => v - p0[i]),
      ).map((v, i) => v + anchor.rootPos[i]);
      result[2] = p[2];
      return result;
    }),
  };
}
export class MotionSequence {
  constructor(config) {
    this.config = config;
    this.keep = Math.max(0, ...config.offsets.map((v) => -v)) + 2;
    this.reset();
  }
  defaultFrame() {
    return {
      jointPos: this.config.defaultPose.slice(),
      rootPos: this.config.defaultRootPos.slice(),
      rootQuat: this.config.defaultRootQuat.slice(),
    };
  }
  reset() {
    this.pendingMotion = null;
    this.keyboard = null;
    const d = this.defaultFrame();
    this.motion = Object.fromEntries(
      fields.map((k) => [k, Array.from({ length: this.keep }, () => d[k].slice())]),
    );
    this.index = this.keep - 1;
    this.phase = "default";
    this.label = "Default";
  }
  frame(index = this.index) {
    return Object.fromEntries(fields.map((k) => [k, this.motion[k][index].slice()]));
  }
  appendAligned(motion, n = this.config.transitionSteps) {
    const anchor = this.frame(this.motion.rootPos.length - 1),
      aligned = alignMotion(motion, anchor);
    const start = this.motion.rootPos.length;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      this.motion.jointPos.push(lerp(anchor.jointPos, aligned.jointPos[0], t));
      this.motion.rootPos.push(lerp(anchor.rootPos, aligned.rootPos[0], t));
      this.motion.rootQuat.push(slerp(anchor.rootQuat, aligned.rootQuat[0], t));
    }
    for (let i = 0; i < aligned.rootPos.length; i++)
      for (const k of fields) this.motion[k].push(aligned[k][i]);
    return { start: start + n, end: this.motion.rootPos.length - 1 };
  }
  start(motion, label, transitionSteps = this.config.transitionSteps, replace = false) {
    if (this.phase !== "default" && !replace) return false;
    if (!motion.rootPos.length || fields.some((k) => motion[k].length !== motion.rootPos.length))
      throw Error("Invalid motion frames");
    this.keyboard?.clear();
    this.keyboard = null;
    this.pendingMotion = null;
    // Preserve the entire negative-offset command window; proprioceptive history lives in the controller.
    const drop = Math.max(0, this.index - this.keep + 1);
    for (const k of fields) this.motion[k] = this.motion[k].slice(drop, this.index + 1);
    this.index -= drop;
    const range = this.appendAligned(motion, transitionSteps);
    this.clipStart = range.start;
    this.clipEnd = range.end;
    this.label = label;
    this.phase = "entering";
    return true;
  }
  returnDefault() {
    if (this.phase === "default" || this.phase === "returning") return false;
    // Stop only the reference stream. Never overwrite physics or observation history.
    for (const k of fields) this.motion[k] = this.motion[k].slice(0, this.index + 1);
    const d = this.defaultFrame();
    this.appendAligned(Object.fromEntries(fields.map((k) => [k, [d[k]]])));
    this.phase = "returning";
    return true;
  }
  beginKeyboard(driver) {
    if (this.phase === "keyboard") return true;
    if (["entering", "motion"].includes(this.phase)) {
      this.pendingMotion = {
        label: this.label,
        motion: Object.fromEntries(
          fields.map((k) => [
            k,
            this.motion[k]
              .slice(Math.max(this.index + 1, this.clipStart), this.clipEnd + 1)
              .map((row) => row.slice()),
          ]),
        ),
      };
    }
    for (const k of fields) this.motion[k] = this.motion[k].slice(0, this.index + 1);
    driver.begin(this.frame());
    this.keyboard = driver;
    this.phase = "keyboard";
    this.label = "Keyboard";
    this.previewKeyboard();
    return true;
  }
  previewKeyboard() {
    if (this.phase !== "keyboard") return;
    for (const k of fields) this.motion[k] = this.motion[k].slice(0, this.index + 1);
    for (const frame of this.keyboard.preview(Math.max(...this.config.offsets, 1)))
      for (const k of fields) this.motion[k].push(frame[k]);
  }
  endKeyboard() {
    if (this.phase !== "keyboard") return;
    this.keyboard.clear();
    this.keyboard = null;
    this.returnDefault();
  }
  advance() {
    if (this.phase === "keyboard") {
      const frame = this.keyboard.advance();
      for (const k of fields) {
        this.motion[k] = this.motion[k].slice(0, this.index + 1);
        this.motion[k].push(frame[k]);
        if (this.motion[k].length > this.keep) this.motion[k].shift();
      }
      this.index = this.motion.rootPos.length - 1;
      this.previewKeyboard();
      return;
    }
    if (this.phase === "default") return;
    if (this.index < this.motion.rootPos.length - 1) this.index++;
    if (this.phase === "entering" && this.index >= this.clipStart) this.phase = "motion";
    if (this.phase === "motion" && this.index >= this.clipEnd) this.returnDefault();
    else if (this.phase === "returning" && this.index >= this.motion.rootPos.length - 1) {
      this.phase = "default";
      this.label = "Default";
      const pending = this.pendingMotion;
      this.pendingMotion = null;
      if (pending?.motion.rootPos.length) this.start(pending.motion, pending.label);
    }
  }
}
