# Brag Plan: memedle

## What is this app?
A daily memecoin guessing game: one coin a day, six guesses, and every guess
hands back five clues (chain, mascot type, launch year, peak cap, cap now).

## The angle
Show one real game being solved, start to finish, in about 20 seconds, so the
rules explain themselves. No feature list. The three guesses and every tile
colour are real: they come from the game's own `grade()` against today's
answer, not made up for the video. The story is funny on its own: the player
guesses the most famous dog, then a closer dog, and the answer was the cat.

## Hook (first 2-3 seconds)
The "?" coin of the day drops onto the paper with a thud and the line
"Guess the memecoin." types out beside it. Question first; the board follows.

## Key moments (the middle)
- DOGE goes in. Five tiles turn over one at a time: mostly pink, but "Dog"
  and the $88B peak land yellow (close).
- WIF goes in. Solana, 2023 and the $4.8B peak land green. One guess away.
- POPCAT goes in. All five turn green on the music's strongest hit, and the
  row hops tile by tile.

## Outro / punchline
"It was the cat." Then the logo lockup (the character grid and the word
memedle), "One memecoin a day. Six guesses.", and the address.

## User flow worth showing
Type a coin name into the guess field -> press the arrow -> five clue tiles
turn over -> read the colours -> guess again -> all green.

## Tone
- Preset: default
- Creative direction: watch one real game get solved
- Interpretation: clean and playful, the board does the talking; captions are
  short and hold long enough to read; the only joke is the dog-dog-cat turn.

## Format: landscape - 1920x1080, plus two phone cuts
- `brag.mp4` 1920x1080, `brag-9x16.mp4` 1080x1920, `brag-4x5.mp4` 1080x1350.
- The vertical cut is its own layout (composition-9x16/): each row's logo and
  ticker sit on a line above its tiles, so the five tiles get the full width.
  Everything that carries meaning stays inside the central 1080x1350 band
  (y 285 to 1635), clear of a 9:16 player's own chrome, which is why the 4:5
  feed cut is a plain `crop=1080:1350:0:285` of the 9:16 render.
- Finishing, all three: poster baked into frame 0, then
  `volume=9dB,alimiter=limit=0.8:level=0` on the audio. The raw mix is
  -25.1 LUFS, too quiet for a phone speaker; this lands -16.8 LUFS at
  -1.6 dBTP (measured after AAC). +10 dB reached -15.9 but made the limiter
  take up to 12.6 dB off the thuds and the bell. `loudnorm` is not used: on
  an earlier BRAG mix it left +3.5 dBTP peaks after AAC.
## Duration: 23s

## Visual identity (from the project)
- Background: #FEFDF7 (Paper, sampled from the site's plate)
- Card: #FFFFFF with a #E4E2D9 hairline
- Text: #16161A (Ink)
- Accent: #BCF23F (Lime), only on the submit key and active mode
- Tile colours: hit #8BD418, near #FFC53D, miss #FB6F84
- Display font: Baloo 2 (800); body: Figtree
- Strongest visual element: the Classic board itself, the chunky clue tiles,
  and the 3x3 character grid lockup

## Share copy (draft)
One memecoin a day, six guesses, five clues per guess. Today it was the cat.

## Audio direction
- Role: warm upbeat bed with motion-matched accents
- Music: happy-beats-business-moves-vol-1 (120 BPM), bundled
- Music treatment: in at 0.30, fades out under the final logo
- Music cue guidance: bundled preset read. Beat grid every ~0.50s from 3.02s.
  Strong cues: 16.02s (lock the all-green win), 17.02s (the row hop),
  20.02s (the logo lockup lands).
- Audio-reactive treatment: subtle; the lime glow behind the winning row
  swells in on 16.02s and breathes on the beat grid (16.52, 17.52, 18.02).
  Timed to the cue file, not to live RMS. No waveform or equalizer visuals.
- SFX posture: moderate, motion-matched
- Audio-coupled moments: per-letter key ticks as each guess is typed; a click
  on the submit key; one soft card sound per tile as it turns (thinned where
  dense); a bell when the row goes all green; a soft thud for the hook coin.
- Restraint rule: no sound on captions appearing; nothing louder than the win.

## Storyboard

### Scene 1 - Hook - 2.8s
The mystery "?" coin (black ring, white face) drops in and settles. "Guess the
memecoin." types out beside it in Baloo 2.
Sequential/interaction: yes - the line types character by character.
Audio intent: a clean start that says "a game is about to happen".
Audio-coupled idea: soft thud when the coin lands; key ticks on the typing.
Music: bed fades in.
Transition mood: clean -> Scene 2

### Scene 2 - The board - 2.2s
The Classic board slides up: the "DAY #29 · CLASSIC" bar, the guess field
("Type a memecoin..."), six empty pips, and the column heads CHAIN TYPE YEAR
PEAK NOW. Caption: "Six guesses. Five clues each."
Sequential/interaction: column heads arrive left to right.
Audio intent: settle in.
Audio-coupled idea: none beyond a soft drop.
Transition mood: none - the board stays for the next three scenes.

### Scene 3 - Guess one: DOGE - 4.0s
"DOGE" types into the field, the arrow key presses down, a row arrives with the
Dogecoin logo, and five tiles turn over in turn:
Own chain (pink) · Dog (yellow) · 2013 ▲ (pink) · $88B ▼ (yellow) · $11B ▼ (pink).
Caption: "Yellow means close."
Sequential/interaction: typing, key press, five tile flips.
Audio intent: tactile, each tile a small beat.
Audio-coupled idea: key ticks, a click on submit, card sounds on the flips.
Transition mood: none

### Scene 4 - Guess two: WIF - 4.0s
"WIF" types in. Row two: Solana (green) · Dog (yellow) · 2023 (green) ·
$4.8B (green) · $136M ▼ (yellow). Caption: "Green is exact."
Sequential/interaction: same as scene 3.
Audio intent: momentum, closer.
Audio-coupled idea: same palette as scene 3.
Transition mood: none

### Scene 5 - Guess three: POPCAT - 4.2s (13.0-17.2)
"POPCAT" types in. Row three turns all green, landing on the 16.02s strong
cue, and the row hops tile by tile on 17.02s.
Sequential/interaction: yes.
Audio intent: the payoff.
Audio-coupled idea: bell on all-green.
Transition mood: soft -> Scene 6

### Scene 6 - Punchline + logo - 5.8s (17.2-23.0)
"It was the cat." holds, then the lockup lands on 20.02s: the 3x3 character
grid beside "memedle", with "One memecoin a day. Six guesses." and
memedle-weld.vercel.app under it.
Sequential/interaction: the grid's nine tiles pop in, then the word.
Audio intent: warm resolve, music fades under the logo.
Audio-coupled idea: one soft impact as the lockup lands.
Transition mood: end

**Music mood for this video:** upbeat
**Audio summary:** a bright bed under tactile typing and tile sounds, a bell on
the win, then a warm fade under the logo.
