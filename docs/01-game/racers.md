---
status: agreed
purpose: The launch racer roster — who runs in the sea races.
depends-on: game-modes.md, ../03-cosmetics/content/data/racers.json, ../decisions/0019-pass-3-on-the-game-specs.md
---

# Racers

## What this is

The launch roster, and the character each racer is meant to have.
Personality is the product: players back characters, follow form, and
hold grudges. Roster and field sizes are in
`../02-economy/currency-model.md`.

Form parameters — base weight, volatility, drift — live in
`../03-cosmetics/content/data/racers.json`, which is the authority. The
hidden values never reach the client; players see only derived odds and
form history (`../04-technical/data-model.md`).

| Racer | Species | Character |
|---|---|---|
| **Sure Thing** | Sea turtle | The favourite. Calm, huge, metronomic — beats you slowly |
| **Riptide** | Marlin | Raw speed, zero temperament. Best and worst racer in the sea, some weeks both |
| **Photo Finish** | Swordfish | Every race she runs ends close. Nobody knows how |
| **Madame Ink** | Octopus | Tactical — reads the field, takes the inside line, never panics |
| **Second Wind** | Manta ray | Slow starts, monstrous finishes; form comes in long cycles |
| **Undertow** | Moray eel | Always from behind. Unsettling to bet on, worse to bet against |
| **Commodore** | Lobster | The dignified veteran; hasn't changed pace in years |
| **Fine Print** | Anglerfish | Methodical, unglamorous, exactly where the terms said she'd be |
| **Knots** | Seahorse | Tiny, furious, utterly consistent — king of the mid-field |
| **Moonjelly** | Moon jellyfish | Drifts. Sometimes across the line first. May not know it's a race |
| **Bubbles** | Pufferfish | Crowd favourite. Panics, inflates, occasionally wins mid-panic |
| **Barnacle Bill** | Crab | Old, encrusted, sideways. Finishes eventually |
| **Long Shot** | Hermit crab | Almost never wins; the three times he did are why the stands exist |
| **Sea Biscuit** | Sea cucumber | A sea cucumber. Racing. Believe |

## Design notes

Three archetypes, each defined by a **parameter in the data**, so the
prose and `racers.json` cannot drift apart:

- **Anchors — lowest volatility.** Sure Thing and Fine Print. Predictable
  enough that backing a favourite feels like a decision rather than a
  coin-flip. Sure Thing also carries the **highest base weight**: the
  roster's most legible racer should be the one the odds board actually
  makes favourite.
- **Chaos — highest volatility.** Bubbles, Long Shot and Riptide. Long
  odds that occasionally land, which is what makes the stands loud.
  Riptide belongs here on the data, not just in flavour — it is the third
  most volatile racer and the reason "best and worst in the sea" reads
  true.
- **Cyclical — highest drift.** Moonjelly and Second Wind. Their hidden
  weights move fastest between races, which is precisely what rewards
  *form-watching* over weeks rather than within a session. Riptide ranks
  third on drift as well as third on volatility, and belongs to both
  archetypes on purpose: unpredictable within a race *and* between them.

Every archetype in the odds-scaled Pearl formula therefore has a face,
and a column in the data that decides membership.

- **Names follow the catalogue's naming rules**: no definite articles —
  "The …" is reserved for Mythics (`../03-cosmetics/content/naming-conventions.md`).
- **Sea Biscuit is the mascot bet.** Lowest weight in the roster; a Sea
  Biscuit win should be a site-wide event worth a journal entry of its
  own.

## Rules

1. **The data is the authority on form.** Prose here describes what the
   parameters already say; if the two disagree, the prose is the bug.
   Pass 3 found exactly that — Sure Thing was called "the favourite"
   while Riptide carried the higher weight (`decisions/0019`).
2. **Hidden parameters never leave the server.** Odds and form are
   derived; weights are not exposed
   (`../04-technical/data-model.md`, rule 8).
3. **The roster is stable.** Racers persist across races and weeks —
   the whole point of form is that it accumulates against a fixed cast.

## What this deliberately does not do

- No per-race commentary, rivalries or storylines — flavour that would
  need writing per race rather than per racer.
- No racer retirement or roster rotation in v1; the cast is fixed.
- No breeding, upgrades or player-owned racers. Racers are the house's.

## Open questions

None.

## Numbers

Roster size and field size live in `../02-economy/currency-model.md`.
Per-racer form parameters live in
`../03-cosmetics/content/data/racers.json`.
