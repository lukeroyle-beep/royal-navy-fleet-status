import { VesselPhotoService } from "./VesselPhotoService.js";
import { getVesselChange } from "../utils/insights.js";

export class EventDetailsPanel {
  constructor({ container, kind, title, primaryMeta, meta, disclosure, photo, photoImage, photoCredit }) {
    this.container = container;
    this.kind = kind;
    this.title = title;
    this.primaryMeta = primaryMeta;
    this.meta = meta;
    this.disclosure = disclosure;
    this.photo = photo;
    this.photoImage = photoImage;
    this.photoCredit = photoCredit;
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
    this.disclosure.open = false;
    this.#hidePhoto();
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
      ["Location", vessel.lastReportedLocation],
      ["Location information", formatLocationClassification(vessel.locationClassification)],
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
    this.disclosure.open = false;
    this.disclosure.hidden = entries.length === 0;
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
    this.disclosure.open = false;
    this.disclosure.hidden = false;
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

export function formatLocationClassification(value) {
  return {
    mapped: "Mapped public location",
    approximate: "Approximate port or area",
    unknown: "Unknown public location",
    withheld: "Withheld · symbolic marker",
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
