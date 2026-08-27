export const TOUCH_SAFARI_MAX_ZOOM = 16;

export function createMapInteractionProfile({ safari, mobile, reducedMotion }) {
  // Keep the mobile-Safari rendering safeguards while allowing Leaflet to scale
  // continuously around the live gesture midpoint.
  const mobileSafari = Boolean(safari && mobile);
  return {
    mobileSafari,
    maxZoom: mobileSafari ? TOUCH_SAFARI_MAX_ZOOM : 19,
    zoomSnap: mobileSafari ? 1 : 0.1,
    animationsEnabled: !reducedMotion && !mobileSafari,
    continuousTouchZoom: true,
  };
}
