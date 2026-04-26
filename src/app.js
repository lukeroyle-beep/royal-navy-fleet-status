import * as THREE from "https://esm.sh/three@0.164.1";
import { OrbitControls } from "https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls.js";

const replay = {
  start: Date.parse("2022-09-25T00:00:00Z"),
  end: Date.parse("2022-09-27T18:00:00Z"),
  chapters: [
    {
      at: "2022-09-25T00:00:00Z",
      title: "Pre-event maritime pattern",
      summary:
        "The replay opens around Bornholm with representative AIS tracks and patrol activity. The goal is to show how an analyst could scrub correlated open-source layers in one place.",
    },
    {
      at: "2022-09-26T02:00:00Z",
      title: "Regional monitoring intensifies",
      summary:
        "Flight and maritime layers converge on the southern Baltic. Satellite passes are shown as timed collection windows rather than fixed assets.",
    },
    {
      at: "2022-09-26T17:03:00Z",
      title: "First pressure anomaly",
      summary:
        "Incident markers appear near the pipeline corridor as the timeline reaches the reported anomaly window. The side panel keeps context synchronized with the globe.",
    },
    {
      at: "2022-09-27T07:00:00Z",
      title: "Surface disturbance confirmed",
      summary:
        "The replay combines persistent incident markers, vessel positions, aircraft movement, and later satellite detections to show an analyst-ready event narrative.",
    },
  ],
  notes: [
    {
      at: "2022-09-25T06:20:00Z",
      text: "AIS layer: merchant vessel and patrol routes remain visible near Bornholm and the pipeline corridor.",
    },
    {
      at: "2022-09-26T02:10:00Z",
      text: "Flight layer: maritime patrol aircraft track enters the southern Baltic monitoring area.",
    },
    {
      at: "2022-09-26T17:03:00Z",
      text: "Incident layer: pressure anomaly marker added near the Nord Stream corridor.",
    },
    {
      at: "2022-09-27T05:40:00Z",
      text: "Satellite layer: pass window crosses the incident area for visual confirmation cueing.",
    },
    {
      at: "2022-09-27T09:15:00Z",
      text: "OSINT note: prototype data is curated and representative, designed to validate replay UX rather than assert attribution.",
    },
  ],
  tracks: [
    {
      id: "ais-alpha",
      type: "vessel",
      name: "AIS contact A",
      color: 0x2fd0b5,
      points: [
        ["2022-09-25T00:00:00Z", 54.62, 13.05],
        ["2022-09-25T12:00:00Z", 54.74, 14.18],
        ["2022-09-26T04:30:00Z", 55.02, 15.04],
        ["2022-09-26T16:30:00Z", 55.21, 15.62],
        ["2022-09-27T10:30:00Z", 55.42, 16.12],
      ],
    },
    {
      id: "ais-bravo",
      type: "vessel",
      name: "AIS contact B",
      color: 0x2fd0b5,
      points: [
        ["2022-09-25T04:00:00Z", 55.78, 13.8],
        ["2022-09-25T20:00:00Z", 55.35, 14.52],
        ["2022-09-26T08:00:00Z", 55.12, 15.1],
        ["2022-09-26T22:00:00Z", 55.08, 15.74],
        ["2022-09-27T14:00:00Z", 54.88, 16.42],
      ],
    },
    {
      id: "mpa-01",
      type: "flight",
      name: "Maritime patrol flight",
      color: 0xf3ba4d,
      altitude: 0.055,
      points: [
        ["2022-09-26T01:30:00Z", 54.36, 10.8],
        ["2022-09-26T03:00:00Z", 54.95, 12.25],
        ["2022-09-26T04:10:00Z", 55.35, 14.85],
        ["2022-09-26T05:20:00Z", 55.2, 16.1],
        ["2022-09-26T06:10:00Z", 54.65, 15.2],
      ],
    },
    {
      id: "sat-pass",
      type: "satellite",
      name: "Satellite collection pass",
      color: 0x8ab4ff,
      altitude: 0.09,
      points: [
        ["2022-09-27T04:30:00Z", 58.5, 10.8],
        ["2022-09-27T05:10:00Z", 57.1, 12.9],
        ["2022-09-27T05:50:00Z", 55.4, 15.3],
        ["2022-09-27T06:30:00Z", 53.8, 17.1],
        ["2022-09-27T07:10:00Z", 52.3, 19.2],
      ],
    },
  ],
  incidents: [
    {
      at: "2022-09-26T17:03:00Z",
      label: "Pressure anomaly",
      lat: 55.54,
      lon: 15.78,
    },
    {
      at: "2022-09-27T07:00:00Z",
      label: "Surface disturbance",
      lat: 55.59,
      lon: 15.64,
    },
  ],
};

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

let current = replay.start;
let playing = true;
let lastFrame = performance.now();

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
controls.autoRotateSpeed = 0.18;

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

const trackObjects = replay.tracks.map(createTrack);
const incidentObjects = replay.incidents.map(createIncident);

playPause.addEventListener("click", () => {
  playing = !playing;
  playPause.classList.toggle("is-playing", playing);
  playPause.setAttribute("aria-label", playing ? "Pause replay" : "Play replay");
});

scrubber.addEventListener("input", () => {
  playing = false;
  playPause.classList.remove("is-playing");
  const progress = Number(scrubber.value) / 1000;
  current = replay.start + (replay.end - replay.start) * progress;
  updateReplay();
});

window.addEventListener("resize", resize);
resize();
playPause.classList.add("is-playing");
playPause.setAttribute("aria-label", "Pause replay");
updateReplay();
animate();

function createTrack(track) {
  const material = new THREE.LineBasicMaterial({
    color: track.color,
    transparent: true,
    opacity: 0.94,
  });
  const trail = new THREE.Line(new THREE.BufferGeometry(), material);
  globeGroup.add(trail);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(track.type === "flight" ? 0.018 : 0.015, 20, 20),
    new THREE.MeshBasicMaterial({ color: track.color }),
  );
  marker.userData.trackType = track.type;
  globeGroup.add(marker);

  return {
    ...track,
    points: track.points.map(([time, lat, lon]) => ({ time: Date.parse(time), lat, lon })),
    trail,
    marker,
  };
}

function createIncident(incident) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.018, 0.032, 30),
    new THREE.MeshBasicMaterial({
      color: 0xff5d73,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    }),
  );
  const anchor = latLonToVector3(incident.lat, incident.lon, 1.012);
  ring.position.copy(anchor);
  ring.lookAt(anchor.clone().multiplyScalar(1.2));
  globeGroup.add(ring);
  return { ...incident, time: Date.parse(incident.at), object: ring };
}

function updateReplay() {
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
    track.marker.visible = Boolean(sampled);
    track.trail.visible = Boolean(sampled);

    if (!sampled) continue;

    visibleTypes.add(track.type);
    visibleCount += 1;
    track.marker.position.copy(latLonToVector3(sampled.lat, sampled.lon, 1.028 + (track.altitude || 0)));

    const trailPoints = track.points
      .filter((point) => point.time <= current)
      .map((point) => latLonToVector3(point.lat, point.lon, 1.018 + (track.altitude || 0)));

    if (trailPoints.length === 1) {
      trailPoints.push(track.marker.position.clone());
    } else if (trailPoints.length > 1) {
      trailPoints.push(track.marker.position.clone());
    }

    track.trail.geometry.dispose();
    track.trail.geometry = new THREE.BufferGeometry().setFromPoints(trailPoints);
  }

  for (const incident of incidentObjects) {
    incident.object.visible = incident.time <= current;
    if (incident.object.visible) {
      visibleTypes.add("incident");
      const pulse = 1 + Math.sin(performance.now() / 260) * 0.18;
      incident.object.scale.setScalar(pulse);
    }
  }

  activeLayers.textContent = visibleTypes.size.toString();
  visibleTracks.textContent = visibleCount.toString();
  updateNarrative();
}

function updateNarrative() {
  const chapter = replay.chapters
    .map((item) => ({ ...item, time: Date.parse(item.at) }))
    .filter((item) => item.time <= current)
    .at(-1);

  chapterTitle.textContent = chapter?.title || replay.chapters[0].title;
  chapterSummary.textContent = chapter?.summary || replay.chapters[0].summary;

  const notes = replay.notes
    .map((item) => ({ ...item, time: Date.parse(item.at) }))
    .filter((item) => item.time <= current)
    .slice(-5)
    .reverse();

  intelList.innerHTML = notes
    .map((note) => {
      const stamp = new Date(note.time).toISOString().replace("T", " ").slice(0, 16);
      return `<li><time>${stamp} UTC</time>${note.text}</li>`;
    })
    .join("");
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
      };
    }
  }

  return track.points.at(-1);
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
