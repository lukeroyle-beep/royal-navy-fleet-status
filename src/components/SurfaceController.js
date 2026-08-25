import { COMPACT_SURFACE_QUERY, nextOpenSurfaces } from "../utils/interface.js";

export class SurfaceController {
  constructor({ surfaces, triggers, backdrop, onChange = () => {} }) {
    this.surfaces = surfaces;
    this.triggers = triggers;
    this.backdrop = backdrop;
    this.onChange = onChange;
    this.media = window.matchMedia(COMPACT_SURFACE_QUERY);
    this.openSurfaces = new Set(
      [...surfaces].filter(([, element]) => !element.hidden).map(([name]) => name),
    );

    for (const [name, trigger] of triggers) {
      trigger?.addEventListener("click", () => this.toggle(name));
    }
    for (const close of document.querySelectorAll("[data-close-surface]")) {
      close.addEventListener("click", () => this.close(close.dataset.closeSurface, { restoreFocus: true }));
    }
    backdrop?.addEventListener("click", () => this.closeAll());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.openSurfaces.size) this.closeMostRecent({ restoreFocus: true });
    });
    this.media.addEventListener?.("change", () => this.#handleViewportChange());
    this.#handleViewportChange();
  }

  isCompact() {
    return this.media.matches;
  }

  isOpen(name) {
    return this.openSurfaces.has(name);
  }

  open(name, { focus = false } = {}) {
    if (!this.surfaces.has(name)) return;
    const next = new Set(this.openSurfaces);
    if (this.isCompact()) next.clear();
    next.add(name);
    this.#render(next);
    if (focus) this.surfaces.get(name).querySelector("h2, h3, [tabindex='-1']")?.focus({ preventScroll: true });
  }

  close(name, { restoreFocus = false } = {}) {
    if (!this.openSurfaces.has(name)) return;
    const next = new Set(this.openSurfaces);
    next.delete(name);
    this.#render(next);
    if (restoreFocus) this.triggers.get(name)?.focus();
  }

  toggle(name) {
    this.#render(nextOpenSurfaces(this.openSurfaces, name, this.isCompact()));
  }

  closeAll() {
    this.#render(new Set());
  }

  closeMostRecent({ restoreFocus = false } = {}) {
    const name = [...this.openSurfaces].at(-1);
    if (name) this.close(name, { restoreFocus });
  }

  #handleViewportChange() {
    if (this.isCompact() && this.openSurfaces.size > 1) {
      this.#render(new Set([[...this.openSurfaces].at(-1)]));
      return;
    }
    this.#render(this.openSurfaces);
  }

  #render(next) {
    this.openSurfaces = next;
    for (const [name, surface] of this.surfaces) {
      const open = next.has(name);
      surface.hidden = !open;
      surface.classList.toggle("is-open", open);
      this.triggers.get(name)?.setAttribute("aria-expanded", open.toString());
    }
    if (this.backdrop) {
      this.backdrop.hidden = !(this.isCompact() && next.size > 0);
    }
    this.onChange(new Set(next));
  }
}
