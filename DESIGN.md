# Memedle — design contract

> Read this before touching `style.css`. A literal hex or px inside a component
> rule is a bug: every value in this system is named, and the name is the
> vocabulary. If a decision needs a number that is not here, the vocabulary is
> wrong — fix it in `:root`, globally, once.

---

## north_star

**A sunlit paper tabletop where the whole memecoin world has been built out of
lime-green toy blocks.**

Warm bone paper, lit flat and evenly from above. A rolling landscape of
extruded lime cubes runs along the bottom edge like a play mat someone snapped
together. Everything the player touches is a clean white card resting on that
paper. The only things that look *pressable* are drawn with a hard black die
line and a shadow that has zero blur, because they are the tokens you move.

The previous world — a blue pixel-art overworld with a crowd of sprites — is
**gone**. Do not regress to it: no pixel fonts, no sky gradient, no 1px-grid
imagery, no `image-rendering: pixelated`. A note in a commit message is not a
licence to bring back a token that this file deleted.

**theme** light
**industry** daily puzzle game / crypto culture
**description**
One screen, three columns, no scrolling on desktop. A mode rail on the left, the
live game in the middle, yesterday's answer and the rules on the right, a tray of
side-quests beneath. The page reads as a game board photographed from above, not
as a dashboard. Motion is the whole difference between those two readings, so
motion is not optional decoration here — see **elevation** and **motion**.

---

## colors

### The neutral ramp — Ink → Paper

Nine steps, named. Never write one as a hex in a component.

| token | hex | name | role |
| --- | --- | --- | --- |
| `--ink` | `#16161A` | **Ink** | every die line, every hard shadow, primary text |
| `--ink-2` | `#4A4A52` | **Slate** | secondary text, card sub-copy, the blurb line |
| `--ink-3` | `#84848F` | **Fog** | placeholder, meta, the footer line, disabled label |
| `--ash` | `#C9C8C2` | **Ash** | inert fills and empty pips only — **never text** |
| `--line` | `#E4E2D9` | **Rule** | the hairline border on a calm card |
| `--card-2` | `#F2F0E8` | **Shelf** | a recessed surface *inside* a card (tile back, input) |
| `--card` | `#FFFFFF` | **Card** | the default card face |
| `--paper` | `#FEFDF7` | **Paper** | the page itself — **sampled from the plate's own field** by `tools/use-bg.mjs`, never hand-edited |
| `--paper-2` | `#EAE7DC` | **Paper Deep** | the band behind the tray, under the fold |

### The accent — exactly one, and it is spent

| token | hex | name | role |
| --- | --- | --- | --- |
| `--lime` | `#BCF23F` | **Lime** | the active mode card, the submit key, the rule numerals |
| `--lime-2` | `#A6DE23` | **Lime Deep** | the pressed/hover state of anything Lime, the wordmark shadow |
| `--lime-3` | `#EDFBC4` | **Lime Wash** | a Lime tint on a white card: the dock icon plates |

**Accent scarcity is the rule that makes this page not look generic.** Lime is
allowed on: the one active mode card, the one submit key, the how-to-play
numerals and the dock icon plates. It is banned from: body text,
card borders, secondary buttons, modal chrome, and anything that appears more
than once in a row for decoration. If you are reaching for Lime to make
something stand out, the answer is contrast or weight, not more Lime.

### Status — grid tiles, flags and verdicts only. Never a button fill.

| token | hex | name | role |
| --- | --- | --- | --- |
| `--hit` | `#8BD418` | **Hit** | exact match |
| `--hit-ink` | `#16161A` | — | text on Hit |
| `--near` | `#FFC53D` | **Near** | close: same family, ±1 year, adjacent band |
| `--near-ink` | `#3A2A00` | — | text on Near |
| `--miss` | `#FB6F84` | **Miss** | wrong |
| `--miss-ink` | `#3A0C14` | — | text on Miss |

`body.cb` swaps **Hit → `#3B7FD4`** and **Miss → `#E07B18`** for colourblind
play. Near and Lime are untouched by that swap; that is deliberate, they are
already distinguishable by position and by shape.

### Scenery — the supplied plate

The landscape is **not drawn in code**. It is the artwork the owner supplied,
`img/bg.webp` (a 1672×941 16:9 plate), painted by CSS on `.world`. It was
redrawn in SVG for several rounds first and never matched, because a redraw is
an approximation by construction. There is therefore no scenery colour ramp to
name: the only green the UI owns is the Lime accent.

- **`--paper` is the plate's own field colour**, sampled by `tools/use-bg.mjs`.
  The plate stops partway up the viewport on anything taller than 16:9, so a
  shade of drift puts a visible seam across the full width. A test pins it.
- **One sizing rule everywhere: `100% auto`, anchored bottom.** Never `cover` —
  above 16:9 it fills the height and crops the sides, and the sides are both
  character clusters.
- To replace the plate: `node tools/use-bg.mjs <path>`. It re-encodes to WebP,
  re-samples `--paper`, and restamps. Do not hand-wire a new image.

---

## surfaces

| level | token | purpose |
| --- | --- | --- |
| 0 | `--paper` | the tabletop, and the plate that sits on it |
| 1 | `--card` | every calm panel: game panel, rules, yesterday, modals |
| 2 | `--card-2` | recessed inside a card: input well, empty tile, dist bar track |
| 3 | `--ink` | the one dark object per view — the flag, the reveal banner |

---

## typography

Two families. That is the whole list. **Jersey 15 and Luckiest Guy are deleted**
— the pixel display face belonged to the old world and reintroducing it breaks
the north star.

| family | substitute | weights | role |
| --- | --- | --- | --- |
| **Baloo 2** | `"Segoe UI", system-ui, sans-serif` | 600 / 700 / 800 | the wordmark, mode names, card titles, big numerals. Round terminals and a tall x-height are what make the page read as a toy. |
| **Figtree** | `system-ui, sans-serif` | 400 / 500 / 600 / 700 / 800 | everything else: body, labels, meta, counters, tiles. |

`--font-num` does not exist and must not be re-added. **Figtree carries every
digit in the interface** because it has real tabular figures — `font-variant-
numeric: tabular-nums` genuinely works in it, so counters like `0/6` and the
stats grid do not jiggle as they tick. Baloo 2's digits are proportional; it is
allowed a number only where the number never changes in place (the wordmark, a
mode name).

Tracking tightens as size grows: `-0.03em` at 48px+, `-0.01em` at 20–32px,
normal at body, `+0.08em` on uppercase labels at 11–13px.

### type_scale

| role | size | weight | line-height | tracking | family |
| --- | --- | --- | --- | --- | --- |
| `wordmark` | clamp(44px, 7vw, 74px) | 800 | 0.9 | -0.035em | Baloo 2 |
| `title` | 20px | 700 | 1.15 | -0.01em | Baloo 2 |
| `mode` | 17px | 700 | 1.1 | 0 | Baloo 2 |
| `numeral` | 26px | 800 | 1 | -0.01em | Baloo 2 |
| `label` | 12px | 700 | 1 | +0.08em, uppercase | Figtree |
| `body` | 15px | 400 | 1.5 | 0 | Figtree |
| `sub` | 13.5px | 400 | 1.4 | 0 | Figtree |
| `meta` | 12px | 500 | 1.3 | 0 | Figtree |
| `tile` | 13px | 700 | 1.15 | 0 | Figtree |

---

## spacing

`base` 4px · `elementGap` 12px · `cardPadding` 18px · `sectionGap` 28px ·
`pageWidth` clamp(960px, 84vw, 1480px) · `railWidth` clamp(214px, 15.5vw, 296px) ·
`sideRailWidth` clamp(228px, 16.5vw, 306px) · three columns from 1240px up

All fluid, and **the centre column is the budget**. The rails and the plate get
what is left over, never the other way round.

This was learned the hard way. The page was once sized at 70vw so the cards
would clear the plate's characters — a row-by-row scan put the plate's cream gap
at ~71% of its width — and it starved the board: at 1280px, **20 of 23 clue
tiles were clipped to 29px** ("Eth…", "20…"), and every test still passed
because none of them measured a tile. A legible board beats uncovered background
art; the cards are opaque and sit *on* the plate, which is how a tabletop reads
anyway. The suite now asserts that no tile clips its value.

On phones (≤620px) the chain column shows its short form — ETH, SOL, HOOD, BNB,
BTC, ADA — because a 46px tile cannot print "Robinhood", and it is how crypto
players say it anyway. The full name stays in the tile's `title`.

`tools/sweep.mjs` renders twelve real viewports (360×780 → 2560×1440) and fails
on horizontal overflow or a clipped card. It does NOT play a game, so it cannot
see a clipped tile — that is what the suite's tile check is for.

### radius — three, total

| token | value | applies to |
| --- | --- | --- |
| `--r-1` | 12px | controls: buttons, inputs, tiles, chips, logo plates |
| `--r-2` | 20px | cards: panels, modals, the dock tray, mode cards |
| `--r-pill` | 999px | pills, counters, badges, the guess input |

Nothing rounds at any other value. 20px is the **maximum** card radius in this
system: larger reads as a phone app and breaks against the 12px controls sitting
inside it.

### die line

`--cut: 2px` — the black outline on a pressable object.
`--cut-in: 1.5px` — a line printed *inside* a card (a tile edge, a badge ring).

---

## elevation

**One philosophy, two tiers, and the tier is the affordance.**

- **Calm (level 1).** A white card, a `--line` hairline border, and
  `--shadow-soft` (`0 2px 0 var(--line)`) — a shadow with zero blur that is
  barely darker than the border. It rests on the paper. It does not invite a
  click.
- **Live (level 2).** A black `--cut` die line and `--shadow`
  (`0 var(--lift) 0 var(--ink)`, `--lift: 4px`) — hard offset, **zero blur,
  Ink only**. This is a token you can pick up.

Pressing a live object translates it down by exactly `--lift` and zeroes the
shadow, so the object meets the paper. Hovering lifts it by `--rise` (2px) and
deepens the shadow to match. The arithmetic must always close: `translateY` plus
shadow offset is a constant, or the object appears to grow rather than move.

**There are no blurred drop shadows anywhere in the UI.** Blur exists in exactly
two places on this site: the modal scrim, and Blur mode's coin — which is the
literal subject of that game mode. A soft shadow on a card is the single
fastest way to make this page look like every other template.

Only things that are *pressable or active* get the Live tier. In practice, per
view, that is: the active mode card, the submit key, the two top-bar icon
buttons, the full-rules button, the dock tiles, and the primary button inside an
open modal. If a seventh thing is Live, one of them is wrong.

---

## motion

Motion is load-bearing here, not polish. GSAP is vendored at
`vendor/gsap.min.js`; `motion.js` owns every timeline and `sfx.js` owns sound.

**The curve vocabulary** — three easings, taken from the tables, never
hand-rolled:

```
--ease-out:    cubic-bezier(.23, 1, .32, 1)      entering, exiting
--ease-in-out: cubic-bezier(.77, 0, .175, 1)     moving on screen
--ease-pop:    cubic-bezier(.2, .9, .3, 1.35)    a toy springing back
```

**Never `ease-in` on a UI element**, and never the browser's built-in
`ease-out` on anything deliberate — both are too weak to read at these
durations.

**The duration vocabulary.** Down is faster than up; leaving is faster than
arriving.

| token | ms | for |
| --- | --- | --- |
| `--dur-press` | 90 | the downstroke, before the finger knows it moved |
| `--dur-tint` | 130 | a hover fill fading |
| `--dur-close` | 160 | any dismissal |
| `--dur-pop` | 220 | the release, long enough for the overshoot to read |
| `--dur-flip` | 420 | one clue tile turning over |
| `--hold-flash` | 1800 | how long a flash message sits before it leaves |

**The stagger is 60ms** everywhere: entrance cards, clue tiles, dock tiles.
Nothing in this interface arrives all at once.

**Reduced motion is a gentler variant, not zero.** Under
`prefers-reduced-motion: reduce`: transforms and travel are dropped, opacity and
colour transitions are **kept** (they are what make a state change legible), the
landscape and mascots hold still, and the tile flip becomes a cross-fade of the
same duration. Never write a blanket `* { transition-duration: .01ms }` — it
makes descendants transition `visibility` and quietly breaks focus into a newly
opened dialog.

**Hover motion is gated** behind `@media (hover: hover) and (pointer: fine)`.
Touch fires a false hover on tap, and a card that lifts and stays lifted after a
tap looks broken.

**Sound is on by default, and nothing plays before a gesture.** Those are two
different rules and only the second one is about noise. A browser will not start
an `AudioContext` until the player has pressed something, so the first sound is
always an answer to their own press — never noise on load. Off-by-default was
tried first and meant almost nobody ever heard the kit. The mute is one tap in
the top bar and in Settings, and a remembered `"0"` in `md_sfx` is honoured.
Every cue is synthesised in `sfx.js` from oscillators: there are no audio files
to ship. **Never put a sound on hover** — it fires every time the pointer
crosses something, and becomes noise inside a minute.

### the reveal

A clue tile waits **blank**, turns over, and its colour lands on the exact frame
it is edge-on (`flip-reveal`, the 49.9% / 50% keyframe pair — a snap, not a
fade). The earlier version arrived already coloured and then flipped, which gave
the answer away before the motion that was supposed to deliver it. Each status
names its own `--tile-bg` / `--tile-ink`, so one keyframe lands any of the
three. Per-tile timing is the variable `--d`, not `animation-delay`, because an
exact match's overshoot has to begin the instant its own flip ends and only a
shared variable lets both animations read the same number.

### the toys

Two things on the page do nothing useful and exist to be poked: **the wordmark**
(each letter jumps on hover and leaves its Lime shadow behind; a click sends the
whole word up as a wave) and **the mystery coin** (click to spin it twice). They
are where the delight budget is cheapest — both are seen rarely, and neither is
on a path the player must take to play. Do not add a third toy to anything the
player touches every guess.

### what never animates

The autocomplete list re-renders on every keystroke and arrow-key navigation
moves through it dozens of times a game. Neither animates, ever. Animation on a
keyboard-driven, high-frequency action makes the interface feel slower than it
is.

---

## layout

A fluid page (see **spacing**), centred, with a mode rail, a fluid centre and an
info rail. The three columns collapse at 1180px to centre-then-rails, and at
860px to one column in reading order: brand, modes, game, tray, rails.

The plate is **fixed** and never scrolls with the content; it is the table the
cards are lying on, and a table that slides away is a parallax effect, which
this system does not have.

**The block is vertically centred, safely.** `.app` is a full-height flex column
and the first and last children take `margin-top: auto` / `margin-bottom: auto`.
Never `justify-content: center`: on a column taller than the viewport it
overflows in BOTH directions and pushes the top of the page above the scroll
origin, where it can never be scrolled back into view. An auto margin collapses
to zero instead, so a short laptop starts at the top and scrolls normally while
a tall screen centres. The bottom padding is larger than the top on purpose —
the lower third of the viewport is the plate's green, so the geometric centre
reads as low; this lands the block on the optical centre. `tools/vcenter.mjs`
reports the gap above and below at eight viewports.

Two things this broke, both fixed, both worth knowing: in a flex column a
horizontal `margin: auto` means *shrink to content, then centre*, so the dock
collapsed from 720px to ~440px until it got an explicit `width: 100%`; and the
footer, whose height now depends on the viewport, sits on a plaque of the
plate's own paper so its fine print stays legible over the blocks.

There are **no corner mottos**. The four pinned taglines (`MEME TODAY / SMARTER
TOMORROW` and the rest) were removed at the owner's request on 2026-09-18 — do
not bring them back as decoration.

---

## imagery

Three kinds of picture, with three different treatments, and they must not be
merged.

1. **Coin logos** (`img/<TICKER>.png`) are the game's *subject*. They always sit
   in a rounded `--r-1` plate with a `--cut-in` line and `object-fit: cover` —
   never bare on the paper, never circular except in the reveal.
2. **Mascots** (`img/art/<NAME>.webp`) are transparent cut-out meme
   illustrations standing on the landscape at the two bottom corners. They are
   decoration, they are `aria-hidden`, and they carry a prop drawn in CSS — a
   flag on the left, a speech bubble on the right. **A token icon is not a
   mascot**: it is a character inside a coloured disc, so cutting it out returns
   a disc. Only art from `tools/art-sources.json` is eligible.
3. **The landscape** is hand-authored inline SVG in `index.html`, not an image
   file. It must paint on the first frame with no request, and it must be able
   to take a `viewBox` change at any width without re-cropping.

---

## components

| name | role |
| --- | --- |
| `.world` | fixed-position landscape layer: hills, clouds, coins, mascots. `aria-hidden`, `pointer-events: none`. |
| `.brand` | the wordmark — Ink type over a Lime Deep offset copy at `translate(3px, 4px)`, plus one sparkle. The offset is a second element, not a `text-shadow`, so it can be animated independently. |
| `.mode-card` | one per game mode. Calm when idle; **Live and Lime-filled when active**. Carries a logo plate, a name, a blurb, a `x/6` counter and a progress rail. |
| `.panel` | the calm white card. A `panel-bar` title row over a `panel-body`. |
| `.tile` | one clue cell. `--r-1`, `--cut-in` edge, status fill, flips on reveal. |
| `.guess-input` | a pill well at `--card-2` with the Live submit key sitting beside it. |
| `.dock` | the tray of six side-quests. Each tile: a Lime Wash icon plate, a two-line uppercase label, and an optional Miss-coloured count badge. |
| `.rule-list` | the numbered how-to-play list. Lime numerals in a circle, one line of copy each. |
| `.yday` | yesterday's answer: logo plate, mode + number, ticker, a link key. |
| `.flag` / `.bubble` | the two mascot props. Ink flag with Paper type; Card bubble with a `--cut` line and a tail. |
| `.modal` | a Card at `--r-2` over a blurred scrim. The only blur in the UI. |

---

## dos

1. **Name the value in `:root` before you use it.** A literal in a component is
   how a system becomes a pile of CSS — the next person has no way to know
   whether `#FB6F84` was Miss or a typo.
2. **Spend Lime once per view.** The page has one thing it wants you to do; Lime
   is how it says so, and a second Lime object makes the first one silent.
3. **Let the tier do the talking.** If an object is not pressable it gets the
   Calm treatment, no exceptions — a black die line on a static card is a
   promise the interface does not keep.
4. **Keep the press arithmetic closed.** `--lift` down, `--lift` off the shadow.
   Any other pairing reads as the object changing size, which no physical token
   does.
5. **Stagger everything that arrives in a group**, 60ms. Simultaneous entrance
   is the single clearest tell that motion was added at the end.
6. **Put digits in Figtree with `tabular-nums`.** A counter that changes width
   as it counts drags the layout with it, and the eye catches it every time.
7. **Draw the landscape, do not photograph it.** Inline SVG paints on the first
   frame and scales to any viewport; a raster hill is a request, a crop bug and
   a blurry edge at 2x.

## donts

1. **No blurred shadows on UI.** Zero-blur offset or a hairline border, nothing
   else. Blur belongs to the modal scrim and to Blur mode's coin, which is the
   puzzle.
2. **No pixel font, no pixel art, no sky gradient.** That was the old world.
   Jersey 15 and Luckiest Guy are removed from the page; adding either back
   reintroduces a second visual language that fights this one.
3. **No radius outside 12 / 20 / 999.** Especially not 24px or 28px on a card —
   it drags the whole page toward generic consumer-app and stops the 12px
   controls from looking deliberately smaller.
4. **Never `transition: all`, and never animate `width`/`height`/`top`/`left`.**
   Transform and opacity only; the tray, the tiles and the cards all animate on
   screens where a layout-triggering property would drop frames.
5. **Never `scale(0)` for an entrance.** Start at `scale(.94)` with
   `opacity: 0`. Nothing in a physical world appears out of nothing, and the
   snap from zero reads as a glitch rather than as an arrival.
6. **No sound before a gesture, and none on hover.** Autoplaying audio is
   blocked by the browser anyway, so code that assumes it works silently fails;
   and a hover sound fires on every pass of the pointer, which turns the kit
   into noise the player mutes and never turns back on.
7. **No scenery colour on a UI surface, and no UI neutral in the scenery.** The
   two palettes are deliberately disjoint; the moment a card borrows `--g-face`
   the landscape stops reading as a separate physical layer behind the cards.
