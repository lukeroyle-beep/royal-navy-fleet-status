import { EventDetailsPanel } from "./components/EventDetailsPanel.js";
import { FleetMap } from "./components/FleetMap.js";
import { ScenarioLoader } from "./components/ScenarioLoader.js";
import { hasPlottablePosition } from "./utils/map.js";
import "./styles.css";

const DATA_URL = "./data/royal-navy/vessels.json";
const elements = {
  asOfDate: document.querySelector("#asOfDate"),
  totalCount: document.querySelector("#totalCount"),
  mappedCount: document.querySelector("#mappedCount"),
  filteredCount: document.querySelector("#filteredCount"),
  search: document.querySelector("#searchInput"),
  service: document.querySelector("#serviceFilter"),
  status: document.querySelector("#statusFilter"),
  type: document.querySelector("#typeFilter"),
  location: document.querySelector("#locationFilter"),
  reset: document.querySelector("#resetFilters"),
  list: document.querySelector("#vesselList"),
  resultsStatus: document.querySelector("#resultsStatus"),
  error: document.querySelector("#loadError"),
  errorMessage: document.querySelector("#loadErrorMessage"),
  mapNotice: document.querySelector("#mapNotice"),
  mapReset: document.querySelector("#resetMap"),
};

const details = new EventDetailsPanel({
  kind: document.querySelector("#detailKind"),
  title: document.querySelector("#detailTitle"),
  description: document.querySelector("#detailDescription"),
  meta: document.querySelector("#detailMeta"),
  photo: document.querySelector("#detailPhoto"),
  photoImage: document.querySelector("#detailPhotoImage"),
});

let dataset;
let selectedId = null;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const fleetMap = new FleetMap({
  container: document.querySelector("#fleetMap"),
  notice: elements.mapNotice,
  onSelect: (vessel) => selectVessel(vessel, { source: "map" }),
});

initialize();

async function initialize() {
  try {
    dataset = await new ScenarioLoader(DATA_URL).load();
    bindDataset();
  } catch (error) {
    showError(error);
  }
}

function bindDataset() {
  elements.asOfDate.textContent = formatDate(dataset.metadata.asOfDate);
  elements.totalCount.textContent = dataset.vessels.length.toString();
  elements.mappedCount.textContent = dataset.vessels.filter(hasPlottablePosition).length.toString();
  fillSelect(elements.service, uniqueValues("service"));
  fillSelect(elements.status, uniqueValues("status"));
  fillSelect(elements.type, uniqueValues("vesselType"));
  fleetMap.setVessels(dataset.vessels);
  details.renderDefault(dataset);

  elements.search.addEventListener("input", applyFilters);
  for (const select of [elements.service, elements.status, elements.type, elements.location]) {
    select.addEventListener("change", applyFilters);
  }
  elements.reset.addEventListener("click", resetFilters);
  elements.mapReset.addEventListener("click", () => fleetMap.resetView());
  applyFilters();
}

function uniqueValues(field) {
  return [...new Set(dataset.vessels.map((vessel) => vessel[field]))].sort((a, b) => a.localeCompare(b));
}

function fillSelect(select, values) {
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

function applyFilters() {
  const query = elements.search.value.trim().toLocaleLowerCase("en-GB");
  const filtered = dataset.vessels.filter((vessel) => {
    const matchesQuery =
      !query ||
      vessel.name.toLocaleLowerCase("en-GB").includes(query) ||
      (vessel.pennantNumber || "").toLocaleLowerCase("en-GB").includes(query);
    return (
      matchesQuery &&
      (!elements.service.value || vessel.service === elements.service.value) &&
      (!elements.status.value || vessel.status === elements.status.value) &&
      (!elements.type.value || vessel.vesselType === elements.type.value) &&
      (!elements.location.value || vessel.locationClassification === elements.location.value)
    );
  });

  elements.filteredCount.textContent = filtered.length.toString();
  elements.resultsStatus.textContent = `${filtered.length} of ${dataset.vessels.length}`;
  renderList(filtered);
  fleetMap.setVisibleVessels(filtered);
  if (selectedId && !filtered.some((vessel) => vessel.id === selectedId)) {
    selectedId = null;
    details.renderDefault(dataset);
    fleetMap.clearSelection();
  }
}

function renderList(vessels) {
  elements.list.replaceChildren(
    ...vessels.map((vessel) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const heading = document.createElement("span");
      const meta = document.createElement("small");
      button.type = "button";
      button.dataset.vesselId = vessel.id;
      button.className = vessel.id === selectedId ? "is-selected" : "";
      heading.textContent = vessel.name;
      meta.textContent = `${vessel.pennantNumber || "No pennant"} · ${vessel.status} · ${formatClassification(vessel.locationClassification)}`;
      button.append(heading, meta);
      button.addEventListener("click", () => selectVessel(vessel, { source: "list" }));
      item.append(button);
      return item;
    }),
  );
}

function selectVessel(vessel, { source = "list" } = {}) {
  selectedId = vessel.id;
  details.renderVessel(vessel);
  fleetMap.selectVessel(vessel, { focus: source === "list" });
  for (const button of elements.list.querySelectorAll("button")) {
    button.classList.toggle("is-selected", button.dataset.vesselId === vessel.id);
  }
  document
    .querySelector("#detailCard")
    .scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
}

function resetFilters() {
  elements.search.value = "";
  elements.service.value = "";
  elements.status.value = "";
  elements.type.value = "";
  elements.location.value = "";
  applyFilters();
  elements.search.focus();
}

function showError(error) {
  elements.error.hidden = false;
  elements.errorMessage.textContent = error instanceof Error ? error.message : "Unknown fleet data error.";
}

function formatDate(value) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatClassification(value) {
  return {
    mapped: "Mapped",
    approximate: "Approximate",
    unknown: "Unknown",
    withheld: "Classified",
  }[value];
}
