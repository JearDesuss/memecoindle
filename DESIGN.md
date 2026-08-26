# Memedle — design contract

> Read this before changing `style.css`. Any literal hex or px inside a component
> rule is a bug: the value belongs in `:root` or it does not exist.

## north_star

**A sheet of die-cut vinyl stickers pressed flat onto a sunlit arcade cabinet.**

Noon light, no dusk. Every box on this page is a sticker: one die width all the way
round, one flat ink, and it lifts off the sheet by a fixed amount when it wants to be
pressed. Stickers do not have bevels, they do not glow, and they do not each come in a
different colour because the printer was bored.

Everything below falls out of that sentence. When a decision is contested, ask what a
sticker would do.

## theme

light · single theme · `body.cb` swaps only the two status hues for colourblind play

## industry

Consumer daily puzzle game (Wordle-descended) for a crypto-native audience. Read in 30
seconds on a phone, shared as a grid.

## description

One screen. A mode rail on the left, the live board in the middle, yesterday and the
rules on the right, a dark backing card at the bottom for everything else. It sits on
an illustrated overworld that is scenery, never chrome — the UI never borrows the
illustration's colours and the illustration never borrows the UI's outline.

The whole system is one sticker component with three roles and three sizes. If a new
element needs a look the sticker cannot give it, the answer is almost always that the
element should not exist.

## colors

The neutral ramp is named. Hex-only palettes drift.

| hex | name | group | role — where it is allowed to appear |
|---|---|---|---|
| `#2B2C4B` | Ink | neutral | every die-cut outline, every lift shadow, body text. The only outline colour on the page. |
| `#55567A` | Slate | neutral | secondary text: blurbs, captions, column heads, `.fine` |
| `#8B8CAB` | Fog | neutral | tertiary: placeholder, quote mark, unplayed marks |
| `#B9BAD2` | Ash | neutral | inert fills — the unused guess pip — and tertiary text on the Night card, where Fog fails contrast. |
| `#E5D08A` | Rind | neutral | hairline *inside* a sticker: recessed rows, quiet borders |
| `#F6E9B8` | Card | neutral | recessed surface inside a sticker: panel bars, quiet buttons |
| `#FDF6DA` | Paper | neutral | the sticker face. The default surface of the whole system. |
| `#FFFDF2` | Snow | neutral | the one lit surface: text input, hover state |
| `#2F3358` | Night | neutral | the single dark backing card (`.more`) and the unsolved coin |
| `#FFD93B` | **Gold** | **accent** | **the one live action in a view, and the wordmark. Nothing else.** |
| `#3FA84F` | Bull | status | correct — guess tile, win flag, distribution bar, win verdict |
| `#F5B321` | Amber | status | close — guess tile, revealed clue chip |
| `#E04B42` | Miss | status | wrong — guess tile, loss flag, loss verdict, danger button |

**Accent scarcity is the whole trick.** Gold is the only chromatic *control* fill on
the page. One per view: the submit button, or the active mode card, or the primary
button in a modal — never two at once, never as decoration. Purple and pink were cut
outright; they were four sibling buttons wearing four unrelated hues, which is the
loudest tell of a UI nobody planned.

Amber sits deliberately clear of Gold (`#F5B321` vs `#FFD93B`). They collided before,
and an accent indistinguishable from a status colour is not an accent.

Status colours are allowed on tiles, flags, bars and verdicts. **A status colour may
never fill a button.** The one exception is `.btn-danger`, which is a status *as* an
action and is confined to the settings danger zone.

## surfaces

| hex | name | level | purpose |
|---|---|---|---|
| illustration | Overworld | 0 | the fixed background image. Scenery. Never a UI surface. |
| `#FDF6DA` Paper | Sheet | 1 | every panel, modal, mode card, and pressable sticker |
| `#F6E9B8` Card | Inset | 2 | a recess *within* level 1: panel bars, quiet buttons, chips |
| `#2F3358` Night | Backing | 3 | one element only — the footer card. Its contents invert to Paper. |

## typography

Three families, three jobs, no overlap. A family with two jobs is a family too many.

| family | substitute | weights | role |
|---|---|---|---|
| Luckiest Guy | Arial Black, system-ui | 400 | **display only** — the SVG wordmark and the reveal verdict. Banned from UI and body copy. |
| Jersey 15 | ui-monospace, monospace | 400 | **letter-only uppercase labels** — mode names, button faces, section and modal headings |
| Baloo 2 | Segoe UI, system-ui | 600 / 800 | **everything else** — all body copy, and every label that can contain a digit |

**The digit rule is load-bearing.** Jersey 15's `6` has a nearly closed counter, so
`0/6` reads as `0/8`. Any string that may contain a numeral uses Baloo 2 at 800, even
when its neighbours are Jersey 15. Silkscreen (`M` reads as `H`) and Pixelify (`C`
reads as `O`) were both rejected on the same test.

`font-feature-settings: "tnum" 1` on every numeral run — counters, countdowns and
badges must not reflow as they tick.

## type_scale

| role | family | size | weight | line-height | tracking |
|---|---|---|---|---|---|
| wordmark | Luckiest Guy | SVG, fluid | 400 | — | −0.01em |
| verdict | Luckiest Guy | 25px | 400 | 1.3 | −0.01em |
| label-lg | Jersey 15 | 20px | 400 | 1.05 | +0.03em |
| label-md | Jersey 15 | 15px | 400 | 1.1 | +0.04em |
| label-sm | Baloo 2 | 13px | 800 | 1.2 | +0.05em |
| body | Baloo 2 | 15px | 600 | 1.5 | 0 |
| body-sm | Baloo 2 | 13px | 600 | 1.45 | 0 |
| num | Baloo 2 | 23px | 800 | 1 | 0 |

White display text over the illustration carries an 8-way 2px Ink stroke
(`--stroke`), never a soft shadow. It is a sprite outline, not a glow, and it is the
only text effect in the system.

## spacing

    base            4px — every gap is a multiple, no exceptions
    elementGap      8px
    cardPadding     12px
    sectionGap      24px
    pageMaxWidth    1180px

    radius
      control       6px    buttons, inputs, tiles, chips, logos, icons
      card          12px   panels, modals, the backing card
      pill          999px  badges, streak, clue chips, progress tracks — never a button

**Three radii. That is the whole list.** Eleven different values were in use; the
drift is why the page read as assembled rather than designed. `50%` is not a fourth
radius — it is reserved for things that are round *in the fiction*: a coin, a guess
pip. No control is ever a circle.

    cut             4px  the die-cut on anything that is its own sticker
    cut-in          3px  a mark printed inside a sticker — tile, chip, logo, pip

    lift            3px  small controls
    lift-card       5px  panels, modals, mode cards, the backing card

## elevation

**One philosophy: a sticker lifts off the sheet. Hard offset, zero blur, Ink only.**

`box-shadow: 0 var(--lift) 0 var(--ink)`. Pressing translates the element down by
exactly the lift and zeroes the shadow, so the sticker meets the sheet. Nothing else.

No blurred `rgba()` drop shadows anywhere in the UI — 29 of them were layered *on top
of* the hard shadows, which is three elevation systems fighting inside one rule. The
4px Ink outline is what separates a panel from the background; a soft shadow beneath
it does nothing except make it look like a stock template. Blur survives in exactly
two places, both illustration: the crowd's contact shadow and the modal backdrop
scrim.

No inner shadows. No bevels. No `to bottom` gradient on any control — 25 of those were
the "shiny plastic" that made every button look extruded from the same generator.
Fills are flat. Gradients exist only in the scenery (sky, grass, dirt).

## layout

Three columns at `1fr 1.65fr 1fr` with an 8px gutter, collapsing to `1fr 1.5fr` at
1040px (right rail wraps full-width) and to a single column at 760px, where the mode
rail becomes a 3-up strip of name-and-flag chips.

Vertical rhythm inside a panel is 12px; between panels, 12px; between sections, 24px.
The page is centred at 1180px and the illustration bleeds past it on both sides — the
content column must never touch the viewport edge, because the crowd needs shoulder
room to read as a world rather than a border.

The footer backing card is deliberately narrower (620px) than the board above it. It
is the only element that steps in, and that step is what signals the game is over.

## imagery

- **Coin logos are the subject.** Always in a `cut-in` Ink frame at `control` radius,
  `object-fit: cover`, never floating and never circular. A cropped square reads as an
  asset; a circle reads as an avatar.
- **The overworld is scenery.** One fixed background image, `cover`, anchored bottom.
  It never scrolls independently, never sits above the content, and never contributes
  a colour to a token.
- **Never derive UI art from token icons.** A token icon is a character crammed inside
  a coloured disc, so background-removal returns a disc. The crowd is hand-picked
  illustration; see `docs/ARCHITECTURE.md`.
- Logos ship at up to 320px so Blur mode out-resolves its frame at 2x.

## components

| name | role | description |
|---|---|---|
| `.btn` | the one button | Paper fill, `cut` Ink, `control` radius, `lift`. Jersey 15 uppercase. Everything pressable is this, at one of three sizes. |
| `.btn-primary` | the live action | The `.btn`, filled Gold. **One per view.** |
| `.btn-quiet` | peer options | The `.btn` with a Rind border and no lift — for sets of equals (stat tabs, archive rows) where nothing is primary. |
| `.btn-danger` | destructive | The `.btn`, filled Miss. Danger zone only. |
| `.ico-btn` | square icon | The `.btn` at 42px square. Topbar and social row use the identical element — same size, same radius, same lift. |
| `.pill` | inline nav | The `.btn`, for the footer's "keep playing" row. All peers, so all Paper — pill radius on a control reads as a tag cloud. |
| `.panel` | a sticker | Paper, `cut` Ink, `card` radius, `lift-card`. Optional `.panel-bar` header in Card with a `cut` Ink rule beneath. One bar treatment — colour-coded bars were decoration carrying no information. |
| `.mode-card` | rail entry | A pressable `.panel`: logo, name, blurb, flag, progress track. The active one is **pressed flat** into the sheet with a Gold spine down its left edge — selection is state, so it borrows the system's physics rather than a second Gold fill. |
| `.tile` | graded answer | `cut-in` Ink, `control` radius, flat status fill. The only place status colour is large. |
| `.chip` | inline fact | `pill` radius, `cut-in`, Card or Amber fill. Never pressable. |
| `.social-btn` | outbound link | The `.btn` at 42px tall with a 17px glyph. The X mark carries no word beside it — it *is* the wordmark; DexScreener's candlestick is not self-identifying, so it keeps one. A missing URL renders it Card-filled with a quiet `soon` tag. |
| `.more` | backing card | The one Night surface. Same cut, radius and lift as everything else — it is a sticker that happens to be dark, not a foreign object. Ink and Night are three shades apart, so this card re-points `--shadow` at a deeper value or every lift inside it vanishes. |

## dos

- **Write the north-star sentence before the CSS.** Generic UI is what happens when
  nobody did. Every rule here is derivable from the sticker sentence; if a new rule is
  not, it is probably wrong.
- **Spend the accent once per view.** If two things are Gold, neither is the action.
  Demote one to Paper and the eye lands where it should.
- **Flat fills only.** A `to bottom` gradient on a control is the fastest way to make a
  hand-built page look machine-generated, because that is what every generator emits.
- **Match siblings exactly.** Four buttons in a row are four peers: same fill, same
  size, same weight. Differentiating them by hue invents a hierarchy that does not
  exist and destroys the one that does.
- **Reach for the ramp, not a new hex.** If Slate is too dark for a caption, the
  caption is at the wrong size — the ramp has nine stops and they are enough.
- **Keep the digit rule.** Jersey 15 anywhere a numeral can appear will eventually ship
  `0/8` to a player. Baloo 2 800 for those, always.
- **Ink means spent.** A used guess pip, the rail's progress fill and the guess
  counter are all Ink — they report consumption. Spending Gold on them would
  mean the accent no longer points at the live control, and spending Bull would
  mean green no longer only means correct.
- **Let the outline do the separating.** 4px of Ink against sky is more contrast than
  any shadow will buy, and it costs nothing on a busy background.

## donts

- **No emoji as UI furniture.** 🏆 on a section header, ✦ flanking a title, 🎮 in a
  panel bar — pure filler, rendered at a different weight than the pixel art beside
  it, and a sparkle-flanked heading is the most recognisable AI-slop tell on the web.
  The one sanctioned exception is 🔥 on the streak pill, where the emoji is the
  established convention for the thing itself.
- **No blurred shadow in the UI.** Ever. It is a third elevation system and it makes a
  flat world look like a template. Blur is for scenery and the modal scrim only.
- **No fourth radius.** A one-off 18px or 24px corner is how a system becomes eleven
  radii; large radii additionally read as consumer-app and break against the 6px
  controls.
- **No border width outside `cut`/`cut-in`.** Five ad-hoc widths made identical
  components look subtly mismatched at every zoom level.
- **No status colour on a button.** Green means correct, not clickable. Overloading it
  costs the player the one signal the game actually runs on.
- **No second job for a font.** `--font-num` and `--font-ui` both resolved to Baloo 2
  — a distinction the code claimed and the design never had. One family, one job.
- **No advisory or hedging copy.** "Spend them wisely", "the majors make good openers",
  "think like a degen" are an assistant talking, not a game. State the rule, or say
  nothing. Same for "unhinged" and "flavours", which now read as generated on sight.
- **Never regress to the dark "degen terminal" look.** It was tried and cut. The world
  is noon, not midnight, and the whole palette is built on Paper.
