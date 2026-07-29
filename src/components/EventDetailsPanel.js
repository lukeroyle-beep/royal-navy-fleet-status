import { VesselPhotoService } from "./VesselPhotoService.js";

export class EventDetailsPanel {
  constructor({ kind, title, description, meta, photo, photoImage, photoCredit }) {
    this.kind = kind;
    this.title = title;
    this.description = description;
    this.meta = meta;
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
    this.description.textContent = `${dataset.vessels.length} Royal Navy and Royal Fleet Auxiliary records are available.`;
    this.meta.replaceChildren();
    this.#hidePhoto();
  }

  renderVessel(vessel) {
    const token = ++this.renderToken;
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
    ];
    this.meta.replaceChildren(...entries.map(([term, value]) => createEntry(term, value)));
    this.#hidePhoto();
    this.photoImage.alt = `Photograph of ${vessel.name}`;

    this.photoService
      .find(vessel)
      .then((result) => {
        if (token !== this.renderToken || !result) return;
        this.photoImage.src = result.imageUrl;
        this.photoCredit.href = result.pageUrl;
        this.photo.hidden = false;
      })
      .catch(() => {
        if (token === this.renderToken) this.#hidePhoto();
      });
  }

  #hidePhoto() {
    this.photo.hidden = true;
    this.photoImage.removeAttribute("src");
    this.photoImage.alt = "";
    this.photoCredit.removeAttribute("href");
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
