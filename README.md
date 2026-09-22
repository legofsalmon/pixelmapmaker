# Pixel Map Maker

A browser tool for planning LED video walls. Pick real cabinets from a scraped
manufacturer library, **drag the screens around a canvas**, and export
native-resolution pixel maps plus a spec sheet with size, weight, power and
current.

Built as an answer to [pixl Grid](https://apps.apple.com/us/app/pixl-grid/id1445330973?mt=12)
and [LEDWallCalc](https://ledwallcalc.com/) — see [COMPETITORS.md](COMPETITORS.md)
for the full feature review those two drove.

## What it does

**Layout**
- Drag screens directly on the canvas; nothing needs typing to move a wall
- Snapping to canvas edges and centre, to other screens' edges and centres, and
  to the cabinet grid — hold <kbd>Ctrl</kbd> to override
- Marquee multi-select, arrow-key nudge (<kbd>Shift</kbd> for 10 px), undo/redo
- Align six ways, distribute evenly, or pack into a row or column with a fixed
  gap; bulk-edit colour, numbering and signal overlay across a selection
- <kbd>⌘/Ctrl</kbd>+<kbd>A</kbd> select all, <kbd>⌘/Ctrl</kbd>+<kbd>D</kbd>
  duplicate, <kbd>Delete</kbd> remove
- Pan with <kbd>Space</kbd>-drag, alt-drag or right-drag; scroll to zoom
- Layer list with show/hide, lock, reorder, duplicate

**Cabinet library**
- 256 real cabinets scraped from manufacturer spec pages and datasheets
- Filter by brand, type, indoor/outdoor and pitch range; search; favourites
- Add your own panels when a model is not in the list
- Every entry links back to the manufacturer page it came from

**Calculations**, live as you drag
- Resolution, aspect, physical size in metric and imperial
- Cabinet count, surface area, megapixels
- Weight, maximum and average power, current at 230 V and 120 V, heat load

**Viewing**
- Set where the nearest and furthest of the audience stand and every screen is
  read against it: how many arcminutes a pixel takes up from each, how far back
  the pixels stop being separable, and how much of the field of view the screen
  fills
- Says when a pitch is finer than anyone in the room can resolve, and names the
  pitch that would look the same — the most expensive mistake on a quote
- On the spec sheet as well as in the inspector, so it goes out with the price

**Brightness**
- Set the light falling on the screen face and it works out the floor that
  reflection puts under every black pixel, and the contrast ratio the panel
  actually reaches in that room — not the one on the datasheet
- Says what peak brightness would hold the contrast you need, and the brightest
  ambient the panel holds it in before the room wins
- Brightness figures that cannot be true are refused rather than used

**Pick list**
- Choose a processor and it works out how many you need — by pixel count and by
  port count, telling you which one decides
- Cabling either worked out for you (data runs from port capacity, circuits from
  voltage, breaker size and how hard you want to load it) or set by hand
- Data and power split into feed cables and panel-to-panel jumpers, the way a
  prep list actually reads
- A patch view listing which panels sit on which port, following each screen's
  feed corner and run pattern
- Contingency of 0–20% and rounding up to whole cases and cable bundles, shown
  as required → with contingency → what to pull
- Print to PDF or export CSV

**Support structure**
- Three ways of standing it up: truss and baseplates, a ground support system,
  or flown from rigging points
- The two ballasted cases run the overturning solver vendored from the
  [tipping-point](https://github.com/legofsalmon/tipping-point) project: how
  many uprights, ballast per plate, load per upright, and the wind speed it
  holds to against the one it goes over at
- Wind and buildability are reported separately, so a scheme that survives the
  design wind but whose baseplates would overlap says exactly that
- Flown screens get hang-point count and per-point load, checked against the
  panel's own published maximum hanging count
- Truss presets and force coefficients come from the same solver

**Test patterns**
- Sonar, line, pulse, scan, ripple, waves and screen lines, playing live on the
  canvas — the moving patterns that show up a dead tile, a mis-patched cabinet
  or processing latency
- Speed, direction, colour, opacity, trail and thickness; sweep the whole canvas
  or each screen separately
- Record the animation out at the canvas's native resolution, MP4 where the
  browser supports it and WebM otherwise

**Output**
- PNG at the canvas's native resolution, with or without an alpha background
- Per-screen PNG cropped to that wall
- Named saves kept in the browser, listed with date, screen and cabinet counts,
  reopened or deleted from the save dialog
- Project JSON to save and reopen
- Composition JSON of every screen's position and size, for After Effects,
  Resolume and Millumin
- Printable spec sheet (print to PDF)

**Rendering options** — a logo image centred on each screen with size and
opacity, cabinet numbering, signal-run overlay with four start
corners and four run patterns, six colour palettes, alternate tile tint, centre
labels, canvas centre guides, and a mask that dims everything outside the walls.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run build      # production build
npm run typecheck
npm run lint
npm test           # the maths, against published figures
```

## The cabinet library

`data/cabinets.json` is generated, not hand-written. Rebuild it with:

```bash
npm run scrape                        # all sources
node scripts/scraper/index.mjs --source roevisual
```

Each source in `scripts/scraper/sources/` exports `brand` and `scrape()`, and
returns records that `scripts/scraper/index.mjs` normalises, validates and
de-duplicates. To add a manufacturer, drop in another module and register it in
the `SOURCES` map.

### Support structure

`src/lib/vendor/ledwall.js` is vendored from
[legofsalmon/tipping-point](https://github.com/legofsalmon/tipping-point) (MIT).
The only edit is the module wrapper — upstream ships a UMD, this needs an ES
module — and the physics is copied verbatim. Re-vendor rather than editing it:

```bash
node scripts/vendor-ledwall.mjs [path-to-tipping-point-checkout]
```

The script refuses to run if the upstream wrapper changes shape, and stamps the
commit it copied into the file header.

It is a first pass and a sanity check, not a substitute for a structural
engineer. Ground support is life-safety kit and real designs are signed off
against the manufacturer's load data and a wind standard.

### Viewing distance

`src/lib/viewing.ts` works from one published constant: a person with 20/20
vision resolves detail down to about one arcminute. Planar's white paper on
direct-view LED states it as a multiplier — pitch in mm × 3438 gives the
distance in mm at which pixels stop being distinguishable — which is
1 / tan(1 arcminute), and is what the module computes.

- [Planar, *Recommended Viewing Distance & Direct View LED*](https://www.planar.com/media/439462/understanding-viewing-distance.pdf)

The rules of thumb layered on top of that are labelled as rules of thumb,
because they disagree with each other by 10–15%: the 10× rule (pitch in mm × 10
= feet) lands about 11% short of the real figure, and "stand no closer than the
pitch in metres" puts a pixel at 3.4 arcminutes rather than 1. Both are shown
next to the number they approximate rather than instead of it.

The field-of-view line quotes SMPTE EG-18's 30° minimum. That is a guideline
for a seated cinema audience watching a projected picture, not a standard for a
wall at a gig, so it is a reference line and not a pass mark.

### Brightness and ambient light

`src/lib/contrast.ts` is the same shape as the viewing maths: physics the app
computes, and a requirement the user sets.

The physics is the standard ambient-contrast relation. Light falling on the
screen face comes back off it as `lux × reflectance / π` cd/m², that reflected
luminance lands under the blacks, and the contrast the panel reaches is
`(peak + reflected) / reflected`. The panel's own black is taken as zero — it is
far below the reflected floor in any lit room, and the error is on the
optimistic side.

Two numbers in there are assumptions and are labelled as such in the interface:
face reflectance, which no manufacturer publishes and which is settable, and
the ambient level, which has presets. Only the office preset comes from a
standard — EN 12464-1 puts 500 lux on the task area for ordinary office work.

What the app deliberately does not ship is a table of *required* contrast
ratios. [ANSI/AVIXA V201.01:2021 Image System Contrast
Ratio](https://www.avixa.org/standards/image-system-contrast-ratio) defines four
of them by viewing category and covers direct-view LED rather than only
projection, but the figures sit behind the standard and the numbers circulating
for them disagree. So the target is a field you fill in, and the standard is
named as where a real one comes from.

### Processors

`src/lib/processors.ts` carries the processor list. Only entries with a
`sourceUrl` come from a manufacturer's own datasheet or support documentation:

| Processor | Ports | Capacity |
|---|---|---|
| Brompton Tessera SX40 | 4 × 10GBASE-T | 9 MP at 36 bpp, 60 Hz |
| Megapixel HELIOS | 8 × 10G fibre SFP+ | 35 MP |
| NovaStar VX2000 Pro | 20 × 1G | 13 MP |
| NovaStar MX40 Pro | 20 × 1G | 9 MP |
| NovaStar MCTRL4K | 16 × 1G | 4096 × 2160 at 60 Hz |
| NovaStar VX1000 | 10 × 1G | 6.5 MP |

The generic 1G and 10G entries are labelled planning assumptions, not
specifications. Real port capacity moves with bit depth, refresh and frame rate
— some of these halve it in 3D or top-and-bottom modes — so treat all of it as a
first pass, and add your own kit with **+ Add your own processor**, which saves
with the project.

### Current sources

| Brand | Cabinets | Notes |
|---|---:|---|
| [ROE Visual](https://www.roevisual.com/en/products) | 76 | Full published specs including weight, power, BTU, hanging and stacking limits |
| [GLOSHINE](https://gloshine.com/products) | 91 | Publishes size, pitch and weight; panel resolution is derived from size ÷ pitch |
| [Absen](https://www.usabsen.com/) | 89 | Parsed from the specification PDFs linked on each product page; power is quoted per m² and converted per panel |

### Data quality

The scraper validates every record before it ships:

- Size, resolution and pitch must agree within 8%, so a corner or right-angle
  panel that folds pixels round two faces is dropped rather than laid out wrong.
- Where a manufacturer does not publish a panel resolution it is derived from
  cabinet size ÷ pitch, snapped to a plausible module multiple, and flagged
  `derivedResolution`. The inspector shows a warning on those panels.
- Indoor/outdoor comes from the weakest IP rating quoted, not the strongest.
- Missing weight or power stays missing — totals say "partial" rather than
  quietly summing zeros. A brightness figure that cannot be true is treated the
  same way by the app rather than used.
- Text in a spec PDF arrives as runs of glyphs, and a number can be split
  across two of them. Runs are rejoined by whether they sit flush, not by
  inserting a space between everything — that bug had 5000 nit outdoor panels
  shipping as 5.

Specifications change. Confirm against the current datasheet before ordering or
rigging anything.

### Manufacturers not included

`absen.com` is bot-protected, but Absen's US site publishes the same
specification PDFs and is reachable, so that is where the Absen source reads
from. The same trick was tried on the others and does not work:

| Brand | What happens |
|---|---|
| Unilumin | Site loads, but specs render client-side. No spec PDFs anywhere on it, and `products` is not exposed through the WordPress REST API. |
| INFiLED | Host does not resolve or answer. |
| Desay | Host does not resolve or answer. |
| Chauvet Professional | Site and WooCommerce Store API both reachable, but the API carries only pitch and IP rating — `dimensions` and `weight` are empty, and the linked PDFs are marketing one-pagers with no cabinet size or resolution. |

The common blocker is that these publish specs only to a JavaScript client. A
headless browser would solve it, and the source interface is ready for one —
run the scraper somewhere the browser has ordinary TLS to the open internet.

[LED Wall Central](https://www.ledwallcentral.com/) has a large multi-brand
database and would be an obvious shortcut. Its `robots.txt` disallows
`ClaudeBot` and `anthropic-ai` across the whole site, so it is deliberately
not used.

## Deploying

Zero-config on Vercel — it is a stock Next.js App Router project with no
environment variables, no database and no server-side state. Import the repo at
[vercel.com/new](https://vercel.com/new), or:

```bash
npx vercel --prod
```

Projects are held in `localStorage` — the working project autosaves, and named
saves sit alongside it — so nothing leaves the browser.

## Layout of the code

```
src/lib/render.ts      canvas renderer, shared by the viewport and PNG export
src/lib/effects.ts     animated test patterns, pure functions of time
src/lib/geometry.ts    layer bounds, snapping, signal-run ordering
src/lib/calc.ts        size / weight / power / current maths
src/lib/cabinets.ts    library loading and filtering
src/lib/picklist.ts    prep-list aggregation, contingency and pack rounding
src/lib/cabling.ts     data and power runs, auto or manual
src/lib/support.ts     support structure, wrapping the vendored solver
src/lib/viewing.ts     viewing distance, pitch suitability, field of view
src/lib/contrast.ts    ambient light, reflected floor, achieved contrast
src/state/store.ts     editor state, history, persistence
src/components/        canvas stage, library, inspector, layers, toolbar, spec sheet
scripts/scraper/       cabinet library scraper
scripts/test-*.mjs     tests, run with npm test
data/cabinets.json     generated library
```

`renderProject()` is a pure function over a 2D context in canvas-pixel
coordinates. The viewport applies a pan/zoom transform before calling it and the
exporter calls it untransformed, so what you see is exactly what you export.
