import { buildTerrain } from "./terrain-builder.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ terrain: buildTerrain(data) });
  } catch (error) {
    self.postMessage({ error: error.message ?? String(error) });
  }
};
