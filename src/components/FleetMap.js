import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";

import {
  clusterSizeClass,
  hasPlottablePosition,
  markerClassName,
  plottedVessels,
} from "../utils/map.js";

const DEFAULT_VIEW = {
  centre: [28, 0],
  zoom: 2,
};

export class FleetMap {
  constructor({ container, notice, onSelect }) {
    this.container = container;
    this.notice = notice;
    this.onSelect = onSelect;
    this.markers = new Map();
    this.visibleVessels = [];
    this.selectedId = null;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.map = L.map(container, {
      center: DEFAULT_VIEW.centre,
      zoom: DEFAULT_VIEW.zoom,
      minZoom: 2,
      maxZoom: 19,
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
    this.tiles.on("tileerror", () => this.#showTileNotice());
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

  selectVessel(vessel, { focus = false } = {}) {
    this.selectedId = vessel.id;
    this.#refreshMarkerIcons();

    if (!focus || !hasPlottablePosition(vessel)) return;
    const marker = this.markers.get(vessel.id);
    if (!marker || !this.clusterGroup.hasLayer(marker)) return;

    this.clusterGroup.zoomToShowLayer(marker, () => {
      this.map.panTo(marker.getLatLng(), { animate: !this.reducedMotion });
      marker.openTooltip();
    });
  }

  clearSelection() {
    this.selectedId = null;
    this.#refreshMarkerIcons();
  }

  resetView() {
    const markers = this.visibleVessels
      .map((vessel) => this.markers.get(vessel.id))
      .filter(Boolean);

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
      padding: [34, 34],
    });
  }

  #createMarker(vessel) {
    const marker = L.marker([vessel.position.lat, vessel.position.lon], {
      alt: `${vessel.name}, ${formatClassification(vessel.locationClassification)} location`,
      icon: this.#createMarkerIcon(vessel),
      keyboard: true,
      riseOnHover: true,
      title: vessel.name,
      vessel,
    });
    marker.bindTooltip(
      `<strong>${escapeHtml(vessel.name)}</strong><span>${escapeHtml(vessel.position.label)}</span>`,
      {
        className: "fleet-tooltip",
        direction: "top",
        offset: [0, -12],
      },
    );
    marker.on("click", () => this.onSelect(vessel));
    return marker;
  }

  #createMarkerIcon(vessel) {
    return L.divIcon({
      className: markerClassName(vessel, this.selectedId),
      html: '<span aria-hidden="true"></span>',
      iconAnchor: [14, 14],
      iconSize: [28, 28],
      tooltipAnchor: [0, -10],
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

  #refreshMarkerIcons() {
    for (const [id, marker] of this.markers) {
      const vessel = marker.options.vessel || this.visibleVessels.find((item) => item.id === id);
      if (vessel) marker.setIcon(this.#createMarkerIcon(vessel));
    }
  }

  #showTileNotice() {
    if (!this.notice) return;
    this.notice.hidden = false;
  }
}

function formatClassification(value) {
  return value === "mapped" ? "mapped public" : "approximate";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
