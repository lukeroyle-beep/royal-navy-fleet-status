# Private release test checklist

Use this checklist to test a release candidate without making the repository or application public.
Record the observed results in `docs/release-test-report.md`. Automated checks do not replace the
physical-device observations below.

## Prepare the release candidate

From PowerShell in the repository:

```powershell
git switch main
git pull --ff-only
npm install
npm run build
npm run preview:private -- <device>.<tailnet>.ts.net
```

The private-preview command accepts a hostname ending in `.ts.net`, permits only that hostname and
keeps Vite bound to `127.0.0.1`. Do not include `https://`, a port or a path.

In a second PowerShell window:

```powershell
tailscale serve 4173
```

Keep both windows open. Connect the test device to the same Tailscale network and open the HTTPS
address printed by Tailscale Serve. Press `Ctrl+C` in both windows when testing is complete.

## Device matrix

| Device | Browser | Orientation or viewport | Required |
| --- | --- | --- | --- |
| iPad | Safari | Portrait | Yes |
| iPad | Safari | Landscape | Yes |
| Desktop or laptop | Current Chrome, Edge or Safari | 1280 × 720 or larger | Yes |
| Desktop or laptop | Current Chrome, Edge or Safari | 200% browser zoom | Yes |

## Functional checks

Mark each result as Pass, Fail or Blocked and record evidence in the report.

| ID | Check | Expected result |
| --- | --- | --- |
| RT-1 | Open the private HTTPS address. | The interface loads without a host, certificate or blank-page error. |
| RT-2 | Inspect the initial map. | All filtered plotted vessels fit within the map and OpenStreetMap attribution is readable. |
| RT-3 | Pan, pinch or scroll to zoom, and use both zoom buttons. | Map controls respond without obscuring the interface. |
| RT-4 | Select a separated marker. | The vessel details and matching list entry update. |
| RT-5 | Select a cluster and then an overlapping marker. | The cluster zooms and identical locations can be selected individually. |
| RT-6 | Search by vessel name and pennant number. | Counts, list entries and plotted markers update together. |
| RT-7 | Exercise every filter and reset the filters. | Results remain synchronised and reset restores all records. |
| RT-8 | Select a vessel from the list. | A plotted vessel is revealed on the map and its details are shown. |
| RT-9 | Select unknown and withheld records. | Details appear without creating a marker or moving the map. |
| RT-10 | Select **Show all plotted vessels**. | Every currently filtered plotted vessel fits in the viewport. |
| RT-11 | Open a supporting source. | The HTTPS source opens in a new browser tab. |
| RT-12 | Rotate the iPad between Portrait and Landscape. | Layout reflows without horizontal scrolling or hidden controls. |
| RT-13 | Use touch targets around the map and filters. | Controls are usable without accidental adjacent activation. |
| RT-14 | Repeat key navigation at 200% desktop browser zoom. | Content remains operable without horizontal page scrolling. |
| RT-15 | Temporarily block or disconnect basemap tile requests. | A non-blocking notice appears and the vessel list and evidence remain usable. |

## Release decision

A release candidate passes private testing only when every required device has completed RT-1 to
RT-15 with no unresolved material defect. Record incomplete physical-device testing as Blocked, not
Pass.
