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
  getAvailabilityBand,
  getAvailabilitySummary,
  getFleetStatusSummary,
} from "./utils/fleet.js";
import {
  filterFleetVessels,
  formatPlotEligibilitySummary,
  summarizePlotEligibility,
} from "./utils/fleetFilter.js";
import {
  createPublicationComparison,
  createPublicSnapshotDataset,
  listPublicSnapshotDates,
  resolvePublicSnapshotDate,
  shortClassName,
} from "./utils/insights.js";
import { filterShoreEstablishments, shoreTypes } from "./utils/shore.js";
import {
  assessPublicationAge,
  formatDatasetReleaseLabel,
  formatPublicationFreshness,
  formatPublicationChangeLabels,
} from "./utils/release.js";
import {
  countActiveFilters,
  formatVesselResultSummary,
  resolveSnapshotTransitionSelection,
} from "./utils/interface.js";
import { publicAssetUrl } from "./utils/assetUrl.js";
import {
  PORT_SHORE_FILTER,
  PUBLIC_PRESETS,
  createPublicStateCatalog,
  createShareablePublicUrl,
  parsePublicUrlState,
  persistPublicState,
  publicStateMatchesPreset,
  readPersistedPublicState,
  resolvePublicSelection,
  stateForPublicPreset,
} from "./utils/publicState.js";
import { registerFleetWebMcp } from "./webmcp.js";
import "./styles.css";

const DATA_URL = publicAssetUrl("data/royal-navy/vessels.json");
const SHORE_DATA_URL = publicAssetUrl("data/royal-navy/shore-establishments.json");
const CHANGES_URL = publicAssetUrl("data/royal-navy/publication-changes.json");
const HISTORY_URL = publicAssetUrl("data/royal-navy/status-history.jsonl");
const LOCATION_HISTORY_URL = publicAssetUrl("data/royal-navy/status-location-history.jsonl");
const HISTORY_CATALOG_URL = publicAssetUrl("data/royal-navy/status-history-catalog.json");
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
  changedOnlyToggle: document.querySelector("#changedOnlyToggle"),
  changedOnlyStatus: document.querySelector("#changedOnlyStatus"),
  snapshotSelect: document.querySelector("#snapshotSelect"),
  snapshotDescription: document.querySelector("#snapshotDescription"),
  deployedCount: document.querySelector("#deployedCount"),
  availableCount: document.querySelector("#availableCount"),
  refitCount: document.querySelector("#refitCount"),
  unknownCount: document.querySelector("#unknownCount"),
  classifiedCount: document.querySelector("#classifiedCount"),
  summaryFilters: [...document.querySelectorAll("[data-summary-filter], [data-summary-location]")],
  activeFilterBar: document.querySelector("#activeFilterBar"),
  activeFilterChips: document.querySelector("#activeFilterChips"),
  clearActiveFilters: document.querySelector("#clearActiveFilters"),
  loadingState: document.querySelector("#loadingState"),
  dataHealthNotice: document.querySelector("#dataHealthNotice"),
  filterResultStatus: document.querySelector("#filterResultStatus"),
  filterSelectionStatus: document.querySelector("#filterSelectionStatus"),
  plotResultStatus: document.querySelector("#plotResultStatus"),
  filterPlotStatus: document.querySelector("#filterPlotStatus"),
  classRibbon: document.querySelector("#classRibbon"),
  classSelectionStatus: document.querySelector("#classSelectionStatus"),
  classAvailabilityPanel: document.querySelector("#classAvailabilityPanel"),
  classAvailabilityTitle: document.querySelector("#classAvailabilityTitle"),
  classAvailabilityScore: document.querySelector("#classAvailabilityScore"),
  classAvailabilityPercentage: document.querySelector("#classAvailabilityPercentage"),
  classAvailabilityFormula: document.querySelector("#classAvailabilityFormula"),
  classMapSummary: document.querySelector("#classMapSummary"),
  classAvailabilityBreakdown: document.querySelector("#classAvailabilityBreakdown"),
  classAvailabilityVessels: document.querySelector("#classAvailabilityVessels"),
  search: document.querySelector("#searchInput"),
  service: document.querySelector("#serviceFilter"),
  status: document.querySelector("#statusFilter"),
  type: document.querySelector("#typeFilter"),
  location: document.querySelector("#locationFilter"),
  presence: document.querySelector("#presenceFilter"),
  reset: document.querySelector("#resetFilters"),
  panelReset: document.querySelector("#panelResetFilters"),
  list: document.querySelector("#vesselList"),
  tableBody: document.querySelector("#fleetTableBody"),
  tableWrap: document.querySelector("#fleetTableWrap"),
  cardViewToggle: document.querySelector("#cardViewToggle"),
  tableViewToggle: document.querySelector("#tableViewToggle"),
  fleetEmptyState: document.querySelector("#fleetEmptyState"),
  resultsStatus: document.querySelector("#resultsStatus"),
  error: document.querySelector("#loadError"),
  errorMessage: document.querySelector("#loadErrorMessage"),
  mapNotice: document.querySelector("#mapNotice"),
  mapFilterNotice: document.querySelector("#mapFilterNotice"),
  mapReset: document.querySelector("#resetMap"),
  fleetLayerToggle: document.querySelector("#fleetLayerToggle"),
  shoreLayerToggle: document.querySelector("#shoreLayerToggle"),
  clusterLayerToggle: document.querySelector("#clusterLayerToggle"),
  shoreLayerCount: document.querySelector("#shoreLayerCount"),
  shoreControls: document.querySelector("#shoreControls"),
  shoreSearch: document.querySelector("#shoreSearchInput"),
  shoreType: document.querySelector("#shoreTypeFilter"),
  shoreFilteredCount: document.querySelector("#shoreFilteredCount"),
  shoreTotalCount: document.querySelector("#shoreTotalCount"),
  shoreList: document.querySelector("#shoreEstablishmentList"),
  unifiedShoreResults: document.querySelector("#unifiedShoreResults"),
  unifiedShoreStatus: document.querySelector("#unifiedShoreStatus"),
  unifiedShoreList: document.querySelector("#unifiedShoreList"),
  clusterResults: document.querySelector("#clusterResults"),
  clusterResultsTitle: document.querySelector("#clusterResultsTitle"),
  clusterResultList: document.querySelector("#clusterResultList"),
  closeClusterResults: document.querySelector("#closeClusterResults"),
  presetButtons: [...document.querySelectorAll("[data-public-preset]")],
  presetStatus: document.querySelector("#presetStatus"),
};

const details = new EventDetailsPanel({
  container: document.querySelector("#detailCard"),
  kind: document.querySelector("#detailKind"),
  title: document.querySelector("#detailTitle"),
  classLine: document.querySelector("#detailClassLine"),
  primaryMeta: document.querySelector("#detailPrimaryMeta"),
  meta: document.querySelector("#detailMeta"),
  supplementary: document.querySelector("#detailSupplementary"),
  supplementaryTitle: document.querySelector("#detailSupplementaryTitle"),
  photo: document.querySelector("#detailPhoto"),
  photoImage: document.querySelector("#detailPhotoImage"),
  photoFallback: document.querySelector("#detailPhotoFallback"),
  photoCredit: document.querySelector("#detailPhotoCredit"),
  timeline: document.querySelector("#vesselTimeline"),
  timelineSummary: document.querySelector("#vesselTimelineSummary"),
  timelineList: document.querySelector("#vesselTimelineList"),
});

let dataset;
let currentDataset;
let shoreDataset;
let insights = { changes: null, history: [], historyCatalog: null, available: false };
let publicationComparison = null;
let selectedSnapshotDate = null;
let changedOnly = false;
let selectedId = null;
let selectedShoreId = null;
let selectedClass = "";
let publicStateCatalog;
let publicStateReady = false;
let applyingPublicState = false;
let currentFilteredVessels = [];
let fleetResultView = "list";
const dataHealthMessages = [];
const publicStorage = getPublicStorage();

const fleetMap = new FleetMap({
  container: document.querySelector("#fleetMap"),
  notice: elements.mapNotice,
  onSelect: (vessel) => selectVessel(vessel, { source: "map", focusMap: false }),
  onSelectEstablishment: (establishment) =>
    selectShoreEstablishment(establishment, { source: "map" }),
  onOpenCluster: (vessels) => renderClusterResults(vessels, "vessel"),
  onOpenShoreCluster: (establishments) =>
    renderClusterResults(establishments, "shore"),
  onViewChange: () => syncPublicState(),
  shouldKeepSelectionVisible: () => surfaceController.isOpen("detail"),
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
  focusFallbacks: new Map([["detail", elements.fleetToggle]]),
  backdrop: document.querySelector("#surfaceBackdrop"),
  onChange: (open) => {
    document.querySelector(".command-workspace").classList.toggle("has-detail", open.has("detail"));
    document.querySelector(".command-workspace").classList.toggle("has-panel", [...open].some((name) => name !== "detail"));
    document.querySelector(".command-workspace").classList.toggle("has-right-panel", ["filters", "layers", "changes"].some((name) => open.has(name)));
    document.querySelector(".command-workspace").classList.toggle("has-fleet-panel", open.has("fleet"));
    if (publicStateReady && (selectedId || selectedShoreId)) queueSelectedRecordVisibility();
  },
});
if (surfaceController.isCompact()) surfaceController.closeAll();

initialize();

async function initialize() {
  try {
    [currentDataset, shoreDataset] = await Promise.all([
      new ScenarioLoader(DATA_URL).load(),
      new ShoreEstablishmentLoader(SHORE_DATA_URL).load(),
    ]);
    dataset = currentDataset;
    try {
      const loadedInsights = await new FleetInsightsLoader({
        changesUrl: CHANGES_URL,
        historyUrl: HISTORY_URL,
        locationHistoryUrl: LOCATION_HISTORY_URL,
        historyCatalogUrl: HISTORY_CATALOG_URL,
      }).load();
      if (!insightsMatchDataset(loadedInsights, currentDataset.metadata)) {
        throw new Error("Fleet insight files belong to a different dataset release.");
      }
      insights = { ...loadedInsights, available: true };
    } catch (error) {
      console.warn("Fleet insight data is unavailable; the core tracker remains usable.", error);
      addDataHealthNotice(
        "Fleet snapshot loaded. Changes and historical context are temporarily unavailable.",
      );
    }
    bindDataset();
  } catch (error) {
    showError(error);
  }
}

function bindDataset() {
  selectedSnapshotDate = currentDataset.metadata.asOfDate;
  publicationComparison = insights.available
    ? createPublicationComparison(insights.changes, currentDataset.vessels)
    : null;
  renderSnapshotSelector();
  elements.asOfDate.textContent = formatDatasetReleaseLabel(dataset.metadata);
  elements.publicationFreshness.textContent = formatPublicationFreshness(dataset.metadata);
  const publicationAge = assessPublicationAge(dataset.metadata);
  elements.publicationFreshness.dataset.state = publicationAge.state;
  if (publicationAge.state === "stale") {
    addDataHealthNotice(
      `The public dataset is older than ${publicationAge.staleAfterDays} days and may be stale. This does not imply an asset-level update or live position.`,
    );
  }
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
  elements.shoreTotalCount.textContent = shoreDataset.establishments.length.toString();
  appendSelectOption(elements.shoreType, PORT_SHORE_FILTER, "Ports and dockyards");
  fillSelect(elements.shoreType, shoreTypes(shoreDataset.establishments));
  publicStateCatalog = createPublicStateCatalog({
    vessels: currentDataset.vessels,
    selectionVessels: insights.historyCatalog?.vessels ?? currentDataset.vessels,
    shoreEstablishments: shoreDataset.establishments,
    snapshotDates: insights.available ? listPublicSnapshotDates(insights.history) : [],
    currentSnapshotDate: currentDataset.metadata.asOfDate,
  });

  elements.snapshotSelect.addEventListener("change", () => {
    applySnapshotDate(elements.snapshotSelect.value);
  });
  elements.changedOnlyToggle.addEventListener("change", () => {
    changedOnly = elements.changedOnlyToggle.checked;
    updateChangedOnlyStatus();
    applyFilters();
  });
  elements.search.addEventListener("input", () => {
    applyFilters();
    renderUnifiedShoreResults();
    if (elements.search.value.trim()) surfaceController.open("fleet");
  });
  for (const select of [
    elements.service,
    elements.status,
    elements.type,
    elements.location,
    elements.presence,
  ]) {
    select.addEventListener("change", applyFilters);
  }
  elements.reset.addEventListener("click", () => resetFilters({ focus: true }));
  elements.panelReset.addEventListener("click", () => resetFilters({ focus: true }));
  elements.clearActiveFilters.addEventListener("click", () => resetFilters({ focus: true }));
  for (const button of elements.summaryFilters) {
    button.addEventListener("click", () => applySummaryFilter(button));
  }
  elements.cardViewToggle.addEventListener("click", () => setFleetResultView("list"));
  elements.tableViewToggle.addEventListener("click", () => setFleetResultView("table"));
  elements.closeClusterResults.addEventListener("click", clearClusterResults);
  elements.mapReset.addEventListener("click", () => fleetMap.resetView());
  elements.fleetLayerToggle.addEventListener("change", () => {
    fleetMap.setFleetVisible(elements.fleetLayerToggle.checked);
    renderPlotSummary(currentFilteredVessels);
    syncPublicState();
  });
  elements.shoreLayerToggle.addEventListener("change", () =>
    toggleShoreLayer(elements.shoreLayerToggle.checked),
  );
  elements.clusterLayerToggle.addEventListener("change", () => {
    fleetMap.setClusteringEnabled(elements.clusterLayerToggle.checked);
    syncPublicState();
  });
  elements.shoreSearch.addEventListener("input", applyShoreFilters);
  elements.shoreType.addEventListener("change", applyShoreFilters);
  for (const button of elements.presetButtons) {
    button.addEventListener("click", () => applyPublicPreset(button.dataset.publicPreset));
  }
  const initialState =
    parsePublicUrlState(window.location.href, publicStateCatalog) ??
    readPersistedPublicState(publicStorage, publicStateCatalog);
  applyPublicState(initialState, { initial: true });
  document.querySelector('[data-close-surface="detail"]').addEventListener("click", () =>
    clearSelectedRecord({ syncMode: "push" }),
  );
  window.addEventListener("popstate", () => {
    const state = parsePublicUrlState(window.location.href, publicStateCatalog);
    if (state) applyPublicState(state, { sync: false });
  });
  elements.loadingState.hidden = true;
  document.querySelector("#fleetSummaryBanner").setAttribute("aria-busy", "false");
  elements.summaryFilters.forEach((button) => { button.disabled = false; });
  registerWebMcpTools();
  window.dispatchEvent(new Event("rn-fleet-ready"));
}

function registerWebMcpTools() {
  void registerFleetWebMcp({
    getContext: () => {
      const state = currentPublicState();
      return {
        dataset,
        state,
        availableSnapshotDates: [...publicStateCatalog.snapshotDates],
        catalogs: {
          services: [...publicStateCatalog.services].sort(),
          vesselClasses: [...publicStateCatalog.vesselClasses].sort(),
          vesselTypes: [...publicStateCatalog.types].sort(),
          statuses: [...publicStateCatalog.statuses].sort(),
          locationStates: [...publicStateCatalog.locationStates].sort(),
        },
        shareUrl: createShareablePublicUrl(
          window.location.href,
          state,
          publicStateCatalog,
        ).href,
      };
    },
    applyState: (state) => applyPublicState(state),
    showVessel: (vessel) => {
      resetFilters({ focus: false });
      selectVessel(vessel, { source: "webmcp" });
    },
  }).catch((error) => {
    console.warn("WebMCP tools could not be registered; the fleet tracker remains usable.", error);
  });
}

function renderSnapshotSelector() {
  const dates = insights.available
    ? listPublicSnapshotDates(insights.history)
    : [currentDataset.metadata.asOfDate];
  elements.snapshotSelect.replaceChildren(
    ...dates
      .slice()
      .reverse()
      .map((snapshotDate) => {
        const option = document.createElement("option");
        option.value = snapshotDate;
        option.textContent = `${formatDatasetReleaseLabel({ asOfDate: snapshotDate })}${
          snapshotDate === currentDataset.metadata.asOfDate ? " (current)" : ""
        }`;
        return option;
      }),
  );
  elements.snapshotSelect.disabled = !insights.available || dates.length < 2;
  updateSnapshotLabels();
}

function applySnapshotDate(requestedDate, { sync = true } = {}) {
  const resolvedDate = insights.available
    ? resolvePublicSnapshotDate(
        insights.history,
        requestedDate,
        currentDataset.metadata.asOfDate,
      )
    : currentDataset.metadata.asOfDate;
  const retainedVesselId = selectedId;
  const retainedShoreId = selectedShoreId;
  selectedSnapshotDate = resolvedDate;
  dataset = insights.available
    ? createPublicSnapshotDataset({
        currentFleet: currentDataset,
        history: insights.history,
        catalog: insights.historyCatalog,
        locationHistory: insights.locationHistory,
        snapshotDate: resolvedDate,
      })
    : currentDataset;

  const isCurrent = selectedSnapshotDate === currentDataset.metadata.asOfDate;
  if (!isCurrent) {
    changedOnly = false;
    elements.changedOnlyToggle.checked = false;
  }
  elements.changedOnlyToggle.disabled =
    !isCurrent || !publicationComparison?.changedCurrentVesselIds?.length;
  updateChangedOnlyStatus();
  updateSnapshotLabels();
  renderFleetOverview();
  renderClassRibbon();

  selectedId = null;
  selectedShoreId = null;
  fleetMap.clearSelection();
  fleetMap.setVessels(dataset.vessels);
  const visibleVessels = applyFilters({ sync: false });
  const retainedSelection = resolveSnapshotTransitionSelection({
    visibleVessels,
    shoreEstablishments: shoreDataset.establishments,
    selectedVesselId: retainedVesselId,
    selectedShoreId: retainedShoreId,
  });
  if (retainedSelection.vessel) {
    selectVessel(retainedSelection.vessel, {
      source: "restore",
      focusMap: false,
      sync: false,
    });
  } else if (retainedSelection.shoreEstablishment) {
    selectShoreEstablishment(retainedSelection.shoreEstablishment, {
      source: "restore",
      focusMap: false,
      sync: false,
    });
  } else {
    details.renderDefault(dataset);
    surfaceController.close("detail");
  }
  if (sync) syncPublicState();
}

function updateSnapshotLabels() {
  const isCurrent = selectedSnapshotDate === currentDataset.metadata.asOfDate;
  elements.snapshotSelect.value = selectedSnapshotDate;
  elements.asOfDate.textContent = formatDatasetReleaseLabel({ asOfDate: selectedSnapshotDate });
  elements.publicationFreshness.textContent = isCurrent
    ? formatPublicationFreshness(currentDataset.metadata)
    : "Historical public snapshot";
  elements.snapshotDescription.textContent = isCurrent
    ? `Current public snapshot effective ${formatDatasetReleaseLabel({ asOfDate: selectedSnapshotDate })}.`
    : `Historical public snapshot effective ${formatDatasetReleaseLabel({ asOfDate: selectedSnapshotDate })}. Markers show supported archived public locations; coverage is partial and these are not live positions.`;
}

function updateChangedOnlyStatus() {
  if (selectedSnapshotDate !== currentDataset.metadata.asOfDate) {
    elements.changedOnlyStatus.textContent =
      "Changed-vessels-only is available on the current public snapshot.";
    return;
  }
  elements.changedOnlyStatus.textContent = changedOnly
    ? "Showing current vessels changed since the previous public snapshot."
    : "Showing all current vessels.";
}

function toggleShoreLayer(open, { fit = true, sync = true } = {}) {
  elements.shoreControls.hidden = !open;
  elements.shoreLayerToggle.checked = open;
  fleetMap.setShoreVisible(open, { fit });
  if (sync) syncPublicState();
}

function applyShoreFilters({ fit = true, sync = true } = {}) {
  const filtered = filterShoreEstablishments(shoreDataset.establishments, {
    query: elements.shoreSearch.value,
    type: elements.shoreType.value,
  });
  elements.shoreFilteredCount.textContent = filtered.length.toString();
  elements.shoreList.replaceChildren(...filtered.map(createShoreListItem));
  fleetMap.setVisibleShoreEstablishments(filtered, { fit });
  renderFilterSummary(currentFilteredVessels.length);
  if (sync) syncPublicState();
}

function renderUnifiedShoreResults() {
  const query = elements.search.value.trim();
  if (!query || !shoreDataset?.establishments) {
    elements.unifiedShoreResults.hidden = true;
    elements.unifiedShoreList.replaceChildren();
    return;
  }
  const matches = filterShoreEstablishments(shoreDataset.establishments, { query });
  elements.unifiedShoreStatus.textContent = `${matches.length} result${matches.length === 1 ? "" : "s"}`;
  elements.unifiedShoreList.replaceChildren(
    ...matches.map((establishment) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const name = document.createElement("span");
      const meta = document.createElement("small");
      button.type = "button";
      button.dataset.establishmentId = establishment.id;
      button.className = establishment.id === selectedShoreId ? "is-selected" : "";
      button.setAttribute("aria-current", (establishment.id === selectedShoreId).toString());
      name.textContent = establishment.name;
      meta.textContent = `${establishment.type} · ${establishment.location}`;
      button.append(name, meta);
      button.addEventListener("click", () => {
        toggleShoreLayer(true, { fit: false, sync: false });
        applyShoreFilters({ fit: false, sync: false });
        selectShoreEstablishment(establishment, {
          source: "search",
          trigger: button,
          returnSurface: "fleet",
          returnFocusFallback: elements.fleetToggle,
        });
      });
      item.append(button);
      return item;
    }),
  );
  elements.unifiedShoreResults.hidden = false;
}

function renderClusterResults(records, kind) {
  if (!records.length) return;
  elements.clusterResultsTitle.textContent =
    kind === "shore" ? "Shore cluster contents" : "Vessel cluster contents";
  elements.clusterResultList.replaceChildren(
    ...records.map((record) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const name = document.createElement("span");
      const meta = document.createElement("small");
      button.type = "button";
      name.textContent = record.name;
      if (kind === "shore") {
        button.dataset.establishmentId = record.id;
        button.className = record.id === selectedShoreId ? "is-selected" : "";
        button.setAttribute("aria-current", (record.id === selectedShoreId).toString());
        meta.textContent = `${record.type} · ${record.location}`;
        button.addEventListener("click", () =>
          selectShoreEstablishment(record, {
            source: "cluster",
            trigger: button,
            returnSurface: "fleet",
            returnFocusFallback: elements.fleetToggle,
          }),
        );
      } else {
        button.dataset.vesselId = record.id;
        button.className = record.id === selectedId ? "is-selected" : "";
        button.setAttribute("aria-current", (record.id === selectedId).toString());
        meta.textContent = `${record.pennantNumber || "No pennant"} · ${record.status}`;
        button.addEventListener("click", () =>
          selectVessel(record, {
            source: "cluster",
            trigger: button,
            returnSurface: "fleet",
            returnFocusFallback: elements.fleetToggle,
          }),
        );
      }
      button.append(name, meta);
      item.append(button);
      return item;
    }),
  );
  elements.clusterResults.hidden = false;
  surfaceController.open("fleet");
}

function clearClusterResults() {
  elements.clusterResults.hidden = true;
  elements.clusterResultList.replaceChildren();
}

function createShoreListItem(establishment) {
  const item = document.createElement("li");
  const button = document.createElement("button");
  const name = document.createElement("span");
  const meta = document.createElement("small");
  button.type = "button";
  button.dataset.establishmentId = establishment.id;
  button.className = establishment.id === selectedShoreId ? "is-selected" : "";
  button.setAttribute("aria-current", (establishment.id === selectedShoreId).toString());
  name.textContent = establishment.name;
  meta.textContent = `${establishment.type} · ${establishment.location}`;
  button.append(name, meta);
  button.addEventListener("click", () =>
    selectShoreEstablishment(establishment, {
      source: "list",
      trigger: button,
      returnSurface: "layers",
      returnFocusFallback: elements.layersToggle,
    }),
  );
  item.append(button);
  return item;
}

function selectShoreEstablishment(
  establishment,
  {
    source = "list",
    focusMap = true,
    sync = true,
    trigger = null,
    returnSurface = null,
    returnFocusFallback = null,
  } = {},
) {
  if (selectedShoreId !== establishment.id) collapseInspector();
  selectedShoreId = establishment.id;
  selectedId = null;
  details.renderEstablishment(establishment);
  window.requestAnimationFrame(() => {
    if (selectedShoreId === establishment.id) fleetMap.selectShoreEstablishment(establishment, { focus: focusMap });
  });
  updateSelectionSemantics();
  surfaceController.open("detail", {
    focus: source !== "restore" && surfaceController.isCompact(),
    returnFocus: trigger,
    returnSurface,
    returnFocusFallback,
  });
  queueSelectedRecordVisibility();
  if (sync) syncPublicState({ mode: source === "restore" ? "replace" : "push" });
}

function uniqueValues(field) {
  return [...new Set(dataset.vessels.map((vessel) => vessel[field]))].sort((a, b) => a.localeCompare(b));
}

function renderFleetOverview() {
  const summary = getFleetStatusSummary(dataset.vessels);
  elements.deployedCount.textContent = summary.deployed.toString();
  elements.availableCount.textContent = summary.available.toString();
  elements.refitCount.textContent = summary.inRefit.toString();
  elements.unknownCount.textContent = summary.unknown.toString();
  elements.classifiedCount.textContent = summary.classified.toString();
  updateSummaryFilterState();
}

function applySummaryFilter(button) {
  const status = button.dataset.summaryFilter || "";
  const location = button.dataset.summaryLocation || "";
  if (status) elements.status.value = elements.status.value === status ? "" : status;
  if (location) elements.location.value = elements.location.value === location ? "" : location;
  applyFilters();
}

function updateSummaryFilterState() {
  for (const button of elements.summaryFilters) {
    const active = button.dataset.summaryFilter
      ? elements.status.value === button.dataset.summaryFilter
      : elements.location.value === button.dataset.summaryLocation;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active.toString());
  }
}

function fillSelect(select, values) {
  for (const value of values) {
    appendSelectOption(select, value, value);
  }
}

function appendSelectOption(select, value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
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
    button.setAttribute("aria-label", `${label}: filter by vessel class`);
  }
  button.addEventListener("click", () => {
    selectedClass = value;
    elements.classAvailabilityPanel.open = false;
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
  }
  elements.classSelectionStatus.textContent = selectedClass ? shortClassName(selectedClass) : "All classes";
  renderClassAvailability();
}

function renderClassAvailability() {
  if (!selectedClass) {
    elements.classAvailabilityPanel.hidden = true;
    elements.classAvailabilityBreakdown.replaceChildren();
    elements.classAvailabilityVessels.replaceChildren();
    elements.classMapSummary.textContent = "";
    return;
  }

  const vessels = dataset.vessels.filter((vessel) => vessel.vesselClass === selectedClass);
  const filteredVessels = filterFleetVessels(dataset.vessels, currentFleetFilterCriteria());
  const summary = getAvailabilitySummary(vessels);
  const statuses = [
    ...AVAILABILITY_STATUS_ORDER,
    ...Object.keys(summary.byStatus)
      .filter((status) => !AVAILABILITY_STATUS_ORDER.includes(status))
      .sort((left, right) => left.localeCompare(right)),
  ];

  elements.classAvailabilityTitle.textContent = `${shortClassName(selectedClass)} availability`;
  renderAvailabilityScore(
    elements.classAvailabilityScore,
    elements.classAvailabilityPercentage,
    summary.percentage,
    "selected class availability",
  );
  elements.classAvailabilityFormula.textContent =
    `${summary.active} of ${summary.total} vessels are deployed or available. ` +
    "The total includes vessels in re-fit and vessels with status unknown.";
  elements.classMapSummary.textContent = `Map: ${formatPlotEligibilitySummary(filteredVessels)}.`;
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
  button.className = vessel.id === selectedId ? "is-selected" : "";
  button.setAttribute("aria-current", (vessel.id === selectedId).toString());
  name.textContent = vessel.name;
  status.textContent = vessel.status;
  button.append(name, status);
  button.addEventListener("click", () =>
    selectVessel(vessel, {
      source: "class",
      trigger: button,
      returnSurface: "filters",
      returnFocusFallback: elements.filterToggle,
    }),
  );
  item.append(button);
  return item;
}

function formatPercentage(value) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

function renderAvailabilityScore(container, percentageElement, percentage, accessibleDescription) {
  const band = getAvailabilityBand(percentage);
  const formattedPercentage = formatPercentage(percentage);
  percentageElement.textContent = formattedPercentage;
  container.dataset.availabilityBand = band;
  container.setAttribute("aria-label", `${formattedPercentage} ${accessibleDescription}`);
}

function applyFilters({ fit = false, sync = true } = {}) {
  const filtered = filterFleetVessels(dataset.vessels, currentFleetFilterCriteria());

  currentFilteredVessels = filtered;
  renderFilterSummary(filtered.length);
  renderPlotSummary(filtered);
  renderClassAvailability();
  elements.resultsStatus.textContent = `${filtered.length} of ${dataset.vessels.length}`;
  renderList(filtered);
  renderUnifiedShoreResults();
  fleetMap.setVisibleVessels(filtered, { fit });
  if (selectedId && !filtered.some((vessel) => vessel.id === selectedId)) {
    selectedId = null;
    details.renderDefault(dataset);
    fleetMap.clearSelection();
    surfaceController.close("detail");
    updateSelectionSemantics();
  }
  if (sync) syncPublicState();
  return filtered;
}

function currentFleetFilterCriteria() {
  return {
    query: elements.search.value,
    vesselClass: selectedClass,
    service: elements.service.value,
    status: elements.status.value,
    type: elements.type.value,
    locationState: elements.location.value,
    presence: elements.presence.value,
    changedVesselIds: changedOnly ? publicationComparison?.changedCurrentVesselIds ?? [] : null,
  };
}

function renderPlotSummary(filtered) {
  const summary = summarizePlotEligibility(filtered);
  const status = `Map: ${formatPlotEligibilitySummary(filtered)}.`;
  elements.plotResultStatus.textContent = status;
  elements.filterPlotStatus.textContent = status;

  if (!elements.fleetLayerToggle.checked || summary.pointMapped > 0) {
    elements.mapFilterNotice.hidden = true;
    elements.mapFilterNotice.textContent = "";
    return;
  }
  if (summary.total === 0) {
    const shoreMatches = elements.search.value.trim() && shoreDataset?.establishments
      ? filterShoreEstablishments(shoreDataset.establishments, {
          query: elements.search.value.trim(),
        }).length
      : 0;
    elements.mapFilterNotice.textContent = shoreMatches
      ? `No vessels match this search. ${shoreMatches} shore ${shoreMatches === 1 ? "establishment remains" : "establishments remain"} available.`
      : "No vessel records match the current filters.";
  } else if (selectedSnapshotDate !== currentDataset.metadata.asOfDate) {
    elements.mapFilterNotice.textContent =
      "No supported point locations match this historical view. Unlocated vessels remain in the fleet list.";
  } else {
    elements.mapFilterNotice.textContent =
      "No point locations are publishable for this filter. Regional and list-only records remain in the fleet list.";
  }
  elements.mapFilterNotice.hidden = false;
}

function renderFilterSummary(filteredCount) {
  const filterLabels = [
    selectedClass ? shortClassName(selectedClass) : "",
    elements.service.value,
    elements.status.value,
    elements.type.value,
    elements.location.value ? formatLocationState(elements.location.value) : "",
    elements.presence.value ? formatPresence(elements.presence.value) : "",
    changedOnly ? "Changed since previous snapshot" : "",
  ].filter(Boolean);
  const hasSearch = Boolean(elements.search.value.trim());
  const vesselFilterCount = countActiveFilters({
    query: elements.search.value,
    vesselClass: selectedClass,
    service: elements.service.value,
    status: elements.status.value,
    type: elements.type.value,
    location: elements.location.value,
    presence: elements.presence.value,
  }) + (changedOnly ? 1 : 0);
  const activeFilterCount =
    vesselFilterCount +
    countActiveFilters({
      shoreQuery: elements.shoreSearch.value,
      shoreType: elements.shoreType.value,
    });
  const hasFilters = activeFilterCount > 0;
  elements.filterResultStatus.textContent = formatVesselResultSummary(
    filteredCount,
    dataset.vessels.length,
    vesselFilterCount,
  );
  elements.filterSelectionStatus.textContent =
    vesselFilterCount > 1
      ? `${vesselFilterCount} active`
      : filterLabels[0] || (hasSearch ? "Search active" : "All vessels");
  elements.reset.hidden = !hasFilters;
  elements.panelReset.hidden = !hasFilters;
  elements.filterBadge.hidden = !hasFilters;
  elements.filterBadge.textContent = activeFilterCount.toString();
  elements.filterBadge.setAttribute(
    "aria-label",
    `${activeFilterCount} active ${activeFilterCount === 1 ? "filter" : "filters"}`,
  );
  updateSummaryFilterState();
  renderActiveFilterChips();
}

function renderActiveFilterChips() {
  const filters = [
    ["query", elements.search.value.trim() ? `Search: ${elements.search.value.trim()}` : ""],
    ["class", selectedClass ? `Class: ${shortClassName(selectedClass)}` : ""],
    ["service", elements.service.value ? `Service: ${elements.service.value}` : ""],
    ["status", elements.status.value ? `Status: ${elements.status.value}` : ""],
    ["type", elements.type.value ? `Type: ${elements.type.value}` : ""],
    [
      "location",
      elements.location.value ? `Location: ${formatLocationState(elements.location.value)}` : "",
    ],
    [
      "presence",
      elements.presence.value ? `Area: ${formatPresence(elements.presence.value)}` : "",
    ],
    [
      "shoreQuery",
      elements.shoreSearch.value.trim()
        ? `Shore search: ${elements.shoreSearch.value.trim()}`
        : "",
    ],
    [
      "shoreType",
      elements.shoreType.value ? `Shore type: ${selectedOptionLabel(elements.shoreType)}` : "",
    ],
    ["changed", changedOnly ? "Changed since previous snapshot" : ""],
  ].filter(([, label]) => label);
  elements.activeFilterChips.replaceChildren(
    ...filters.map(([key, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.clearFilter = key;
      button.setAttribute("aria-label", `Remove ${label}`);
      button.append(label, Object.assign(document.createElement("span"), { textContent: "×" }));
      button.addEventListener("click", () => clearSingleFilter(key));
      return button;
    }),
  );
  elements.activeFilterBar.hidden = filters.length === 0;
}

function selectedOptionLabel(select) {
  return select.selectedOptions[0]?.textContent || select.value;
}

function clearSingleFilter(key) {
  if (key === "query") elements.search.value = "";
  if (key === "class") {
    selectedClass = "";
    updateClassRibbon();
  }
  if (key === "service") elements.service.value = "";
  if (key === "status") elements.status.value = "";
  if (key === "type") elements.type.value = "";
  if (key === "location") elements.location.value = "";
  if (key === "presence") elements.presence.value = "";
  if (key === "shoreQuery") elements.shoreSearch.value = "";
  if (key === "shoreType") elements.shoreType.value = "";
  if (key === "changed") {
    changedOnly = false;
    elements.changedOnlyToggle.checked = false;
    updateChangedOnlyStatus();
  }
  applyShoreFilters({ fit: false, sync: false });
  applyFilters();
}

function renderPublicationChanges() {
  const publication = publicationComparison;
  if (!publication?.previousAsOfDate) return;
  const labels = formatPublicationChangeLabels(publication);
  elements.changesToggle.hidden = false;
  elements.changesCount.textContent = publication.changes.length.toString();
  elements.changesCount.setAttribute(
    "aria-label",
    `${publication.changes.length} changed ${publication.changes.length === 1 ? "vessel" : "vessels"}`,
  );
  elements.changesSummary.textContent = labels.summary;
  elements.changesList.replaceChildren(createChangeList(publication.changes));
  elements.changedOnlyToggle.disabled = !publication.changedCurrentVesselIds.length;
}

function createChangeList(changes) {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  const list = document.createElement("ul");
  heading.textContent = `Changed between snapshots · ${changes.length}`;
  for (const change of changes) {
    const item = document.createElement("li");
    const content = document.createElement(change.presentInCurrent ? "button" : "div");
    const vesselName = document.createElement("span");
    const description = document.createElement("small");
    if (change.presentInCurrent) content.type = "button";
    if (change.presentInCurrent) {
      content.dataset.vesselId = change.vesselId;
      content.setAttribute("aria-current", (change.vesselId === selectedId).toString());
    }
    vesselName.textContent = change.vesselName;
    description.textContent = change.items
      .map((entry) => `${entry.label}: ${entry.before} → ${entry.after}`)
      .join(" · ");
    content.append(vesselName, description);
    if (change.presentInCurrent) {
      content.addEventListener("click", () => revealChangedVessel(change.vesselId, content));
    }
    item.append(content);
    list.append(item);
  }
  section.append(heading, list);
  return section;
}

function revealChangedVessel(vesselId, trigger) {
  applySnapshotDate(currentDataset.metadata.asOfDate, { sync: false });
  const vessel = currentDataset.vessels.find((candidate) => candidate.id === vesselId);
  if (!vessel) return;
  resetFilters({ focus: false });
  surfaceController.close("changes");
  selectVessel(vessel, {
    source: "changes",
    trigger,
    returnSurface: "changes",
    returnFocusFallback: elements.changesToggle,
  });
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
      button.setAttribute("aria-current", (vessel.id === selectedId).toString());
      button.dataset.status = vessel.status;
      heading.textContent = vessel.name;
      meta.textContent = `${vessel.pennantNumber || "No pennant"} · ${vessel.status} · ${formatLocationState(vessel.locationState)} · ${formatLocationPrecision(vessel.locationPrecision)}`;
      button.append(heading, meta);
      button.addEventListener("click", () =>
        selectVessel(vessel, {
          source: "list",
          trigger: button,
          returnSurface: "fleet",
          returnFocusFallback: elements.fleetToggle,
        }),
      );
      item.append(button);
      return item;
    }),
  );
  elements.tableBody.replaceChildren(
    ...vessels.map((vessel) => {
      const row = document.createElement("tr");
      const nameCell = document.createElement("th");
      const button = document.createElement("button");
      nameCell.scope = "row";
      button.type = "button";
      button.dataset.vesselId = vessel.id;
      button.textContent = `${vessel.name}${vessel.pennantNumber ? ` · ${vessel.pennantNumber}` : ""}`;
      button.setAttribute("aria-current", (vessel.id === selectedId).toString());
      button.addEventListener("click", () =>
        selectVessel(vessel, {
          source: "table",
          trigger: button,
          returnSurface: "fleet",
          returnFocusFallback: elements.fleetToggle,
        }),
      );
      nameCell.append(button);
      for (const value of [
        vessel.service,
        vessel.vesselType,
        vessel.status,
        vessel.publicLocationLabel,
      ]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      row.prepend(nameCell);
      return row;
    }),
  );
  elements.fleetEmptyState.hidden = vessels.length !== 0;
  setFleetResultView(fleetResultView);
}

function setFleetResultView(view) {
  fleetResultView = view === "table" ? "table" : "list";
  const tableVisible = fleetResultView === "table";
  elements.list.hidden = tableVisible;
  elements.tableWrap.hidden = !tableVisible;
  elements.cardViewToggle.setAttribute("aria-pressed", (!tableVisible).toString());
  elements.tableViewToggle.setAttribute("aria-pressed", tableVisible.toString());
}

function selectVessel(
  vessel,
  {
    source = "list",
    focusMap = true,
    sync = true,
    trigger = null,
    returnSurface = null,
    returnFocusFallback = null,
  } = {},
) {
  if (selectedId !== vessel.id) collapseInspector();
  selectedId = vessel.id;
  selectedShoreId = null;
  details.renderVessel(vessel, {
    asOfDate: selectedSnapshotDate,
    history: insights.history,
    changes:
      selectedSnapshotDate === currentDataset.metadata.asOfDate ? insights.changes : null,
    insightsAvailable: insights.available,
  });
  // Let the record text update before rebuilding the map selection layers.
  // A newer selection cancels this pending acknowledgement.
  window.requestAnimationFrame(() => {
    if (selectedId === vessel.id) fleetMap.selectVessel(vessel, { focus: focusMap });
  });
  updateSelectionSemantics();
  surfaceController.open("detail", {
    focus: source === "changes" || (source !== "restore" && surfaceController.isCompact()),
    returnFocus: trigger,
    returnSurface,
    returnFocusFallback,
  });
  queueSelectedRecordVisibility();
  if (sync) syncPublicState({ mode: source === "restore" ? "replace" : "push" });
}

function collapseInspector() {
  document.querySelector(".command-workspace").classList.remove("detail-expanded");
  const button = document.querySelector("#detailExpand");
  button.setAttribute("aria-expanded", "false");
  button.textContent = "Expand details";
}

function queueSelectedRecordVisibility() {
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    fleetMap.focusSelection({ top: 64 });
  }));
}

const detailExpand = document.querySelector("#detailExpand");
detailExpand.addEventListener("click", () => {
  const expanded = detailExpand.getAttribute("aria-expanded") !== "true";
  detailExpand.setAttribute("aria-expanded", String(expanded));
  detailExpand.textContent = expanded ? "Collapse details" : "Expand details";
  document.querySelector(".command-workspace").classList.toggle("detail-expanded", expanded);
  queueSelectedRecordVisibility();
});
new ResizeObserver(() => {
  if (publicStateReady && (selectedId || selectedShoreId)) queueSelectedRecordVisibility();
}).observe(document.querySelector(".command-workspace"));

function clearSelectedRecord({ syncMode = "replace" } = {}) {
  selectedId = null;
  selectedShoreId = null;
  details.renderDefault(dataset);
  fleetMap.clearSelection();
  updateSelectionSemantics();
  if (publicStateReady) syncPublicState({ mode: syncMode });
}

function updateSelectionSemantics() {
  for (const button of document.querySelectorAll("button[data-vessel-id]")) {
    const active = Boolean(selectedId && button.dataset.vesselId === selectedId);
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-current", active.toString());
  }
  for (const button of document.querySelectorAll("button[data-establishment-id]")) {
    const active = Boolean(
      selectedShoreId && button.dataset.establishmentId === selectedShoreId,
    );
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-current", active.toString());
  }
}

function resetFilters({ focus = false } = {}) {
  elements.search.value = "";
  elements.service.value = "";
  elements.status.value = "";
  elements.type.value = "";
  elements.location.value = "";
  elements.presence.value = "";
  elements.shoreSearch.value = "";
  elements.shoreType.value = "";
  changedOnly = false;
  elements.changedOnlyToggle.checked = false;
  updateChangedOnlyStatus();
  selectedClass = "";
  updateClassRibbon();
  applyShoreFilters({ fit: false, sync: false });
  applyFilters();
  if (focus) elements.search.focus();
}

function applyPublicState(state, { initial = false, sync = true } = {}) {
  applyingPublicState = true;
  selectedId = null;
  selectedShoreId = null;
  applySnapshotDate(state.snapshotDate, { sync: false });
  selectedClass = state.filters.vesselClass;
  elements.search.value = state.filters.query;
  elements.service.value = state.filters.service;
  elements.status.value = state.filters.status;
  elements.type.value = state.filters.type;
  elements.location.value = state.filters.locationState;
  elements.presence.value = state.filters.presence;
  elements.shoreSearch.value = state.filters.shoreQuery;
  elements.shoreType.value = state.filters.shoreType;
  elements.fleetLayerToggle.checked = state.layers.fleet;
  elements.clusterLayerToggle.checked = state.layers.clusters;
  updateClassRibbon();

  fleetMap.clearSelection();
  fleetMap.setClusteringEnabled(state.layers.clusters, { fit: false });
  fleetMap.setFleetVisible(state.layers.fleet, { fit: false });
  toggleShoreLayer(state.layers.shore, { fit: false, sync: false });
  applyFilters({ fit: false, sync: false });
  renderUnifiedShoreResults();
  applyShoreFilters({ fit: false, sync: false });
  details.renderDefault(dataset);
  surfaceController.close("detail");

  const selection = resolvePublicSelection(publicStateCatalog, state);
  const selectedVessel = selection.vessel
    ? dataset.vessels.find((vessel) => vessel.id === selection.vessel.id)
    : null;
  if (selectedVessel) {
    selectVessel(selectedVessel, { source: "restore", focusMap: false, sync: false });
  } else if (selection.shoreEstablishment) {
    selectShoreEstablishment(selection.shoreEstablishment, {
      source: "restore",
      focusMap: false,
      sync: false,
    });
  }
  if (initial) {
    fleetMap.completeStartupView(state.map);
  } else if (state.map) {
    fleetMap.setView(state.map);
  } else {
    fleetMap.resetView();
  }

  applyingPublicState = false;
  if (initial) publicStateReady = true;
  if (sync) syncPublicState();
}

function applyPublicPreset(name) {
  const state = stateForPublicPreset(name);
  if (!state) return;
  state.snapshotDate = selectedSnapshotDate;
  applyPublicState(state);
  elements.presetStatus.textContent = `${PUBLIC_PRESETS[name].label} applied.`;
}

function currentPublicState() {
  return {
    filters: {
      query: elements.search.value,
      vesselClass: selectedClass,
      service: elements.service.value,
      status: elements.status.value,
      type: elements.type.value,
      locationState: elements.location.value,
      presence: elements.presence.value,
      shoreQuery: elements.shoreSearch.value,
      shoreType: elements.shoreType.value,
    },
    layers: {
      fleet: elements.fleetLayerToggle.checked,
      shore: elements.shoreLayerToggle.checked,
      clusters: elements.clusterLayerToggle.checked,
    },
    selectedVessel: selectedId,
    selectedShoreEstablishment: selectedShoreId,
    snapshotDate: selectedSnapshotDate,
    map: fleetMap.getPublicView(),
  };
}

function syncPublicState({ mode = "replace" } = {}) {
  if (!publicStateReady || applyingPublicState) return;
  const state = currentPublicState();
  persistPublicState(publicStorage, state, publicStateCatalog);
  const shareableUrl = createShareablePublicUrl(window.location.href, state, publicStateCatalog);
  try {
    const method = mode === "push" && shareableUrl.href !== window.location.href
      ? "pushState"
      : "replaceState";
    window.history[method](window.history.state, "", shareableUrl);
  } catch {
    // State persistence remains usable when a host prevents URL replacement.
  }
  for (const button of elements.presetButtons) {
    const active = publicStateMatchesPreset(state, button.dataset.publicPreset);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active.toString());
  }
}

function getPublicStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function showError(error) {
  elements.loadingState.hidden = true;
  document.querySelector("#fleetSummaryBanner").setAttribute("aria-busy", "false");
  elements.summaryFilters.forEach((button) => { button.disabled = true; });
  elements.error.hidden = false;
  elements.errorMessage.textContent = error instanceof Error ? error.message : "Unknown fleet data error.";
  window.dispatchEvent(new Event("rn-fleet-failed"));
}

function addDataHealthNotice(message) {
  if (!dataHealthMessages.includes(message)) dataHealthMessages.push(message);
  elements.dataHealthNotice.textContent = dataHealthMessages.join(" ");
  elements.dataHealthNotice.hidden = dataHealthMessages.length === 0;
}
function formatPresence(value) {
  return {
    uk: "United Kingdom and nearby waters",
    overseas: "Overseas reported locations",
  }[value];
}
