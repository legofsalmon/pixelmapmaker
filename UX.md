# How this app is designed

Written after a UX review in September 2026, prompted by a fair complaint: *"there
is a lot of functions all exposed with a similar level of importance."* That was
true — 25 controls sat in one toolbar row at one visual weight, and 12 of them
used the same button style.

This is the standing brief for every future change. It is meant to be argued
with and updated, not obeyed blindly, but a change that contradicts it should say
why.

---

## 1. Who this is for

Roles blur — one freelancer may do all of this in a month — so the app is
organised around **the four jobs people hire it for**, not job titles.

| Job | Who, and when | Where | Under what pressure |
|---|---|---|---|
| **Quote** | Sales estimator or PM, weeks before the show | Desktop and phone | Answer before the competitor does |
| **Map** | Video engineer or screens designer, 1–4 weeks out | Desktop | Content team and media-server op both build from this file |
| **Kit** | PM, TD, warehouse, rigger, 1–7 days before truck-out | Desktop, then printed paper | The truck leaves whether or not the list is right |
| **Verify** | LED tech or crew chief, load-in day, at the wall | Phone, often in the dark | Find the dead tile before doors |

**Quote** needs about eight functions. **Verify** needs three. **Map** is the
only job that needs the editor proper. Designing as though every user needs
everything is what produced the flat toolbar.

### The jobs in one line each

- **Quote** — pick a panel, set a grid, read size / weight / power / resolution.
  Should be answerable *without opening anything*.
- **Map** — place several screens on a canvas, number them, set the signal run,
  export a pixel map and a composition file.
- **Kit** — choose a processor, set the cabling rules, get a pick list with
  contingency, print it.
- **Verify** — open the exported map on a phone, run a test pattern, find the
  bad cabinet.

### Two things that follow

**The exported file is the product; the editor is scaffolding.** The primary
success event is a PNG, a CSV or a printed sheet leaving the app. Those exits
earn the strongest weight in the interface.

**A rental house owns five panel types, not 246.** Favourites are the real
default view; the full library is the escape hatch.

---

## 2. Hierarchy

The rule that was missing. Every control sits in exactly one tier, and the tier
decides its treatment.

| Tier | Meaning | Treatment | Budget |
|---|---|---|---|
| **1 — Primary** | The job's main exit | One filled accent button | **One per region** |
| **2 — Secondary** | Used several times a session | Quiet bordered button | A handful |
| **3 — Tertiary** | Occasional, or configuration | Text button, menu item, or a settings popover | Unlimited, out of the way |

Presence on the primary surface is itself a claim about importance. If everything
is present at equal weight, the interface tells the user nothing and they have to
build the model themselves by trial.

**Do not delete features to fix density.** Professionals need all of it
eventually. Hick's law is logarithmic and largely defeated by grouping: choosing
between five labelled groups of five is far cheaper than choosing between 25
undifferentiated items. Going from 25 controls to 20 buys nothing; going from 25
flat to 5 grouped collapses it to two easy decisions.

**Miller's 7±2 does not cap a toolbar.** It is about recall; a toolbar is
recognition — everything is on screen. Do not create nesting to hit a number.

**Hide what cannot apply.** Align and distribute are meaningless below two
selections. Ballast is meaningless with no screens placed. The app already gets
this right by swapping the inspector for the multi-select panel; extend that
instinct outward rather than disabling controls in place.

**Disclose in the order work commits:** how big and how much (everyone) → where
things sit (Map) → how it is wired and held up (Kit) → how it is verified (site).

**Let a stacked region be folded, and remember the fold.** Two panels sharing
one scroll container is fine until the upper one grows — attach a logo, open the
datasheet — and pushes the lower one off the bottom, where it has to be hunted
for. Folding is the cheap fix and a splitter is not: a splitter asks the user to
manage a number, a fold asks them to answer yes or no. Remember the answer,
because someone doing the same job all week should not have to give it again
every morning.

---

## 3. Visual language

Hierarchy is a *ranking*. Rank on size, weight, colour and space **before**
reaching for a border, a box or an icon. Chrome is the last resort.

- **Three text levels, no more.** Primary, secondary, tertiary — as tokens.
  Two is too few to rank a dense screen; four stops being a ranking.
- **Weight and colour carry the ranking, not size.** Vertical space is the
  scarce resource here. A semibold label above a regular value already ranks
  them at the same size. Reserve size changes for two or three real headlines.
- **One accent, one meaning.** In a canvas editor that meaning is **selection**.
  An accent doing six jobs cannot win the one that matters.
- **Spacing on a 4pt grid** — 4, 8, 12, 16, 24, 32. Off-grid values are bugs,
  not taste, and a scale nothing obeys is decoration. Exactly two exceptions,
  both about hairlines rather than layout: a 1px rule, and a 2px half-step
  (`--s0`) where something has to sit optically level with a 1px border.
- **Control size is not layout spacing.** Forcing button padding onto the
  spacing scale is what left inputs at 29px, buttons at 33px and selects at
  31px — three heights in one row. Controls get their own token.
- **Group with a spacing ratio of about 2×**, not a divider. Tighten inside the
  group before widening between groups.
- **Borders are a tax.** Prefer proximity and a shared background. Spend a
  border only where whitespace genuinely cannot do the job — and make the
  surface ramp large enough that grouping-by-background actually works.

---

## 4. Accessibility

Not a phase. Every change is checked against this list, and WCAG 2.2 AA is the
floor.

**Canvas.** A graphical editor is not exempt from keyboard operability
(2.1.1). It needs a role, an accessible name, a real focus stop, and a keyboard
model. Separately, every drag needs a **single-pointer, non-dragging
alternative** (2.5.7, AA) — a keyboard shortcut does *not* satisfy this, because
it is about pointer users who cannot drag.

**Dialogs.** `aria-modal="true"` is a promise. Declaring it without focus
containment, initial focus, Escape-to-close and focus return is *worse* than not
declaring it, because it tells AT to hide a page that focus can still wander
into. Name dialogs with `aria-labelledby` pointing at the visible heading, never
a duplicate `aria-label` that will drift.

*(Escape-to-close is the APG Dialog pattern and a firm convention — it is not
SC 2.1.2, which is only about not trapping focus. We do it because it is right,
not because an SC forces it.)*

**Focus.** Visible on everything (2.4.7), at 3:1 against its surroundings
(1.4.11), and not hidden behind a sticky header (2.4.11). A border-colour shift
is not a focus indicator.

**State.** Toggles expose `aria-pressed` with a *stable* name. Swapping the
accessible name to carry state means a user cannot query state without
activating the control.

**Contrast.** Text tokens here already pass comfortably. The trap is
`1.4.11 Non-text Contrast`: control boundaries need 3:1, decorative dividers do
not. Use separate tokens so one low-contrast value cannot silently drop every
bordered control below the line.

**Motion.** Every non-essential animation must be removable via
`prefers-reduced-motion`, and the interface must stay comprehensible with all
motion off. This matters more here than in most apps, because the test patterns
are deliberately, continuously animated.

**Async.** Live regions must exist in the DOM *before* they have content —
several screen readers only announce mutations. Progress that lives only on a
disabled button is unreachable.

---

## 5. Delight

Pleasure sits at the top of the pyramid, above functional, reliable and usable.
You cannot paint delight onto a usability failure — fix the rank order first.

The target emotion is **competence transferred to the user**. Make the technician
feel good at their job; do not try to make the tool lovable.

**Worth building**

- **The snap.** In a spatial editor the moment a screen clicks into alignment is
  the highest-frequency emotional event in the product. It should be *felt*.
- **Motion with a job** — feedback, orientation, causality, attention. Under
  100ms feels instant; under 400ms holds flow; past 1s needs a progress signal.
- **Empty states as the only onboarding a professional will tolerate.** Orient,
  demonstrate, reduce to one action. Never a dead end, never a blocking tour.
- **The end of the session** — the export — is what gets remembered.
- **Microcopy with a voice.** Plain, specific, and it names the next move.

**Not worth building**

Confetti on export. A mascot. Jokes anywhere near a failure message. Blocking
welcome tours. `window.confirm()`. Motion that answers no question.
And "Something went wrong" — which names nothing, suggests nothing, and teaches
the user to stop reading messages.

---

## 6. Checklist for a change

1. Which of the four jobs does this serve? If none, why is it being built?
2. What tier is each new control, and does the region still have exactly one
   primary?
3. Can it be hidden until it applies?
4. Keyboard-reachable? Focus visible? State in the accessibility tree? If it
   drags, is there a non-drag path?
5. Spacing on the grid, text in one of three levels, accent not borrowed?
6. If it animates, does it have a job and does it respect reduced motion?
7. If it can fail, does the message name what happened and what to do next?

---

## Sources

Nielsen Norman Group (progressive disclosure; complex-application guidelines;
the Miller's-law misreading; emotional design's three pillars). Jensen Harris on
the Office command-frequency data. Hick–Hyman (1952/1953). Microsoft Fluent
CommandBar, Material Design 3 and IBM Carbon on button hierarchy. W3C WCAG 2.2
and the ARIA Authoring Practices Guide. Aarron Walter's hierarchy of user needs;
Don Norman on visceral, behavioural and reflective design; Kinneret Yifrah on
microcopy.
