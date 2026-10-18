import * as ort from "../vendor/onnxruntime-web/dist/ort.all.min.mjs";
import { Simulation, fetchChecked } from "./physics.js";
import { Viewer } from "./viewer.js";
import { KeyboardMotion } from "./keyboard-motion.js";
import { setupTerrainEditor } from "./terrain-editor.js";
import { ReferencePreview } from "./reference-preview.js";
import { setupMotionImport } from "./motion-import-ui.js";
import { MousePush } from "./mouse-push.js";
const $ = (id) => document.getElementById(id);
const status = (text) => {
  $("status").textContent = text;
};
let running = false,
  busy = false,
  sim,
  viewer,
  session,
  config,
  changing = false,
  loopToken = 0,
  toggling = false,
  commanding = false;
const heldKeys = new Set();
let terrainId, motionId, reference, uploadedMotion, mousePush;
function clearKeys() {
  heldKeys.clear();
  sim?.keyboardDriver?.clear();
  if (sim) sim.keyboardEnabled = false;
}
const motionCache = new Map(),
  depthContext = $("depth").getContext("2d");
function phaseText() {
  if (sim.boundaryStopped) return "Boundary reached · Reset scene to continue";
  const sequence = sim.sequence;
  return {
    keyboard: "Moving · ↑ ↓ move · ← → turn",
    default: "Standing",
    entering: `Transitioning into ${sequence.label}`,
    motion: `Executing ${sequence.label}`,
    returning: "Transitioning to standing",
  }[sim.phase];
}
function refreshButtons() {
  $("play").disabled = !!sim?.boundaryStopped;
  $("recover").disabled = !!sim?.boundaryStopped || changing || commanding || toggling;
  for (const button of $("motion").querySelectorAll("button")) {
    button.disabled = !!sim?.boundaryStopped || changing || commanding || toggling;
    button.setAttribute(
      "aria-pressed",
      String(
        button.dataset.id === motionId &&
          ["entering", "motion", "keyboard", "returning"].includes(sim?.phase),
      ),
    );
  }
  for (const button of $("terrain").querySelectorAll("button"))
    button.setAttribute("aria-pressed", String(button.dataset.id === sim?.terrainId));
  $("play-imported").disabled = !!sim?.boundaryStopped || changing || commanding || toggling;
  $("return").disabled =
    sim?.boundaryStopped || changing || commanding || toggling || sim?.phase === "default";
}
function fail(error) {
  mousePush?.cancel();
  clearKeys();
  running = false;
  loopToken++;
  $("error").hidden = false;
  $("error").textContent = error.message ?? String(error);
  status("Stopped — reset required");
  $("play").textContent = "Resume";
  console.error(error);
}
function update() {
  viewer.sync(sim.data);
  if (reference) {
    reference.sync(sim.sequence.frame());
    $("reference-label").textContent = sim.phase === "default" ? "Standing" : sim.sequence.label;
  }
  const boundary = sim.boundary;
  $("boundary-note").hidden = boundary.level === "clear" && !sim.boundaryStopped;
  $("boundary-note").textContent = sim.boundaryStopped
    ? "Paused near the terrain edge. Reset scene to continue."
    : `Terrain edge ${boundary.distance.toFixed(1)} m away · pauses at the 1 m buffer.`;
  const image = depthContext.createImageData(32, 18);
  sim.camera.forEach((v, i) => {
    image.data.fill(Math.round(v * 255), i * 4, i * 4 + 3);
    image.data[i * 4 + 3] = 255;
  });
  depthContext.putImageData(image, 0, 0);
  $("time").textContent = `${(sim.frame * config.controlDt).toFixed(2)} s`;
  $("phase").textContent = phaseText();
  refreshButtons();
}
async function stopped() {
  mousePush?.cancel();
  clearKeys();
  running = false;
  loopToken++;
  $("play").textContent = "Resume";
  while (busy) await new Promise((resolve) => setTimeout(resolve, 5));
}
function resume() {
  if (sim.boundaryStopped) {
    status(phaseText());
    refreshButtons();
    return;
  }
  if (document.hidden) {
    status(`Paused · ${phaseText()}`);
    return;
  }
  running = true;
  $("play").textContent = "Pause";
  step(++loopToken);
}
async function change(custom = null) {
  if (changing || commanding || toggling) return false;
  changing = true;
  $("controls").disabled = true;
  const previousModel = sim.model;
  try {
    await stopped();
    $("error").hidden = true;
    status("Loading…");
    if (custom) {
      sim.loadCustomTerrain(custom);
      viewer.build(sim.model, { colorByHeight: custom.config.type !== "slope" });
      if (!$("terrain").querySelector("[data-id=custom]"))
        addChoice("terrain", { id: "custom", label: "Custom terrain" }, () =>
          selectTerrain("custom"),
        );
      terrainId = "custom";
    } else if (sim.terrainId !== terrainId) {
      sim.loadTerrain(terrainId);
      viewer.build(sim.model, {
        colorByHeight:
          !["slope", "slope-inverted"].includes(terrainId) &&
          !(terrainId === "custom" && sim.customTerrain.config.type === "slope"),
      });
    }
    clearKeys();
    motionId = null;
    sim.reset();
    update();
    viewer.home();
    $("terrain-note").textContent = "";
    resume();
    return true;
  } catch (error) {
    if (custom) {
      if (sim.model === previousModel) status("Compilation failed · current scene retained");
      else fail(error);
      throw error;
    }
    fail(error);
    return false;
  } finally {
    changing = false;
    $("controls").disabled = false;
    refreshButtons();
  }
}
async function recover() {
  if (changing || commanding || toggling || sim.boundaryStopped) return false;
  commanding = true;
  $("controls").disabled = true;
  try {
    await stopped();
    sim.recover();
    $("error").hidden = true;
    update();
    resume();
    return true;
  } catch (error) {
    fail(error);
    return false;
  } finally {
    commanding = false;
    $("controls").disabled = false;
    refreshButtons();
  }
}
async function selectedMotion() {
  if (motionId === "uploaded" && uploadedMotion) return uploadedMotion;
  const selected = config.motions.find((item) => item.id === motionId);
  if (!selected) throw Error("Select a motion");
  if (!motionCache.has(selected.id))
    motionCache.set(selected.id, await fetchChecked("public/" + selected.file));
  return { motion: motionCache.get(selected.id), label: selected.label };
}
async function command(returning = false) {
  if (changing || commanding || toggling || sim.boundaryStopped) return false;
  commanding = true;
  refreshButtons();
  $("controls").disabled = true;
  try {
    // Finish the current policy step; changing the reference never resets the robot.
    await stopped();
    const selected = returning ? null : await selectedMotion();
    if (returning) {
      motionId = null;
      sim.sequence.pendingMotion = null;
    }
    const accepted = returning
      ? sim.returnDefault()
      : sim.startMotion(selected.motion, selected.label);
    update();
    resume();
    return accepted;
  } catch (error) {
    fail(error);
    return false;
  } finally {
    commanding = false;
    $("controls").disabled = false;
    refreshButtons();
  }
}
async function loadKeyboard() {
  const load = async (id) => {
    if (!motionCache.has(id)) {
      const item = config.motions.find((m) => m.id === id);
      motionCache.set(id, await fetchChecked("public/" + item.file));
    }
    return motionCache.get(id);
  };
  const [forward, backward] = await Promise.all([load("walk1_subject1"), load("back_walk")]);
  sim.keyboardDriver = new KeyboardMotion(config, forward, backward);
}
function keyboardInput(event, down) {
  if (
    !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) ||
    !sim?.keyboardDriver
  )
    return;
  if (!down) heldKeys.delete(event.key);
  const editing = event.target.closest?.('input,select,textarea,[contenteditable="true"]');
  if (editing || changing || commanding || toggling || sim.boundaryStopped) {
    clearKeys();
    return;
  }
  event.preventDefault();
  if (down) heldKeys.add(event.key);
  sim.keyboardDriver.setInput(
    Number(heldKeys.has("ArrowUp")) - Number(heldKeys.has("ArrowDown")),
    Number(heldKeys.has("ArrowLeft")) - Number(heldKeys.has("ArrowRight")),
  );
  sim.keyboardEnabled = heldKeys.size > 0;
  if (down && !running) resume();
}
function addChoice(container, item, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.id = item.id;
  button.setAttribute("aria-pressed", "false");
  const name = document.createElement("span");
  name.textContent = item.label;
  button.append(name);
  if (container === "motion") {
    const duration = document.createElement("small");
    duration.textContent = `${(item.duration ?? item.frames / 50).toFixed(1)} s`;
    button.append(duration);
  }
  button.onclick = onClick;
  $(container).append(button);
}
async function selectTerrain(id) {
  if (changing || commanding || toggling) return;
  terrainId = id;
  if (!(await change())) terrainId = sim.terrainId;
}
async function selectMotion(id) {
  if (changing || commanding || toggling || sim.boundaryStopped) return;
  motionId = id;
  await command();
}
async function policyStep() {
  if (sim.boundaryStopped) return;
  const before = performance.now();
  const output = await session.run({
    obs: new ort.Tensor("float32", sim.observation(), [1, 1473]),
    camera: new ort.Tensor("float32", sim.camera, [1, 1, 18, 32]),
  });
  $("latency").textContent = `${(performance.now() - before).toFixed(1)} ms`;
  sim.apply(output.actions.data);
  update();
  if (sim.boundaryStopped) {
    running = false;
    loopToken++;
    $("play").textContent = "Resume";
    status(phaseText());
  }
}
async function step(token) {
  if (!running || busy || token !== loopToken) return;
  busy = true;
  const start = performance.now();
  try {
    await policyStep();
    $("speed").textContent = `${Math.min(1, 20 / (performance.now() - start)).toFixed(2)}×`;
    if (running) status(phaseText());
  } catch (error) {
    fail(error);
  } finally {
    busy = false;
  }
  if (running && token === loopToken)
    setTimeout(() => step(token), Math.max(0, 20 - (performance.now() - start)));
}
async function init() {
  config = await fetchChecked("public/assets/config.json");
  terrainId = config.terrains[0].id;
  for (const item of config.terrains) addChoice("terrain", item, () => selectTerrain(item.id));
  for (const item of config.motions) addChoice("motion", item, () => selectMotion(item.id));
  viewer = new Viewer($("scene"));
  let lastReferenceRender = 0;
  const render = (time) => {
    mousePush?.update();
    viewer.render();
    if (reference && !$("reference-body").hidden && time - lastReferenceRender > 33) {
      reference.render();
      lastReferenceRender = time;
    }
    requestAnimationFrame(render);
  };
  requestAnimationFrame(render);
  sim = new Simulation(config);
  await sim.init(status);
  reference = new ReferencePreview($("reference-scene"), sim.mj, config);
  $("reference-panel").hidden = false;
  $("reference-toggle").onclick = () => {
    const hidden = !$("reference-body").hidden;
    $("reference-body").hidden = hidden;
    $("reference-toggle").setAttribute("aria-expanded", String(!hidden));
    $("reference-toggle").setAttribute(
      "aria-label",
      hidden ? "Show reference preview" : "Hide reference preview",
    );
    $("reference-toggle").textContent = hidden ? "+" : "−";
    $("reference-toggle").title = hidden ? "Show reference preview" : "Hide reference preview";
    if (hidden) {
      $("reference-panel").classList.remove("expanded");
      $("reference-expand").setAttribute("aria-pressed", "false");
      $("reference-expand").setAttribute("aria-label", "Enlarge reference preview");
      $("reference-expand").title = "Enlarge reference preview";
    }
  };
  $("reference-expand").onclick = () => {
    if ($("reference-body").hidden) $("reference-toggle").click();
    const expanded = $("reference-panel").classList.toggle("expanded");
    $("reference-expand").setAttribute("aria-pressed", String(expanded));
    $("reference-expand").setAttribute(
      "aria-label",
      expanded ? "Shrink reference preview" : "Enlarge reference preview",
    );
    $("reference-expand").title = expanded
      ? "Shrink reference preview"
      : "Enlarge reference preview";
  };
  status("Loading…");
  ort.env.wasm.wasmPaths = new URL("../vendor/onnxruntime-web/dist/", import.meta.url).href;
  ort.env.wasm.numThreads = 1;
  session = await ort.InferenceSession.create("public/" + config.model, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  await loadKeyboard();
  await change();
  mousePush = new MousePush(
    $("scene"),
    viewer,
    sim,
    () => running && !changing && !commanding && !toggling && !sim.boundaryStopped,
    $("force-note"),
  );
  window.addEventListener("keydown", (e) => keyboardInput(e, true));
  window.addEventListener("keyup", (e) => keyboardInput(e, false));
  window.addEventListener("blur", clearKeys);
  document.addEventListener("focusin", (e) => {
    if (e.target.closest?.('input,select,textarea,[contenteditable="true"],button,summary'))
      clearKeys();
  });
  $("reset").onclick = () => change();
  $("recover").onclick = recover;
  setupTerrainEditor(change);
  setupMotionImport(
    config,
    (motion, label) => {
      uploadedMotion = { motion, label };
    },
    () => selectMotion("uploaded"),
  );
  $("return").onclick = () => command(true);
  $("home").onclick = () => viewer.home();
  $("follow").onchange = () => {
    viewer.follow = $("follow").checked;
    viewer.track();
  };
  $("play").onclick = async () => {
    if (toggling || changing || commanding) return;
    toggling = true;
    $("play").disabled = true;
    try {
      if (running) {
        await stopped();
        status(`Paused · ${phaseText()}`);
      } else {
        await stopped();
        resume();
      }
    } catch (error) {
      fail(error);
    } finally {
      toggling = false;
      refreshButtons();
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopped().then(() => status(`Paused · ${phaseText()}`));
  });
  window.nexus = {
    sim,
    session,
    ort,
    viewer,
    reference,
    mousePush,
    get running() {
      return running;
    },
    pause: stopped,
    change,
    recover,
    selectTerrain,
    selectMotion,
    execute: command,
    async step(n = 1) {
      await stopped();
      for (let i = 0; i < n && !sim.boundaryStopped; i++) await policyStep();
      return { frame: sim.frame, phase: sim.phase, qpos: Array.from(sim.data.qpos) };
    },
  };
}
init().catch(fail);
