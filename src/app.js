import {
  EventDetailsPanel,
  formatLocationPrecision,
  formatLocationState,
} from "./components/EventDetailsPanel.js";
import {
  FleetInsightsLoader,
  insightsMatchDataset,
} from "./components/FleetInsightsLoader.js";
import { FleetMap } from "./components/FleetMap.js";
import { ScenarioLoader } from "./components/ScenarioLoader.js";
import { ShoreEstablishmentLoader } from "./components/ShoreEstablishmentLoader.js";
import { SurfaceController } from "./components/SurfaceController.js";
import {
  AVAILABILITY_STATUS_ORDER,
  getAvailabilitySummary,
  getFleetStatusSummary,
} from "./utils/fleet.js";
import { shortClassName } from "./utils/insights.js";
import { filterShoreEstablishments, shoreTypes } from "./utils/shore.js";
import {
  formatDatasetReleaseLabel,
  formatPublicationFreshness,
  formatPublicationChangeLabels,
} from "./utils/release.js";
import { countActiveFilters, formatVesselResultSummary } from "./utils/interface.js";
import "./styles.css";

const DATA_URL = "./data/royal-navy/vessels.json";
const SHORE_DATA_URL = "./data/royal-navy/shore-establishments.json";
const CHANGES_URL = "./data/royal-navy/publication-changes.json";
const HISTORY_URL = "./data/royal-navy/status-history.jsonl";
const CLASS_PRIORITY = [
  "Type 45 / Daring class",
  "Type 23 / Duke class",
  "River class",
  "Hunt class",
  "Astute class",
  "Tide class",
  "Queen Elizabeth class",
  "Bay class",
];

const elements = {
  asOfDate: document.querySelector("#asOfDate"),
  publicationFreshness: document.querySelector("#publicationFreshness"),
  fleetToggle: document.querySelector("#fleetToggle"),
  layersToggle: document.querySelector("#layersToggle"),
  filterToggle: document.querySelector("#filterToggle"),
  filterBadge: document.querySelector("#filterBadge"),
  changesToggle: document.querySelector("#changesToggle"),
  changesCount: document.querySelector("#changesCount"),
  changesPanel: document.querySelector("#changesPanel"),
  changesSummary: document.querySelector("#changesSummary"),
  changesList: document.querySelector("#changesList"),
  totalCount: document.querySelector("#totalCount"),
  fleetAvailabilityPercentage: document.querySelector("#fleetAvailabilityPercentage"),
  fleetAvailabilityFormula: document.querySelector("#fleetAvailabilityFormula"),
  deployedCount: document.querySelector("#deployedCount"),
  refitCount: document.querySelector("#refitCount"),
  unknownCount: document.querySelector("#unknownCount"),
  filterResultStatus: document.querySelector("#filterResultStatus"),
  filterSelectionStatus: document.querySelector("#filterSelectionStatus"),
  classRibbon: document.querySelector("#classRibbon"),
  classSelectionStatus: document.querySelector("#classSelectionStatus"),
  classAvailabilityPanel: document.querySelector("#classAvailabilityPanel"),
  classAvailabilityTitle: document.querySelector("#classAvailabilityTitle"),
  classAvailabilityPercentage: document.querySelector("#classAvailabilityPercentage"),
  classAvailabilityFormula: document.querySelector("#classAvailabilityFormula"),
  classAvailabilityBreakdown: document.querySelector("#classAvailabilityBreakdown"),
  classAvailabilityVessels: document.querySelector("#classAvailabilityVessels"),
  search: document.querySelector("#searchInput"),
  service: document.querySelector("#serviceFilter"),
  status: document.querySelector("#statusFilter"),
  type: document.querySelector("#typeFilter"),
  location: document.querySelector("#locationFilter"),
  reset: document.querySelector("#resetFilters"),
  panelReset: document.querySelector("#panelResetFilters"),
  list: document.querySelector("#vesselList"),
  resultsStatus: document.querySelector("#resultsStatus"),
  error: document.querySelector("#loadError"),
  errorMessage: document.querySelector("#loadErrorMessage"),
  mapNotice: document.querySelector("#mapNotice"),
  mapReset: document.querySelector("#resetMap"),
  fleetLayerToggle: document.querySelector("#fleetLayerToggle"),
  shoreLayerToggle: document.querySelector("#shoreLayerToggle"),
  clusterLayerToggle: document.querySelector("#clusterLayerToggle"),
  uncertaintyLayerRow: document.querySelector("#uncertaintyLayerRow"),
  uncertaintyLayerToggle: document.querySelector("#uncertaintyLayerToggle"),
  uncertaintyLayerCount: document.querySelector("#uncertaintyLayerCount"),
  shoreLayerCount: document.querySelector("#shoreLayerCount"),
  shoreControls: document.querySelector("#shoreControls"),
  shoreSearch: document.querySelector("#shoreSearchInput"),
  shoreType: document.querySelector("#shoreTypeFilter"),
  shoreFilteredCount: document.querySelector("#shoreFilteredCount"),
  shoreTotalCount: document.querySelector("#shoreTotalCount"),
  shoreList: document.querySelector("#shoreEstablishmentList"),
};

const details = new EventDetailsPanel({
  container: document.querySelector("#detailCard"),
  kind: document.querySelector("#detailKind"),
  title: document.querySelector("#detailTitle"),
  primaryMeta: document.querySelector("#detailPrimaryMeta"),
  meta: document.querySelector("#detailMeta"),
  disclosure: document.querySelector("#detailDisclosure"),
  photo: document.querySelector("#detailPhoto"),
  photoImage: document.querySelector("#detailPhotoImage"),
  photoCredit: document.querySelector("#detailPhotoCredit"),
});

let dataset;
let shoreDataset;
let insights = { changes: null, history: [], available: false };
let selectedId = null;
let selectedShoreId = null;
let selectedClass = "";

const fleetMap = new FleetMap({
  container: document.querySelector("#fleetMap"),
  notice: elements.mapNotice,
  onSelect: (vessel) => selectVessel(vessel, { source: "map" }),
  onSelectEstablishment: (establishment) =>
    selectShoreEstablishment(establishment, { source: "map" }),
});

const surfaceController = new SurfaceController({
  surfaces: new Map([
    ["fleet", document.querySelector("#fleetDrawer")],
    ["detail", document.querySelector("#detailDrawer")],
    ["layers", document.querySelector("#layersPanel")],
    ["filters", document.querySelector("#filterPanel")],
    ["changes", document.querySelector("#changesPanel")],
  ]),
  triggers: new Map([
    ["fleet", elements.fleetToggle],
    ["layers", elements.layersToggle],
    ["filters", elements.filterToggle],
    ["changes", elements.changesToggle],
  ]),
  backdrop: document.querySelector("#surfaceBackdrop"),
});
if (surfaceController.isCompact()) surfaceController.closeAll();

initialize();

async function initialize() {
  try {
    [dataset, shoreDataset] = await Promise.all([
      new ScenarioLoader(DATA_URL).load(),
      new ShoreEstablishmentLoader(SHORE_DATA_URL).load(),
    ]);
    try {
      const loadedInsights = await new FleetInsightsLoader({
        changesUrl: CHANGES_URL,
        historyUrl: HISTORY_URL,
      }).load();
      if (!insightsMatchDataset(loadedInsights, dataset.metadata)) {
        throw new Error("Fleet insight files belong to a different dataset release.");
      }
      insights = { ...loadedInsights, available: true };
    } catch (error) {
      console.warn("Fleet insight data is unavailable; the core tracker remains usable.", error);
    }
    bindDataset();
  } catch (error) {
    showError(error);
  }
}

function bindDataset() {
  elements.asOfDate.textContent = formatDatasetReleaseLabel(dataset.metadata);
  elements.publicationFreshness.textContent = formatPublicationFreshness(dataset.metadata);
  renderFleetOverview();
  fillSelect(elements.service, uniqueValues("service"));
  fillSelect(elements.status, uniqueValues("status"));
  fillSelect(elements.type, uniqueValues("vesselType"));
  renderClassRibbon();
  renderPublicationChanges();
  fleetMap.setVessels(dataset.vessels);
  fleetMap.setShoreEstablishments(shoreDataset.establishments);
  details.renderDefault(dataset);
  elements.shoreLayerCount.textContent = `${shoreDataset.establishments.length} public locations`;
  const uncertaintyCount = dataset.vessels.filter((vessel) => vessel.uncertaintyArea).length;
  elements.uncertaintyLayerRow.hidden = uncertaintyCount === 0;
  elements.uncertaintyLayerCount.textContent = `${uncertaintyCount} ${uncertaintyCount === 1 ? "region" : "regions"}`;
  elements.shoreTotalCount.textContent = shoreDataset.establishments.length.toString();
  fillSelect(elements.shoreType, shoreTypes(shoreDataset.establishments));

  elements.search.addEventListener("input", () => {
    applyFilters();
    if (elements.search.value.trim()) surfaceController.open("fleet");
  });
  for (const select of [elements.service, elements.status, elements.type, elements.location]) {
    select.addEventListener("change", applyFilters);
  }
  elements.reset.addEventListener("click", () => resetFilters({ focus: true }));
  elements.panelReset.addEventListener("click", () => resetFilters({ focus: true }));
  elements.mapReset.addEventListener("click", () => fleetMap.resetView());
  elements.fleetLayerToggle.addEventListener("change", () =>
    fleetMap.setFleetVisible(elements.fleetLayerToggle.checked),
  );
  elements.shoreLayerToggle.addEventListener("change", () =>
    toggleShoreLayer(elements.shoreLayerToggle.checked),
  );
  elements.clusterLayerToggle.addEventListener("change", () =>
    fleetMap.setClusteringEnabled(elements.clusterLayerToggle.checked),
  );
  elements.uncertaintyLayerToggle.addEventListener("change", () =>
    fleetMap.setUncertaintyAreasVisible(elements.uncertaintyLayerToggle.checked),
  );
  elements.shoreSearch.addEventListener("input", applyShoreFilters);
  elements.shoreType.addEventListener("change", applyShoreFilters);
  applyFilters();
  applyShoreFilters({ fit: false });
}

function toggleShoreLayer(open) {
  elements.shoreControls.hidden = !open;
  elements.shoreLayerToggle.checked = open;
  fleetMap.setShoreVisible(open, { fit: true });
}

function applyShoreFilters({ fit = true } = {}) {
  const filtered = filterShoreEstablishments(shoreDataset.establishments, {
    query: elements.shoreSearch.value,
    type: elements.shoreType.value,
  });
  elements.shoreFilteredCount.textContent = filtered.length.toString();
  elements.shoreList.replaceChildren(...filtered.map(createShoreListItem));
  fleetMap.setVisibleShoreEstablishments(filtered, { fit });
  if (selectedShoreId && !filtered.some((establishment) => establishment.id === selectedShoreId)) {
    selectedShoreId = null;
    details.renderDefault(dataset);
    fleetMap.clearSelection();
    surfaceController.close("detail");
  }
}

function createShoreListItem(establishment) {
  const item = document.createElement("li");
  const button = document.createElement("button");
  const name = document.createElement("span");
  const meta = document.createElement("small");
  button.type = "button";
  button.dataset.establishmentId = establishment.id;
  button.className = establishment.id === selectedShoreId ? "is-selected" : "";
  name.textContent = establishment.name;
  meta.textContent = `${establishment.type} · ${establishment.location}`;
  button.append(name, meta);
  button.addEventListener("click", () => selectShoreEstablishment(establishment, { source: "list" }));
  item.append(button);
  return item;
}

function selectShoreEstablishment(establishment, { source = "list" } = {}) {
  selectedShoreId = establishment.id;
  selectedId = null;
  details.renderEstablishment(establishment);
  fleetMap.selectShoreEstablishment(establishment, { focus: true });
  for (const button of elements.shoreList.querySelectorAll("button")) {
    button.classList.toggle("is-selected", button.dataset.establishmentId === establishment.id);
  }
  for (const button of elements.list.querySelectorAll("button")) {
    button.classList.remove("is-selected");
  }
  surfaceController.open("detail", { focus: source === "list" });
}

function uniqueValues(field) {
  return [...new Set(dataset.vessels.map((vessel) => vessel[field]))].sort((a, b) => a.localeCompare(b));
}

function renderFleetOverview() {
  const summary = getFleetStatusSummary(dataset.vessels);
  const availability = getAvailabilitySummary(dataset.vessels);
  elements.totalCount.textContent = summary.total.toString();
  elements.fleetAvailabilityPercentage.textContent = formatPercentage(availability.percentage);
  elements.fleetAvailabilityFormula.textContent =
    `${availability.active} active of ${availability.total} total vessels · ` +
    "active means deployed or available";
  elements.deployedCount.textContent = summary.deployed.toString();
  elements.refitCount.textContent = summary.inRefit.toString();
  elements.unknownCount.textContent = summary.unknown.toString();
}

function fillSelect(select, values) {
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

function renderClassRibbon() {
  const classes = uniqueValues("vesselClass").sort((a, b) => {
    const aPriority = CLASS_PRIORITY.indexOf(a);
    const bPriority = CLASS_PRIORITY.indexOf(b);
    if (aPriority !== -1 || bPriority !== -1) {
      if (aPriority === -1) return 1;
      if (bPriority === -1) return -1;
      return aPriority - bPriority;
    }
    return a.localeCompare(b);
  });
  elements.classRibbon.replaceChildren(
    createClassButton("", "All"),
    ...classes.map((vesselClass) => createClassButton(vesselClass, shortClassName(vesselClass))),
  );
  updateClassRibbon();
}

function createClassButton(value, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.vesselClass = value;
  button.textContent = label;
  if (value) {
    button.setAttribute("aria-controls", "classAvailabilityPanel");
    button.setAttribute("aria-label", `${label}: show class availability`);
  }
  button.addEventListener("click", () => {
    selectedClass = value;
    updateClassRibbon();
    applyFilters();
  });
  return button;
}

function updateClassRibbon() {
  for (const button of elements.classRibbon.querySelectorAll("button")) {
    const isSelected = button.dataset.vesselClass === selectedClass;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", isSelected.toString());
    if (button.dataset.vesselClass) {
      button.setAttribute("aria-expanded", isSelected.toString());
    }
  }
  elements.classSelectionStatus.textContent = selectedClass ? shortClassName(selectedClass) : "All classes";
  renderClassAvailability();
}

function renderClassAvailability() {
  if (!selectedClass) {
    elements.classAvailabilityPanel.hidden = true;
    elements.classAvailabilityBreakdown.replaceChildren();
    elements.classAvailabilityVessels.replaceChildren();
    return;
  }

  const vessels = dataset.vessels.filter((vessel) => vessel.vesselClass === selectedClass);
  const summary = getAvailabilitySummary(vessels);
  const statuses = [
    ...AVAILABILITY_STATUS_ORDER,
    ...Object.keys(summary.byStatus)
      .filter((status) => !AVAILABILITY_STATUS_ORDER.includes(status))
      .sort((left, right) => left.localeCompare(right)),
  ];

  elements.classAvailabilityTitle.textContent = `${shortClassName(selectedClass)} availability`;
  elements.classAvailabilityPercentage.textContent = formatPercentage(summary.percentage);
  elements.classAvailabilityFormula.textContent =
    `${summary.active} of ${summary.total} vessels are deployed or available. ` +
    "The total includes vessels in re-fit and vessels with status unknown.";
  elements.classAvailabilityBreakdown.replaceChildren(
    ...statuses.map((status) => createAvailabilityMetric(status, summary.byStatus[status] ?? 0)),
    createAvailabilityMetric("Total", summary.total),
  );
  elements.classAvailabilityVessels.replaceChildren(
    ...vessels
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(createClassVesselItem),
  );
  elements.classAvailabilityPanel.hidden = false;
}

function createAvailabilityMetric(label, value) {
  const metric = document.createElement("div");
  const term = document.createElement("dt");
  const count = document.createElement("dd");
  term.textContent = label;
  count.textContent = value.toString();
  metric.append(term, count);
  return metric;
}

function createClassVesselItem(vessel) {
  const item = document.createElement("li");
  const button = document.createElement("button");
  const name = document.createElement("span");
  const status = document.createElement("small");
  button.type = "button";
  button.dataset.vesselId = vessel.id;
  button.setAttribute("aria-label", `${vessel.name}, ${vessel.status}`);
  name.textContent = vessel.name;
  status.textContent = vessel.status;
  button.append(name, status);
  button.addEventListener("click", () => selectVessel(vessel, { source: "class" }));
  item.append(button);
  return item;
}

function formatPercentage(value) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
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
      (!selectedClass || vessel.vesselClass === selectedClass) &&
      (!elements.service.value || vessel.service === elements.service.value) &&
      (!elements.status.value || vessel.status === elements.status.value) &&
      (!elements.type.value || vessel.vesselType === elements.type.value) &&
      (!elements.location.value || vessel.locationState === elements.location.value)
    );
  });

  renderFilterSummary(filtered.length);
  elements.resultsStatus.textContent = `${filtered.length} of ${dataset.vessels.length}`;
  renderList(filtered);
  fleetMap.setVisibleVessels(filtered);
  if (selectedId && !filtered.some((vessel) => vessel.id === selectedId)) {
    selectedId = null;
    details.renderDefault(dataset);
    fleetMap.clearSelection();
    surfaceController.close("detail");
  }
}

function renderFilterSummary(filteredCount) {
  const filterLabels = [
    selectedClass ? shortClassName(selectedClass) : "",
    elements.service.value,
    elements.status.value,
    elements.type.value,
    elements.location.value ? formatLocationState(elements.location.value) : "",
  ].filter(Boolean);
  const hasSearch = Boolean(elements.search.value.trim());
  const activeFilterCount = countActiveFilters({
    query: elements.search.value,
    vesselClass: selectedClass,
    service: elements.service.value,
    status: elements.status.value,
    type: elements.type.value,
    location: elements.location.value,
  });
  const hasFilters = activeFilterCount > 0;
  elements.filterResultStatus.textContent = formatVesselResultSummary(
    filteredCount,
    dataset.vessels.length,
    activeFilterCount,
  );
  elements.filterSelectionStatus.textContent =
    activeFilterCount > 1
      ? `${activeFilterCount} active`
      : filterLabels[0] || (hasSearch ? "Search active" : "All vessels");
  elements.reset.hidden = !hasFilters;
  elements.panelReset.hidden = !hasFilters;
  elements.filterBadge.hidden = !hasFilters;
  elements.filterBadge.textContent = activeFilterCount.toString();
  elements.filterBadge.setAttribute(
    "aria-label",
    `${activeFilterCount} active ${activeFilterCount === 1 ? "filter" : "filters"}`,
  );
}

function renderPublicationChanges() {
  const publication = insights.changes;
  if (!publication?.changes?.length) return;
  const labels = formatPublicationChangeLabels(publication);
  elements.changesToggle.hidden = false;
  elements.changesCount.textContent = publication.changes.length.toString();
  elements.changesCount.setAttribute(
    "aria-label",
    `${publication.changes.length} changed ${publication.changes.length === 1 ? "vessel" : "vessels"}`,
  );
  elements.changesSummary.textContent = labels.summary;
  elements.changesList.replaceChildren(createChangeList(publication.changes));
}

function createChangeList(changes) {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  const list = document.createElement("ul");
  heading.textContent = `Updated vessels · ${changes.length}`;
  for (const change of changes) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const vesselName = document.createElement("span");
    const description = document.createElement("small");
    button.type = "button";
    vesselName.textContent = change.vesselName;
    description.textContent = change.items
      .map((entry) => `${entry.label}: ${entry.before} → ${entry.after}`)
      .join(" · ");
    button.append(vesselName, description);
    button.addEventListener("click", () => revealChangedVessel(change.vesselId));
    item.append(button);
    list.append(item);
  }
  section.append(heading, list);
  return section;
}

function revealChangedVessel(vesselId) {
  const vessel = dataset.vessels.find((candidate) => candidate.id === vesselId);
  if (!vessel) return;
  resetFilters({ focus: false });
  surfaceController.close("changes");
  selectVessel(vessel, { source: "changes" });
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
      button.dataset.status = vessel.status;
      heading.textContent = vessel.name;
      meta.textContent = `${vessel.pennantNumber || "No pennant"} · ${vessel.status} · ${formatLocationState(vessel.locationState)} · ${formatLocationPrecision(vessel.locationPrecision)}`;
      button.append(heading, meta);
      button.addEventListener("click", () => selectVessel(vessel, { source: "list" }));
      item.append(button);
      return item;
    }),
  );
}

function selectVessel(vessel, { source = "list" } = {}) {
  selectedId = vessel.id;
  selectedShoreId = null;
  details.renderVessel(vessel, {
    asOfDate: dataset.metadata.asOfDate,
    history: insights.history,
    changes: insights.changes,
    insightsAvailable: insights.available,
  });
  fleetMap.selectVessel(vessel, { focus: true });
  for (const button of elements.list.querySelectorAll("button")) {
    button.classList.toggle("is-selected", button.dataset.vesselId === vessel.id);
  }
  for (const button of elements.shoreList.querySelectorAll("button")) {
    button.classList.remove("is-selected");
  }
  surfaceController.open("detail", { focus: source === "changes" });
  if (source === "changes") {
    document.querySelector("#detailTitle").focus({ preventScroll: true });
  }
}

function resetFilters({ focus = false } = {}) {
  elements.search.value = "";
  elements.service.value = "";
  elements.status.value = "";
  elements.type.value = "";
  elements.location.value = "";
  selectedClass = "";
  updateClassRibbon();
  applyFilters();
  if (focus) elements.search.focus();
}

function showError(error) {
  elements.error.hidden = false;
  elements.errorMessage.textContent = error instanceof Error ? error.message : "Unknown fleet data error.";
}
