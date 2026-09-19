import { PUBLIC_LOCATION_STATES } from './publicEnums.js';
import { hasPrivateFilesystemPath } from './public-location-text.js';

// Display metadata only. Geometry and selection authority stay in the reviewed assessment.
export function validateLocationContext(vessel) {
  if (!Object.hasOwn(vessel, 'locationContext')) return;
  const value = vessel.locationContext;
  const fail = () => { throw new Error('Invalid public location context'); };
  if (['SSBN', 'SSN'].includes(vessel.vesselType) || vessel.locationState === 'withheld') fail();
  const keys = (object, required, optional = []) => object && typeof object === 'object' && !Array.isArray(object) &&
    required.every(key => Object.hasOwn(object, key)) && Object.keys(object).every(key => [...required, ...optional].includes(key));
  const date = value => value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
  if (!keys(value, ['retained', 'observedAt', 'publishedAt'], ['latestReport']) || typeof value.retained !== 'boolean' ||
      !date(value.observedAt) || !date(value.publishedAt)) fail();
  if (value.retained && (vessel.locationState !== 'last_reported' || vessel.locationPrecision === 'none' || !value.observedAt)) fail();
  if (Object.hasOwn(value, 'latestReport')) {
    const report = value.latestReport;
    if (!value.retained || !keys(report, ['label', 'precision', 'state', 'observedAt', 'publishedAt']) ||
        typeof report.label !== 'string' || !report.label.trim() || report.label.length > 240 ||
        /https?:|\b(?:EVID|ASSESS)_|\b(?:berth|jetty)\b/i.test(report.label) || hasPrivateFilesystemPath(report.label) ||
        !['port', 'city', 'region', 'none'].includes(report.precision) || !PUBLIC_LOCATION_STATES.includes(report.state) ||
        report.state === 'withheld' || !date(report.observedAt) || !date(report.publishedAt)) fail();
  }
}
