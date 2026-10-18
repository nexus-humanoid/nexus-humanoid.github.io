import { DEFAULT_TERRAIN, TERRAIN_STEPS, TERRAIN_FIELDS } from "./terrain-builder.js";
export function setupTerrainEditor(apply) {
  const $ = (id) => document.getElementById(id);
  let type = DEFAULT_TERRAIN.type,
    generation = null;
  const shapes = {
    stairs: "Pyramid stairs",
    slope: "Pyramid slope",
    rough: "Random rough",
    wave: "Wave",
    boxes: "Random platforms",
  };
  for (const [id, label] of Object.entries(shapes)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = id;
    button.textContent = label;
    button.onclick = () => {
      type = id;
      edited();
    };
    $("custom-type").append(button);
  }
  const labels = {
    size: "Terrain patch width (m)",
    platform: "Central platform width (m)",
    stepHeight: "Step height (m)",
    stepWidth: "Step depth (m)",
    slope: "Slope gradient (rise / run)",
    amplitude: "Height amplitude ± (m)",
    roughSpacing: "Roughness spacing (m)",
    seed: "Random seed",
    wavelength: "Wavelength (m)",
    boxWidth: "Maximum platform width / length (m)",
    boxGap: "Minimum gap (m)",
    boxHeight: "Maximum height / depth (m)",
  };
  for (const key of Object.keys(TERRAIN_STEPS)) {
    const label = document.createElement("label");
    label.htmlFor = `custom-${key}`;
    label.textContent = labels[key];
    const input = document.createElement("input");
    input.type = "number";
    input.id = label.htmlFor;
    input.step = "any";
    input.value = DEFAULT_TERRAIN[key];
    input.required = true;
    const field = document.createElement("div");
    field.id = `field-${key}`;
    field.append(label, input);
    $("custom-fields").append(field);
  }
  const reliefField = document.createElement("div");
  const reliefLabel = document.createElement("label");
  reliefLabel.htmlFor = "custom-relief";
  reliefLabel.textContent = "Platform relief";
  const relief = document.createElement("select");
  relief.id = "custom-relief";
  for (const [value, label] of [
    ["mixed", "Raised & recessed"],
    ["raised", "Raised only"],
    ["recessed", "Recessed only"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    relief.append(option);
  }
  relief.value = DEFAULT_TERRAIN.boxRelief;
  reliefField.append(reliefLabel, relief);
  $("custom-fields").append(reliefField);
  function edited() {
    reliefField.hidden = type !== "boxes";
    for (const button of $("custom-type").children)
      button.setAttribute("aria-pressed", String(button.dataset.id === type));
    for (const key of Object.keys(TERRAIN_STEPS))
      $("field-" + key).hidden = !TERRAIN_FIELDS[type].includes(key);
    $("custom-inverted-label").hidden = !["stairs", "slope"].includes(type);
    const gradient = Number($("custom-slope").value),
      angle = (Math.atan(gradient) * 180) / Math.PI;
    $("custom-description").textContent =
      type === "stairs"
        ? "Reference: 0.10 m height, 0.30 m depth. Other settings are experimental."
        : type === "slope"
          ? `Ridge angle: ${angle.toFixed(1)}°. Reference gradient: 0.30. Other settings are experimental.`
          : type === "boxes"
            ? "Varied rectangular platforms and shallow depressions, with three height levels and flat paths between them. The starting area stays level. Experimental terrain."
            : type === "rough"
              ? "Seeded random height variations with a smooth, flat starting area. Experimental terrain."
              : type === "wave"
                ? "Crossing sine/cosine waves with a smooth, flat starting area. Experimental terrain."
                : "A bounded flat surface with edge protection.";
    $("custom-result").textContent = "Edits are pending until you generate.";
    $("custom-error").hidden = true;
  }
  $("terrain-editor").addEventListener("input", edited);
  function freezeEditor(disabled) {
    for (const input of $("terrain-editor").querySelectorAll("input,select,button"))
      if (input.id !== "generate") input.disabled = disabled;
  }
  $("generate").onclick = async () => {
    if (generation) {
      generation.cancel();
      return;
    }
    $("custom-error").hidden = true;
    let worker;
    try {
      const input = { type, boxRelief: relief.value, inverted: $("custom-inverted").checked };
      for (const key of Object.keys(TERRAIN_STEPS)) input[key] = $("custom-" + key).valueAsNumber;
      const start = performance.now();
      worker = new Worker(new URL("./terrain-worker.js", import.meta.url), { type: "module" });
      const pending = new Promise((resolve, reject) => {
        generation = {
          cancel() {
            worker.terminate();
            reject(new DOMException("Generation cancelled.", "AbortError"));
          },
        };
        worker.onmessage = ({ data }) =>
          data.error ? reject(Error(data.error)) : resolve(data.terrain);
        worker.onerror = (event) => reject(Error(event.message || "Terrain generation failed."));
      });
      freezeEditor(true);
      $("generate").textContent = "Cancel generation";
      $("custom-result").textContent = "Generating terrain…";
      worker.postMessage(input);
      const generated = await pending;
      worker.terminate();
      generation = null;
      $("generate").textContent = "Generate & reset";
      if (await apply(generated))
        $("custom-result").textContent =
          `Custom terrain ready · ${generated.config.size} × ${generated.config.size} m patch + surrounding flat ground${generated.config.type === "boxes" ? ` · ${generated.features.length} platforms` : ""} · ${Math.round(performance.now() - start)} ms`;
    } catch (error) {
      if (error.name === "AbortError") $("custom-result").textContent = "Generation cancelled.";
      else {
        $("custom-error").textContent = error.message ?? String(error);
        $("custom-error").hidden = false;
        $("custom-result").textContent = "Terrain not ready. Check the message above.";
      }
    } finally {
      worker?.terminate();
      generation = null;
      freezeEditor(false);
      $("generate").textContent = "Generate & reset";
    }
  };
  edited();
  $("custom-result").textContent = "";
}
