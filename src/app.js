import { GlobeView, isEntityVisible, sampleTrack } from "./components/GlobeView.js";
import { ScenarioLoader } from "./components/ScenarioLoader.js";
import { TimelineControls } from "./components/TimelineControls.js";
import { LayerTogglePanel } from "./components/LayerTogglePanel.js";
import { EventDetailsPanel } from "./components/EventDetailsPanel.js";

const SCENARIO_URL = "./data/scenarios/red-sea-demo.json";

const elements = {
  scenarioTitle: document.querySelector("#scenarioTitle"),
  scenarioSubtitle: document.querySelector("#scenarioSubtitle"),
  scenarioDisclaimer: document.querySelector("#scenarioDisclaimer"),
  dateLabel: document.querySelector("#dateLabel"),
  timeLabel: document.querySelector("#timeLabel"),
  chapterTitle: document.querySelector("#chapterTitle"),
  chapterSummary: document.querySelector("#chapterSummary"),
  intelList: document.querySelector("#intelList"),
  activeLayers: document.querySelector("#activeLayers"),
  visibleTracks: document.querySelector("#visibleTracks"),
};

let scenario;
let current = 0;
let playing = true;
let lastFrame = performance.now();
let selectedEntity = null;
let layerState = {
  aircraft: true,
  maritime: true,
  incidents: true,
  zones: true,
};

const detailsPanel = new EventDetailsPanel({
  kind: document.querySelector("#detailKind"),
  title: document.querySelector("#detailTitle"),
  description: document.querySelector("#detailDescription"),
  meta: document.querySelector("#detailMeta"),
  confidenceRow: document.querySelector("#confidenceRow"),
  confidenceLabel: document.querySelector("#confidenceLabel"),
  confidenceBar: document.querySelector("#confidenceBar"),
});

const timeline = new TimelineControls({
  playPause: document.querySelector("#playPause"),
  scrubber: document.querySelector("#scrubber"),
  speed: document.querySelector("#speed"),
  onPlayChange: (nextPlaying) => {
    playing = nextPlaying;
  },
  onScrub: (time) => {
    current = time;
    updateReplay();
  },
});

new LayerTogglePanel({
  inputs: [...document.querySelectorAll("[data-layer-toggle]")],
  onChange: (nextState) => {
    layerState = nextState;
    if (selectedEntity && !isEntityVisible(selectedEntity, current, layerState)) {
      selectedEntity = null;
      detailsPanel.renderDefault(scenario);
    }
    updateReplay();
  },
});

const globeView = new GlobeView({
  canvas: document.querySelector("#globe"),
  onSelect: (entity) => {
    selectedEntity = entity;
    detailsPanel.renderEntity(entity, current, sampleTrack);
  },
});

try {
  scenario = await new ScenarioLoader(SCENARIO_URL).load();
  current = scenario.start;
  bindScenario(scenario);
  updateReplay();
  detailsPanel.renderDefault(scenario);
  timeline.setPlaying(true);
  requestAnimationFrame(animate);
} catch (error) {
  showLoadError(error);
}

function bindScenario(nextScenario) {
  elements.scenarioTitle.textContent = nextScenario.metadata.title;
  elements.scenarioSubtitle.textContent = nextScenario.metadata.subtitle;
  elements.scenarioDisclaimer.textContent = nextScenario.metadata.disclaimer;
  document.title = `${nextScenario.metadata.title} | Sentinel Replay MVP`;
  timeline.bindRange(nextScenario.start, nextScenario.end);
  globeView.setScenario(nextScenario);
}

function updateReplay() {
  if (!scenario) return;

  const now = new Date(current);
  elements.dateLabel.textContent = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  elements.timeLabel.textContent = `${now.toISOString().slice(11, 16)} UTC`;
  timeline.setTime(current);

  const status = globeView.update(current, layerState, selectedEntity);
  if (!status.selectedStillVisible) {
    selectedEntity = null;
    detailsPanel.renderDefault(scenario);
  } else if (selectedEntity) {
    detailsPanel.renderEntity(selectedEntity, current, sampleTrack);
  }

  elements.activeLayers.textContent = status.activeLayers.toString();
  elements.visibleTracks.textContent = status.visibleTracks.toString();
  updateNarrative();
}

function updateNarrative() {
  const chapter = scenario.chapters.filter((item) => item.time <= current).at(-1) || scenario.chapters[0];
  elements.chapterTitle.textContent = chapter.title;
  elements.chapterSummary.textContent = chapter.summary;

  const incidentNotes = layerState.incidents
    ? scenario.incidents
      .filter((incident) => incident.time <= current)
      .map((incident) => ({
        time: incident.time,
        sourceType: `${incident.category} | ${incident.confidence} confidence`,
        text: `${incident.title}: ${incident.description}`,
      }))
    : [];

  const zoneNotes = layerState.zones
    ? scenario.zones
      .filter((zone) => current >= zone.activeStart && current <= zone.activeEnd)
      .map((zone) => ({
        time: zone.activeStart,
        sourceType: zone.type.replaceAll("_", " "),
        text: `${zone.title}: ${zone.description}`,
      }))
    : [];

  const notes = [...scenario.notes.filter((item) => item.time <= current), ...incidentNotes, ...zoneNotes]
    .sort((a, b) => a.time - b.time)
    .slice(-5)
    .reverse();

  elements.intelList.innerHTML = notes
    .map((note) => {
      const stamp = new Date(note.time).toISOString().replace("T", " ").slice(0, 16);
      return `<li><time>${stamp} UTC | ${note.sourceType}</time>${note.text}</li>`;
    })
    .join("");
}

function animate(time = performance.now()) {
  const delta = time - lastFrame;
  lastFrame = time;

  if (playing) {
    current += delta * timeline.getSpeed() * 240;
    if (current >= scenario.end) current = scenario.start;
  }

  updateReplay();
  requestAnimationFrame(animate);
}

function showLoadError(error) {
  playing = false;
  elements.scenarioTitle.textContent = "Scenario failed to load";
  elements.chapterTitle.textContent = "Local JSON unavailable";
  elements.chapterSummary.textContent = error instanceof Error ? error.message : "Unknown scenario loading error.";
  elements.scenarioDisclaimer.textContent = "Serve the project over HTTP so the browser can load local JSON files.";
  elements.activeLayers.textContent = "0";
  elements.visibleTracks.textContent = "0";
}
