export class EventDetailsPanel {
  constructor(elements) {
    this.elements = elements;
  }

  renderDefault(scenario) {
    this.elements.kind.textContent = "Replay engine";
    this.elements.title.textContent = "Click a track, marker, or zone";
    this.elements.description.textContent =
      "The globe is focused on the scenario region. Play or scrub the timeline, then select visible evidence layers for source and confidence details.";
    this.elements.confidenceRow.hidden = true;
    this.renderMeta([
      ["Region", scenario?.metadata.region || "Loading"],
      ["Scenario", scenario?.metadata.subtitle || "Curated demo"],
      ["Data", "Static mocked OSINT-style JSON"],
    ]);
  }

  renderEntity(entity, current, sampleTrack) {
    if (entity.kind === "track") this.renderTrack(entity.ref, current, sampleTrack);
    if (entity.kind === "incident") this.renderIncident(entity.ref);
    if (entity.kind === "zone") this.renderZone(entity.ref);
  }

  renderTrack(track, current, sampleTrack) {
    const sample = sampleTrack(track, current) || track.points.at(-1);
    this.elements.kind.textContent =
      track.type === "vessel" ? "Maritime track" : track.type === "flight" ? "Aircraft track" : "Context track";
    this.elements.title.textContent = track.name;
    this.elements.description.textContent = track.assetType
      ? `${track.assetType} from ${track.sourceLabel}.`
      : `Curated ${track.type} movement from ${track.sourceLabel}.`;
    this.elements.confidenceRow.hidden = true;

    const meta = [
      ["ID", track.id],
      ["Source", track.sourceLabel],
      ["Position", `${sample.lat.toFixed(2)}, ${sample.lon.toFixed(2)}`],
    ];
    if (typeof sample.altitudeFt === "number") meta.push(["Altitude", `${Math.round(sample.altitudeFt).toLocaleString("en-GB")} ft`]);
    if (typeof sample.speedKnots === "number") meta.push(["Speed", `${sample.speedKnots.toFixed(1)} kt`]);
    if (typeof sample.courseDeg === "number") meta.push(["Course", `${Math.round(sample.courseDeg)} deg`]);
    this.renderMeta(meta);
  }

  renderIncident(incident) {
    this.elements.kind.textContent = `${incident.category} marker`;
    this.elements.title.textContent = incident.title;
    this.elements.description.textContent = incident.description;
    this.setConfidence(incident.confidence);
    this.renderMeta([
      ["Timestamp", formatTimestamp(incident.time)],
      ["Position", `${incident.lat.toFixed(2)}, ${incident.lon.toFixed(2)}`],
      ["Source", incident.sourceUrl],
    ]);
  }

  renderZone(zone) {
    this.elements.kind.textContent = zone.type.replaceAll("_", " ");
    this.elements.title.textContent = zone.title;
    this.elements.description.textContent = zone.description;
    this.elements.confidenceRow.hidden = true;
    this.renderMeta([
      ["Active from", formatTimestamp(zone.activeStart)],
      ["Active until", formatTimestamp(zone.activeEnd)],
      ["Source", zone.sourceLabel],
      ["Vertices", zone.polygon.length.toString()],
    ]);
  }

  renderMeta(rows) {
    this.elements.meta.replaceChildren();
    for (const [label, value] of rows) {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = label;
      description.textContent = value;
      row.append(term, description);
      this.elements.meta.append(row);
    }
  }

  setConfidence(confidence) {
    const settings = {
      low: { fill: "34%", glow: "rgba(255, 93, 115, 0.32)" },
      medium: { fill: "66%", glow: "rgba(243, 186, 77, 0.32)" },
      high: { fill: "100%", glow: "rgba(47, 208, 181, 0.32)" },
    };
    const next = settings[confidence] || settings.low;
    this.elements.confidenceRow.hidden = false;
    this.elements.confidenceLabel.textContent = confidence;
    this.elements.confidenceBar.style.setProperty("--confidence-fill", next.fill);
    this.elements.confidenceBar.style.setProperty("--confidence-glow", next.glow);
  }
}

function formatTimestamp(time) {
  return `${new Date(time).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}
