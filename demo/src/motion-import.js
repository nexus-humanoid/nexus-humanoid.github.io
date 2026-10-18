import { normalized } from "./observation.js";
import { slerp } from "./motion-sequence.js";
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_SECONDS = 120;
const fields = { rootPos: 3, rootQuat: 4, jointPos: 29 };

// Accept only explicit G1 joint trajectories; this is not a human-motion retargeter.
export function parseMotion(text, options, config) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_FILE_BYTES)
    throw Error("Motion file is too large (maximum 20 MB).");
  text = text.replace(/^\uFEFF/, "");
  let input;
  if (options.format === "json") {
    try {
      input = JSON.parse(text);
    } catch {
      throw Error("Could not read JSON. Check the motion format guide.");
    }
  } else if (options.format === "csv") {
    const order = options.quaternionOrder ?? "wxyz";
    if (!["wxyz", "xyzw"].includes(order)) throw Error("Choose WXYZ or XYZW quaternion order.");
    const lines = text
      .trim()
      .split(/\r?\n/)
      .filter((line) => line.trim());
    const rows = lines.map((line) => line.split(",").map((v) => v.trim()));
    const header = [
      "root_x",
      "root_y",
      "root_z",
      ...order.split("").map((k) => "root_q" + k),
      ...config.jointNames,
    ];
    if (rows[0]?.some((v) => v !== "" && !Number.isFinite(Number(v)))) {
      if (rows[0].length !== header.length || rows[0].some((v, i) => v !== header[i]))
        throw Error("CSV header must match the 36 columns in the format guide.");
      rows.shift();
    }
    input = { fps: options.fps, quaternionOrder: order, rootPos: [], rootQuat: [], jointPos: [] };
    for (const [i, row] of rows.entries()) {
      if (row.length !== 36 || row.some((v) => v === "" || !Number.isFinite(Number(v))))
        throw Error(`CSV row ${i + 1} must contain 36 finite numbers.`);
      const values = row.map(Number);
      input.rootPos.push(values.slice(0, 3));
      input.rootQuat.push(values.slice(3, 7));
      input.jointPos.push(values.slice(7));
    }
  } else throw Error("Choose a .json or .csv motion file.");
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Expected a motion object.");
  const fps = input.fps,
    n = input.rootPos?.length;
  if (typeof fps !== "number" || !Number.isFinite(fps) || fps < 1 || fps > 240)
    throw Error("Sample rate (fps) must be between 1 and 240 Hz.");
  if (!Number.isInteger(n) || n < 1) throw Error("Motion must contain at least one frame.");
  if (n / fps > MAX_SECONDS) throw Error("Motion duration must not exceed 120 seconds.");
  for (const [key, width] of Object.entries(fields)) {
    if (!Array.isArray(input[key]) || input[key].length !== n)
      throw Error(`${key} must have the same number of frames as rootPos.`);
    input[key].forEach((row, i) => {
      if (
        !Array.isArray(row) ||
        row.length !== width ||
        !row.every((v) => typeof v === "number" && Number.isFinite(v))
      )
        throw Error(`${key}, frame ${i + 1}: expected ${width} finite numbers.`);
    });
  }
  let jointOrder = config.jointNames.map((_, i) => i);
  if (input.jointNames !== undefined) {
    if (
      !Array.isArray(input.jointNames) ||
      input.jointNames.length !== 29 ||
      new Set(input.jointNames).size !== 29 ||
      config.jointNames.some((name) => !input.jointNames.includes(name))
    )
      throw Error("jointNames must contain each of the 29 G1 joint names exactly once.");
    jointOrder = config.jointNames.map((name) => input.jointNames.indexOf(name));
  }
  const order = input.quaternionOrder ?? "wxyz";
  if (!["wxyz", "xyzw"].includes(order)) throw Error("quaternionOrder must be wxyz or xyzw.");
  const quats = input.rootQuat.map((q, i) => {
    if (Math.hypot(...q) < 1e-6)
      throw Error(`rootQuat, frame ${i + 1}: quaternion must have nonzero length.`);
    return normalized(order === "xyzw" ? [q[3], ...q.slice(0, 3)] : q);
  });
  const targetFps = 1 / config.controlDt,
    count = Math.floor(((n - 1) * targetFps) / fps + 1e-8) + 1;
  const result = { fps: targetFps, rootPos: [], rootQuat: [], jointPos: [] },
    origin = input.rootPos[0];
  for (let i = 0; i < count; i++) {
    const at = Math.min(n - 1, (i * fps) / targetFps),
      a = Math.floor(at),
      b = Math.min(n - 1, a + 1),
      t = at - a;
    const interpolate = (key) => input[key][a].map((v, k) => v * (1 - t) + input[key][b][k] * t);
    result.rootPos.push(interpolate("rootPos").map((v, k) => (k < 2 ? v - origin[k] : v)));
    result.rootQuat.push(slerp(quats[a], quats[b], t));
    const joints = interpolate("jointPos");
    result.jointPos.push(jointOrder.map((k) => joints[k]));
  }
  if (Object.keys(fields).some((key) => result[key].some((row) => !row.every(Number.isFinite))))
    throw Error("Motion values exceed the supported numerical range.");
  return result;
}
