export class EventDetailsPanel {
  constructor({ kind, title, description, meta, source }) {
    this.kind = kind;
    this.title = title;
    this.description = description;
    this.meta = meta;
    this.source = source;
  }

  renderDefault(dataset) {
    this.kind.textContent = "Fleet record";
    this.title.textContent = "Select a vessel";
    this.description.textContent = `${dataset.vessels.length} Royal Navy and Royal Fleet Auxiliary records are available.`;
    this.meta.replaceChildren();
    this.source.hidden = true;
  }

  renderVessel(vessel) {
    this.kind.textContent = vessel.service;
    this.title.textContent = vessel.name;
    this.description.textContent =
      vessel.locationClassification === "unknown" || vessel.locationClassification === "withheld"
        ? vessel.unmappedReason
        : "Marker shows the last publicly reported port or representative operational area recorded in this dataset.";

    const entries = [
      ["Pennant", vessel.pennantNumber || "Not recorded"],
      ["Class", vessel.vesselClass],
      ["Type", vessel.vesselType],
      ["Status", vessel.status],
      ["Location", vessel.lastReportedLocation],
      ["Precision", formatClassification(vessel.locationClassification)],
      ["Location evidence date", formatDate(vessel.locationEvidenceDate)],
      ["Evidence checked", formatDate(vessel.evidenceCheckedDate)],
      ["Evidence classification", formatEvidenceClassification(vessel.evidenceClassification)],
      ["Source", vessel.source.label],
    ];
    this.meta.replaceChildren(...entries.map(([term, value]) => createEntry(term, value)));
    this.source.href = vessel.source.url;
    this.source.hidden = false;
  }
}

function createEntry(term, value) {
  const wrapper = document.createElement("div");
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = term;
  dd.textContent = value;
  wrapper.append(dt, dd);
  return wrapper;
}

function formatClassification(value) {
  return {
    mapped: "Mapped public location",
    approximate: "Approximate port or area",
    unknown: "Unknown",
    withheld: "Withheld",
  }[value];
}

function formatDate(value) {
  if (!value) return "Unknown";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatEvidenceClassification(value) {
  return {
    "direct-report": "Direct dated report",
    "direct-tracker": "Direct tracker observation",
    insufficient: "Insufficient for mapping",
    "withheld-policy": "Withheld by policy",
  }[value];
}
