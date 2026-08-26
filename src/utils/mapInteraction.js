export const TOUCH_SAFARI_MAX_ZOOM = 16;

export function createMapInteractionProfile({ safari, mobile, reducedMotion }) {
  // Physical iPhone Safari can wedge its WebKit compositor while Leaflet combines
  // fractional pinch zoom, animated transforms and a filtered tile pane at high zoom.
  const mobileSafari = Boolean(safari && mobile);
  return {
    mobileSafari,
    maxZoom: mobileSafari ? TOUCH_SAFARI_MAX_ZOOM : 19,
    zoomSnap: mobileSafari ? 1 : 0.1,
    animationsEnabled: !reducedMotion && !mobileSafari,
  };
}
