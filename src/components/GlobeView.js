import * as THREE from "https://esm.sh/three@0.164.1";
import { OrbitControls } from "https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls.js";
import { latLonToVector3, makeGlobeTexture } from "../utils/geo.js";

export class GlobeView {
  constructor({ canvas, onSelect }) {
    this.canvas = canvas;
    this.onSelect = onSelect;
    this.scenario = null;
    this.trackObjects = [];
    this.incidentObjects = [];
    this.zoneObjects = [];

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x070b12, 3.1, 6.2);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
    this.camera.position.set(0.15, 1.35, 3.1);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 2.05;
    this.controls.maxDistance = 4.8;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.15;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Line.threshold = 0.025;
    this.pointer = new THREE.Vector2();
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.#buildGlobe();
    this.#bindLights();
    this.resize();

    window.addEventListener("resize", () => this.resize());
    canvas.addEventListener("pointerdown", (event) => this.#handlePick(event));
  }

  setScenario(scenario) {
    this.scenario = scenario;
    this.group.rotation.y = THREE.MathUtils.degToRad(-(scenario.metadata.center.lon + 90));
    this.group.rotation.x = THREE.MathUtils.degToRad(scenario.metadata.center.lat * 0.25);
    this.trackObjects = scenario.tracks.map((track) => this.#createTrack(track));
    this.incidentObjects = scenario.incidents.map((incident) => this.#createIncident(incident));
    this.zoneObjects = scenario.zones.map((zone) => this.#createZone(zone));
  }

  update(time, layerState, selectedEntity) {
    const visibleTypes = new Set();
    let visibleTracks = 0;

    for (const track of this.trackObjects) {
      const sampled = sampleTrack(track, time);
      const enabled = isTrackLayerEnabled(track, layerState);
      track.marker.visible = Boolean(sampled) && enabled;
      track.trail.visible = Boolean(sampled) && enabled;

      if (!sampled || !enabled) continue;

      visibleTypes.add(track.type);
      visibleTracks += 1;
      const altitude = getVisualAltitude(track, sampled);
      track.marker.position.copy(latLonToVector3(sampled.lat, sampled.lon, 1.028 + altitude));

      const trailPoints = track.points
        .filter((point) => point.time <= time)
        .map((point) => latLonToVector3(point.lat, point.lon, 1.018 + getVisualAltitude(track, point)));
      trailPoints.push(track.marker.position.clone());
      track.trail.geometry.dispose();
      track.trail.geometry = new THREE.BufferGeometry().setFromPoints(trailPoints);
    }

    for (const incident of this.incidentObjects) {
      incident.object.visible = incident.time <= time && layerState.incidents;
      incident.hitObject.visible = incident.object.visible;
      if (incident.object.visible) {
        visibleTypes.add("incident");
        incident.object.scale.setScalar(1 + Math.sin(performance.now() / 260) * 0.18);
      }
    }

    for (const zone of this.zoneObjects) {
      zone.object.visible = time >= zone.activeStart && time <= zone.activeEnd && layerState.zones;
      if (zone.object.visible) visibleTypes.add("zone");
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    return {
      activeLayers: visibleTypes.size,
      visibleTracks,
      selectedStillVisible: selectedEntity ? isEntityVisible(selectedEntity, time, layerState) : true,
    };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  #buildGlobe() {
    this.group.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1, 96, 96),
        new THREE.MeshStandardMaterial({ map: makeGlobeTexture(), roughness: 0.72, metalness: 0.05 }),
      ),
    );
    this.group.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1.006, 96, 96),
        new THREE.MeshBasicMaterial({ color: 0x78c8ff, wireframe: true, transparent: true, opacity: 0.055 }),
      ),
    );
    this.group.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1.045, 96, 96),
        new THREE.MeshBasicMaterial({ color: 0x71b7ff, transparent: true, opacity: 0.13, side: THREE.BackSide }),
      ),
    );
  }

  #bindLights() {
    this.scene.add(new THREE.AmbientLight(0x9ec9ff, 1.6));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(2.5, 1.4, 1.7);
    this.scene.add(keyLight);
  }

  #createTrack(track) {
    const material = new THREE.LineBasicMaterial({ color: track.color, transparent: true, opacity: 0.94 });
    const trail = new THREE.Line(new THREE.BufferGeometry(), material);
    const markerRadius = track.type === "flight" || track.type === "osint" ? 0.018 : 0.015;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(markerRadius, 20, 20),
      new THREE.MeshBasicMaterial({ color: track.color }),
    );
    marker.userData.entity = { kind: "track", ref: track };
    trail.userData.entity = { kind: "track", ref: track };
    this.group.add(trail, marker);
    return { ...track, trail, marker };
  }

  #createIncident(incident) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.018, 0.034, 30),
      new THREE.MeshBasicMaterial({
        color: getIncidentColor(incident.category),
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
      }),
    );
    const anchor = latLonToVector3(incident.lat, incident.lon, 1.012);
    ring.position.copy(anchor);
    ring.lookAt(anchor.clone().multiplyScalar(1.2));
    ring.userData.entity = { kind: "incident", ref: incident };

    const hitObject = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
    );
    hitObject.position.copy(anchor);
    hitObject.userData.entity = { kind: "incident", ref: incident };
    this.group.add(ring, hitObject);
    return { ...incident, object: ring, hitObject };
  }

  #createZone(zone) {
    const points = zone.polygon.map(([lat, lon]) => latLonToVector3(lat, lon, 1.016));
    const boundary = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: zone.color || "#ff5d73", transparent: true, opacity: 0.72 }),
    );
    boundary.userData.entity = { kind: "zone", ref: zone };
    this.group.add(boundary);
    return { ...zone, object: boundary };
  }

  #handlePick(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const pickable = [
      ...this.trackObjects.flatMap((track) => [track.marker, track.trail]),
      ...this.incidentObjects.flatMap((incident) => [incident.object, incident.hitObject]),
      ...this.zoneObjects.map((zone) => zone.object),
    ].filter((object) => object.visible);

    const hits = this.raycaster.intersectObjects(pickable, false).filter((item) => item.object.userData.entity);
    const hit =
      hits.find((item) => item.object.userData.entity.kind === "incident") ||
      hits.find((item) => item.object.userData.entity.kind === "track") ||
      hits.find((item) => item.object.userData.entity.kind === "zone");

    if (hit) this.onSelect(hit.object.userData.entity);
  }
}

export function sampleTrack(track, time) {
  if (time < track.points[0].time || time > track.points.at(-1).time) return null;

  for (let index = 0; index < track.points.length - 1; index += 1) {
    const start = track.points[index];
    const end = track.points[index + 1];
    if (time >= start.time && time <= end.time) {
      const amount = (time - start.time) / (end.time - start.time);
      return {
        lat: THREE.MathUtils.lerp(start.lat, end.lat, amount),
        lon: THREE.MathUtils.lerp(start.lon, end.lon, amount),
        altitudeFt: interpolateOptional(start.altitudeFt, end.altitudeFt, amount),
        speedKnots: interpolateOptional(start.speedKnots, end.speedKnots, amount),
        courseDeg: interpolateOptional(start.courseDeg, end.courseDeg, amount),
      };
    }
  }
  return track.points.at(-1);
}

export function isEntityVisible(entity, time, layerState) {
  if (entity.kind === "track") return isTrackLayerEnabled(entity.ref, layerState) && Boolean(sampleTrack(entity.ref, time));
  if (entity.kind === "incident") return layerState.incidents && entity.ref.time <= time;
  if (entity.kind === "zone") return layerState.zones && time >= entity.ref.activeStart && time <= entity.ref.activeEnd;
  return true;
}

function isTrackLayerEnabled(track, layerState) {
  if (track.type === "flight") return layerState.aircraft;
  if (track.type === "vessel") return layerState.maritime;
  return layerState.incidents;
}

function interpolateOptional(start, end, amount) {
  if (typeof start !== "number" || typeof end !== "number") return undefined;
  return THREE.MathUtils.lerp(start, end, amount);
}

function getVisualAltitude(track, point) {
  if (typeof point.altitudeFt === "number") {
    return THREE.MathUtils.clamp(point.altitudeFt / 500000, 0.025, 0.12);
  }
  return track.altitude || 0;
}

function getIncidentColor(category) {
  const colors = {
    strike: 0xff5d73,
    alert: 0xff9f43,
    closure: 0xf3ba4d,
    sighting: 0xff5d73,
    statement: 0xd7e1ea,
    satellite: 0x8ab4ff,
    social: 0xb58cff,
  };
  return colors[category] || 0xff5d73;
}
