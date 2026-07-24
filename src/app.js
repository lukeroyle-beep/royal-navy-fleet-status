import { EventDetailsPanel } from "./components/EventDetailsPanel.js";
import { GlobeView } from "./components/GlobeView.js";
import { ScenarioLoader } from "./components/ScenarioLoader.js";

const DATA_URL = "./data/royal-navy/vessels.json";
const elements = {
  title: document.querySelector("#mapTitle"),
  subtitle: document.querySelector("#mapSubtitle"),
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
  disclaimer: document.querySelector("#dataDisclaimer"),
  error: document.querySelector("#loadError"),
  errorMessage: document.querySelector("#loadErrorMessage"),
};

const details = new EventDetailsPanel({
  kind: document.querySelector("#detailKind"),
  title: document.querySelector("#detailTitle"),
  description: document.querySelector("#detailDescription"),
  meta: document.querySelector("#detailMeta"),
  source: document.querySelector("#detailSource"),
});

let dataset;
let selectedId = null;

const globe = new GlobeView({
  canvas: document.querySelector("#globe"),
  onSelect: (vessel) => selectVessel(vessel),
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
  elements.title.textContent = dataset.metadata.title;
  elements.subtitle.textContent = dataset.metadata.subtitle;
  elements.asOfDate.textContent = formatDate(dataset.metadata.asOfDate);
  elements.disclaimer.textContent = dataset.metadata.disclaimer;
  elements.totalCount.textContent = dataset.vessels.length.toString();
  elements.mappedCount.textContent = dataset.vessels.filter((vessel) => vessel.position).length.toString();
  fillSelect(elements.service, uniqueValues("service"));
  fillSelect(elements.status, uniqueValues("status"));
  fillSelect(elements.type, uniqueValues("vesselType"));
  globe.setVessels(dataset.vessels);
  details.renderDefault(dataset);

  for (const input of [elements.search, elements.service, elements.status, elements.type, elements.location]) {
    input.addEventListener("input", applyFilters);
    input.addEventListener("change", applyFilters);
  }
  elements.reset.addEventListener("click", resetFilters);
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
  globe.setVisibleVessels(filtered);
  if (selectedId && !filtered.some((vessel) => vessel.id === selectedId)) {
    selectedId = null;
    details.renderDefault(dataset);
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
      button.addEventListener("click", () => selectVessel(vessel));
      item.append(button);
      return item;
    }),
  );
}

function selectVessel(vessel) {
  selectedId = vessel.id;
  details.renderVessel(vessel);
  for (const button of elements.list.querySelectorAll("button")) {
    button.classList.toggle("is-selected", button.dataset.vesselId === vessel.id);
  }
  document.querySelector("#detailCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  elements.subtitle.textContent = "Fleet data unavailable";
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
    withheld: "Withheld",
  }[value];
}
