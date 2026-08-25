import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";

import {
  clusterSizeClass,
  getMapPosition,
  getUncertaintyArea,
  hasPlottablePosition,
  mapFitPadding,
  markerClassName,
  plottedVessels,
} from "../utils/map.js";

const DEFAULT_VIEW = {
  centre: [28, 0],
  zoom: 2,
};

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
    this.selectedId = null;
    this.selectedShoreId = null;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.map = L.map(container, {
      center: DEFAULT_VIEW.centre,
      zoom: DEFAULT_VIEW.zoom,
      minZoom: 0,
      maxZoom: 19,
      zoomSnap: 0.1,
      worldCopyJump: true,
      zoomControl: false,
      keyboard: true,
      zoomAnimation: !this.reducedMotion,
      fadeAnimation: !this.reducedMotion,
      markerZoomAnimation: !this.reducedMotion,
    });

    L.control.zoom({ position: "bottomright" }).addTo(this.map);
    this.map.attributionControl.setPrefix(false);

    this.tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
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
      animate: !this.reducedMotion,
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
      animate: !this.reducedMotion,
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

    this.resizeObserver = new ResizeObserver(() => this.map.invalidateSize({ pan: false }));
    this.resizeObserver.observe(container);
    window.addEventListener("orientationchange", () => {
      window.setTimeout(() => this.map.invalidateSize({ pan: false }), 100);
    });
    this.map.on("moveend", () => this.onViewChange(this.getView()));
  }

  getView() {
    const centre = this.map.getCenter();
    return {
      centre: [centre.lat, centre.lng],
      zoom: this.map.getZoom(),
    };
  }

  setView({ centre, zoom }, { animate = false } = {}) {
    this.map.setView(centre, zoom, { animate: animate && !this.reducedMotion });
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
      const contextualZoom = Math.min(Math.max(this.map.getZoom(), 4), 7);
      this.map.setView(marker.getLatLng(), contextualZoom, { animate: !this.reducedMotion });
      marker.openTooltip();
      return;
    }
    const area = this.uncertaintyLayers.get(vessel.id);
    if (!area || !this.uncertaintyAreasVisible) return;
    this.map.fitBounds(area.getBounds(), {
      animate: !this.reducedMotion,
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
    const contextualZoom = Math.min(Math.max(this.map.getZoom(), 4), 7);
    this.map.setView(marker.getLatLng(), contextualZoom, { animate: !this.reducedMotion });
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
        animate: !this.reducedMotion,
      });
      return;
    }

    const bounds = L.featureGroup(layers).getBounds();
    this.map.fitBounds(bounds, {
      animate: !this.reducedMotion,
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
    if (!this.fleetVisible) return;

    const selectedMarker = this.selectedId ? this.markers.get(this.selectedId) : null;
    const markers = this.visibleVessels
      .map((vessel) => this.markers.get(vessel.id))
      .filter((marker) => marker && marker !== selectedMarker);
    const activeGroup = this.clusteringEnabled ? this.clusterGroup : this.unclusteredGroup;
    for (const marker of markers) activeGroup.addLayer(marker);
    if (selectedMarker && this.visibleVessels.some((vessel) => vessel.id === this.selectedId)) {
      this.selectionGroup.addLayer(selectedMarker);
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
