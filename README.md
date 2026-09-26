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

**Curved and angled walls**
- Set a screen on a radius, typed either as a bend per joint or as the radius
  itself — the two fields drive each other
- Or fold it at named cabinets into an L, a U or a three-sided box
- A plan view of the footprint, with the span across the ends, how far the wall
  reaches back, the turn and the radius
- The pixel map is unchanged by any of it: a curved wall unrolls a flat
  rectangle of pixels, so the canvas, the export and the signal order stay put

**Cabinet library**
- 541 real cabinets scraped from manufacturer spec pages and datasheets
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

**Power and distro**
- Five supplies: three-phase 400/230 V, 208/120 V and 480/277 V, and single-phase
  230 V and 120 V — picking one also sets the voltage the circuits are sized at
- Circuits dealt across L1, L2 and L3 heaviest-first onto whichever leg is
  lightest, with the load, current and feed utilisation of each leg
- Neutral current from the actual imbalance, and how far apart the legs come out
- The smallest stocked feed that holds the worst leg, and the connector it
  usually lands on
- A way-by-way patch: which distro, which way, which leg, which screen
- On the spec sheet as well as the pick list, because the service is what a
  venue has to be asked for weeks ahead

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
npm test           # every scripts/test-*.mjs: the maths, against published figures
```

## The cabinet library

`data/cabinets.json` is generated, not hand-written. Rebuild it with:

```bash
npm run scrape                        # all sources
node scripts/scraper/index.mjs --source roevisual
```

One source at a time tops that brand up and leaves the rest of the library
alone, so a vendor can be re-read without re-reading all of them.

Each source in `scripts/scraper/sources/` exports `brand` and `scrape()`, and
returns records that `scripts/scraper/index.mjs` normalises, validates and
de-duplicates. To add a manufacturer, drop in another module and register it in
the `SOURCES` map.

Unilumin and INFiLED publish their specs only to a JavaScript client, so those
two sources drive a headless Chromium through `scripts/scraper/browser.mjs`.
Playwright is a devDependency; the browser binary is not, so fetch it once:

```bash
npx playwright install chromium
```

Everything else about those sources is ordinary — they export `brand` and
`scrape()` like the rest, and return the same records.

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

The solver is flat-wall only, so a curved or angled screen is currently assessed
as though it were straight — which understates the footprint and overstates the
wind area. The support panel says so on any project that has one.

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
### Power distribution

`src/lib/power.ts` is the three-phase side. Two things it is deliberate about:

- **A cabinet is not a three-phase load.** Its power supply is wired between one
  line and neutral, so it sees the phase voltage — 230 V on a 400 V service,
  120 V on a 208 V one — and its leg carries the watts on it divided by that.
  The √3 in `P = √3 · V(L-L) · I` is for a load connected across all three
  lines; applying it per leg reads 42% low. `threePhaseLineAmps` is there for
  the balanced whole-service figure and a test holds the two together.
- **The neutral does not carry nothing.** Three equal line-to-neutral loads at
  120° cancel; unequal ones return the vector sum,
  `√(a² + b² + c² − ab − bc − ca)`. That figure is the fundamental only —
  switch-mode panel supplies add third-harmonic current that does not cancel —
  so the neutral is sized for a full leg and the number is reported as
  information rather than as a conductor size.

Circuits are dealt onto legs longest-processing-time first: heaviest circuit to
whichever leg is lightest, ties to the lower-numbered leg. It is never worse
than 4/3 of the perfect split and it gives the same answer every time, which
matters more than the last amp — a patch sheet that reshuffles itself between
two runs of the same project is worse than a slightly uneven one.

Like the rest of this, it is a planning aid. Distribution is signed off by an
electrician against the venue's own service, not by a browser tool.

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
| [INFiLED](https://www.infiled.com/) | 285 | Spec panel rendered client-side, read with a headless browser; numbers arrive in both decimal conventions on one page |
| [Unilumin](https://unilumin.com/products/professional/) | 0 so far | Source written and tested, but see the note below — the product pages have not been reachable long enough to complete a crawl |

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

- A weight, power or brightness figure that no cabinet has — a misread
  separator moves one by a factor of a hundred, not a little — is dropped from
  that record and logged, rather than shipped. The rest of the record is kept.

Specifications change. Confirm against the current datasheet before ordering or
rigging anything.

### Telling a spec change from a broken scrape

A later run has to answer one question: did the vendor change a spec, or did
the scrape break? The run reports three things separately so that it can.

- **Pages that never loaded** are counted as unreachable. The run is short, not
  wrong — retry it.
- **Pages that loaded without a recognisable spec table** are counted
  separately. That is the site having been rebuilt under the parser, and it is
  a bug to fix rather than a retry.
- **A brand whose count collapses** — more than 25% below what the shipped
  library already holds for it — stops the run. `data/cabinets.json` is left
  exactly as it was and the script exits non-zero, naming the brand and how
  many of its pages were unreachable versus unparseable.
- **A brand read only in part** — more than a third of its pages unreachable —
  stops the run too. A brand appearing for the first time has no count to
  collapse from, so without this a half-finished first crawl would ship as
  though it were the whole catalogue.

Pass `--allow-shrink` to write the result anyway, when the catalogue really is
smaller or the gaps are expected.

A spec that merely *changed* trips none of those counters. It lands in the diff
of `data/cabinets.json`, which is where a person should read it: the file is
committed, so `git diff` after a scrape is the changelog for the catalogue.

### Manufacturers not included

`absen.com` is bot-protected, but Absen's US site publishes the same
specification PDFs and is reachable, so that is where the Absen source reads
from.

Unilumin and INFiLED were on this list until a headless browser was wired in,
which is what both of them needed. What is left:

| Brand | What happens |
|---|---|
| Desay | Host does not resolve or answer. Every name it trades under was tried — `desayled.com`, `desay-led.com`, `en.desayled.com`, `desayoptics.com`, `sz-desay.com` — and none of them completes a connection, so there is nothing for a browser to render. |
| Chauvet Professional | Site and WooCommerce Store API both reachable, but the API carries only pitch and IP rating — `dimensions` and `weight` are empty, and the linked PDFs are marketing one-pagers with no cabinet size or resolution. |

Two notes on the two that are now in, because both will bite whoever runs the
scraper next:

- **Unilumin** answers 502 to a crawl that does not pause, and goes on
  refusing an address long afterwards. The source waits between pages, but no
  Unilumin records have shipped yet: its product pages have been reachable in
  windows too short to finish 39 of them, while `unilumin.com/` itself keeps
  answering. The parser is written against a table captured while they were
  up and is covered by `scripts/test-browser-sources.mjs`; what it needs is a
  run from an address the site has not tired of. Until then the run audit
  refuses the empty result rather than shipping it.
- **INFiLED** puts a SiteGround interstitial in front of a first visit. An
  ordinary browser sits through it for a few seconds and is let past, which is
  all the source does — it waits, sometimes across two or three loads. Its
  `robots.txt` (read 2026-09-22) is Yoast's default, `Disallow:` with nothing
  after it, so nothing on the site is off limits.

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

Projects are held in IndexedDB — the working project autosaves, named saves
sit alongside it, and logos are kept as images rather than as text — so
nothing leaves the browser.

## Releasing

Releases are cut by CI, from the changelog.

```bash
npm run release -- 0.4.0            # Unreleased becomes 0.4.0, and the version is bumped
git commit -am "Release 0.4.0"
git push
```

A push to `main` runs the lint, the types, the tests and a build. If they pass
and `package.json` names a version that has no release yet, the workflow tags
it and publishes a GitHub release whose body is that version's section of
`CHANGELOG.md`. A push that does not change the version releases nothing, so
ordinary work is unaffected and re-running is harmless.

Writing the notes is the only part left to a person, which is the part worth
one. Everything downstream of them is read rather than retyped, and `npm test`
fails if `package.json` names a version the changelog says nothing about — so
a release cannot go out describing the one before it.

## Layout of the code

```
src/lib/render.ts      canvas renderer, shared by the viewport and PNG export
src/lib/effects.ts     animated test patterns, pure functions of time
src/lib/geometry.ts    layer bounds, snapping, signal-run ordering
src/lib/curve.ts       curved and angled walls in plan
src/lib/plan.ts        the plan-view drawing
src/lib/calc.ts        size / weight / power / current maths
src/lib/cabinets.ts    library loading and filtering
src/lib/picklist.ts    prep-list aggregation, contingency and pack rounding
src/lib/cabling.ts     data and power runs, auto or manual
src/lib/power.ts       three-phase supply, leg balancing and distro patch
src/lib/support.ts     support structure, wrapping the vendored solver
src/lib/viewing.ts     viewing distance, pitch suitability, field of view
src/lib/contrast.ts    ambient light, reflected floor, achieved contrast
src/state/store.ts     editor state, history, persistence
src/components/        canvas stage, library, inspector, layers, toolbar, spec sheet
scripts/scraper/       cabinet library scraper
scripts/test-*.mjs     tests, run with npm test
scripts/release*.mjs   the version bump, and the notes CI releases from
data/cabinets.json     generated library
```

`renderProject()` is a pure function over a 2D context in canvas-pixel
coordinates. The viewport applies a pan/zoom transform before calling it and the
exporter calls it untransformed, so what you see is exactly what you export.
