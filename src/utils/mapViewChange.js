export class MapViewChangeGate {
  #authoritativeView = null;
  #internalChangeDepth = 0;

  get authoritativeView() {
    return cloneView(this.#authoritativeView);
  }

  setAuthoritativeView(view) {
    this.#authoritativeView = cloneView(view);
  }

  recordExternalViewChange(view) {
    if (this.#internalChangeDepth > 0) return false;
    this.setAuthoritativeView(view);
    return true;
  }

  runInternalViewChange(callback) {
    this.#internalChangeDepth += 1;
    try {
      return callback(this.authoritativeView);
    } finally {
      this.#internalChangeDepth -= 1;
    }
  }
}

function cloneView(view) {
  if (!view) return null;
  return {
    centre: [...view.centre],
    zoom: view.zoom,
  };
}
