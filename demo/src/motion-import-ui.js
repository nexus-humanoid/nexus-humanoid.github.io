import { parseMotion, MAX_FILE_BYTES } from "./motion-import.js";
export function setupMotionImport(config, onImport, onPlay) {
  const $ = (id) => document.getElementById(id),
    fileInput = $("motion-file");
  let importing = false;
  function selected() {
    const csv = fileInput.files[0]?.name.toLowerCase().endsWith(".csv");
    $("csv-settings").hidden = !csv;
    $("import-error").hidden = true;
  }
  fileInput.addEventListener("change", selected);
  $("import-motion").onclick = async () => {
    if (importing) return;
    $("import-error").hidden = true;
    const file = fileInput.files[0];
    try {
      if (!file) throw Error("Choose a JSON or CSV file first.");
      if (file.size > MAX_FILE_BYTES) throw Error("Motion file is too large (maximum 20 MB).");
      importing = true;
      $("import-motion").disabled = true;
      fileInput.disabled = true;
      const format = file.name.toLowerCase().split(".").at(-1);
      const motion = parseMotion(
        await file.text(),
        { format, fps: $("csv-fps").valueAsNumber, quaternionOrder: $("csv-quaternion").value },
        config,
      );
      const label = file.name.replace(/\.(json|csv)$/i, "");
      onImport(motion, label);
      $("import-result").textContent =
        `${file.name} · ${(motion.rootPos.length / motion.fps).toFixed(2)} s · Ready to play`;
      $("play-imported").hidden = false;
    } catch (error) {
      $("import-error").textContent = error.message ?? String(error);
      $("import-error").hidden = false;
    } finally {
      importing = false;
      $("import-motion").disabled = false;
      fileInput.disabled = false;
    }
  };
  $("play-imported").onclick = onPlay;
  selected();
}
