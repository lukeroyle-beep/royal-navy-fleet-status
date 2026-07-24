import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { latLonToVector3, makeGlobeTexture } from "../utils/geo.js";

const COLORS = {
  mapped: 0x42e6c7,
  approximate: 0xf3ba4d,
};

export class GlobeView {
  constructor({ canvas, onSelect }) {
    this.canvas = canvas;
    this.onSelect = onSelect;
    this.markers = [];
    this.visibleIds = new Set();
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x050a10, 3.2, 6.2);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
    this.camera.position.set(0.15, 1.25, 3.15);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 2.05;
    this.controls.maxDistance = 4.8;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.12;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.#buildGlobe();
    this.#bindLights();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    canvas.addEventListener("pointerdown", (event) => this.#handlePick(event));
    this.#animate();
  }

  setVessels(vessels) {
    for (const item of this.markers) this.group.remove(item.object);
    this.markers = vessels.filter((vessel) => vessel.position).map((vessel) => this.#createMarker(vessel));
    this.visibleIds = new Set(vessels.map((vessel) => vessel.id));
  }

  setVisibleVessels(vessels) {
    this.visibleIds = new Set(vessels.map((vessel) => vessel.id));
    for (const marker of this.markers) marker.object.visible = this.visibleIds.has(marker.vessel.id);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    this.camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
    this.camera.updateProjectionMatrix();
  }

  #buildGlobe() {
    this.group.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1, 96, 96),
        new THREE.MeshStandardMaterial({ map: makeGlobeTexture(), roughness: 0.76, metalness: 0.04 }),
      ),
    );
    this.group.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1.006, 72, 72),
        new THREE.MeshBasicMaterial({ color: 0x78c8ff, wireframe: true, transparent: true, opacity: 0.045 }),
      ),
    );
    this.group.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1.045, 72, 72),
        new THREE.MeshBasicMaterial({ color: 0x71b7ff, transparent: true, opacity: 0.13, side: THREE.BackSide }),
      ),
    );
  }

  #bindLights() {
    this.scene.add(new THREE.AmbientLight(0xaad8ff, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(2.4, 1.5, 1.7);
    this.scene.add(key);
  }

  #createMarker(vessel) {
    const radius = vessel.locationClassification === "mapped" ? 0.022 : 0.018;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 20, 20),
      new THREE.MeshBasicMaterial({ color: COLORS[vessel.locationClassification] }),
    );
    marker.position.copy(latLonToVector3(vessel.position.lat, vessel.position.lon, 1.028));
    marker.userData.vessel = vessel;
    this.group.add(marker);
    return { vessel, object: marker };
  }

  #handlePick(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const visible = this.markers.map((item) => item.object).filter((object) => object.visible);
    const hit = this.raycaster.intersectObjects(visible, false)[0];
    if (hit?.object.userData.vessel) this.onSelect(hit.object.userData.vessel);
  }

  #animate() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.#animate());
  }
}
