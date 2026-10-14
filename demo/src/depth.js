// Match deployment: pinhole metric image-plane depth -> mm -> clip -> crop -> bilinear resize.
export class DepthSensor {
  constructor(mj, model, config) {
    this.mj = mj;
    this.model = model;
    this.config = config;
    const c = model.cam("depth_cam");
    this.id = c.id;
    c.delete();
    this.hit = new mj.IntBuffer(18 * 32 * 4);
    this.normal = new mj.DoubleBuffer(18 * 32 * 4 * 3);
    this.distances = new mj.DoubleBuffer(18 * 32 * 4);
    const [h, w] = config.raw_size,
      [oh, ow] = config.target_size,
      [top, bottom, left, right] = config.crop_region;
    const fy = h / (2 * Math.tan((model.cam_fovy[this.id] * Math.PI) / 360));
    this.pixels = [];
    for (let y = 0; y < oh; y++)
      for (let x = 0; x < ow; x++) {
        const sx = ((x + 0.5) * (w - left - right)) / ow - 0.5 + left,
          sy = ((y + 0.5) * (h - top - bottom)) / oh - 0.5 + top;
        const x0 = Math.floor(sx),
          y0 = Math.floor(sy),
          tx = sx - x0,
          ty = sy - y0;
        this.pixels.push(
          [
            [x0, y0, (1 - tx) * (1 - ty)],
            [x0 + 1, y0, tx * (1 - ty)],
            [x0, y0 + 1, (1 - tx) * ty],
            [x0 + 1, y0 + 1, tx * ty],
          ].map(([px, py, weight]) => ({
            ray: [(px + 0.5 - w / 2) / fy, -(py + 0.5 - h / 2) / fy, -1],
            weight,
          })),
        );
      }
  }
  read(data) {
    const a = this.id * 9,
      m = data.cam_xmat,
      p = Array.from(data.cam_xpos.slice(this.id * 3, this.id * 3 + 3));
    const [near, far] = this.config.depth_range,
      out = new Float32Array(this.pixels.length);
    const rays = [];
    for (const samples of this.pixels)
      for (const { ray: r } of samples)
        rays.push(
          m[a] * r[0] + m[a + 1] * r[1] + m[a + 2] * r[2],
          m[a + 3] * r[0] + m[a + 4] * r[1] + m[a + 5] * r[2],
          m[a + 6] * r[0] + m[a + 7] * r[1] + m[a + 8] * r[2],
        );
    // Batch broad-phase work once for the entire image. Rays keep local z=-1.
    this.mj.mj_multiRay(
      this.model,
      data,
      p,
      rays,
      [1, 1, 1, 0, 0, 0],
      true,
      -1,
      this.hit,
      this.distances,
      this.normal,
      rays.length / 3,
      1e6,
    );
    const distances = this.distances.GetView();
    let j = 0,
      k = 0;
    for (const samples of this.pixels) {
      let value = 0;
      for (const { weight } of samples) {
        const distance = distances[k++];
        const metres = distance < 0 ? far : Math.floor(distance * 1000) / 1000;
        value +=
          (weight * (Math.max(near, Math.min(far, metres === 0 ? far : metres)) - near)) /
          (far - near);
      }
      out[j++] = value;
    }
    return out;
  }
  dispose() {
    this.hit.delete();
    this.normal.delete();
    this.distances.delete();
  }
}
