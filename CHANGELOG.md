# Changelog

Release notes for tagged versions. GitHub releases are cut by hand from
these, so this file is the source rather than a copy of them.

## Unreleased

_Nothing yet._

## 0.3.0

Two strands of work landed together: the wall described in more of the ways a
job actually asks about it — where the audience stands, the light in the room,
a curve in plan, the three-phase service — and the app made to hold up under
the size of project that comes with them.


- **Big walls stay usable on an ordinary laptop.** Drawing was fine on a fast
  machine and fell apart on anything slower: a 3,600-cabinet wall with a test
  pattern running held 19.6fps while blocking the main thread for 869ms in
  every 2,000. Almost all of it was text — the font was being re-parsed for
  every tile, and cabinet numbers were drawn at a 6px floor even when zoomed
  out far enough that nobody could read them. Numbers now disappear when they
  would be illegible on screen, and everything constant is set once. The same
  wall now blocks for 91ms. Exports are drawn untransformed, so they keep their
  numbers whatever the viewport was zoomed to.
- **Work is no longer lost at the storage ceiling.** A single logo took a saved
  project to 2.31MB against the browser's ~5MB limit for the kind of storage
  the app was using, so three screens with a logo each — ordinary for a
  multi-screen show — quietly stopped saving while you carried on working.
  Projects and named saves now live in IndexedDB, which has room for hundreds
  of times that, and logos are stored as images rather than as text, which is a
  third smaller again. Anything already saved moves across on first load. If a
  save does fail, it now says so instead of failing silently.
- **A project that cannot be read no longer takes the app down with it.** A
  half-written save used to crash on load, and because every way back in
  reloaded the same data the crash repeated forever. A save that does not make
  sense is now refused, with an empty canvas and an explanation; the crash page
  behind that has a way out of its own.
- **Runs can be made to finish at the edge of the screen.** A run that stops
  mid-wall leaves its tail cable hanging on the face of it. Ending on an edge
  puts every termination where the racks and the distro already are. Separate
  toggles for data and for power. It costs ports — a run has to shorten to a
  whole number of rows, and on a 10-wide wall a 16-cabinet chain becomes ten
  and four ports become six — and the table says so rather than leaving it to
  be noticed.
- **Port capacity moves with colour depth and refresh rate.** A pixel costs
  three channels of colour on every refresh, so 120Hz halves what a port
  carries and 10-bit costs a fifth of it. Quoted capacities assume a baseline
  and manufacturers do not share one — Brompton quote the SX40 at 12 bits a
  channel where NovaStar's familiar 650,000 a port is 8-bit — so each processor
  is now scaled from its own. Which makes a real planning point visible:
  running an SX40 at 8-bit rather than its quoted 12-bit buys half as much
  capacity again.
- **Power circuits can be drawn on the canvas.** They were numbers in a table
  while data runs had an overlay, so there was no way to see a circuit cross a
  screen the way you can see a port. Power draws warm, thicker and dashed,
  nudged off the centre line, so both can be on at once and still be read.
- **Data runs can be closed to a backup port.** A chain fed from one end dies
  entirely at the first dead panel or pulled cable. Close the loop and a second
  port picks up the tail, so a break anywhere is covered from the other side
  and the processor swaps over within a frame — Brompton pair two outputs for
  it, NovaStar call it hot backup, and it is the same cabling either way. The
  cost is stated rather than buried, because it is the whole decision: two
  ports per run, and a long cable from the far end of each chain back to the
  rack. Four runs become eight ports and four returns, the patch names both
  ends of each loop, and the processor count is worked out from ports occupied
  rather than runs — sizing a redundant system off the run count would specify
  half the kit it needs.
- **The exported diagrams carry the cabling plan.** They never had. An exported
  PNG drew one unbroken chain through the whole screen, with no port labels and
  no power circuits, whatever the settings said — reported as the edge toggles
  not reaching the diagrams, which was right about the symptom and too kind
  about the cause. Turning a project into run overlays was written inside the
  canvas component, so the live view had it and the three export paths did not;
  it now sits in one place that the viewport, both PNG exports and the video
  all read. The per-screen export draws power too, which it never could. This
  was the worse half to have wrong: the screen is checked by the person who set
  it, and the export is what goes to site.
- **A Union Jack palette**, which is a joke and also genuinely useful: a flag
  stretched over a whole wall only meets its corners when every cabinet is
  where the map says, so a mis-patch shows up across a room in a way a colour
  swatch never does. The centre image can be set to turn slowly, for no
  defensible reason at all.

- **Viewing distance.** Set where the nearest and furthest of the audience
  stand, and every screen says how it reads from both: arcminutes per pixel,
  the distance at which pixels stop being separable, how much of the field of
  view it fills, and how much of its own resolution reaches the back of the
  room. It also says when a pitch is finer than anyone present can resolve, and
  what pitch would look the same — the most expensive thing to get wrong on a
  quote. On the spec sheet too, so it goes out with the price.
- **Brightness against the light in the room.** A panel's nit figure says
  nothing on its own: what decides whether an image survives is the light
  bouncing off the screen face, because it lands under the blacks and no panel
  can emit negative light. Set the ambient level and each screen reports the
  floor reflection puts under it, the contrast it actually reaches there, the
  peak brightness that would hold the contrast you need, and the brightest room
  it holds that in. The required ratio is yours to set — the app computes the
  physics and does not invent the requirement.
- **Curved and angled walls.** A screen can be set on a radius or folded into an
  L or a U, with a plan view of the footprint beside the controls and the span,
  depth, turn and radius on the spec sheet. The pixel map does not change: a
  curved wall unrolls a flat rectangle, and any warping belongs in the media
  server. No manufacturer in the library publishes a maximum bend per joint, so
  the check says the angle is unchecked rather than claiming a pass; enter one
  on a custom panel to have it tested.
- **Three-phase power and distro balancing.** The app gave current at 230 V and
  120 V single-phase, which is the wrong question for a wall of any size: the
  venue hands over a three-phase service and somebody has to decide which way
  sits on which leg. Pick a supply — 400/230 V, 208/120 V, 480/277 V, or either
  single-phase — and the circuits are dealt across L1, L2 and L3 heaviest-first
  onto the lightest leg, with per-leg load and current, the neutral the
  imbalance actually returns, how far apart the legs come out, the smallest
  stocked feed that holds the worst one and the connector it lands on, and a
  way-by-way patch. It is on the spec sheet as well as the pick list, because
  the service is the part a venue has to be asked for weeks ahead.
- **Six outdoor panels were in the library at 5 and 50 nits.** Absen's spec
  PDFs break a number across two runs of glyphs, and the parser joined every
  run with a space, so `num()` read the first piece: 5000 became 5. Runs are
  now rejoined by whether they sit flush. The same bug had been quietly taking
  a digit off three cabinet depths and two weights, and had been dropping ten
  cabinets whose dimensions it mangled past the validator. The library is
  rebuilt: 246 cabinets to 256, with 13 corrected figures.
- **The first tests in the repo.** `npm test` finds and runs every
  `scripts/test-*.mjs`, checking each piece of maths against the published
  figures it claims to reproduce. No framework: Node strips the types and a
  thirty-line loader resolves the app's own imports, so a test exercises the
  module that ships.
- **Unilumin and INFiLED, read with a headless browser.** Both publish their
  specs only to a JavaScript client, which is the whole reason neither was in
  the library: fetch a product page and you get every label and not one value.
  `scripts/scraper/browser.mjs` drives Chromium so a source can read what the
  page actually draws. INFiLED brings 285 cabinets, 256 to 541. The Unilumin
  source is written and covered by tests but has no records in yet — its
  product pages have not stayed reachable long enough to finish a crawl.
- **Desay is still out**, and not for want of JavaScript: no name the company
  trades under answers at all.
- **A scrape that goes wrong no longer overwrites a good library.** A run now
  counts pages that never loaded apart from pages that loaded without their
  spec table — the first is a short run, the second is the site having moved
  under the parser — and stops before writing when a brand's count collapses.
  A spec that merely changed trips none of that and lands in the diff, which is
  where someone should read it. Scraping one source now tops that brand up
  instead of truncating the library to it.
- **Figures no cabinet has are dropped rather than shipped.** INFiLED writes
  "8,09kg" where Absen writes "20.4kg", and read the old way that panel weighed
  809kg. Weight, power and brightness are now checked against what a cabinet
  can physically be, and a figure outside that is dropped and logged rather
  than quietly rigged.

## 0.2.0

Pixel Map Maker plans LED video walls: drag screens on a canvas, size them in cabinets or metres, and get the cabling, processors, support structure and paperwork that follow from the layout.

Live at **https://pixelmap.letissier.ie**

This is the first tagged release. The app has been in production throughout, so the tag marks a point in the history rather than the first time anything shipped.

### What it does

- **Drag screens on the canvas** — multi-select, marquee, nudge, align and distribute, snapping to edges, centres and the tile grid
- **246 real cabinets** scraped from ROE Visual, GLOSHINE and Absen spec pages and datasheets, filterable by brand, pitch and indoor/outdoor
- **Size in cabinets or in metres** — a wall is asked for in metres and built in cabinets, so both are typeable and either drives the other
- **Cabling and processors** — data and power runs, a pick list, and 13 processors from Brompton, Megapixel and NovaStar
- **Support structure** — ballast, wind loading and hanging, reusing the MIT-licensed tipping-point solver
- **Test patterns** — sonar, line, pulse, scan, ripple, waves and screen lines, playing live on the canvas and recordable to video
- **Exports** — PNG (whole canvas or per screen, transparent optional), project JSON, and a printable spec sheet

### Recent work

- **Data runs respect what can actually be cabled.** Runs were sized on pixel capacity alone, which put 200 cabinets on one port. A run is now the smallest of pixel capacity, the maker's per-port limit and the longest chain you will rig — and the report names whichever one bound.
- **The signal overlay is a patch diagram.** One colour per run, labelled with its port, with the patch list carrying matching swatches. Ports are dealt out across the whole project rather than numbered from 1 inside each screen.
- **Test patterns are picked from thumbnails** rendered by the effect functions themselves, because "Sonar" and "Ripple" are names for things nobody can picture.
- **Interface rebuilt around a three-tier hierarchy**, documented in `UX.md`, with WCAG 2.2 AA fixes and a 4pt spacing scale that is actually obeyed.

### Known limits

- Cabinet specs are scraped; confirm against the current datasheet before ordering.
- Unilumin, INFiLED and Desay cabinets are not included — their specs are JS-rendered with no reachable PDFs.
- Fixture-level pixel mapping is deliberately out of scope; that is a playback engine, a different product.
