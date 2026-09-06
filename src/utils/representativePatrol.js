// A fixed display anchor restored from the legacy symbolic marker. This is NOT
// an observed position, patrol area, route or geographical-presence datum.
export const REPRESENTATIVE_PATROL = "representative-patrol";
export const REPRESENTATIVE_PATROL_ANCHOR = Object.freeze({ lat: 45, lon: -35, label: "On patrol" });

export function hasRepresentativePatrolMarker(vessel) {
  return Boolean(
    vessel?.mapRepresentation === REPRESENTATIVE_PATROL &&
    vessel.id === "hms-vengeance" && vessel.vesselType === "SSBN" &&
    vessel.vesselClass === "Vanguard class" && vessel.service === "Royal Navy" &&
    vessel.status === "Deployed" && vessel.locationClassification === "withheld" &&
    vessel.locationState === "withheld" && vessel.locationPrecision === "none" &&
    vessel.position === null && vessel.uncertaintyArea === null &&
    vessel.publicLocationLabel === "On patrol" && vessel.lastReportedLocation === "On patrol"
  );
}
