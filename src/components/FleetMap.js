import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";

import {
  clusterSizeClass,
  coLocatedMarkerOffsets,
  coLocatedVessels,
  getMapPosition,
  getUncertaintyArea,
  hasPlottablePosition,
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
  constructor({ container, notice, onSelect, onSelectEstablishment, onViewChange = () => {} }) {
    this.container = container;
    this.notice = notice;
    this.onSelect = onSelect;
    this.onSelectEstablishment = onSelectEstablishment;
    this.onViewChange = onViewChange;
    this.markers = new Map();
    this.uncertaintyLayers = new Map();
    this.uncertaintyGroups = [];
    this.shoreMarkers = new Map();
    this.visibleVessels = [];
    this.visibleShoreEstablishments = [];
    this.fleetVisible = true;
    this.uncertaintyAreasVisible = true;
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
    this.unclusteredGroup = L.layerGroup().addTo(this.map);
    this.selectionGroup = L.layerGroup().addTo(this.map);
    this.uncertaintyGroup = L.layerGroup().addTo(this.map);

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
    this.uncertaintyLayers.clear();
    this.uncertaintyGroups = [];

    const groupedUncertaintyAreas = new Map();
    for (const vessel of plottedVessels(vessels)) {
      if (getMapPosition(vessel)) {
        this.markers.set(vessel.id, this.#createMarker(vessel));
      } else if (getUncertaintyArea(vessel)) {
        const area = getUncertaintyArea(vessel);
        const key = uncertaintyGeometryKey(area);
        const group = groupedUncertaintyAreas.get(key) || [];
        group.push(vessel);
        groupedUncertaintyAreas.set(key, group);
      }
    }
    for (const groupedVessels of groupedUncertaintyAreas.values()) {
      const layer = this.#createUncertaintyArea(groupedVessels);
      this.uncertaintyGroups.push({ layer, vessels: groupedVessels });
      for (const vessel of groupedVessels) this.uncertaintyLayers.set(vessel.id, layer);
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

  setUncertaintyAreasVisible(visible, { fit = true } = {}) {
    this.uncertaintyAreasVisible = visible;
    this.#syncFleetLayers();
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
    this.#refreshUncertaintyStyles();
    this.#refreshShoreMarkerIcons();
    this.#syncFleetLayers();
    this.#syncShoreLayers();

    if (!focus || !hasPlottablePosition(vessel)) return;
    if (!this.fleetVisible) return;
    const marker = this.markers.get(vessel.id);
    if (marker) {
      const contextualZoom = Math.max(this.map.getZoom(), 4);
      this.map.setView(marker.getLatLng(), contextualZoom, {
        animate: this.interactionProfile.animationsEnabled,
      });
      marker.openTooltip();
      return;
    }
    const area = this.uncertaintyLayers.get(vessel.id);
    if (!area || !this.uncertaintyAreasVisible) return;
    this.map.fitBounds(area.getBounds(), {
      animate: this.interactionProfile.animationsEnabled,
      maxZoom: 6,
      padding: mapFitPadding(this.container.clientWidth),
    });
    area.openTooltip();
  }

  selectShoreEstablishment(establishment, { focus = true } = {}) {
    this.selectedId = null;
    this.selectedShoreId = establishment.id;
    this.#refreshMarkerIcons();
    this.#refreshUncertaintyStyles();
    this.#refreshShoreMarkerIcons();
    this.#syncFleetLayers();
    this.#syncShoreLayers();

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
    this.#refreshUncertaintyStyles();
    this.#refreshShoreMarkerIcons();
    this.#syncFleetLayers();
    this.#syncShoreLayers();
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
      ...(this.fleetVisible && this.uncertaintyAreasVisible
        ? [...new Set(
            this.visibleVessels
              .map((vessel) => this.uncertaintyLayers.get(vessel.id))
              .filter(Boolean),
          )]
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

  #createUncertaintyArea(vessels) {
    const area = getUncertaintyArea(vessels[0]);
    const layer = L.circle([area.centre.lat, area.centre.lon], {
      ...this.#uncertaintyStyle(vessels),
      className: "fleet-uncertainty-area",
      interactive: true,
      radius: area.radiusKm * 1000,
    });
    layer.options.regionVessels = vessels;
    const activateArea = () => {
      const visibleVessels = layer.options.visibleRegionVessels || vessels;
      if (visibleVessels.length === 1) {
        this.onSelect(visibleVessels[0]);
        return;
      }
      this.#openUncertaintyChooser(layer, visibleVessels);
    };
    layer.on("click", activateArea);
    layer.on("add", () => {
      this.#configureUncertaintyElement(layer);
      const element = layer.getElement();
      if (!element) return;
      element.onkeydown = (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateArea();
      };
    });
    return layer;
  }

  #configureUncertaintyLayer(layer, vessels) {
    layer.options.visibleRegionVessels = vessels;
    layer.unbindTooltip();
    if (vessels.length === 1) {
      const vessel = vessels[0];
      const area = getUncertaintyArea(vessel);
      layer.bindTooltip(
        `<strong>${escapeHtml(vessel.name)}</strong><span>${escapeHtml(area.label)} · Approximate region, not a live position</span>`,
        { className: "fleet-tooltip", direction: "top" },
      );
    } else {
      layer.bindTooltip(
        `<strong>${vessels.length} vessels</strong><span>${escapeHtml(vessels.map((vessel) => vessel.name).join(", "))} · Activate to choose a vessel</span>`,
        { className: "fleet-tooltip", direction: "top" },
      );
    }
    this.#configureUncertaintyElement(layer);
  }

  #configureUncertaintyElement(layer) {
    const element = layer.getElement();
    if (!element) return;
    const vessels = layer.options.visibleRegionVessels || layer.options.regionVessels;
    element.setAttribute("tabindex", "0");
    element.setAttribute("role", "button");
    element.setAttribute(
      "aria-label",
      vessels.length === 1
        ? `${vessels[0].name}, ${getUncertaintyArea(vessels[0]).label}, approximate region, not a live position`
        : `${vessels.length} vessels, ${vessels.map((vessel) => vessel.name).join(", ")}, share this approximate regional area; activate to choose a vessel`,
    );
  }

  #openUncertaintyChooser(layer, vessels) {
    const content = document.createElement("section");
    const heading = document.createElement("strong");
    const note = document.createElement("p");
    const choices = document.createElement("div");
    content.className = "fleet-region-picker-content";
    heading.textContent = `${vessels.length} vessels share this regional area`;
    note.textContent = "Choose a vessel. The area is approximate and is not a live position.";
    choices.setAttribute("role", "group");
    choices.setAttribute("aria-label", "Vessels in this approximate regional area");
    for (const vessel of vessels) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${vessel.name} · ${getUncertaintyArea(vessel).label}`;
      button.addEventListener("click", () => {
        layer.closePopup();
        this.onSelect(vessel);
      });
      choices.append(button);
    }
    content.append(heading, note, choices);
    layer.unbindPopup();
    layer.bindPopup(content, {
      className: "fleet-region-picker",
      closeButton: true,
      maxWidth: 340,
    });
    layer.openPopup();
    window.setTimeout(() => choices.querySelector("button")?.focus(), 0);
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
      html: '<span aria-hidden="true"></span>',
      iconAnchor: [22, 22],
      iconSize: [44, 44],
      tooltipAnchor: [0, -16],
    });
  }

  #createShoreMarkerIcon(establishment) {
    const selectedClass = establishment.id === this.selectedShoreId ? " is-selected" : "";
    return L.divIcon({
      className: `shore-marker${selectedClass}`,
      html: '<span aria-hidden="true"></span>',
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
      if (vessel) marker.setIcon(this.#createMarkerIcon(vessel));
    }
  }

  #refreshUncertaintyStyles() {
    for (const { layer, vessels } of this.uncertaintyGroups) {
      layer.setStyle(this.#uncertaintyStyle(vessels));
    }
  }

  #uncertaintyStyle(vessels) {
    const selected = vessels.some((vessel) => vessel.id === this.selectedId);
    return {
      color: selected ? "#ffffff" : "#f0bd5c",
      dashArray: selected ? "7 5" : "5 6",
      fillColor: "#f0bd5c",
      fillOpacity: selected ? 0.2 : 0.1,
      opacity: selected ? 1 : 0.82,
      weight: selected ? 3 : 2,
    };
  }

  #refreshShoreMarkerIcons() {
    for (const [id, marker] of this.shoreMarkers) {
      const establishment =
        marker.options.establishment ||
        this.visibleShoreEstablishments.find((candidate) => candidate.id === id);
      if (establishment) marker.setIcon(this.#createShoreMarkerIcon(establishment));
    }
  }

  #syncFleetLayers() {
    this.clusterGroup.clearLayers();
    this.unclusteredGroup.clearLayers();
    this.selectionGroup.clearLayers();
    this.uncertaintyGroup.clearLayers();
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
    if (this.uncertaintyAreasVisible) {
      const visibleIds = new Set(this.visibleVessels.map((vessel) => vessel.id));
      for (const { layer, vessels } of this.uncertaintyGroups) {
        const visibleVessels = vessels.filter((vessel) => visibleIds.has(vessel.id));
        if (!visibleVessels.length) continue;
        this.#configureUncertaintyLayer(layer, visibleVessels);
        this.uncertaintyGroup.addLayer(layer);
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
    if (
      selectedMarker &&
      this.visibleShoreEstablishments.some((establishment) => establishment.id === this.selectedShoreId)
    ) {
      this.shoreSelectionGroup.addLayer(selectedMarker);
    }
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

function uncertaintyGeometryKey(area) {
  return `${area.centre.lat}|${area.centre.lon}|${area.radiusKm}`;
}
