import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
export class Viewer {
  constructor(canvas, { reference = false } = {}) {
    this.reference = reference;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, reference ? 1.5 : 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#edf1f5");
    this.scene.fog = new THREE.Fog("#edf1f5", 30, 120);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const sky = new THREE.HemisphereLight(0xf2f6ff, 0x74818c, 1.8);
    sky.position.set(0, 0, 1);
    this.scene.add(sky);
    this.sun = new THREE.DirectionalLight(0xfffaf2, 3);
    this.sun.position.set(3, -4, 7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(reference ? 512 : 2048, reference ? 512 : 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -3.5,
      right: 3.5,
      top: 3.5,
      bottom: -3.5,
      near: 0.1,
      far: 25,
    });
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.012;
    this.scene.add(this.sun, this.sun.target);
    const fill = new THREE.DirectionalLight(0xc6dfff, 0.65);
    fill.position.set(-4, 2, 4);
    this.scene.add(fill);
    if (reference) {
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ color: 0xc7d5d8, roughness: 1 }),
      );
      floor.receiveShadow = true;
      this.scene.add(floor);
      const grid = new THREE.GridHelper(10, 20, 0x8dabad, 0xb0c5c7);
      grid.rotation.x = Math.PI / 2;
      grid.position.z = 0.001;
      this.scene.add(grid);
    }
    // Keep useful depth precision at the feet; a 1 cm near plane causes surface flicker.
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 150);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 35;
    this.floorTexture = new THREE.DataTexture(
      new Uint8Array([
        220, 229, 235, 255, 193, 207, 217, 255, 193, 207, 217, 255, 220, 229, 235, 255,
      ]),
      2,
      2,
    );
    this.floorTexture.wrapS = this.floorTexture.wrapT = THREE.RepeatWrapping;
    this.floorTexture.repeat.set(2000, 2000);
    this.floorTexture.magFilter = THREE.NearestFilter;
    this.floorTexture.generateMipmaps = true;
    this.floorTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.floorTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.floorTexture.needsUpdate = true;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.follow = true;
    this.matrix = new THREE.Matrix4();
    this.observer = new ResizeObserver(() => {
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
    this.observer.observe(canvas);
    this.home();
  }
  home() {
    const target = this.rootTarget ?? new THREE.Vector3(0, 0, 0.65);
    this.controls.target.copy(target);
    this.camera.position
      .copy(target)
      .add(new THREE.Vector3(...(this.reference ? [1.5, -2.1, 0.95] : [3, -4, 1.75])));
    this.controls.update();
  }
  track() {
    this.controls.enablePan = !this.follow;
    if (this.follow && this.rootTarget) {
      const delta = this.rootTarget.clone().sub(this.controls.target);
      this.camera.position.add(delta);
      this.controls.target.copy(this.rootTarget);
    }
  }
  geometry(model, i, topOnly = false) {
    const type = model.geom_type[i],
      s = Array.from(model.geom_size.slice(i * 3, i * 3 + 3));
    if (type === 0) return new THREE.PlaneGeometry(2000, 2000);
    if (type === 2) return new THREE.SphereGeometry(s[0], 20, 12);
    if (type === 3) {
      const g = new THREE.CapsuleGeometry(s[0], s[1] * 2, 6, 12);
      g.rotateX(Math.PI / 2);
      return g;
    }
    if (type === 4) {
      const g = new THREE.SphereGeometry(1, 20, 12);
      g.scale(...s);
      return g;
    }
    if (type === 5) {
      const g = new THREE.CylinderGeometry(s[0], s[0], s[1] * 2, 20);
      g.rotateX(Math.PI / 2);
      return g;
    }
    if (type === 6 && topOnly) {
      const g = new THREE.PlaneGeometry(s[0] * 2, s[1] * 2);
      g.translate(0, 0, s[2]);
      return g;
    }
    if (type === 6) return new THREE.BoxGeometry(s[0] * 2, s[1] * 2, s[2] * 2);
    const id = model.geom_dataid[i];
    if (type === 7) {
      const v = model.mesh_vertadr[id] * 3,
        n = model.mesh_vertnum[id] * 3,
        f = model.mesh_faceadr[id] * 3,
        nf = model.mesh_facenum[id] * 3;
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.BufferAttribute(Float32Array.from(model.mesh_vert.slice(v, v + n)), 3),
      );
      g.setIndex(Array.from(model.mesh_face.slice(f, f + nf)));
      g.computeVertexNormals();
      return g;
    }
    if (type === 1) {
      const rows = model.hfield_nrow[id],
        cols = model.hfield_ncol[id],
        a = model.hfield_adr[id],
        size = Array.from(model.hfield_size.slice(id * 4, id * 4 + 4)),
        vertices = [],
        indices = [];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          vertices.push(
            ((2 * c) / (cols - 1) - 1) * size[0],
            ((2 * r) / (rows - 1) - 1) * size[1],
            model.hfield_data[a + r * cols + c] * size[2],
          );
      for (let r = 0; r < rows - 1; r++)
        for (let c = 0; c < cols - 1; c++) {
          const k = r * cols + c;
          indices.push(k, k + 1, k + cols, k + 1, k + cols + 1, k + cols);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      g.setIndex(indices);
      g.computeVertexNormals();
      return g;
    }
    throw Error(`Unsupported geometry ${type}`);
  }
  build(model, { colorByHeight = true } = {}) {
    const isFlat = Array.from(model.geom_type).some(
      (type, i) => type === 0 && model.geom_group[i] === 0,
    );
    this.scene.fog = isFlat ? null : new THREE.Fog("#edf1f5", 30, 120);
    this.group.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
    });
    this.group.clear();
    this.meshes = [];
    // Equal-height pieces share a shade, so construction seams stay invisible.
    const levelKey = (i) =>
      Math.round((model.geom_pos[i * 3 + 2] + model.geom_size[i * 3 + 2]) * 100000);
    const levels = [
      ...new Set(
        Array.from(model.geom_type).flatMap((type, i) =>
          type === 6 && model.geom_group[i] === 0 ? [levelKey(i)] : [],
        ),
      ),
    ].sort((a, b) => a - b);
    for (let i = 0; i < model.ngeom; i++) {
      if (
        model.geom_group[i] === 3 ||
        model.geom_group[i] === 5 ||
        (this.reference && model.geom_group[i] === 0)
      )
        continue;
      const material = model.geom_matid[i],
        rgba =
          material >= 0
            ? model.mat_rgba.slice(material * 4, material * 4 + 4)
            : model.geom_rgba.slice(i * 4, i * 4 + 4);
      const geom = model.geom(i);
      const isSurround = geom.name.startsWith("outskirts_");
      geom.delete();
      // Every terrain surface is walkable; let lighting describe its shape instead of
      // giving the central patch a different colour from the surrounding ground.
      const color =
        model.geom_group[i] === 0
          ? new THREE.Color("#b7c4cd")
          : new THREE.Color(rgba[0], rgba[1], rgba[2]);
      if (this.reference) color.set(rgba[0] < 0.4 ? "#327d91" : "#70b8c9");
      if (
        model.geom_group[i] === 0 &&
        model.geom_type[i] === 6 &&
        !isSurround &&
        levels.indexOf(levelKey(i)) % 2 === 1
      )
        color.set("#aabac5");
      const mesh = new THREE.Mesh(
        this.geometry(model, i, isSurround),
        new THREE.MeshStandardMaterial({
          color: model.geom_type[i] === 0 ? 0xffffff : color,
          map: model.geom_type[i] === 0 ? this.floorTexture : null,
          roughness: model.geom_group[i] === 0 ? 1 : this.reference ? 0.8 : 0.6,
          metalness: model.geom_group[i] === 0 || this.reference ? 0 : 0.15,
          side:
            model.geom_group[i] === 0 && model.geom_type[i] !== 0
              ? THREE.FrontSide
              : THREE.DoubleSide,
        }),
      );
      mesh.castShadow = model.geom_group[i] !== 0;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.meshes.push({
        i,
        mesh,
        isSurround,
        isTerrain: model.geom_group[i] === 0,
        isHeightfield: model.geom_type[i] === 1,
      });
    }
    this.heightColorsPending = colorByHeight;
    this.rootTarget = null;
    this.home();
  }
  sync(data) {
    for (const { i, mesh } of this.meshes) {
      mesh.position.fromArray(data.geom_xpos, i * 3);
      const r = data.geom_xmat,
        a = i * 9;
      this.matrix.set(
        r[a],
        r[a + 1],
        r[a + 2],
        0,
        r[a + 3],
        r[a + 4],
        r[a + 5],
        0,
        r[a + 6],
        r[a + 7],
        r[a + 8],
        0,
        0,
        0,
        0,
        1,
      );
      mesh.quaternion.setFromRotationMatrix(this.matrix);
    }
    if (this.heightColorsPending) {
      this.heightColorsPending = false;
      const fields = this.meshes.filter((m) => m.isTerrain && m.isHeightfield);
      const outer = this.meshes.find((m) => m.isSurround && !m.isHeightfield);
      if (fields.length && outer) {
        const point = new THREE.Vector3(),
          worldZ = (mesh, x, y, z) =>
            point.set(x, y, z).applyQuaternion(mesh.quaternion).add(mesh.position).z;
        const base = worldZ(outer.mesh, 0, 0, outer.mesh.geometry.attributes.position.getZ(0));
        let range = 0;
        for (const { mesh } of fields) {
          const p = mesh.geometry.attributes.position;
          for (let k = 0; k < p.count; k++)
            range = Math.max(range, Math.abs(worldZ(mesh, p.getX(k), p.getY(k), p.getZ(k)) - base));
        }
        const neutral = new THREE.Color("#b7c4cd"),
          low = new THREE.Color("#9eafb9"),
          high = new THREE.Color("#c8d1d7"),
          shade = new THREE.Color();
        for (const { mesh } of fields) {
          const p = mesh.geometry.attributes.position,
            colors = [];
          for (let k = 0; k < p.count; k++) {
            const delta = worldZ(mesh, p.getX(k), p.getY(k), p.getZ(k)) - base;
            const t = range > 1e-6 ? Math.min(1, Math.abs(delta) / range) : 0;
            shade.copy(neutral).lerp(delta >= 0 ? high : low, t);
            colors.push(shade.r, shade.g, shade.b);
          }
          mesh.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
          mesh.material.color.set(0xffffff);
          mesh.material.vertexColors = true;
          mesh.material.needsUpdate = true;
        }
      }
    }
    // Keep the orbit center attached to the pelvis, including terrain elevation.
    this.rootTarget = new THREE.Vector3(data.qpos[0], data.qpos[1], data.qpos[2] - 0.117);
    this.track();
  }
  render() {
    if (this.controls.enabled) this.controls.update();
    this.track();
    if (this.rootTarget) {
      this.sun.target.position.copy(this.rootTarget);
      this.sun.position.copy(this.rootTarget).add(new THREE.Vector3(3, -4, 7));
    }
    this.renderer.render(this.scene, this.camera);
  }
}
