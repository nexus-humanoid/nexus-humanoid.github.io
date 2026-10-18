const EXTENT = 1000,
  APRON = 1;
export function createSurround(bounds, edges) {
  const [x0, x1, y0, y1] = bounds,
    all = Object.values(edges).flat();
  if (!all.length || !all.every(Number.isFinite))
    throw Error("Cannot determine terrain edge heights.");
  const height = all.reduce((a, b) => a + b, 0) / all.length;
  const patches = [],
    floor = [];
  let asset = "",
    geoms = "";
  function box(name, a, b, c, d, z) {
    geoms += `<geom name="outskirts_${name}" type="box" group="0" pos="${(a + b) / 2} ${(c + d) / 2} ${z - 0.1}" size="${(b - a) / 2} ${(d - c) / 2} .1" friction=".75 .1 .1"/>`;
  }
  function patch(name, a, b, c, d, rows, cols, heights) {
    patches.push({ name, x0: a, x1: b, y0: c, y1: d, rows, cols, heights });
    const min = Math.min(...heights),
      max = Math.max(...heights),
      range = max - min;
    if (range < 1e-8) {
      box(name, a, b, c, d, min);
      return;
    }
    const values = [];
    for (let r = rows - 1; r >= 0; r--)
      for (let col = 0; col < cols; col++) values.push((heights[r * cols + col] - min) / range);
    asset += `<hfield name="outskirts_${name}" nrow="${rows}" ncol="${cols}" size="${(b - a) / 2} ${(d - c) / 2} ${range} .2" elevation="${values.join(" ")}"/>`;
    geoms += `<geom name="outskirts_${name}" type="hfield" hfield="outskirts_${name}" group="0" pos="${(a + b) / 2} ${(c + d) / 2} ${min}" friction=".75 .1 .1"/>`;
  }
  const { north, south, east, west } = edges;
  patch("north", x0, x1, y1, y1 + APRON, 2, north.length, [...north, ...north.map(() => height)]);
  patch("south", x0, x1, y0 - APRON, y0, 2, south.length, [...south.map(() => height), ...south]);
  patch(
    "east",
    x1,
    x1 + APRON,
    y0,
    y1,
    east.length,
    2,
    east.flatMap((v) => [v, height]),
  );
  patch(
    "west",
    x0 - APRON,
    x0,
    y0,
    y1,
    west.length,
    2,
    west.flatMap((v) => [height, v]),
  );
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const heights = Array(4).fill(height),
        r = sy < 0 ? 1 : 0,
        c = sx < 0 ? 1 : 0;
      const samples = sy < 0 ? south : north;
      heights[r * 2 + c] = samples[sx < 0 ? 0 : samples.length - 1];
      patch(
        `corner_${sx}_${sy}`,
        sx < 0 ? x0 - APRON : x1,
        sx < 0 ? x0 : x1 + APRON,
        sy < 0 ? y0 - APRON : y1,
        sy < 0 ? y0 : y1 + APRON,
        2,
        2,
        heights,
      );
    }
  function outer(name, a, b, c, d) {
    floor.push({ x0: a, x1: b, y0: c, y1: d });
    box(name, a, b, c, d, height);
  }
  outer("far_north", -EXTENT, EXTENT, y1 + APRON, EXTENT);
  outer("far_south", -EXTENT, EXTENT, -EXTENT, y0 - APRON);
  outer("far_east", x1 + APRON, EXTENT, y0 - APRON, y1 + APRON);
  outer("far_west", -EXTENT, x0 - APRON, y0 - APRON, y1 + APRON);
  return { bounds: [-EXTENT, EXTENT, -EXTENT, EXTENT], height, patches, floor, asset, geoms };
}
export function extendTerrain(mj, model, data, bounds, xml) {
  mj.mj_forward(model, data);
  // The preset flat scene already has an infinite collision plane.
  for (let i = 0; i < model.ngeom; i++)
    if (model.geom_type[i] === 0 && model.geom_group[i] === 0) {
      // MuJoCo ray queries respect the finite plane size even when contact is infinite.
      xml = xml.replace(/<geom\b[^>]*>/g, (tag) =>
        tag.includes('type="plane"')
          ? tag.replace(/size="[^"]*"/, `size="${EXTENT} ${EXTENT} .1"`)
          : tag,
      );
      return { bounds: [-EXTENT, EXTENT, -EXTENT, EXTENT], height: data.geom_xpos[i * 3 + 2], xml };
    }
  const [x0, x1, y0, y1] = bounds,
    eps = 1e-6;
  const nx = Math.ceil((x1 - x0) / 0.1) + 1,
    ny = Math.ceil((y1 - y0) / 0.1) + 1;
  const hit = new mj.IntBuffer(1),
    normal = new mj.DoubleBuffer(3);
  const edge = (n, point) =>
    Array.from({ length: n }, (_, i) => {
      const [x, y] = point(i / (n - 1));
      const distance = mj.mj_ray(
        model,
        data,
        [x, y, 100],
        [0, 0, -1],
        [1, 0, 0, 0, 0, 0],
        true,
        -1,
        hit,
        normal,
      );
      if (distance < 0) throw Error("Missing support at the terrain boundary.");
      return 100 - distance;
    });
  let edges;
  try {
    edges = {
      north: edge(nx, (t) => [x0 + eps + t * (x1 - x0 - 2 * eps), y1 - eps]),
      south: edge(nx, (t) => [x0 + eps + t * (x1 - x0 - 2 * eps), y0 + eps]),
      east: edge(ny, (t) => [x1 - eps, y0 + eps + t * (y1 - y0 - 2 * eps)]),
      west: edge(ny, (t) => [x0 + eps, y0 + eps + t * (y1 - y0 - 2 * eps)]),
    };
  } finally {
    hit.delete();
    normal.delete();
  }
  const surround = createSurround(bounds, edges);
  if (surround.asset)
    xml = xml.includes("</asset>")
      ? xml.replace("</asset>", surround.asset + "</asset>")
      : xml.replace("<worldbody>", `<asset>${surround.asset}</asset><worldbody>`);
  xml = xml.replace("</worldbody>", surround.geoms + "</worldbody>");
  return { ...surround, xml };
}
