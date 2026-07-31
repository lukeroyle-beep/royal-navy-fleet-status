import { VesselPhotoService } from "./VesselPhotoService.js";

export class EventDetailsPanel {
  constructor({ kind, title, meta, photo, photoImage }) {
    this.kind = kind;
    this.title = title;
    this.meta = meta;
    this.photo = photo;
    this.photoImage = photoImage;
    this.photoService = new VesselPhotoService();
    this.renderToken = 0;
    this.photoImage.addEventListener("error", () => this.#hidePhoto());
  }

  renderDefault(dataset) {
    this.renderToken += 1;
    this.kind.textContent = "Fleet record";
    this.title.textContent = "Select a vessel";
    this.meta.replaceChildren();
    this.#hidePhoto();
  }

  renderVessel(vessel) {
    const token = ++this.renderToken;
    this.kind.textContent = vessel.service;
    this.title.textContent = vessel.name;

    const entries = [
      ["Pennant", vessel.pennantNumber || "Not recorded"],
      ["Class", vessel.vesselClass],
      ["Type", vessel.vesselType],
      ["Commission date", vessel.commissionedDate || "Not recorded"],
      ["Status", vessel.status],
      ["Location", vessel.lastReportedLocation],
    ];
    this.meta.replaceChildren(...entries.map(([term, value]) => createEntry(term, value)));
    this.#hidePhoto();
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

  #hidePhoto() {
    this.photo.hidden = true;
    this.photoImage.removeAttribute("src");
    delete this.photoImage.dataset.vesselId;
    this.photoImage.alt = "";
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
