# Changelog

Release notes for tagged versions. GitHub releases are cut by hand from
these, so this file is the source rather than a copy of them.

## Unreleased

- **The signal overlay costs what it shows, not what the wall holds.**
  Switching the run overlay on took a 40,000-cabinet wall from 49.7 frames a
  second to 6.6, blocking the main thread 79% of the time — which is why it
  had never shown up: it is off by default, so none of the earlier profiling
  touched it. A quarter of that frame turned out to be port labels. There is
  one per chain, so a wall that size draws two and a half thousand of them
  every frame, each costing a font parse, a `measureText` and a rounded
  rectangle, at a size the zoom made a pixel high. They now stand down when
  they are too small to read, as the cabinet numbers already did, and come
  back on the way in. Chains nowhere near the window are skipped whole, and
  the signal ordering — forty thousand pairs, rebuilt twice a frame — is
  worked out once and kept. The wall now runs at 36.1 frames a second with
  the overlay on, blocking 1%, and the cost no longer grows with the wall.
  Exports are untouched and checked: they pass no window, so they keep every
  chain and every label however the viewport happened to be zoomed.

## 0.6.0

- **Cabling can be drawn by hand, against a running total.** The automatic
  plan cuts the wall into equal chains, which is right until the room has an
  opinion — the distro is stage left, a cable has to cross a walkway, two
  cabinets hang off a different truss. Drag across the cabinets to trace a
  chain and it is patched in the order you touch them; the arrow keys do the
  same from the keyboard. Each chain shows how full it is as you draw —
  "12 of 16 cabinets, 480,000 of 650,000 px" — and names which ceiling that
  is, the port's pixels, what the processor will address, or the chain length
  you set. Power circuits work the same way against watts on the breaker. A
  chain over its limit turns red on the canvas and in the list rather than
  being quietly truncated.
  The drawing aids are the rules, not a separate mode: a cabinet that does
  not touch the last one is refused, so dragging fast cannot make the chain
  leap a gap behind the pointer, and dragging back along the chain retracts
  it. Ctrl is the deliberate override for a chain that really does cross the
  wall. A cabinet already on another chain is refused outright, because
  double-patching is the mistake the whole view exists to catch.
  What is drawn is kept beside the automatic plan rather than replacing it,
  and a switch on the screen says which one the overlays and the pick list
  read. Nothing is lost by trying something.
- **A recording is one loop long, and no longer.** The length was a number
  you typed, defaulting to ten seconds, and every frame past the first loop
  was one the file already had: a bigger file of the same video. Every
  pattern here runs on the same clock, so a loop is one over the speed —
  four seconds at the default — and that is now what it records. Where a
  centre image is turning it waits for both to come round, so the join does
  not jump; where the two would only agree minutes apart it records the
  pattern's loop and says the image will jump, rather than writing a minute
  of 4K to keep a joke in step. Typing a length still works and the panel
  offers the loop back.
- **A wall of any size now costs the same to draw.** The canvas drew every
  cabinet on every frame, whether or not it was on screen — and a big wall is
  mostly off screen, because 200 cabinets across is 38,400 pixels against a 4K
  canvas. Drawing is now limited to the cabinets the viewport actually covers.
  The second half was the numbering: working out which cabinet is which built
  the whole signal run and a lookup of it, forty thousand entries, every
  frame, to label the few hundred on screen. A cabinet's place in the run is
  arithmetic, so it is worked out per cabinet instead. Measured on a
  six-times-throttled machine with a test pattern playing: a 40,000-cabinet
  wall went from 4.8 to 29.4 frames a second, and from blocking the main
  thread 63% of the time to 5%. 8,040 cabinets went 18.4 to 28.7. Frame cost
  no longer grows with the wall — every size now sits at the same ceiling.
  Exports are untouched: they draw the whole wall, as they must, and are
  checked to still do it while the viewport is zoomed into a corner.

## 0.5.0

- **The corner handles resize the screen.** They were always drawn and never
  did anything: four grab targets on a selected screen whose whole message was
  "this is selected". Dragging one now adds and removes cabinets with the
  opposite corner held still, so a wall can be sized on the canvas and not
  only in the fields. It counts in whole cabinets because a wall is built from
  whole cabinets — the drag takes the nearest, never fewer than one, and going
  past the far corner stops there rather than turning the screen inside out.
  Handles are now drawn only where they work: a locked screen, or one too
  small on screen to leave anywhere to grab it by, shows the outline and no
  corners. A painted handle that ignores the pointer is the same lie the other
  way round.
- **REDOT is in the library, and brings the first bend rating in it.** Nine
  carbon-fibre panels from redotled.com, 541 cabinets to 550. The interesting
  part is one field: REDOT publishes a maximum bend per joint, and no other
  brand here does, so the curve check has only ever been able to say the angle
  was unchecked. Put a REDOT panel on a curve too tight for it now and the app
  says "the wall bends 9.0° at a joint but the panel is rated to 5°". Where
  two ratings are quoted the tighter one is kept, because this check exists to
  fail a curve the panel cannot make.
- **Two REDOT panels were left out, on purpose.** The transparent pair are
  quoted "3.9mm(H) 7.8mm(V)" — the pixels really are twice as far apart
  vertically — and a cabinet here carries one pitch, which the app spends on
  working out how close an audience can stand before the pixels separate.
  Either figure would make that confidently wrong in one axis, so they are
  refused and the run says why rather than flattening them. One of the two
  also lists a 1000x5000mm cabinet, which its own resolution and pitch put at
  1000x500; the source cross-checks those three against each other now, so a
  digit typed twice is caught where it is published rather than by the
  validator at the end.
- **The scraper's browser can borrow Node's TLS trust.** Chromium carries its
  own root store, so behind a proxy that re-signs TLS it has no idea who
  signed anything and every page dies before it parses — which looks exactly
  like the site being down. `SCRAPE_FETCH_VIA_NODE=1` has Node make the
  requests and hands the browser the replies, so the certificate is still
  checked, against whatever Node trusts. It moves where the check happens; it
  does not remove it, and there is deliberately no flag here for ignoring
  certificate errors.
- **Unilumin is still out, for a new reason.** It used to be unreachable. It
  is reachable now, and a full crawl found that 38 of 41 product pages no
  longer carry a specification table: they have been redesigned into marketing
  copy, with pitches in prose and no cabinet size, resolution or weight
  anywhere, and no datasheet to follow. The parser is not broken in a way a
  selector fixes — the figures are not published. The run audit refused the
  near-empty result and left the library alone, which is the behaviour that
  matters. Desay remains unreachable, and Brompton's site still answers a
  crawl with a challenge page.
- **A file that is not a project says so.** Opening one that would not parse
  handed the JSON parser's own words to the user — `Unexpected token '', "PNG"`
  — which names the byte it choked on and not the mistake, which is almost
  always that this is not a project file. It now says which file, that it is
  not one, and what to open instead. A file that parses but holds no screens
  is told apart from one that does not parse at all, because those are two
  different mistakes.

## 0.4.0

- **Screens fed over ST 2110 can be planned.** A new ST 2110 tab in the pick
  list works out what each screen's feed costs on the network, uncompressed
  under ST 2110-20 or as JPEG XS under ST 2110-22. Packets are cut exactly as
  the st2110 project's sender cuts them, and the tests hold the counts to that
  sender's for ten formats; a 2304 × 1152 wall in 10-bit RGB at 60 fps comes
  to 8,064 packets a frame and 5.11 Gb/s on the wire. It counts the ports the
  sending side needs with Ethernet's framing included, cuts a screen that
  outgrows one link between cabinets, gives every flow a multicast group (and a
  second for ST 2022-7), warns about groups a switch may send to every port,
  and downloads an SDP file for each receiver as one zip. st2110's linter finds
  no errors in those files, and a capture of its sender's stream arrives whole
  against them. Once the feed is planned, the spec sheet carries it too.

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
- **Checks run on every push, and releases cut themselves.** There was no CI
  at all: `npm test`, the linter and the typechecker existed and ran when
  somebody remembered. They now run on GitHub for every push and pull request,
  and on main a passing run publishes a release for whatever version
  `package.json` names, with the body read out of this file. Cutting a release
  by hand was a tag, a title and a paste into a browser form, which only the
  repository's owner could do; it is now a version bump and a push. The notes
  cannot drift from the changelog because there is only the one copy of them,
  and `npm test` fails if a version is bumped without any written.
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
