import { VesselPhotoService } from "./VesselPhotoService.js";
import { getVesselChange, getVesselPublicTimeline } from "../utils/insights.js";

export class EventDetailsPanel {
  constructor({
    container,
    kind,
    title,
    primaryMeta,
    meta,
    supplementary,
    supplementaryTitle,
    photo,
    photoImage,
    photoCredit,
    timeline,
    timelineSummary,
    timelineList,
  }) {
    this.container = container;
    this.kind = kind;
    this.title = title;
    this.primaryMeta = primaryMeta;
    this.meta = meta;
    this.supplementary = supplementary;
    this.supplementaryTitle = supplementaryTitle;
    this.photo = photo;
    this.photoImage = photoImage;
    this.photoCredit = photoCredit;
    this.timeline = timeline;
    this.timelineSummary = timelineSummary;
    this.timelineList = timelineList;
    this.photoService = new VesselPhotoService();
    this.renderToken = 0;
    this.photoImage.addEventListener("error", () => this.#hidePhoto());
  }

  renderDefault(dataset) {
    this.renderToken += 1;
    this.kind.textContent = "Fleet record";
    this.title.textContent = "Select a vessel";
    this.primaryMeta.replaceChildren();
    this.meta.replaceChildren();
    this.supplementaryTitle.textContent = "Vessel details";
    this.supplementary.hidden = true;
    this.#hidePhoto();
    this.#hideTimeline();
    this.container.hidden = true;
  }

  renderVessel(
    vessel,
    { asOfDate, history = [], changes = null, insightsAvailable = false } = {},
  ) {
    const token = ++this.renderToken;
    this.kind.textContent = vessel.service;
    this.title.textContent = vessel.name;
    this.container.hidden = false;

    const releaseChange = getVesselChange(changes, vessel.id);

    const primaryEntries = [
      ["Status", vessel.status],
      ["Location", vessel.publicLocationLabel],
      ["Public location status", formatLocationState(vessel.locationState)],
      ["Geographic precision", formatLocationPrecision(vessel.locationPrecision)],
      ["Class", vessel.vesselClass],
      ["Type", vessel.vesselType],
      ["Snapshot", formatSnapshotDate(asOfDate)],
    ];
    const entries = [
      ["Pennant", vessel.pennantNumber || "Not recorded"],
      ["Commission date", vessel.commissionedDate || "Not recorded"],
    ];
    if (releaseChange) entries.push(["This release", formatReleaseChange(releaseChange)]);
    this.primaryMeta.replaceChildren(...primaryEntries.map(([term, value]) => createEntry(term, value)));
    this.meta.replaceChildren(...entries.map(([term, value]) => createEntry(term, value)));
    this.supplementaryTitle.textContent = "Vessel details";
    this.supplementary.hidden = entries.length === 0;
    this.#renderTimeline(history, vessel.id, asOfDate);
    this.#hidePhoto();
    this.photoImage.style.removeProperty("object-position");
    this.photoImage.alt = `Photograph of ${vessel.name}`;
    this.photoImage.dataset.vesselId = vessel.id;

    this.photoService
      .find(vessel)
      .then((result) => {
        if (token !== this.renderToken || !result) return;
        this.photoImage.src = result.imageUrl;
        this.photo.hidden = false;
      })
      .catch(() => {
        if (token === this.renderToken) this.#hidePhoto();
      });
  }

  renderEstablishment(establishment) {
    this.renderToken += 1;
    this.kind.textContent = establishment.type;
    this.title.textContent = establishment.name;
    this.container.hidden = false;
    this.primaryMeta.replaceChildren(
      createEntry("Type", establishment.type),
      createEntry("Location", establishment.location),
    );
    this.meta.replaceChildren(
      createEntry("Role", establishment.role),
      createEntry("About", establishment.description),
    );
    this.supplementaryTitle.textContent = "Establishment details";
    this.supplementary.hidden = false;
    this.photoImage.alt = establishment.imageAlt;
    this.photoImage.dataset.establishmentId = establishment.id;
    delete this.photoImage.dataset.vesselId;
    this.photoImage.style.objectPosition = establishment.imageFocalPoint;
    this.photoImage.src = establishment.image;
    const creditLink = document.createElement("a");
    creditLink.href = establishment.imageCredit.sourceUrl;
    creditLink.target = "_blank";
    creditLink.rel = "noreferrer noopener";
    creditLink.textContent = `${establishment.imageCredit.label} · ${establishment.imageCredit.license}`;
    this.photoCredit.replaceChildren("Image credit: ", creditLink);
    this.photoCredit.hidden = false;
    this.photo.hidden = false;
    this.#hideTimeline();
  }

  #renderTimeline(history, vesselId, asOfDate) {
    const observations = getVesselPublicTimeline(history, vesselId, { upToDate: asOfDate });
    this.timeline.hidden = false;
    this.timeline.open = false;
    this.timelineSummary.textContent = observations.length
      ? `${observations.length} discrete public ${observations.length === 1 ? "observation" : "observations"} through ${formatSnapshotDate(asOfDate)}.`
      : "No public status observations are available for this vessel.";
    this.timelineList.replaceChildren(
      ...observations.map((observation) => {
        const item = document.createElement("li");
        const time = document.createElement("time");
        const status = document.createElement("strong");
        time.dateTime = observation.effectiveDate;
        time.textContent = formatSnapshotDate(observation.effectiveDate);
        status.textContent = observation.status;
        item.append(time, status);
        return item;
      }),
    );
  }

  #hideTimeline() {
    this.timeline.open = false;
    this.timeline.hidden = true;
    this.timelineSummary.textContent = "";
    this.timelineList.replaceChildren();
  }

  #hidePhoto() {
    this.photo.hidden = true;
    this.photoImage.removeAttribute("src");
    this.photoImage.style.removeProperty("object-position");
    delete this.photoImage.dataset.vesselId;
    delete this.photoImage.dataset.establishmentId;
    this.photoImage.alt = "";
    this.photoCredit.replaceChildren();
    this.photoCredit.hidden = true;
  }
}

function createEntry(term, value) {
  const wrapper = document.createElement("div");
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = term;
  dd.textContent = value;
  if (term === "Status") dd.dataset.status = value;
  wrapper.append(dt, dd);
  return wrapper;
}

export function formatLocationState(value) {
  return {
    confirmed: "Confirmed public location",
    last_reported: "Last publicly reported location",
    unconfirmed: "Location unconfirmed",
    no_recent_information: "No recent public information",
    withheld: "Location not published",
  }[value] || value;
}

export function formatLocationPrecision(value) {
  return {
    port: "Port-level location",
    city: "City-level location",
    region: "Approximate region",
    none: "Not mapped",
  }[value] || value;
}

export function formatReleaseChange(change) {
  const details = change.items.map((item) => `${item.label}: ${item.before} → ${item.after}`);
  return `Updated this release · ${details.join("; ")}`;
}

export function formatSnapshotDate(value) {
  if (!value) return "Current public snapshot";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date(`${value}T12:00:00Z`));
}
