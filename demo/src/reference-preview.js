import { Viewer } from "./viewer.js";

// Independent kinematic data: reference visualization must never write physics state.
export class ReferencePreview {
  constructor(canvas, mj, config) {
    this.mj = mj;
    this.config = config;
    this.model = mj.MjModel.from_xml_path("/demo/g1.xml");
    this.data = new mj.MjData(this.model);
    this.joints = config.jointNames.map((name) => {
      const joint = this.model.jnt(name),
        address = this.model.jnt_qposadr[joint.id];
      joint.delete();
      return address;
    });
    this.viewer = new Viewer(canvas, { reference: true });
    this.viewer.build(this.model);
  }
  sync(frame) {
    // Center planar translation while retaining reference height and orientation.
    this.data.qpos.set([0, 0, frame.rootPos[2]], 0);
    this.data.qpos.set(frame.rootQuat, 3);
    this.joints.forEach((address, i) => {
      this.data.qpos[address] = frame.jointPos[i];
    });
    this.mj.mj_forward(this.model, this.data);
    this.viewer.sync(this.data);
  }
  render() {
    this.viewer.render();
  }
}
