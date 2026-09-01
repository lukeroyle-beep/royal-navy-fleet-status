import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";

import {
  clusterSizeClass,
  coLocatedMarkerOffsets,
  coLocatedVessels,
  getMapPosition,
  mapFitPadding,
  markerClassName,
  plottedVessels,
} from "../utils/map.js";
import {
  createMapInteractionProfile,
  discretePinchZoomTarget,
} from "../utils/mapInteraction.js";
import { MapStartupViewGate } from "../utils/mapStartup.js";
import { MapViewChangeGate } from "../utils/mapViewChange.js";

const DEFAULT_VIEW = {
  centre: [28, 0],
  zoom: 2,
};

function touchDistance(firstTouch, secondTouch) {
  return Math.hypot(
    firstTouch.clientX - secondTouch.clientX,
    firstTouch.clientY - secondTouch.clientY,
  );
}

export class FleetMap {
  constructor({
    container,
    notice,
    onSelect,
    onSelectEstablishment,
    onOpenCluster = () => {},
    onOpenShoreCluster = () => {},
    onViewChange = () => {},
  }) {
    this.container = container;
    this.notice = notice;
    this.onSelect = onSelect;
    this.onSelectEstablishment = onSelectEstablishment;
    this.onOpenCluster = onOpenCluster;
    this.onOpenShoreCluster = onOpenShoreCluster;
    this.onViewChange = onViewChange;
    this.markers = new Map();
    this.shoreMarkers = new Map();
    this.visibleVessels = [];
    this.visibleShoreEstablishments = [];
    this.fleetVisible = true;
    this.shoreVisible = false;
    this.clusteringEnabled = true;
    this.startupViewGate = new MapStartupViewGate();
    this.viewChangeGate = new MapViewChangeGate();
    this.selectedId = null;
    this.selectedShoreId = null;
    this.coLocatedSelection = null;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.interactionProfile = createMapInteractionProfile({
      safari: L.Browser.safari,
      mobile: L.Browser.mobile,
      reducedMotion: this.reducedMotion,
    });
    this.container.classList.toggle("is-mobile-safari", this.interactionProfile.mobileSafari);
    this.resizeFrame = null;
    this.lastContainerSize = [container.clientWidth, container.clientHeight];

    this.map = L.map(container, {
      center: DEFAULT_VIEW.centre,
      zoom: DEFAULT_VIEW.zoom,
      minZoom: 0,
      maxZoom: this.interactionProfile.maxZoom,
      zoomSnap: this.interactionProfile.zoomSnap,
      worldCopyJump: true,
      zoomControl: false,
      keyboard: true,
      touchZoom: this.interactionProfile.continuousTouchZoom,
      bounceAtZoomLimits: false,
      zoomAnimation: this.interactionProfile.animationsEnabled,
      fadeAnimation: this.interactionProfile.animationsEnabled,
      markerZoomAnimation: this.interactionProfile.animationsEnabled,
    });

    if (this.interactionProfile.discreteTouchZoom) this.#installDiscreteTouchZoom();

    L.control.zoom({ position: "bottomright" }).addTo(this.map);
    this.map.attributionControl.setPrefix(false);

    this.tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: this.interactionProfile.maxZoom,
      detectRetina: false,
      updateWhenIdle: true,
    });
    this.tileLoadFailed = false;
    this.tiles.on("loading", () => {
      this.tileLoadFailed = false;
    });
    this.tiles.on("tileerror", () => {
      this.tileLoadFailed = true;
      this.#showTileNotice();
    });
    this.tiles.on("load", () => {
      if (!this.tileLoadFailed) this.#hideTileNotice();
    });
    this.tiles.addTo(this.map);

    this.clusterGroup = L.markerClusterGroup({
      animate: this.interactionProfile.animationsEnabled,
      animateAddingMarkers: false,
      chunkedLoading: false,
      maxClusterRadius: 48,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      spiderfyDistanceMultiplier: 1.45,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (cluster) => this.#createClusterIcon(cluster),
    });
    this.map.addLayer(this.clusterGroup);
    this.clusterGroup.on("clusterclick", (event) => {
      const vessels = event.layer
        .getAllChildMarkers()
        .map((marker) => marker.options.vessel)
        .filter(Boolean)
        .sort((left, right) => left.name.localeCompare(right.name));
      this.onOpenCluster(vessels);
    });
    this.unclusteredGroup = L.layerGroup().addTo(this.map);
    this.selectionGroup = L.layerGroup().addTo(this.map);

    this.shoreClusterGroup = L.markerClusterGroup({
      animate: this.interactionProfile.animationsEnabled,
      animateAddingMarkers: false,
      chunkedLoading: false,
      maxClusterRadius: 44,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      spiderfyDistanceMultiplier: 1.65,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (cluster) => this.#createShoreClusterIcon(cluster),
    });
    this.map.addLayer(this.shoreClusterGroup);
    this.shoreClusterGroup.on("clusterclick", (event) => {
      const establishments = event.layer
        .getAllChildMarkers()
        .map((marker) => marker.options.establishment)
        .filter(Boolean)
        .sort((left, right) => left.name.localeCompare(right.name));
      this.onOpenShoreCluster(establishments);
    });
    this.unclusteredShoreGroup = L.layerGroup().addTo(this.map);
    this.shoreSelectionGroup = L.layerGroup().addTo(this.map);

    this.resizeObserver = new ResizeObserver((entries) => {
      const rect = entries.at(-1)?.contentRect;
      const nextSize = [
        Math.round(rect?.width ?? this.container.clientWidth),
        Math.round(rect?.height ?? this.container.clientHeight),
      ];
      if (
        nextSize[0] === this.lastContainerSize[0] &&
        nextSize[1] === this.lastContainerSize[1]
      ) {
        return;
      }
      this.lastContainerSize = nextSize;
      this.#queuePreserveViewThroughResize();
    });
    this.resizeObserver.observe(container);
    this.map.on("moveend", () => {
      const view = this.getView();
      if (
        this.startupViewGate.ready &&
        this.viewChangeGate.recordExternalViewChange(view)
      ) {
        this.onViewChange(view);
      }
    });
    this.map.on("zoomend", () => this.#positionCoLocatedSelection());
  }

  getView() {
    const centre = this.map.getCenter();
    return {
      centre: [centre.lat, centre.lng],
      zoom: this.map.getZoom(),
    };
  }

  getPublicView() {
    return this.viewChangeGate.authoritativeView ?? this.getView();
  }

  setView({ centre, zoom }, { animate = false } = {}) {
    this.map.stop();
    this.map.setView(centre, zoom, {
      animate: animate && this.interactionProfile.animationsEnabled,
    });
  }

  completeStartupView(view) {
    this.startupViewGate.complete(() => {
      this.map.stop();
      if (view) {
        this.map.setView(view.centre, view.zoom, { animate: false });
      } else {
        this.#resetView({ animate: false });
      }
    });
    this.viewChangeGate.setAuthoritativeView(this.getView());
  }

  #preserveViewThroughResize() {
    const preservedView = this.viewChangeGate.authoritativeView ?? this.getView();
    this.viewChangeGate.runInternalViewChange(() => {
      this.map.stop();
      this.map.invalidateSize({ animate: false, debounceMoveend: false, pan: false });
      this.map.setView(preservedView.centre, preservedView.zoom, {
        animate: false,
        reset: true,
      });
    });
  }

  #queuePreserveViewThroughResize() {
    if (this.resizeFrame !== null) window.cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = window.requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.#preserveViewThroughResize();
    });
  }

  #installDiscreteTouchZoom() {
    const pinch = {
      active: false,
      point: null,
      startDistance: 0,
      endDistance: 0,
      startZoom: 0,
      suppressClickUntil: 0,
    };
    const hint = document.createElement("div");
    hint.className = "map-pinch-hint";
    hint.textContent = "Release to zoom";
    hint.setAttribute("aria-hidden", "true");
    hint.hidden = true;
    this.container.parentElement?.append(hint);

    const updateGesture = (event) => {
      const [firstTouch, secondTouch] = event.touches;
      pinch.endDistance = touchDistance(firstTouch, secondTouch);
      const firstPoint = this.map.mouseEventToContainerPoint(firstTouch);
      const secondPoint = this.map.mouseEventToContainerPoint(secondTouch);
      pinch.point = firstPoint.add(secondPoint).divideBy(2);
    };
    const startGesture = (event) => {
      if (pinch.active || event.touches?.length !== 2) return;
      pinch.active = true;
      pinch.startZoom = this.map.getZoom();
      updateGesture(event);
      pinch.startDistance = pinch.endDistance;
      hint.hidden = false;
      this.map.stop();
      event.preventDefault();
    };
    const moveGesture = (event) => {
      if (!pinch.active || event.touches?.length !== 2) return;
      updateGesture(event);
      event.preventDefault();
    };
    const finishGesture = (event) => {
      if (!pinch.active || (event.type === "touchend" && event.touches?.length >= 2)) return;
      pinch.active = false;
      hint.hidden = true;
      pinch.suppressClickUntil = performance.now() + 500;
      if (event.type !== "touchcancel" && pinch.point) {
        const targetZoom = discretePinchZoomTarget({
          startZoom: pinch.startZoom,
          startDistance: pinch.startDistance,
          endDistance: pinch.endDistance,
          minZoom: this.map.getMinZoom(),
          maxZoom: this.map.getMaxZoom(),
        });
        if (targetZoom !== pinch.startZoom) {
          this.map.stop();
          this.map.setZoomAround(pinch.point, targetZoom, false);
        }
      }
      event.preventDefault();
    };
    const suppressPostPinchClick = (event) => {
      if (performance.now() >= pinch.suppressClickUntil) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    this.container.addEventListener("touchstart", startGesture, { passive: false });
    document.addEventListener("touchmove", moveGesture, { passive: false });
    document.addEventListener("touchend", finishGesture, { passive: false });
    document.addEventListener("touchcancel", finishGesture, { passive: false });
    this.container.addEventListener("click", suppressPostPinchClick, true);
  }

  setVessels(vessels) {
    this.clusterGroup.clearLayers();
    this.unclusteredGroup.clearLayers();
    this.selectionGroup.clearLayers();
    this.markers.clear();

    for (const vessel of plottedVessels(vessels)) {
      this.markers.set(vessel.id, this.#createMarker(vessel));
    }

    this.setVisibleVessels(vessels, { fit: true });
  }

  setVisibleVessels(vessels, { fit = true } = {}) {
    this.visibleVessels = plottedVessels(vessels);
    this.#syncFleetLayers();
    if (fit) this.resetView();
  }

  setFleetVisible(visible, { fit = true } = {}) {
    this.fleetVisible = visible;
    this.#syncFleetLayers();
    if (fit) this.resetView();
  }

  setClusteringEnabled(enabled, { fit = false } = {}) {
    this.clusteringEnabled = enabled;
    this.#syncFleetLayers();
    this.#syncShoreLayers();
    if (fit) this.resetView();
  }

  setShoreEstablishments(establishments) {
    this.shoreMarkers.clear();
    for (const establishment of establishments) {
      this.shoreMarkers.set(establishment.id, this.#createShoreMarker(establishment));
    }
    this.setVisibleShoreEstablishments(establishments, { fit: false });
  }

  setVisibleShoreEstablishments(establishments, { fit = true } = {}) {
    this.visibleShoreEstablishments = establishments;
    this.#syncShoreLayers();
    if (this.shoreVisible && fit) this.resetView();
  }

  setShoreVisible(visible, { fit = true } = {}) {
    this.shoreVisible = visible;
    this.#syncShoreLayers();
    if (fit) this.resetView();
  }

  selectVessel(vessel, { focus = false } = {}) {
    this.selectedId = vessel.id;
    this.selectedShoreId = null;
    this.#refreshMarkerIcons();
    this.#refreshShoreMarkerIcons();
    this.#syncFleetLayers();
    this.#syncShoreLayers();
    this.container.classList.add("has-selection");

    if (!focus) return;
    if (!this.fleetVisible) return;
    const marker = this.markers.get(vessel.id);
    if (marker) {
      const contextualZoom = Math.max(this.map.getZoom(), 4);
      this.map.setView(marker.getLatLng(), contextualZoom, {
        animate: this.interactionProfile.animationsEnabled,
      });
      marker.openTooltip();
    }
  }

  selectShoreEstablishment(establishment, { focus = true } = {}) {
    this.selectedId = null;
    this.selectedShoreId = establishment.id;
    this.#refreshMarkerIcons();
    this.#refreshShoreMarkerIcons();
    this.#syncFleetLayers();
    this.#syncShoreLayers();
    this.container.classList.add("has-selection");

    if (!focus || !this.shoreVisible) return;
    const marker = this.shoreMarkers.get(establishment.id);
    if (!marker) return;
    const contextualZoom = Math.max(this.map.getZoom(), 4);
    this.map.setView(marker.getLatLng(), contextualZoom, {
      animate: this.interactionProfile.animationsEnabled,
    });
    marker.openTooltip();
  }

  clearSelection() {
    this.selectedId = null;
    this.selectedShoreId = null;
    this.#refreshMarkerIcons();
    this.#refreshShoreMarkerIcons();
    this.#syncFleetLayers();
    this.#syncShoreLayers();
    this.container.classList.remove("has-selection");
  }

  focusSelection({ top = 0, right = 0, bottom = 0, left = 0 } = {}) {
    const marker = this.selectedId
      ? this.markers.get(this.selectedId)
      : this.shoreMarkers.get(this.selectedShoreId);
    if (!marker || (!this.fleetVisible && this.selectedId) || (!this.shoreVisible && this.selectedShoreId)) {
      return;
    }
    this.map.panInside(marker.getLatLng(), {
      animate: this.interactionProfile.animationsEnabled,
      paddingTopLeft: [left + 28, top + 28],
      paddingBottomRight: [right + 28, bottom + 28],
    });
  }

  resetView() {
    this.startupViewGate.runAutomaticFit(() => this.#resetView());
  }

  #resetView({ animate = this.interactionProfile.animationsEnabled } = {}) {
    this.map.stop();
    const layers = [
      ...(this.fleetVisible
        ? this.visibleVessels.map((vessel) => this.markers.get(vessel.id)).filter(Boolean)
        : []),
      ...(this.shoreVisible
        ? this.visibleShoreEstablishments
            .map((establishment) => this.shoreMarkers.get(establishment.id))
            .filter(Boolean)
        : []),
    ];

    if (!layers.length) {
      this.map.setView(DEFAULT_VIEW.centre, DEFAULT_VIEW.zoom, {
        animate,
      });
      return;
    }

    const bounds = L.featureGroup(layers).getBounds();
    this.map.fitBounds(bounds, {
      animate,
      maxZoom: layers.length === 1 ? 7 : 8,
      padding: mapFitPadding(this.container.clientWidth),
    });
  }

  #createMarker(vessel) {
    const position = getMapPosition(vessel);
    const marker = L.marker([position.lat, position.lon], {
      alt: `${vessel.name}, ${formatLocationState(vessel.locationState)}, ${formatPrecision(vessel.locationPrecision)}`,
      icon: this.#createMarkerIcon(vessel),
      keyboard: true,
      riseOnHover: true,
      title: vessel.name,
      vessel,
    });
    marker.bindTooltip(
      `<strong>${escapeHtml(vessel.name)}</strong><span>${escapeHtml(position.label)} · ${escapeHtml(formatLocationState(vessel.locationState))}</span>`,
      {
        className: "fleet-tooltip",
        direction: "top",
        offset: [0, -12],
      },
    );
    marker.on("click", () => this.onSelect(vessel));
    return marker;
  }

  #createShoreMarker(establishment) {
    const marker = L.marker([establishment.position.lat, establishment.position.lon], {
      alt: `${establishment.name}, ${establishment.type}`,
      icon: this.#createShoreMarkerIcon(establishment),
      keyboard: true,
      riseOnHover: true,
      title: establishment.name,
      establishment,
    });
    marker.bindTooltip(
      `<strong>${escapeHtml(establishment.name)}</strong><span>${escapeHtml(establishment.type)} · ${escapeHtml(establishment.position.label)}</span>`,
      {
        className: "fleet-tooltip shore-tooltip",
        direction: "top",
        offset: [0, -12],
      },
    );
    marker.on("click", () => this.onSelectEstablishment(establishment));
    return marker;
  }

  #createMarkerIcon(vessel) {
    return L.divIcon({
      className: markerClassName(vessel, this.selectedId),
      html: '<span class="fleet-marker-symbol" aria-hidden="true"><i class="fleet-marker-category"></i><i class="fleet-marker-status"></i></span>',
      iconAnchor: [22, 22],
      iconSize: [44, 44],
      tooltipAnchor: [0, -16],
    });
  }

  #createShoreMarkerIcon(establishment) {
    const selectedClass = establishment.id === this.selectedShoreId ? " is-selected" : "";
    return L.divIcon({
      className: `shore-marker${selectedClass}`,
      html: '<span class="shore-marker-symbol" aria-hidden="true"><i></i></span>',
      iconAnchor: [22, 22],
      iconSize: [44, 44],
      tooltipAnchor: [0, -16],
    });
  }

  #createClusterIcon(cluster) {
    const count = cluster.getChildCount();
    return L.divIcon({
      className: `fleet-cluster ${clusterSizeClass(count)}`,
      html: `<span aria-hidden="true">${count}</span><span class="sr-only">${count} vessel locations</span>`,
      iconSize: [44, 44],
    });
  }

  #createShoreClusterIcon(cluster) {
    const count = cluster.getChildCount();
    return L.divIcon({
      className: "shore-cluster",
      html: `<span aria-hidden="true">${count}</span><span class="sr-only">${count} shore establishments</span>`,
      iconSize: [44, 44],
    });
  }

  #refreshMarkerIcons() {
    for (const [id, marker] of this.markers) {
      const vessel = marker.options.vessel || this.visibleVessels.find((item) => item.id === id);
      if (vessel) {
        marker.setIcon(this.#createMarkerIcon(vessel));
        marker.getElement()?.setAttribute("aria-current", (id === this.selectedId).toString());
      }
    }
  }

  #refreshShoreMarkerIcons() {
    for (const [id, marker] of this.shoreMarkers) {
      const establishment =
        marker.options.establishment ||
        this.visibleShoreEstablishments.find((candidate) => candidate.id === id);
      if (establishment) {
        marker.setIcon(this.#createShoreMarkerIcon(establishment));
        marker.getElement()?.setAttribute("aria-current", (id === this.selectedShoreId).toString());
      }
    }
  }

  #syncFleetLayers() {
    this.clusterGroup.clearLayers();
    this.unclusteredGroup.clearLayers();
    this.selectionGroup.clearLayers();
    this.coLocatedSelection = null;
    for (const marker of this.markers.values()) {
      const position = getMapPosition(marker.options.vessel);
      if (position) marker.setLatLng([position.lat, position.lon]);
    }
    if (!this.fleetVisible) return;

    const selectedMarker = this.selectedId ? this.markers.get(this.selectedId) : null;
    const coLocatedMarkers = coLocatedVessels(this.visibleVessels, this.selectedId)
      .map((vessel) => this.markers.get(vessel.id))
      .filter(Boolean);
    const coLocatedMarkerSet = new Set(coLocatedMarkers);
    const markers = this.visibleVessels
      .map((vessel) => this.markers.get(vessel.id))
      .filter(
        (marker) =>
          marker && marker !== selectedMarker && !coLocatedMarkerSet.has(marker),
      );
    const activeGroup = this.clusteringEnabled ? this.clusterGroup : this.unclusteredGroup;
    for (const marker of markers) activeGroup.addLayer(marker);
    if (selectedMarker && this.visibleVessels.some((vessel) => vessel.id === this.selectedId)) {
      if (coLocatedMarkers.length > 1) {
        for (const marker of coLocatedMarkers) this.selectionGroup.addLayer(marker);
        // Keep the layout independent of selection so the highlight moves, not the markers.
        const anchor = coLocatedMarkers[0];
        this.coLocatedSelection = {
          legs: [],
          origin: anchor.getLatLng(),
          siblings: coLocatedMarkers.slice(1),
        };
        this.#positionCoLocatedSelection();
      } else {
        this.selectionGroup.addLayer(selectedMarker);
      }
    }
  }

  #positionCoLocatedSelection() {
    const selection = this.coLocatedSelection;
    if (!selection || !this.fleetVisible) return;

    for (const leg of selection.legs) this.selectionGroup.removeLayer(leg);
    selection.legs = [];
    const zoom = this.map.getZoom();
    const originPoint = this.map.project(selection.origin, zoom);
    const offsets = coLocatedMarkerOffsets(selection.siblings.length);
    for (const [index, marker] of selection.siblings.entries()) {
      const offset = offsets[index];
      const displayPosition = this.map.unproject(
        originPoint.add([offset.x, offset.y]),
        zoom,
      );
      marker.setLatLng(displayPosition);
      const leg = L.polyline([selection.origin, displayPosition], {
        className: "fleet-overlap-leg",
        color: "#ffffff",
        dashArray: "3 4",
        interactive: false,
        opacity: 0.72,
        weight: 2,
      });
      selection.legs.push(leg);
      this.selectionGroup.addLayer(leg);
    }
  }

  #syncShoreLayers() {
    this.shoreClusterGroup.clearLayers();
    this.unclusteredShoreGroup.clearLayers();
    this.shoreSelectionGroup.clearLayers();
    if (!this.shoreVisible) return;

    const selectedMarker = this.selectedShoreId ? this.shoreMarkers.get(this.selectedShoreId) : null;
    const markers = this.visibleShoreEstablishments
      .map((establishment) => this.shoreMarkers.get(establishment.id))
      .filter((marker) => marker && marker !== selectedMarker);
    const activeGroup = this.clusteringEnabled ? this.shoreClusterGroup : this.unclusteredShoreGroup;
    for (const marker of markers) activeGroup.addLayer(marker);
    if (selectedMarker) this.shoreSelectionGroup.addLayer(selectedMarker);
  }

  #showTileNotice() {
    if (!this.notice) return;
    this.notice.hidden = false;
  }

  #hideTileNotice() {
    if (!this.notice) return;
    this.notice.hidden = true;
  }
}

function formatLocationState(value) {
  return {
    confirmed: "confirmed public location",
    last_reported: "last publicly reported location",
    unconfirmed: "location unconfirmed",
    no_recent_information: "no recent public information",
    withheld: "location not published",
  }[value] || value;
}

function formatPrecision(value) {
  return {
    port: "port-level location",
    city: "city-level location",
    region: "approximate region",
    none: "not mapped",
  }[value] || value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
