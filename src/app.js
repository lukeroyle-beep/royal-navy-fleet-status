import { EventDetailsPanel } from "./components/EventDetailsPanel.js";
import {
  FleetInsightsLoader,
  insightsMatchDataset,
} from "./components/FleetInsightsLoader.js";
import { FleetMap } from "./components/FleetMap.js";
import { ScenarioLoader } from "./components/ScenarioLoader.js";
import { getActiveFleetSummary } from "./utils/fleet.js";
import {
  formatSignedDelta,
  getClassSnapshotSummary,
  shortClassName,
} from "./utils/insights.js";
import { hasPlottablePosition } from "./utils/map.js";
import "./styles.css";

const DATA_URL = "./data/royal-navy/vessels.json";
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
  changesToggle: document.querySelector("#changesToggle"),
  changesCount: document.querySelector("#changesCount"),
  changesPanel: document.querySelector("#changesPanel"),
  changesClose: document.querySelector("#changesClose"),
  changesSummary: document.querySelector("#changesSummary"),
  changesList: document.querySelector("#changesList"),
  activeCount: document.querySelector("#activeCount"),
  activePercentage: document.querySelector("#activePercentage"),
  primaryLabel: document.querySelector("#summaryPrimaryLabel"),
  primaryValue: document.querySelector("#totalCount"),
  primaryNote: document.querySelector("#summaryPrimaryNote"),
  secondaryLabel: document.querySelector("#summarySecondaryLabel"),
  secondaryValue: document.querySelector("#mappedCount"),
  secondaryNote: document.querySelector("#summarySecondaryNote"),
  tertiaryLabel: document.querySelector("#summaryTertiaryLabel"),
  tertiaryValue: document.querySelector("#filteredCount"),
  tertiaryNote: document.querySelector("#summaryTertiaryNote"),
  classRibbon: document.querySelector("#classRibbon"),
  classSelectionStatus: document.querySelector("#classSelectionStatus"),
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
  meta: document.querySelector("#detailMeta"),
  photo: document.querySelector("#detailPhoto"),
  photoImage: document.querySelector("#detailPhotoImage"),
});

let dataset;
let insights = { changes: null, history: [], available: false };
let selectedId = null;
let selectedClass = "";
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
    try {
      const loadedInsights = await new FleetInsightsLoader({
        changesUrl: CHANGES_URL,
        historyUrl: HISTORY_URL,
      }).load();
      if (!insightsMatchDataset(loadedInsights, dataset.metadata.asOfDate)) {
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
  const activeFleet = getActiveFleetSummary(dataset.vessels);
  elements.asOfDate.textContent = formatDate(dataset.metadata.asOfDate);
  elements.activeCount.textContent = activeFleet.total.toString();
  elements.activePercentage.textContent = `${activeFleet.percentage.toFixed(1)}%`;
  fillSelect(elements.service, uniqueValues("service"));
  fillSelect(elements.status, uniqueValues("status"));
  fillSelect(elements.type, uniqueValues("vesselType"));
  renderClassRibbon();
  renderPublicationChanges();
  fleetMap.setVessels(dataset.vessels);
  details.renderDefault(dataset);

  elements.search.addEventListener("input", applyFilters);
  for (const select of [elements.service, elements.status, elements.type, elements.location]) {
    select.addEventListener("change", applyFilters);
  }
  elements.reset.addEventListener("click", () => resetFilters({ focus: true }));
  elements.mapReset.addEventListener("click", () => fleetMap.resetView());
  elements.changesToggle.addEventListener("click", () => toggleChangesPanel(elements.changesPanel.hidden));
  elements.changesClose.addEventListener("click", () => toggleChangesPanel(false, { restoreFocus: true }));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.changesPanel.hidden) {
      toggleChangesPanel(false, { restoreFocus: true });
    }
  });
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
  }
  elements.classSelectionStatus.textContent = selectedClass ? shortClassName(selectedClass) : "All classes";
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
      (!elements.location.value || vessel.locationClassification === elements.location.value)
    );
  });

  renderSummary(filtered.length);
  elements.resultsStatus.textContent = `${filtered.length} of ${dataset.vessels.length}`;
  renderList(filtered);
  fleetMap.setVisibleVessels(filtered);
  if (selectedId && !filtered.some((vessel) => vessel.id === selectedId)) {
    selectedId = null;
    details.renderDefault(dataset);
    fleetMap.clearSelection();
  }
}

function renderSummary(filteredCount) {
  if (!selectedClass) {
    const mappedCount = dataset.vessels.filter(hasPlottablePosition).length;
    const mappedDelta = insights.changes
      ? mappedCount - insights.changes.previousMappedCount
      : null;
    setSummaryCell(elements.primaryLabel, elements.primaryValue, elements.primaryNote, {
      label: "Fleet records",
      value: dataset.vessels.length,
      note: insights.changes ? `${insights.changes.changes.length} updated this release` : "",
    });
    setSummaryCell(elements.secondaryLabel, elements.secondaryValue, elements.secondaryNote, {
      label: "Mapped records",
      value: mappedCount,
      note: formatChangeSince(mappedDelta),
    });
    setSummaryCell(elements.tertiaryLabel, elements.tertiaryValue, elements.tertiaryNote, {
      label: "Shown by filters",
      value: filteredCount,
      note: "",
    });
    return;
  }

  const summary = getClassSnapshotSummary(
    dataset.vessels,
    selectedClass,
    insights.history,
    dataset.metadata.asOfDate,
  );
  setSummaryCell(elements.primaryLabel, elements.primaryValue, elements.primaryNote, {
    label: "Class vessels",
    value: summary.vesselCount,
    note: filteredCount === summary.vesselCount ? "" : `${filteredCount} shown by filters`,
  });
  setSummaryCell(elements.secondaryLabel, elements.secondaryValue, elements.secondaryNote, {
    label: "Active now",
    value: summary.active,
    note: formatChangeSince(summary.activeDelta),
  });
  setSummaryCell(elements.tertiaryLabel, elements.tertiaryValue, elements.tertiaryNote, {
    label: "Vessel class availability",
    value: summary.activePercentage === null ? "—" : `${summary.activePercentage.toFixed(0)}%`,
    note: classSnapshotNote(summary),
  });
}

function setSummaryCell(labelElement, valueElement, noteElement, { label, value, note }) {
  labelElement.textContent = label;
  valueElement.textContent = value.toString();
  noteElement.textContent = note;
  noteElement.hidden = !note;
}

function classSnapshotNote(summary) {
  const parts = [];
  const delta = formatSignedDelta(summary.percentageDelta, "pp");
  if (delta) parts.push(`${delta} since ${previousPublicationDate()}`);
  if (summary.unknown) parts.push(`${summary.unknown} unknown`);
  if (!insights.available) {
    parts.push("History unavailable");
  } else if (!summary.rolling.mature) {
    parts.push(`History ${summary.rolling.observationCount}/52`);
  } else if (summary.rolling.coveragePercentage < 100) {
    parts.push(`${summary.rolling.coveragePercentage.toFixed(0)}% coverage`);
  }
  return parts.join(" · ");
}

function formatChangeSince(value) {
  const delta = formatSignedDelta(value);
  return delta ? `${delta} since ${previousPublicationDate()}` : "";
}

function previousPublicationDate() {
  return insights.changes ? formatShortDate(insights.changes.previousAsOfDate) : "previous release";
}

function renderPublicationChanges() {
  const publication = insights.changes;
  if (!publication?.changes?.length) return;
  elements.changesToggle.hidden = false;
  elements.changesCount.textContent = `${formatShortDate(publication.previousAsOfDate)} · ${publication.changes.length} vessels`;
  elements.changesSummary.textContent = `${publication.changes.length} vessels changed between ${formatDate(publication.previousAsOfDate)} and ${formatDate(publication.currentAsOfDate)}.`;
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
  toggleChangesPanel(false);
  selectVessel(vessel, { source: "changes" });
}

function toggleChangesPanel(open, { restoreFocus = false } = {}) {
  elements.changesPanel.hidden = !open;
  elements.changesToggle.setAttribute("aria-expanded", open.toString());
  if (open) {
    elements.changesPanel.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "nearest",
    });
  } else if (restoreFocus) {
    elements.changesToggle.focus();
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
  details.renderVessel(vessel, {
    asOfDate: dataset.metadata.asOfDate,
    history: insights.history,
    changes: insights.changes,
    insightsAvailable: insights.available,
  });
  fleetMap.selectVessel(vessel, { focus: source === "list" || source === "changes" });
  for (const button of elements.list.querySelectorAll("button")) {
    button.classList.toggle("is-selected", button.dataset.vesselId === vessel.id);
  }
  document
    .querySelector("#detailCard")
    .scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
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

function formatDate(value) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatShortDate(value) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
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
