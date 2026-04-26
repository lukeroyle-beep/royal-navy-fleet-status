import * as THREE from "https://esm.sh/three@0.164.1";
import { OrbitControls } from "https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls.js";

const SCENARIO_URL = "./data/scenarios/red-sea-disruption.json";

const scenarioTitle = document.querySelector("#scenarioTitle");
const scenarioSubtitle = document.querySelector("#scenarioSubtitle");
const scenarioDisclaimer = document.querySelector("#scenarioDisclaimer");
const canvas = document.querySelector("#globe");
const dateLabel = document.querySelector("#dateLabel");
const timeLabel = document.querySelector("#timeLabel");
const playPause = document.querySelector("#playPause");
const scrubber = document.querySelector("#scrubber");
const speed = document.querySelector("#speed");
const chapterTitle = document.querySelector("#chapterTitle");
const chapterSummary = document.querySelector("#chapterSummary");
const intelList = document.querySelector("#intelList");
const activeLayers = document.querySelector("#activeLayers");
const visibleTracks = document.querySelector("#visibleTracks");
const detailKind = document.querySelector("#detailKind");
const detailTitle = document.querySelector("#detailTitle");
const detailDescription = document.querySelector("#detailDescription");
const detailMeta = document.querySelector("#detailMeta");
const confidenceRow = document.querySelector("#confidenceRow");
const confidenceLabel = document.querySelector("#confidenceLabel");
const confidenceBar = document.querySelector("#confidenceBar");
const layerToggleInputs = [...document.querySelectorAll("[data-layer-toggle]")];

let replay;
let current = 0;
let playing = true;
let lastFrame = performance.now();
let trackObjects = [];
let incidentObjects = [];
let zoneObjects = [];
let selectedEntity = null;

const layerState = {
  aircraft: true,
  maritime: true,
  incidents: true,
  zones: true,
};

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x070b12, 3.1, 6.2);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
camera.position.set(0.15, 1.35, 3.1);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 2.05;
controls.maxDistance = 4.8;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.15;

const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 0.025;
const pointer = new THREE.Vector2();

const globeGroup = new THREE.Group();
scene.add(globeGroup);

const globe = new THREE.Mesh(
  new THREE.SphereGeometry(1, 96, 96),
  new THREE.MeshStandardMaterial({
    map: makeGlobeTexture(),
    roughness: 0.72,
    metalness: 0.05,
  }),
);
globeGroup.add(globe);

globeGroup.add(
  new THREE.Mesh(
    new THREE.SphereGeometry(1.006, 96, 96),
    new THREE.MeshBasicMaterial({
      color: 0x78c8ff,
      wireframe: true,
      transparent: true,
      opacity: 0.055,
    }),
  ),
);

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(1.045, 96, 96),
  new THREE.MeshBasicMaterial({
    color: 0x71b7ff,
    transparent: true,
    opacity: 0.13,
    side: THREE.BackSide,
  }),
);
globeGroup.add(atmosphere);

scene.add(new THREE.AmbientLight(0x9ec9ff, 1.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(2.5, 1.4, 1.7);
scene.add(keyLight);

playPause.addEventListener("click", () => {
  playing = !playing;
  playPause.classList.toggle("is-playing", playing);
  playPause.setAttribute("aria-label", playing ? "Pause replay" : "Play replay");
});

canvas.addEventListener("pointerdown", handleCanvasPick);

layerToggleInputs.forEach((input) => {
  input.addEventListener("change", () => {
    layerState[input.dataset.layerToggle] = input.checked;
    if (selectedEntity && !isEntityLayerEnabled(selectedEntity)) {
      selectedEntity = null;
      renderDefaultDetails();
    }
    updateReplay();
  });
});

scrubber.addEventListener("input", () => {
  if (!replay) return;
  playing = false;
  playPause.classList.remove("is-playing");
  playPause.setAttribute("aria-label", "Play replay");
  const progress = Number(scrubber.value) / 1000;
  current = replay.start + (replay.end - replay.start) * progress;
  updateReplay();
});

window.addEventListener("resize", resize);
resize();

try {
  replay = normalizeScenario(await loadScenario(SCENARIO_URL));
  current = replay.start;
  bindScenario(replay);
  updateReplay();
  renderDefaultDetails();
  animate();
} catch (error) {
  showLoadError(error);
}

async function loadScenario(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load scenario JSON from ${url}`);
  }
  return response.json();
}

function normalizeScenario(raw) {
  const aircraftTracks = (raw.aircraftTracks || []).map((track) => ({
    id: track.id,
    type: "flight",
    name: track.callsign,
    assetType: track.aircraftType,
    sourceLabel: track.sourceLabel,
    color: track.color || "#f3ba4d",
    colorValue: new THREE.Color(track.color || "#f3ba4d").getHex(),
    points: track.points.map((point) => ({
      time: Date.parse(point.timestamp),
      lat: point.lat,
      lon: point.lon,
      altitudeFt: point.altitudeFt,
    })),
  }));

  const maritimeTracks = (raw.maritimeTracks || []).map((track) => ({
    id: track.vesselId,
    type: "vessel",
    name: track.vesselName,
    assetType: track.vesselType,
    sourceLabel: track.sourceLabel,
    color: track.color || "#2fd0b5",
    colorValue: new THREE.Color(track.color || "#2fd0b5").getHex(),
    points: track.points.map((point) => ({
      time: Date.parse(point.timestamp),
      lat: point.lat,
      lon: point.lon,
      speedKnots: point.speedKnots,
      courseDeg: point.courseDeg,
    })),
  }));

  const auxiliaryTracks = (raw.tracks || []).map((track) => ({
    ...track,
    sourceLabel: track.sourceLabel || "Curated OSINT mock",
    colorValue: new THREE.Color(track.color).getHex(),
    points: track.points.map(([time, lat, lon]) => ({ time: Date.parse(time), lat, lon })),
  }));

  return {
    ...raw,
    start: Date.parse(raw.start),
    end: Date.parse(raw.end),
    chapters: raw.chapters.map((item) => ({ ...item, time: Date.parse(item.at) })),
    notes: raw.notes.map((item) => ({ ...item, time: Date.parse(item.at) })),
    tracks: [...maritimeTracks, ...aircraftTracks, ...auxiliaryTracks],
    incidents: (raw.incidents || []).map((incident) => ({
      ...incident,
      time: Date.parse(incident.timestamp),
    })),
    zones: (raw.zones || []).map((zone) => ({
      ...zone,
      activeStart: Date.parse(zone.activeFrom),
      activeEnd: Date.parse(zone.activeUntil),
      colorValue: new THREE.Color(zone.color || "#ff5d73").getHex(),
    })),
  };
}

function bindScenario(nextReplay) {
  scenarioTitle.textContent = nextReplay.metadata.title;
  scenarioSubtitle.textContent = nextReplay.metadata.subtitle;
  scenarioDisclaimer.textContent = nextReplay.metadata.disclaimer;
  document.title = `${nextReplay.metadata.title} | Sentinel Replay MVP`;
  globeGroup.rotation.y = THREE.MathUtils.degToRad(-(nextReplay.metadata.center.lon + 90));
  globeGroup.rotation.x = THREE.MathUtils.degToRad(nextReplay.metadata.center.lat * 0.25);
  trackObjects = nextReplay.tracks.map(createTrack);
  incidentObjects = nextReplay.incidents.map(createIncident);
  zoneObjects = nextReplay.zones.map(createZone);
  playPause.classList.add("is-playing");
  playPause.setAttribute("aria-label", "Pause replay");
}

function createTrack(track) {
  const material = new THREE.LineBasicMaterial({
    color: track.colorValue,
    transparent: true,
    opacity: 0.94,
  });
  const trail = new THREE.Line(new THREE.BufferGeometry(), material);
  globeGroup.add(trail);

  const markerRadius = track.type === "flight" || track.type === "osint" ? 0.018 : 0.015;
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(markerRadius, 20, 20),
    new THREE.MeshBasicMaterial({ color: track.colorValue }),
  );
  marker.userData.entity = { kind: "track", ref: track };
  globeGroup.add(marker);
  trail.userData.entity = { kind: "track", ref: track };

  return { ...track, trail, marker };
}

function createIncident(incident) {
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
  globeGroup.add(ring);

  const hitTarget = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
  );
  hitTarget.position.copy(anchor);
  hitTarget.userData.entity = { kind: "incident", ref: incident };
  globeGroup.add(hitTarget);

  return { ...incident, object: ring, hitObject: hitTarget };
}

function createZone(zone) {
  const points = zone.polygon.map(([lat, lon]) => latLonToVector3(lat, lon, 1.016));
  const material = new THREE.LineBasicMaterial({
    color: zone.colorValue,
    transparent: true,
    opacity: 0.72,
  });
  const boundary = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
  boundary.userData.entity = { kind: "zone", ref: zone };
  globeGroup.add(boundary);
  return { ...zone, object: boundary };
}

function updateReplay() {
  if (!replay) return;

  const now = new Date(current);
  dateLabel.textContent = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  timeLabel.textContent = `${now.toISOString().slice(11, 16)} UTC`;
  scrubber.value = ((current - replay.start) / (replay.end - replay.start)) * 1000;

  const visibleTypes = new Set();
  let visibleCount = 0;

  for (const track of trackObjects) {
    const sampled = sampleTrack(track, current);
    const enabled = isTrackLayerEnabled(track);
    track.marker.visible = Boolean(sampled) && enabled;
    track.trail.visible = Boolean(sampled) && enabled;

    if (!sampled || !enabled) continue;

    visibleTypes.add(track.type);
    visibleCount += 1;
    const altitude = getVisualAltitude(track, sampled);
    track.marker.position.copy(latLonToVector3(sampled.lat, sampled.lon, 1.028 + altitude));

    const trailPoints = track.points
      .filter((point) => point.time <= current)
      .map((point) => latLonToVector3(point.lat, point.lon, 1.018 + getVisualAltitude(track, point)));

    trailPoints.push(track.marker.position.clone());
    track.trail.geometry.dispose();
    track.trail.geometry = new THREE.BufferGeometry().setFromPoints(trailPoints);
  }

  for (const incident of incidentObjects) {
    incident.object.visible = incident.time <= current && layerState.incidents;
    incident.hitObject.visible = incident.object.visible;
    if (incident.object.visible) {
      visibleTypes.add("incident");
      const pulse = 1 + Math.sin(performance.now() / 260) * 0.18;
      incident.object.scale.setScalar(pulse);
    }
  }

  for (const zone of zoneObjects) {
    zone.object.visible = current >= zone.activeStart && current <= zone.activeEnd && layerState.zones;
    if (zone.object.visible) {
      visibleTypes.add("zone");
    }
  }

  if (selectedEntity && !isEntityVisible(selectedEntity)) {
    selectedEntity = null;
    renderDefaultDetails();
  } else if (selectedEntity) {
    renderEntityDetails(selectedEntity);
  }

  activeLayers.textContent = visibleTypes.size.toString();
  visibleTracks.textContent = visibleCount.toString();
  updateNarrative();
}

function updateNarrative() {
  const chapter = replay.chapters.filter((item) => item.time <= current).at(-1) || replay.chapters[0];
  chapterTitle.textContent = chapter.title;
  chapterSummary.textContent = chapter.summary;

  const incidentNotes = layerState.incidents
    ? replay.incidents
    .filter((incident) => incident.time <= current)
    .map((incident) => ({
      time: incident.time,
      sourceType: `${incident.category} | ${incident.confidence} confidence`,
      text: `${incident.title}: ${incident.description}`,
    }))
    : [];

  const zoneNotes = layerState.zones
    ? replay.zones
    .filter((zone) => current >= zone.activeStart && current <= zone.activeEnd)
    .map((zone) => ({
      time: zone.activeStart,
      sourceType: zone.type.replaceAll("_", " "),
      text: `${zone.title}: ${zone.description}`,
    }))
    : [];

  const notes = [...replay.notes.filter((item) => item.time <= current), ...incidentNotes, ...zoneNotes]
    .sort((a, b) => a.time - b.time)
    .slice(-5)
    .reverse();

  intelList.innerHTML = notes
    .map((note) => {
      const stamp = new Date(note.time).toISOString().replace("T", " ").slice(0, 16);
      return `<li><time>${stamp} UTC | ${note.sourceType}</time>${note.text}</li>`;
    })
    .join("");
}

function handleCanvasPick(event) {
  if (!replay) return;

  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const pickable = [
    ...trackObjects.flatMap((track) => [track.marker, track.trail]),
    ...incidentObjects.flatMap((incident) => [incident.object, incident.hitObject]),
    ...zoneObjects.map((zone) => zone.object),
  ].filter((object) => object.visible);
  const hits = raycaster.intersectObjects(pickable, false).filter((item) => item.object.userData.entity);
  const hit =
    hits.find((item) => item.object.userData.entity.kind === "incident") ||
    hits.find((item) => item.object.userData.entity.kind === "track") ||
    hits.find((item) => item.object.userData.entity.kind === "zone");

  if (!hit) return;

  selectedEntity = hit.object.userData.entity;
  renderEntityDetails(selectedEntity);
}

function renderDefaultDetails() {
  detailKind.textContent = "Replay engine";
  detailTitle.textContent = "Click a track, marker, or zone";
  detailDescription.textContent =
    "The globe is focused on the scenario region. Play or scrub the timeline, then select visible evidence layers for source and confidence details.";
  confidenceRow.hidden = true;
  renderMeta([
    ["Region", replay?.metadata.region || "Loading"],
    ["Scenario", replay?.metadata.subtitle || "Curated demo"],
    ["Data", "Static mocked OSINT-style JSON"],
  ]);
}

function renderEntityDetails(entity) {
  if (entity.kind === "track") {
    renderTrackDetails(entity.ref);
  } else if (entity.kind === "incident") {
    renderIncidentDetails(entity.ref);
  } else if (entity.kind === "zone") {
    renderZoneDetails(entity.ref);
  }
}

function renderTrackDetails(track) {
  const sample = sampleTrack(track, current) || track.points.at(-1);
  detailKind.textContent = track.type === "vessel" ? "Maritime track" : track.type === "flight" ? "Aircraft track" : "Context track";
  detailTitle.textContent = track.name;
  detailDescription.textContent = track.assetType
    ? `${track.assetType} from ${track.sourceLabel}.`
    : `Curated ${track.type} movement from ${track.sourceLabel}.`;
  confidenceRow.hidden = true;

  const meta = [
    ["ID", track.id],
    ["Source", track.sourceLabel],
    ["Position", `${sample.lat.toFixed(2)}, ${sample.lon.toFixed(2)}`],
  ];

  if (typeof sample.altitudeFt === "number") {
    meta.push(["Altitude", `${Math.round(sample.altitudeFt).toLocaleString("en-GB")} ft`]);
  }
  if (typeof sample.speedKnots === "number") {
    meta.push(["Speed", `${sample.speedKnots.toFixed(1)} kt`]);
  }
  if (typeof sample.courseDeg === "number") {
    meta.push(["Course", `${Math.round(sample.courseDeg)} deg`]);
  }

  renderMeta(meta);
}

function renderIncidentDetails(incident) {
  detailKind.textContent = `${incident.category} marker`;
  detailTitle.textContent = incident.title;
  detailDescription.textContent = incident.description;
  setConfidence(incident.confidence);
  renderMeta([
    ["Timestamp", formatTimestamp(incident.time)],
    ["Position", `${incident.lat.toFixed(2)}, ${incident.lon.toFixed(2)}`],
    ["Source", incident.sourceUrl],
  ]);
}

function renderZoneDetails(zone) {
  detailKind.textContent = zone.type.replaceAll("_", " ");
  detailTitle.textContent = zone.title;
  detailDescription.textContent = zone.description;
  confidenceRow.hidden = true;
  renderMeta([
    ["Active from", formatTimestamp(zone.activeStart)],
    ["Active until", formatTimestamp(zone.activeEnd)],
    ["Source", zone.sourceLabel],
    ["Vertices", zone.polygon.length.toString()],
  ]);
}

function renderMeta(rows) {
  detailMeta.replaceChildren();
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    detailMeta.append(row);
  }
}

function setConfidence(confidence) {
  const settings = {
    low: { fill: "34%", glow: "rgba(255, 93, 115, 0.32)" },
    medium: { fill: "66%", glow: "rgba(243, 186, 77, 0.32)" },
    high: { fill: "100%", glow: "rgba(47, 208, 181, 0.32)" },
  };
  const next = settings[confidence] || settings.low;
  confidenceRow.hidden = false;
  confidenceLabel.textContent = confidence;
  confidenceBar.style.setProperty("--confidence-fill", next.fill);
  confidenceBar.style.setProperty("--confidence-glow", next.glow);
}

function formatTimestamp(time) {
  return `${new Date(time).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

function isTrackLayerEnabled(track) {
  if (track.type === "flight") return layerState.aircraft;
  if (track.type === "vessel") return layerState.maritime;
  return layerState.incidents;
}

function isEntityLayerEnabled(entity) {
  if (entity.kind === "track") return isTrackLayerEnabled(entity.ref);
  if (entity.kind === "incident") return layerState.incidents;
  if (entity.kind === "zone") return layerState.zones;
  return true;
}

function isEntityVisible(entity) {
  if (!isEntityLayerEnabled(entity)) return false;
  if (entity.kind === "track") return Boolean(sampleTrack(entity.ref, current));
  if (entity.kind === "incident") return entity.ref.time <= current;
  if (entity.kind === "zone") return current >= entity.ref.activeStart && current <= entity.ref.activeEnd;
  return true;
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

function sampleTrack(track, time) {
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

function latLonToVector3(lat, lon, radius) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function makeGlobeTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 2048;
  textureCanvas.height = 1024;
  const ctx = textureCanvas.getContext("2d");

  const ocean = ctx.createLinearGradient(0, 0, 0, textureCanvas.height);
  ocean.addColorStop(0, "#10283b");
  ocean.addColorStop(0.5, "#173a4c");
  ocean.addColorStop(1, "#0b1c2c");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, textureCanvas.width, textureCanvas.height);

  ctx.strokeStyle = "rgba(220, 245, 255, 0.12)";
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 15) {
    const x = ((lon + 180) / 360) * textureCanvas.width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, textureCanvas.height);
    ctx.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = ((90 - lat) / 180) * textureCanvas.height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(textureCanvas.width, y);
    ctx.stroke();
  }

  drawLand(ctx, [
    [-11, 35],
    [20, 34],
    [34, 45],
    [32, 62],
    [18, 70],
    [-6, 58],
  ]);
  drawLand(ctx, [
    [34, 35],
    [72, 28],
    [124, 48],
    [147, 62],
    [110, 74],
    [52, 67],
  ]);
  drawLand(ctx, [
    [-168, 15],
    [-128, 24],
    [-80, 44],
    [-52, 58],
    [-96, 72],
    [-155, 60],
  ]);
  drawLand(ctx, [
    [-84, -55],
    [-48, -35],
    [-34, -8],
    [-70, 11],
    [-82, -16],
    [-76, -38],
  ]);
  drawLand(ctx, [
    [-18, -35],
    [17, -35],
    [36, -5],
    [30, 24],
    [6, 35],
    [-12, 10],
  ]);
  drawLand(ctx, [
    [112, -44],
    [154, -36],
    [146, -12],
    [116, -16],
  ]);

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillRect(0, 0, textureCanvas.width, 46);
  ctx.fillRect(0, textureCanvas.height - 54, textureCanvas.width, 54);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawLand(ctx, coords) {
  ctx.beginPath();
  coords.forEach(([lon, lat], index) => {
    const x = ((lon + 180) / 360) * 2048;
    const y = ((90 - lat) / 180) * 1024;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "#58735d";
  ctx.fill();
  ctx.strokeStyle = "rgba(230, 248, 235, 0.22)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate(time = performance.now()) {
  const delta = time - lastFrame;
  lastFrame = time;

  if (playing) {
    current += delta * Number(speed.value) * 240;
    if (current >= replay.end) current = replay.start;
  }

  updateReplay();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function showLoadError(error) {
  playing = false;
  scenarioTitle.textContent = "Scenario failed to load";
  chapterTitle.textContent = "Local JSON unavailable";
  chapterSummary.textContent = error instanceof Error ? error.message : "Unknown scenario loading error.";
  scenarioDisclaimer.textContent = "Serve the project over HTTP so the browser can load local JSON files.";
  activeLayers.textContent = "0";
  visibleTracks.textContent = "0";
}
