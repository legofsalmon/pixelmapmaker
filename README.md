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
- 246 real cabinets scraped from manufacturer spec pages and datasheets
- Filter by brand, type, indoor/outdoor and pitch range; search; favourites
- Add your own panels when a model is not in the list
- Every entry links back to the manufacturer page it came from

**Calculations**, live as you drag
- Resolution, aspect, physical size in metric and imperial
- Cabinet count, surface area, megapixels
- Weight, maximum and average power, current at 230 V and 120 V, heat load

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

**Output**
- PNG at the canvas's native resolution, with or without an alpha background
- Per-screen PNG cropped to that wall
- Named saves kept in the browser, listed with date, screen and cabinet counts,
  reopened or deleted from the save dialog
- Project JSON to save and reopen
- Composition JSON of every screen's position and size, for After Effects,
  Resolume and Millumin
- Printable spec sheet (print to PDF)

**Rendering options** — cabinet numbering, signal-run overlay with four start
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

### Processors

`src/lib/processors.ts` carries a short processor list. Only entries with a
`sourceUrl` are taken from a manufacturer's own datasheet — the Brompton Tessera
SX40 (four 10GBASE-T outputs, nominally 9 million pixels at 36 bpp / 60 Hz) and
the NovaStar MX40 Pro (twenty Gigabit ports, up to 9 million pixels). The
generic 1G and 10G entries are labelled planning assumptions, not specifications.
Real port capacity moves with bit depth, refresh and frame rate, so treat all of
it as a first pass.

### Current sources

| Brand | Cabinets | Notes |
|---|---:|---|
| [ROE Visual](https://www.roevisual.com/en/products) | 74 | Full published specs including weight, power, BTU, hanging and stacking limits |
| [GLOSHINE](https://gloshine.com/products) | 91 | Publishes size, pitch and weight; panel resolution is derived from size ÷ pitch |
| [Absen](https://www.usabsen.com/) | 81 | Parsed from the specification PDFs linked on each product page; power is quoted per m² and converted per panel |

### Data quality

The scraper validates every record before it ships:

- Size, resolution and pitch must agree within 8%, so a corner or right-angle
  panel that folds pixels round two faces is dropped rather than laid out wrong.
- Where a manufacturer does not publish a panel resolution it is derived from
  cabinet size ÷ pitch, snapped to a plausible module multiple, and flagged
  `derivedResolution`. The inspector shows a warning on those panels.
- Indoor/outdoor comes from the weakest IP rating quoted, not the strongest.
- Missing weight or power stays missing — totals say "partial" rather than
  quietly summing zeros.

Specifications change. Confirm against the current datasheet before ordering or
rigging anything.

### Manufacturers not included

Unilumin, INFiLED and Desay sit behind bot protection or render their spec
tables client-side from an API this scraper cannot reach. They are worth
revisiting; the source interface is ready for them.

`absen.com` is one of those, but Absen's US site publishes the same
specification PDFs and is reachable, so that is where the Absen source reads
from.

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
src/lib/geometry.ts    layer bounds, snapping, signal-run ordering
src/lib/calc.ts        size / weight / power / current maths
src/lib/cabinets.ts    library loading and filtering
src/lib/picklist.ts    prep-list aggregation, contingency and pack rounding
src/lib/cabling.ts     data and power runs, auto or manual
src/lib/support.ts     support structure, wrapping the vendored solver
src/state/store.ts     editor state, history, persistence
src/components/        canvas stage, library, inspector, layers, toolbar, spec sheet
scripts/scraper/       cabinet library scraper
data/cabinets.json     generated library
```

`renderProject()` is a pure function over a 2D context in canvas-pixel
coordinates. The viewport applies a pan/zoom transform before calling it and the
exporter calls it untransformed, so what you see is exactly what you export.
