import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";

import {
  clusterSizeClass,
  getMapPosition,
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
  constructor({ container, notice, onSelect, onSelectEstablishment }) {
    this.container = container;
    this.notice = notice;
    this.onSelect = onSelect;
    this.onSelectEstablishment = onSelectEstablishment;
    this.markers = new Map();
    this.shoreMarkers = new Map();
    this.visibleVessels = [];
    this.visibleShoreEstablishments = [];
    this.shoreVisible = false;
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

    this.resizeObserver = new ResizeObserver(() => this.map.invalidateSize({ pan: false }));
    this.resizeObserver.observe(container);
    window.addEventListener("orientationchange", () => {
      window.setTimeout(() => this.map.invalidateSize({ pan: false }), 100);
    });
  }

  setVessels(vessels) {
    this.clusterGroup.clearLayers();
    this.markers.clear();

    for (const vessel of plottedVessels(vessels)) {
      const marker = this.#createMarker(vessel);
      this.markers.set(vessel.id, marker);
    }

    this.setVisibleVessels(vessels, { fit: true });
  }

  setVisibleVessels(vessels, { fit = true } = {}) {
    this.visibleVessels = plottedVessels(vessels);
    this.clusterGroup.clearLayers();
    this.clusterGroup.addLayers(
      this.visibleVessels.map((vessel) => this.markers.get(vessel.id)).filter(Boolean),
    );
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
    this.shoreClusterGroup.clearLayers();
    if (this.shoreVisible) {
      this.shoreClusterGroup.addLayers(
        establishments.map((establishment) => this.shoreMarkers.get(establishment.id)).filter(Boolean),
      );
      if (fit) this.resetView();
    }
  }

  setShoreVisible(visible, { fit = true } = {}) {
    this.shoreVisible = visible;
    this.shoreClusterGroup.clearLayers();
    if (visible) {
      this.shoreClusterGroup.addLayers(
        this.visibleShoreEstablishments
          .map((establishment) => this.shoreMarkers.get(establishment.id))
          .filter(Boolean),
      );
    }
    if (fit) this.resetView();
  }

  selectVessel(vessel, { focus = false } = {}) {
    this.selectedId = vessel.id;
    this.selectedShoreId = null;
    this.#refreshMarkerIcons();
    this.#refreshShoreMarkerIcons();

    if (!focus || !hasPlottablePosition(vessel)) return;
    const marker = this.markers.get(vessel.id);
    if (!marker || !this.clusterGroup.hasLayer(marker)) return;

    this.clusterGroup.zoomToShowLayer(marker, () => {
      this.map.panTo(marker.getLatLng(), { animate: !this.reducedMotion });
      marker.openTooltip();
    });
  }

  selectShoreEstablishment(establishment, { focus = true } = {}) {
    this.selectedId = null;
    this.selectedShoreId = establishment.id;
    this.#refreshMarkerIcons();
    this.#refreshShoreMarkerIcons();

    if (!focus || !this.shoreVisible) return;
    const marker = this.shoreMarkers.get(establishment.id);
    if (!marker || !this.shoreClusterGroup.hasLayer(marker)) return;
    this.shoreClusterGroup.zoomToShowLayer(marker, () => {
      this.map.panTo(marker.getLatLng(), { animate: !this.reducedMotion });
      marker.openTooltip();
    });
  }

  clearSelection() {
    this.selectedId = null;
    this.selectedShoreId = null;
    this.#refreshMarkerIcons();
    this.#refreshShoreMarkerIcons();
  }

  resetView() {
    const markers = this.shoreVisible
      ? this.visibleShoreEstablishments
          .map((establishment) => this.shoreMarkers.get(establishment.id))
          .filter(Boolean)
      : this.visibleVessels.map((vessel) => this.markers.get(vessel.id)).filter(Boolean);

    if (!markers.length) {
      this.map.setView(DEFAULT_VIEW.centre, DEFAULT_VIEW.zoom, {
        animate: !this.reducedMotion,
      });
      return;
    }

    const bounds = L.featureGroup(markers).getBounds();
    this.map.fitBounds(bounds, {
      animate: !this.reducedMotion,
      maxZoom: markers.length === 1 ? 7 : 8,
      padding: mapFitPadding(this.container.clientWidth),
    });
  }

  #createMarker(vessel) {
    const position = getMapPosition(vessel);
    const marker = L.marker([position.lat, position.lon], {
      alt: `${vessel.name}, ${formatClassification(vessel.locationClassification)} location`,
      icon: this.#createMarkerIcon(vessel),
      keyboard: true,
      riseOnHover: true,
      title: vessel.name,
      vessel,
    });
    marker.bindTooltip(
      `<strong>${escapeHtml(vessel.name)}</strong><span>${escapeHtml(position.label)}</span>`,
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

  #refreshShoreMarkerIcons() {
    for (const [id, marker] of this.shoreMarkers) {
      const establishment =
        marker.options.establishment ||
        this.visibleShoreEstablishments.find((candidate) => candidate.id === id);
      if (establishment) marker.setIcon(this.#createShoreMarkerIcon(establishment));
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

function formatClassification(value) {
  return {
    mapped: "mapped public",
    approximate: "approximate",
    withheld: "withheld symbolic",
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
