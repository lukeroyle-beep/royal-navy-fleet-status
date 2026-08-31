import {
  COMPACT_SURFACE_QUERY,
  nextOpenSurfaces,
  openSurface,
} from "../utils/interface.js";

export class SurfaceController {
  constructor({ surfaces, triggers, focusFallbacks = new Map(), backdrop, onChange = () => {} }) {
    this.surfaces = surfaces;
    this.triggers = triggers;
    this.focusFallbacks = focusFallbacks;
    this.backdrop = backdrop;
    this.onChange = onChange;
    this.returnContexts = new Map();
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

  open(
    name,
    { focus = false, returnFocus = null, returnSurface = null, returnFocusFallback = null } = {},
  ) {
    if (!this.surfaces.has(name)) return;
    if (returnFocus) {
      this.returnContexts.set(name, {
        target: returnFocus,
        surface: returnSurface,
        fallback: returnFocusFallback,
      });
    } else {
      this.returnContexts.delete(name);
    }
    const next = openSurface(this.openSurfaces, name, this.isCompact());
    this.#render(next);
    if (focus) {
      this.surfaces
        .get(name)
        .querySelector("[data-surface-focus], h2[tabindex='-1'], h3[tabindex='-1']")
        ?.focus({ preventScroll: true });
    }
  }

  close(name, { restoreFocus = false } = {}) {
    if (!this.openSurfaces.has(name)) return;
    const returnContext = this.returnContexts.get(name);
    const recordedTarget = usableFocusTarget(returnContext?.target)
      ? returnContext.target
      : null;
    const focusTarget =
      recordedTarget ??
      returnContext?.fallback ??
      this.focusFallbacks.get(name) ??
      this.triggers.get(name);
    let next = new Set(this.openSurfaces);
    next.delete(name);
    if (
      restoreFocus &&
      returnContext?.surface &&
      this.surfaces.has(returnContext.surface)
    ) {
      next = openSurface(next, returnContext.surface, this.isCompact());
    }
    this.#render(next);
    this.returnContexts.delete(name);
    if (restoreFocus && usableFocusTarget(focusTarget)) {
      focusTarget.focus({ preventScroll: true });
    }
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

function usableFocusTarget(target) {
  return Boolean(target?.isConnected && !target.disabled && typeof target.focus === "function");
}
