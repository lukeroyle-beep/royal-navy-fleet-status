export const TOUCH_SAFARI_MAX_ZOOM = 16;
const PINCH_ACTIVATION_THRESHOLD = 0.18;
const MAX_DISCRETE_PINCH_STEPS = 3;

export function createMapInteractionProfile({ safari, mobile, reducedMotion }) {
  // Physical iPhone Safari can wedge its WebContent process while Leaflet applies
  // continuous pinch transforms. Use a release-to-zoom gesture on that platform.
  const mobileSafari = Boolean(safari && mobile);
  return {
    mobileSafari,
    maxZoom: mobileSafari ? TOUCH_SAFARI_MAX_ZOOM : 19,
    zoomSnap: mobileSafari ? 1 : 0.1,
    animationsEnabled: !reducedMotion && !mobileSafari,
    continuousTouchZoom: !mobileSafari,
    discreteTouchZoom: mobileSafari,
  };
}

export function discretePinchZoomTarget({
  startZoom,
  startDistance,
  endDistance,
  minZoom = 0,
  maxZoom = 19,
}) {
  const boundedStartZoom = Math.min(maxZoom, Math.max(minZoom, Math.round(startZoom)));
  if (
    !Number.isFinite(startDistance) ||
    !Number.isFinite(endDistance) ||
    startDistance <= 0 ||
    endDistance <= 0
  ) {
    return boundedStartZoom;
  }

  const zoomDelta = Math.log2(endDistance / startDistance);
  if (Math.abs(zoomDelta) < PINCH_ACTIVATION_THRESHOLD) return boundedStartZoom;
  const steps = Math.min(
    MAX_DISCRETE_PINCH_STEPS,
    Math.max(1, Math.round(Math.abs(zoomDelta))),
  );
  return Math.min(
    maxZoom,
    Math.max(minZoom, boundedStartZoom + Math.sign(zoomDelta) * steps),
  );
}
