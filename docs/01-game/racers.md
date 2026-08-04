---
status: draft
purpose: The launch racer roster — who runs in the sea races.
depends-on: game-modes.md, ../03-cosmetics/content/data/racers.json
---

# Racers

Fourteen persistent racers; 6–8 per field (`game-modes.md`). Personality
is the product: players back characters, follow form, and hold grudges.
Form parameters (base weight, volatility, drift) live in
`../03-cosmetics/content/data/racers.json` — the hidden values never
reach the client; players see only derived odds and form history.

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

- **The spread is deliberate.** Two reliable anchors (Sure Thing, Fine
  Print) make favourites bettable; three chaos agents (Bubbles, Long
  Shot, Moonjelly) make long odds dramatic; the cyclical racers (Second
  Wind, Riptide) are what makes *form-watching* pay attention over
  weeks. Every archetype in the odds-scaled Pearl formula has a face.
- **Names follow the catalogue's naming rules**: no definite articles —
  "The …" is reserved for Mythics (`../03-cosmetics/content/naming-conventions.md`).
- **Sea Biscuit is the mascot bet.** Lowest weight in the roster; a Sea
  Biscuit win should be a site-wide event worth a journal entry of its
  own.
