# Competitor review

Research carried out September 2026 while scoping Pixel Map Maker. Sources are
the vendors' own product pages and store listings, linked at the bottom.

## The tools

| Tool | Platform | Price | What it is |
|---|---|---|---|
| **pixl Grid** | macOS, Windows | Paid | LED test-pattern / pixel-map generator. The closest reference point for this project. |
| **LEDWallCalc** | iPad / iPhone | £2.99 | Wall calculator built around a searchable library of real LED panels. |
| **LEDPIXMAP v2** (CERATI) | Web | Free | Browser pixel-map generator with animated test effects. |
| **LED Pixel Mapper** | Web | Freemium | Multi-canvas cabinet grid designer with snapping. |
| **Pixelmapster** (Ghosteam) | Web | Free | Simple pixelmap generator aimed at After Effects / Resolume. |
| **ENTTEC ELM / Lightjams / PIXXEM** | Desktop | Paid | Full pixel-mapping *playback* engines — a different category; they drive fixtures live rather than produce map artwork. |

## Feature matrix

| Capability | pixl Grid | LEDWallCalc | LEDPIXMAP | LED Pixel Mapper | **Pixel Map Maker** |
|---|:---:|:---:|:---:|:---:|:---:|
| Multiple screens on one canvas | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Drag screens directly on the canvas** | ❌ | ❌ | ❌ | ❌ | ✅ |
| Marquee / multi-select, nudge, undo | ❌ | ❌ | ❌ | partial | ✅ |
| Snapping to edges, centres and tile grid | ❌ | ❌ | ❌ | ✅ | ✅ |
| Library of real manufacturer cabinets | partial¹ | ✅ | ❌ | ❌ | ✅ (541) |
| Filter library by brand / pitch / indoor–outdoor | ❌ | ✅ | ❌ | ❌ | ✅ |
| User-defined custom panels | ✅ | ✅ | ✅ | ✅ | ✅ |
| Size, weight, power, current, heat calculations | ❌ | ✅ | ❌ | ❌ | ✅ |
| Cabinet numbering | ✅ | ❌ | ✅ | ❌ | ✅ |
| Signal-flow / data-run overlay | ❌ | ❌ | ✅ | ❌ | ✅ |
| Colour palettes | ✅ | ❌ | ✅ | ❌ | ✅ |
| Alternate tile tint | ✅ | ❌ | ✅ | ❌ | ✅ |
| Canvas mask / offset markers | ✅ | ✅ | ❌ | ❌ | ✅ |
| Transparent-background export | ❌ | ✅ | ❌ | ❌ | ✅ |
| Native-resolution PNG export | ✅ | ✅ | ✅ | ✅ | ✅ |
| Per-screen PNG export | ✅ | ✅ | ✅ | ❌ | ✅ |
| Project save / load | ✅ | ❌ | cache only | ✅ | ✅ |
| Composition JSON for AE / Resolume | ✅² | ❌ | ❌ | ✅ | ✅ |
| Printable spec sheet / PDF | ❌ | ✅ | print | ❌ | ✅ |
| Runs in a browser, nothing to install | ❌ | ❌ | ✅ | ✅ | ✅ |
| Animated test patterns (sonar, scan, ripple) | live output | ❌ | ✅ | ❌ | ✅ |
| Video export | ❌ | ❌ | ✅ | ❌ | ✅ |
| Logo overlay | ✅ | ❌ | ✅ | ❌ | ✅ |

¹ pixl Grid added an "LED Type Editor" with cloud download and import/export of
LED types, but it is a user-maintained type list rather than a scraped catalogue
of shipping products.
² pixl Grid exports specifically for Millumin, After Effects and Resolume.

## What we took from each

**LEDWallCalc** — the whole reason the app has a cabinet library. Its workflow is
pick a panel → enter a wall size → get physical size, quantity, power and
resolution → export a PDF for the crew. Pixel Map Maker reproduces that
(library, filters, favourites, custom panels, calculated totals, printable spec
sheet) and then keeps going into layout.

**pixl Grid** — the output format. Native-resolution PNG grids for custom LED
screens, several grids in one canvas, colour palettes, a canvas mask, offset
markers, and half-height tiles. Half tiles are handled here by carrying the
actual half-height panels that manufacturers ship (ROE `CB5 Half`, `GP2.6 Half`
and so on) rather than as a render toggle, so the weight and power figures stay
honest.

**LEDPIXMAP v2** — cabinet numbering and the eight signal-flow start/direction
combinations. Its animated effects and MP4 export are genuinely useful and are
the most obvious thing this app does not yet do.

**LED Pixel Mapper** — snapping to grid lines and cabinet edges, and JSON export
alongside PNG.

## The gap we set out to fill

Every tool above makes you type coordinates. None of them let you grab a screen
and move it. For a multi-screen show — an IMAG wall, side panels, a floor and a
scenic strip on one canvas — laying it out by dragging and snapping is far
quicker than entering offsets, and it is the thing this app is built around.

The second gap is that the layout tools have no idea what a real cabinet is, and
the calculator that does know is a separate app on a different device. Putting a
scraped catalogue of shipping cabinets behind the layout canvas means the weight,
power and current figures update as you drag.

## Since built

The three gaps this review first left open are now closed:

- **Animated test patterns** — sonar, line, pulse, scan, ripple, waves and
  screen lines, playing live on the canvas with speed, direction, colour,
  opacity, trail and thickness, over the whole canvas or per screen.
- **Video export** — records the animated map at the canvas's native
  resolution, MP4 where the browser supports it and WebM otherwise.
- **Logo overlay** — an image centred on each screen with size and opacity,
  drawn into the PNG exports as well as the live canvas.

## Deliberately not built

- **Fixture-level pixel mapping** (ELM, Lightjams, PIXXEM). Different product:
  those drive addressable fixtures live rather than producing map artwork.

## Sources

- [pixl Grid — Mac App Store](https://apps.apple.com/us/app/pixl-grid/id1445330973?mt=12)
- [LEDWallCalc](https://ledwallcalc.com/) · [App Store](https://apps.apple.com/us/app/ledwallcalc/id1277293393)
- [LEDPIXMAP v2 — CERATI Srl](https://www.ledpixmap.com/v2/)
- [LED Pixel Mapper](https://ledpixelmapper.com/)
- [Pixelmapster — Ghosteam](https://www.ghosteaminc.com/pixelmap-tool/)
- [ENTTEC ELM](https://www.enttec.com/product/dmx-lighting-control-software/pixel-mapping-software/)
- [Lightjams](https://www.lightjams.com/pixelMapping.html)
- [PIXXEM — Chromateq](https://www.chromateq.com/pixxem/)
