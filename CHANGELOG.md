# Changelog

Release notes for tagged versions. GitHub releases are cut by hand from
these, so this file is the source rather than a copy of them.

## 0.2.0

Pixel Map Maker plans LED video walls: drag screens on a canvas, size them in cabinets or metres, and get the cabling, processors, support structure and paperwork that follow from the layout.

Live at **https://pixelmap.letissier.ie**

This is the first tagged release. The app has been in production throughout, so the tag marks a point in the history rather than the first time anything shipped.

## What it does

- **Drag screens on the canvas** — multi-select, marquee, nudge, align and distribute, snapping to edges, centres and the tile grid
- **246 real cabinets** scraped from ROE Visual, GLOSHINE and Absen spec pages and datasheets, filterable by brand, pitch and indoor/outdoor
- **Size in cabinets or in metres** — a wall is asked for in metres and built in cabinets, so both are typeable and either drives the other
- **Cabling and processors** — data and power runs, a pick list, and 13 processors from Brompton, Megapixel and NovaStar
- **Support structure** — ballast, wind loading and hanging, reusing the MIT-licensed tipping-point solver
- **Test patterns** — sonar, line, pulse, scan, ripple, waves and screen lines, playing live on the canvas and recordable to video
- **Exports** — PNG (whole canvas or per screen, transparent optional), project JSON, and a printable spec sheet

## Recent work

- **Data runs respect what can actually be cabled.** Runs were sized on pixel capacity alone, which put 200 cabinets on one port. A run is now the smallest of pixel capacity, the maker's per-port limit and the longest chain you will rig — and the report names whichever one bound.
- **The signal overlay is a patch diagram.** One colour per run, labelled with its port, with the patch list carrying matching swatches. Ports are dealt out across the whole project rather than numbered from 1 inside each screen.
- **Test patterns are picked from thumbnails** rendered by the effect functions themselves, because "Sonar" and "Ripple" are names for things nobody can picture.
- **Interface rebuilt around a three-tier hierarchy**, documented in `UX.md`, with WCAG 2.2 AA fixes and a 4pt spacing scale that is actually obeyed.

## Known limits

- Cabinet specs are scraped; confirm against the current datasheet before ordering.
- Unilumin, INFiLED and Desay cabinets are not included — their specs are JS-rendered with no reachable PDFs.
- Fixture-level pixel mapping is deliberately out of scope; that is a playback engine, a different product.
