import loadMujoco from "../vendor/@mujoco/mujoco/mujoco.js";
import { ObservationBuilder } from "./observation.js";
import { DepthSensor } from "./depth.js";
import { extendTerrain } from "./terrain-surround.js";
import { boundaryState } from "./boundary.js";
import { MotionSequence } from "./motion-sequence.js";
import { MousePerturbation } from "./mouse-perturbation.js";
export async function fetchChecked(url, type = "json") {
  const r = await fetch(url);
  if (!r.ok) throw Error(`Cannot load ${url}: HTTP ${r.status}`);
  return type === "bytes"
    ? new Uint8Array(await r.arrayBuffer())
    : type === "text"
      ? r.text()
      : r.json();
}
export class Simulation {
  constructor(config) {
    this.mousePerturbation = new MousePerturbation();
    this.config = config;
    this.obs = new ObservationBuilder(config);
    this.sequence = new MotionSequence(config);
    this.frame = 0;
    this.lastAction = new Float32Array(29);
  }
  async init(progress) {
    progress("Loading…");
    this.mj = await loadMujoco();
    this.mj.FS.mkdir("/demo");
    this.mj.FS.mkdir("/demo/meshes");
    progress("Loading…");
    const files = [...this.config.files, ...this.config.terrains.map((t) => t.file)];
    await Promise.all(
      files.map(async (f) =>
        this.mj.FS.writeFile("/demo/" + f, await fetchChecked("public/assets/" + f, "bytes")),
      ),
    );
  }
  loadTerrain(id) {
    const terrain =
      id === "custom" ? this.customTerrain : this.config.terrains.find((t) => t.id === id);
    if (!terrain) throw Error("Unknown terrain");
    this.installTerrain(terrain);
  }
  loadCustomTerrain(generated) {
    const previous = this.customTerrain;
    const terrain = {
      id: "custom",
      file: "custom.xml",
      bounds: generated.bounds,
      config: generated.config,
      xml: generated.xml,
    };
    this.mj.FS.writeFile("/demo/custom.xml", new TextEncoder().encode(generated.xml));
    try {
      this.installTerrain(terrain);
    } catch (error) {
      if (previous)
        this.mj.FS.writeFile("/demo/custom.xml", new TextEncoder().encode(previous.xml));
      else this.mj.FS.unlink("/demo/custom.xml");
      throw error;
    }
    this.customTerrain = terrain;
  }
  installTerrain(terrain) {
    this.mousePerturbation.clear(this.data);
    // Prepare every model-dependent resource before replacing the working scene.
    let model, data, depth, joints, actuators, surround;
    try {
      model = this.mj.MjModel.from_xml_path("/demo/" + terrain.file);
      data = new this.mj.MjData(model);
      const original = this.mj.FS.readFile("/demo/" + terrain.file, { encoding: "utf8" });
      surround = extendTerrain(this.mj, model, data, terrain.bounds, original);
      this.mj.FS.writeFile("/demo/extended.xml", new TextEncoder().encode(surround.xml));
      const extended = this.mj.MjModel.from_xml_path("/demo/extended.xml");
      data.delete();
      model.delete();
      model = extended;
      data = undefined;
      data = new this.mj.MjData(model);
      joints = this.config.jointNames.map((name) => {
        const j = model.jnt(name),
          id = j.id;
        j.delete();
        return { q: model.jnt_qposadr[id], v: model.jnt_dofadr[id], id };
      });
      actuators = joints.map((j) => {
        for (let i = 0; i < model.nu; i++) if (model.actuator_trnid[2 * i] === j.id) return i;
        throw Error("Missing actuator mapping");
      });
      depth = new DepthSensor(this.mj, model, this.config.camera);
    } catch (error) {
      depth?.dispose();
      data?.delete();
      model?.delete();
      throw error;
    }
    this.depth?.dispose();
    this.data?.delete();
    this.model?.delete();
    Object.assign(this, {
      model,
      data,
      depth,
      joints,
      actuators,
      terrainId: terrain.id,
      terrainBounds: terrain.bounds,
      bounds: surround.bounds,
      surroundHeight: surround.height,
    });
  }
  reset() {
    this.mousePerturbation.clear(this.data);
    this.keyboardEnabled = false;
    this.keyboardDriver?.clear();
    this.boundaryStopped = false;
    this.sequence.reset();
    const initial = this.sequence.defaultFrame();
    this.mj.mj_resetData(this.model, this.data);
    this.obs.reset();
    this.lastAction.fill(0);
    this.frame = 0;
    this.data.qpos.set(initial.rootPos, 0);
    this.data.qpos.set(initial.rootQuat, 3);
    this.data.qvel.fill(0);
    this.joints.forEach((j, i) => {
      this.data.qpos[j.q] = initial.jointPos[i];
    });
    this.mj.mj_forward(this.model, this.data);
    this.camera = this.depth.read(this.data);
  }
  recover() {
    this.mousePerturbation.clear(this.data);
    if (this.boundaryStopped || this.boundary.level === "stop")
      throw Error("Use Reset scene at the terrain boundary");
    const xy = Array.from(this.data.qpos.slice(0, 2)),
      ref = this.sequence.frame();
    if (!xy.every(Number.isFinite)) throw Error("Use Reset scene for an invalid robot position");
    // Move the command trajectory with the robot, retaining phase and playback index.
    const shift = xy.map((v, i) => v - ref.rootPos[i]);
    for (const p of this.sequence.motion.rootPos) {
      p[0] += shift[0];
      p[1] += shift[1];
    }
    if (this.sequence.keyboard) this.sequence.keyboard.rebase(xy);
    const time = this.data.time;
    this.mj.mj_resetData(this.model, this.data);
    this.data.time = time;
    this.data.qpos.set([xy[0], xy[1], ref.rootPos[2]], 0);
    this.data.qpos.set(ref.rootQuat, 3);
    this.joints.forEach((j, i) => {
      this.data.qpos[j.q] = ref.jointPos[i];
    });
    this.mj.mj_forward(this.model, this.data);
    // Sample terrain under the pelvis and both feet, including their footprint.
    const points = [xy];
    for (const name of ["left_ankle_roll_link", "right_ankle_roll_link"]) {
      const body = this.model.body(name),
        id = body.id;
      body.delete();
      const x = this.data.xpos[id * 3],
        y = this.data.xpos[id * 3 + 1];
      for (const dx of [-0.1, 0, 0.1])
        for (const dy of [-0.06, 0, 0.06]) points.push([x + dx, y + dy]);
    }
    const hit = new this.mj.IntBuffer(1),
      normal = new this.mj.DoubleBuffer(3);
    let ground = -Infinity;
    try {
      for (const [x, y] of points) {
        const distance = this.mj.mj_ray(
          this.model,
          this.data,
          [x, y, 100],
          [0, 0, -1],
          [1, 0, 0, 0, 0, 0],
          true,
          -1,
          hit,
          normal,
        );
        if (distance >= 0) ground = Math.max(ground, 100 - distance);
      }
    } finally {
      hit.delete();
      normal.delete();
    }
    if (!Number.isFinite(ground)) throw Error("No terrain support here — use Reset scene");
    this.data.qpos[2] += ground + 0.02;
    this.obs.reset();
    this.lastAction.fill(0);
    this.mj.mj_forward(this.model, this.data);
    this.camera = this.depth.read(this.data);
  }
  startMotion(motion, label) {
    if (this.boundaryStopped) return false;
    return this.sequence.start(motion, label, this.config.transitionSteps, true);
  }
  returnDefault() {
    if (this.boundaryStopped) return false;
    return this.sequence.returnDefault();
  }
  observation() {
    if (this.keyboardEnabled && this.sequence.phase !== "keyboard")
      this.sequence.beginKeyboard(this.keyboardDriver);
    if (!this.keyboardEnabled && this.sequence.phase === "keyboard") this.sequence.endKeyboard();
    this.sequence.previewKeyboard();
    const d = this.data;
    return this.obs.build(this.sequence.motion, this.sequence.index, {
      quat: Array.from(d.qpos.slice(3, 7)),
      gyro: Array.from(d.qvel.slice(3, 6)),
      q: this.joints.map((j) => d.qpos[j.q]),
      dq: this.joints.map((j) => d.qvel[j.v]),
      action: Array.from(this.lastAction),
    });
  }
  get boundary() {
    return boundaryState(this.bounds, this.data.qpos);
  }
  apply(action) {
    if (this.boundaryStopped || this.boundary.level === "stop") {
      this.mousePerturbation.clear(this.data);
      this.boundaryStopped = true;
      return;
    }
    if (action.length !== 29 || !action.every(Number.isFinite))
      throw Error("Policy returned invalid actions");
    const cfg = this.config,
      d = this.data,
      m = this.model;
    this.lastAction.set(action.map((v) => Math.max(-cfg.actionClip, Math.min(cfg.actionClip, v))));
    const targets = cfg.defaultPose.map((p, i) => p + cfg.actionScale[i] * this.lastAction[i]);
    for (let step = 0; step < Math.round(cfg.controlDt / cfg.physicsDt); step++) {
      for (let i = 0; i < 29; i++) {
        const j = this.joints[i],
          a = this.actuators[i],
          torque = cfg.kp[i] * (targets[i] - d.qpos[j.q]) - cfg.kd[i] * d.qvel[j.v];
        d.ctrl[a] = Math.max(
          m.actuator_forcerange[2 * a],
          Math.min(m.actuator_forcerange[2 * a + 1], torque),
        );
      }
      this.mousePerturbation.apply(d, cfg.physicsDt);
      this.mj.mj_step(m, d);
      if (this.boundary.level === "stop") {
        this.mousePerturbation.clear(d);
        this.boundaryStopped = true;
        break;
      }
    }
    if (!Array.from(d.qpos).every(Number.isFinite) || !Array.from(d.qvel).every(Number.isFinite))
      throw Error("Nonfinite simulation state — reset required");
    this.mj.mj_forward(m, d);
    this.frame++;
    this.sequence.advance();
    this.camera = this.depth.read(d);
  }
  get phase() {
    return this.sequence.phase;
  }
}
