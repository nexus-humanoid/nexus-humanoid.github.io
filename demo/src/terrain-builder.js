// Square terrain cells, centered on a ground-zero spawn. Python cfg units are metres.
export const DEFAULT_TERRAIN = {
  type: "stairs",
  size: 20,
  platform: 1,
  stepHeight: 0.1,
  stepWidth: 0.3,
  slope: 0.3,
  inverted: false,
  amplitude: 0.05,
  roughSpacing: 0.4,
  seed: 42,
  wavelength: 2,
  boxWidth: 1.2,
  boxGap: 0.35,
  boxHeight: 0.15,
  boxRelief: "mixed",
};
export const TERRAIN_STEPS = {
  size: 0.5,
  platform: 0.1,
  stepHeight: 0.01,
  stepWidth: 0.01,
  slope: 0.01,
  amplitude: 0.01,
  roughSpacing: 0.1,
  seed: 1,
  wavelength: 0.1,
  boxWidth: 0.05,
  boxGap: 0.05,
  boxHeight: 0.01,
};
export const TERRAIN_FIELDS = {
  flat: ["size"],
  stairs: ["size", "platform", "stepHeight", "stepWidth"],
  slope: ["size", "platform", "slope"],
  boxes: ["size", "platform", "boxWidth", "boxGap", "boxHeight", "seed"],
  rough: ["size", "platform", "amplitude", "roughSpacing", "seed"],
  wave: ["size", "platform", "amplitude", "wavelength"],
};
export function validateTerrain(input) {
  const c = { ...DEFAULT_TERRAIN, ...input };
  if (!Object.hasOwn(TERRAIN_FIELDS, c.type)) throw Error("Choose a supported terrain type.");
  if (c.type === "boxes" && !["raised", "recessed", "mixed"].includes(c.boxRelief))
    throw Error("Choose a platform relief mode.");
  const active = TERRAIN_FIELDS[c.type];
  for (const key of Object.keys(TERRAIN_STEPS))
    if (!active.includes(key)) c[key] = DEFAULT_TERRAIN[key];
  if (!["stairs", "slope"].includes(c.type)) c.inverted = false;
  if (typeof c.inverted !== "boolean") throw Error("Choose a terrain direction.");
  for (const key of active)
    if (typeof c[key] !== "number" || !Number.isFinite(c[key]))
      throw Error(`${key} must be a finite number.`);
  for (const key of ["size", "stepWidth", "roughSpacing", "wavelength", "boxWidth"])
    if (active.includes(key) && c[key] <= 0) throw Error(`${key} must be positive.`);
  for (const key of ["platform", "stepHeight", "slope", "amplitude", "boxGap", "boxHeight"])
    if (active.includes(key) && c[key] < 0) throw Error(`${key} cannot be negative.`);
  if (c.type === "boxes" && -c.size / 2 + c.boxWidth + c.boxGap === -c.size / 2)
    throw Error(
      "Box spacing cannot be represented at this terrain width with floating point precision.",
    );
  if (!Number.isInteger(c.seed)) throw Error("Random seed must be a whole number.");
  if (active.includes("platform") && c.platform >= c.size)
    throw Error("Central platform must fit inside the terrain patch.");
  if (["slope", "rough", "wave"].includes(c.type) && Math.trunc(c.size / 0.1) < 2)
    throw Error("Heightfield terrain needs at least two 0.1 m samples.");
  return c;
}
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
// NumPy rint uses ties-to-even, including negative half-integers.
function rint(x) {
  const lo = Math.floor(x),
    f = x - lo;
  return f === 0.5 ? (lo % 2 === 0 ? lo : lo + 1) : Math.round(x);
}
export function buildTerrain(input) {
  const c = validateTerrain(input),
    half = c.size / 2,
    boxes = [],
    features = [];
  let asset = "",
    geoms = "",
    heights = [];
  function box(x, y, z, sx, sy, sz) {
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    boxes.push({ pos: [x, y, z], size: [sx, sy, sz] });
    geoms += `<geom type="box" pos="${x} ${y} ${z}" size="${sx} ${sy} ${sz}" group="0" friction=".75 .1 .1" rgba=".45 .58 .68 1"/>`;
  }
  if (c.type === "flat") box(0, 0, -0.1, half, half, 0.1);
  if (c.type === "boxes") {
    // Partition the ground into cells so recessed rectangles have real open tops.
    // A solid slab under the entire patch would incorrectly fill every depression.
    const random = seededRandom(c.seed),
      stride = c.boxWidth + c.boxGap;
    const clearance = c.platform / 2 + 0.2,
      base = -c.boxHeight - 0.2;
    function slab(x0, x1, y0, y1, top = 0) {
      box(
        (x0 + x1) / 2,
        (y0 + y1) / 2,
        (base + top) / 2,
        (x1 - x0) / 2,
        (y1 - y0) / 2,
        (top - base) / 2,
      );
    }
    for (let y = -half; y < half - 1e-8; y += stride)
      for (let x = -half; x < half - 1e-8; x += stride) {
        const right = Math.min(half, x + stride),
          far = Math.min(half, y + stride);
        const width = c.boxWidth * (0.5 + 0.5 * random()),
          depth = c.boxWidth * (0.5 + 0.5 * random());
        const x0 = x + c.boxGap / 2 + random() * (c.boxWidth - width),
          x1 = x0 + width;
        const y0 = y + c.boxGap / 2 + random() * (c.boxWidth - depth),
          y1 = y0 + depth;
        const occupied = random() < 0.72;
        const magnitude = ((1 + Math.floor(random() * 3)) * c.boxHeight) / 3;
        const sign =
          c.boxRelief === "raised" ? 1 : c.boxRelief === "recessed" ? -1 : random() < 0.5 ? -1 : 1;
        if (
          !occupied ||
          !magnitude ||
          x0 < -half + 0.5 ||
          x1 > half - 0.5 ||
          y0 < -half + 0.5 ||
          y1 > half - 0.5 ||
          x1 > right ||
          y1 > far ||
          (x0 < clearance && x1 > -clearance && y0 < clearance && y1 > -clearance)
        ) {
          slab(x, right, y, far);
          continue;
        }
        slab(x, x0, y, far);
        slab(x1, right, y, far);
        slab(x0, x1, y, y0);
        slab(x0, x1, y1, far);
        slab(x0, x1, y0, y1, sign * magnitude);
        features.push({ bounds: [x0, x1, y0, y1], height: sign * magnitude });
      }
  }
  if (c.type === "stairs") {
    const n = Math.floor((c.size - c.platform) / (2 * c.stepWidth)),
      sign = c.inverted ? 1 : -1;
    const base = Math.min(0, sign * n * c.stepHeight) - 0.2;
    for (let k = 0; k < n; k++) {
      const outer = half - k * c.stepWidth,
        inner = outer - c.stepWidth;
      const top = sign * (n - k) * c.stepHeight,
        z = (base + top) / 2,
        h = (top - base) / 2;
      box(0, outer - c.stepWidth / 2, z, outer, c.stepWidth / 2, h);
      box(0, -outer + c.stepWidth / 2, z, outer, c.stepWidth / 2, h);
      box(outer - c.stepWidth / 2, 0, z, c.stepWidth / 2, inner, h);
      box(-outer + c.stepWidth / 2, 0, z, c.stepWidth / 2, inner, h);
    }
    const central = half - n * c.stepWidth;
    box(0, 0, base / 2, central, central, -base / 2);
  }
  if (c.type === "slope") {
    // Match mjlab HfPyramidSlopedTerrainCfg: 0.1 m grid, 5 mm quantization,
    // bilinear ridge profile clipped at the platform, rather than a conical ramp.
    const pixels = Math.trunc(c.size / 0.1),
      center = Math.trunc(pixels / 2);
    const peak = Math.trunc(((c.inverted ? -1 : 1) * c.slope * c.size) / 2 / 0.005);
    const platformPixels = Math.trunc(c.platform / 0.1 / 2),
      factor = (center - platformPixels) / center;
    const cap = peak * factor * factor,
      origin = rint(cap) * 0.005;
    for (let row = 0; row < pixels; row++)
      for (let col = 0; col < pixels; col++) {
        const raw =
          peak *
          ((center - Math.abs(center - row)) / center) *
          ((center - Math.abs(center - col)) / center);
        heights.push(
          rint(Math.max(Math.min(0, cap), Math.min(Math.max(0, cap), raw))) * 0.005 - origin,
        );
      }
  }
  if (c.type === "rough" || c.type === "wave") {
    const pixels = Math.trunc(c.size / 0.1),
      spacing = c.size / (pixels - 1);
    const random = seededRandom(c.seed);
    const coarseCount = Math.ceil(c.size / c.roughSpacing) + 1;
    const coarse =
      c.type === "rough"
        ? Array.from(
            { length: coarseCount * coarseCount },
            () => rint(((2 * random() - 1) * c.amplitude) / 0.005) * 0.005,
          )
        : null;
    for (let row = 0; row < pixels; row++)
      for (let col = 0; col < pixels; col++) {
        const x = col * spacing - half,
          y = row * spacing - half;
        let raw;
        if (c.type === "rough") {
          // Seeded bilinear height noise: bounded interpolation without spline overshoot.
          const gx = (x + half) / c.roughSpacing,
            gy = (y + half) / c.roughSpacing;
          const ix = Math.min(Math.floor(gx), coarseCount - 2),
            iy = Math.min(Math.floor(gy), coarseCount - 2),
            tx = gx - ix,
            ty = gy - iy;
          const at = (dx, dy) => coarse[(iy + dy) * coarseCount + ix + dx];
          raw =
            (at(0, 0) * (1 - tx) + at(1, 0) * tx) * (1 - ty) +
            (at(0, 1) * (1 - tx) + at(1, 1) * tx) * ty;
        } else {
          const k = (2 * Math.PI) / c.wavelength;
          raw = 0.5 * c.amplitude * (Math.cos(k * y) + Math.sin(k * x));
        }
        // Extra one-cell collar keeps interpolation triangles off the spawn platform.
        const t = Math.max(
          0,
          Math.min(1, (Math.max(Math.abs(x), Math.abs(y)) - c.platform / 2 - spacing) / 0.5),
        );
        const edge = Math.max(0, Math.min(1, (half - Math.max(Math.abs(x), Math.abs(y))) / 0.5));
        const blend = t * t * (3 - 2 * t) * edge * edge * (3 - 2 * edge);
        heights.push(
          Math.max(-c.amplitude, Math.min(c.amplitude, rint((raw * blend) / 0.005) * 0.005)) || 0,
        );
      }
  }
  if (heights.length) {
    const pixels = Math.trunc(c.size / 0.1);
    let min = Infinity,
      max = -Infinity;
    for (const h of heights) {
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    const range = Math.max(0.005, max - min),
      xmlHeights = [];
    // MJCF elevation text lists rows top-to-bottom; MuJoCo's hfield buffer
    // and mjlab userdata are bottom-to-top. Reverse rows when serializing.
    for (let row = pixels - 1; row >= 0; row--)
      for (let col = 0; col < pixels; col++)
        xmlHeights.push((heights[row * pixels + col] - min) / range);
    const values = xmlHeights.join(" ");
    asset = `<asset><hfield name="custom_surface" nrow="${pixels}" ncol="${pixels}" size="${half} ${half} ${range} ${Math.max(0.1, range)}" elevation="${values}"/></asset>`;
    geoms = `<geom type="hfield" hfield="custom_surface" pos="0 0 ${min}" group="0" friction=".75 .1 .1" rgba=".45 .58 .68 1"/>`;
  }
  const xml = `<mujoco model="Custom terrain"><include file="g1.xml"/><option timestep=".002" integrator="implicitfast"/>${asset}<worldbody><body name="terrain">${geoms}</body></worldbody></mujoco>`;
  return {
    config: c,
    xml,
    bounds: [-half, half, -half, half],
    heightAtCenter: 0,
    boxes,
    heights,
    features,
  };
}
