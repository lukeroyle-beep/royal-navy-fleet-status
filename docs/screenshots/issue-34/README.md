# Issue 34 responsive interface evidence

These screenshots compare commit `6ac9a76` with the implementation on
`loop/issue-34-map-first-interface`. They were captured with headless Chromium at device-equivalent
CSS viewports. They are browser simulations, not photographs from physical devices. Basemap tile
requests were intentionally unavailable in the test environment, so the visible fallback notice is
also evidence that the map remains usable when tiles fail.

| Viewport | Before | After | After state |
| --- | --- | --- | --- |
| Desktop, 1440 × 900 | [`before-desktop-1440x900.png`](./before-desktop-1440x900.png) | [`after-desktop-1440x900.png`](./after-desktop-1440x900.png) | Map-first shell with fleet drawer |
| iPad landscape, 1366 × 1024 | [`before-ipad-landscape-1366x1024.png`](./before-ipad-landscape-1366x1024.png) | [`after-ipad-landscape-1366x1024.png`](./after-ipad-landscape-1366x1024.png) | Touch layer sheet with shore layer enabled |
| iPad portrait, 1024 × 1366 | [`before-ipad-portrait-1024x1366.png`](./before-ipad-portrait-1024x1366.png) | [`after-ipad-portrait-1024x1366.png`](./after-ipad-portrait-1024x1366.png) | Selected-vessel sheet and contextual map |
| iPhone, 390 × 844 | [`before-iphone-390x844.png`](./before-iphone-390x844.png) | [`after-iphone-390x844.png`](./after-iphone-390x844.png) | Touch filter sheet and compact toolbar |

The same browser pass asserted filter count and clear-state behaviour, mutually exclusive compact
surfaces, layer toggling, vessel selection, and Escape-key closing.

An automated axe WCAG 2.0/2.1 A/AA scan reported zero violation types for the desktop fleet,
desktop filter and phone filter states.
