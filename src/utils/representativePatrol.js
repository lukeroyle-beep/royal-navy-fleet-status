// A fixed display anchor restored from the legacy symbolic marker. This is NOT
// an observed position, patrol area, route or geographical-presence datum.
export const REPRESENTATIVE_PATROL = "representative-patrol";
export const REPRESENTATIVE_PATROL_ANCHOR = Object.freeze({ lat: 45, lon: -35, label: "On patrol" });

export function hasRepresentativePatrolMarker(vessel) {
  return Boolean(
    vessel?.mapRepresentation === REPRESENTATIVE_PATROL &&
    vessel.vesselType === "SSBN" &&
    vessel.vesselClass === "Vanguard class" && vessel.service === "Royal Navy" &&
    vessel.status === "Deployed" && vessel.locationClassification === "withheld" &&
    vessel.locationState === "withheld" && vessel.locationPrecision === "none" &&
    vessel.position === null && vessel.uncertaintyArea === null &&
    vessel.publicLocationLabel === "On patrol" && vessel.lastReportedLocation === "On patrol"
  );
}

// Role assignment comes from reviewed policy, never from a particular hull ID.
export function validateRepresentativePatrolFleet(vessels, { requireOne = false } = {}) {
  const assigned = vessels.filter((vessel) => vessel.mapRepresentation != null);
  if (assigned.some((vessel) => !hasRepresentativePatrolMarker(vessel))) {
    throw new Error("Invalid representative patrol assignment.");
  }
  if (assigned.length > 1 || (requireOne && assigned.length !== 1)) {
    throw new Error("Fleet must contain exactly one representative patrol assignment when required, and never more than one.");
  }
  return true;
}
