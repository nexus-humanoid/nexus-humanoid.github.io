import * as THREE from "three";
export class MousePush {
  constructor(canvas, viewer, sim, canDrag, note) {
    Object.assign(this, { canvas, viewer, sim, canDrag, note });
    this.pointerId = null;
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane();
    this.cursor = new THREE.Vector2();
    this.indicator = new THREE.Group();
    this.indicator.visible = false;
    viewer.scene.add(this.indicator);
    this.positions = new Float32Array(6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0xad6545,
        depthTest: false,
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.line.frustumCulled = false;
    this.line.renderOrder = 10;
    this.indicator.add(this.line);
    for (const radius of [0.015, 0.022]) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xad6545, depthTest: false }),
      );
      dot.renderOrder = 11;
      this.indicator.add(dot);
    }
    canvas.addEventListener("pointerdown", (e) => this.begin(e), true);
    canvas.addEventListener("pointermove", (e) => this.move(e), true);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      canvas.addEventListener(
        type,
        (e) => {
          if (e.pointerId === this.pointerId) {
            e.stopImmediatePropagation();
            this.cancel();
          }
        },
        true,
      );
    window.addEventListener("keyup", (e) => {
      if (e.key === "Shift") this.cancel();
    });
    window.addEventListener("blur", () => this.cancel());
  }
  setRay(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.cursor.set(
      (2 * (event.clientX - rect.left)) / rect.width - 1,
      1 - (2 * (event.clientY - rect.top)) / rect.height,
    );
    this.viewer.camera.updateMatrixWorld();
    this.ray.setFromCamera(this.cursor, this.viewer.camera);
  }
  begin(event) {
    if (event.button !== 0 || !event.shiftKey || this.pointerId !== null || !this.canDrag()) return;
    this.setRay(event);
    this.viewer.scene.updateMatrixWorld(true);
    const robots = this.viewer.meshes.filter((m) => !m.isTerrain),
      hit = this.ray.intersectObjects(
        robots.map((m) => m.mesh),
        false,
      )[0];
    if (!hit) return;
    const geom = robots.find((m) => m.mesh === hit.object),
      body = this.sim.model.geom_bodyid[geom.i];
    if (body <= 0) return;
    this.sim.mousePerturbation.begin(body, hit.point.toArray(), this.sim.data);
    const normal = this.viewer.camera.getWorldDirection(new THREE.Vector3());
    this.plane.setFromNormalAndCoplanarPoint(normal, hit.point);
    event.preventDefault();
    event.stopImmediatePropagation();
    this.pointerId = event.pointerId;
    this.controlsEnabled = this.viewer.controls.enabled;
    this.viewer.controls.enabled = false;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "grabbing";
    this.indicator.visible = true;
    this.update();
  }
  move(event) {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.shiftKey || !this.canDrag()) {
      this.cancel();
      return;
    }
    this.setRay(event);
    const point = this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
    if (point) this.sim.mousePerturbation.move(point.toArray());
    this.update();
  }
  update() {
    if (this.pointerId === null) return;
    if (!this.canDrag() || !this.sim.mousePerturbation.active) {
      this.cancel();
      return;
    }
    const p = this.sim.mousePerturbation,
      point = p.point(this.sim.data);
    this.positions.set([...point, ...p.target]);
    this.line.geometry.attributes.position.needsUpdate = true;
    this.indicator.children[1].position.fromArray(point);
    this.indicator.children[2].position.fromArray(p.target);
    this.note.hidden = false;
    const label = `External force · ${Math.round(p.magnitude)} N · release to let go`;
    if (this.note.textContent !== label) this.note.textContent = label;
  }
  cancel() {
    const id = this.pointerId;
    this.pointerId = null;
    this.sim.mousePerturbation.clear(this.sim.data);
    this.indicator.visible = false;
    this.note.hidden = true;
    if (id !== null) {
      this.viewer.controls.enabled = this.controlsEnabled;
      this.canvas.style.removeProperty("cursor");
      if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    }
  }
}
