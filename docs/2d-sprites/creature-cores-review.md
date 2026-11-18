# Creature core character sheets: review notes

Source: Déan's `corecup-nine-creature-core-character-sheets.zip` (14 Nov 2026): nine 1122x1402 concept
sheets (Phoenix, Kraken, Kitsune, Golem, Anansi, Fenrir, Qilin, Kelpie, Cerberus), a contact sheet,
`CORE_ABILITY_SPEC.md` and `core_abilities.json`. The pack says the sheets are visual mockups and that the
written spec beats any text painted into the images. Not imported into the repo yet; nothing here changes
code or rules.

## What the codebase has today

- The rules engine stores each robot's `core` as a name only (`src/data/clubs.ts`, `src/engine/setup.ts`).
  No ability, tier or core effect is implemented, so there is nothing to reconcile in code yet.
- The Sprite Lab draws a generic core: a gem at Spark, a spark ring at Surge, flame wings at Ascended, in a
  single per-player colour (`coreColour` in the atlas JSON). Gear slots are independent of core tier.

## Where the sheets fit

| Topic | Fit |
| --- | --- |
| Anime look, robot tells (ear comms, cheek mark, joint modules, chest emblem) | Matches the sprite brief; good reference for the Round 1 character sheet. |
| Kitsune sheet | Female, red ponytail, Emberforge kit, midfielder: the same person as playmaker #10, now named Kitsune (2026-11-18). |
| Phoenix and Golem sheets | Match the sprite brief's #9 striker (Kai Rivet look) and silver-haired #1 keeper. |
| Spirit creatures and FX studies | Direct reference for the Ascended aura layer (`aura` in the layer stack), replacing the generic wings with one creature per core. |
| "Gear progression" panels | Show chest, shoulder, knee and boot changes per **core tier**. Our system keeps six gear slots (Mk I-III) separate from core tier. Recommend using these panels as the look of the **core** slot only. |
| Activation sequences (focus, ignite, execute, result) | Map onto sprite action events: `ability_focus`, `ability_release`, `ability_resolve`, alongside the existing `foot_contact` and `ball_release`. |

## Conflicts and open questions

1. **Club allocation.** `src/data/clubs.ts` (from the design doc) gives Emberforge: Golem, Qilin, Anansi,
   Fenrir, Phoenix; Tidewell: Black Tortoise, Kraken, **Kitsune**, Kelpie, Minotaur. The sheets dress all
   nine in Emberforge kit, Kitsune included. Cerberus is in neither club. Black Tortoise and Minotaur have
   no sheet. The pack says club assignment is not locked.
2. **Surge mechanics** are TBD for the original eight (only Cerberus has a proposed Surge: +3 dice). Several
   sheets paint invented Surge rules (Kitsune's "two decoys", for example); those stay ideas only.
3. **Cerberus balance**, and its no-rebound save against Phoenix's Ascended rebound, is unresolved.
4. **Core colour per player** fits the sprite brief (glow colour is per player); the sheets give each
   core its own palette (Kitsune pink-orange, Phoenix orange-gold, Anansi violet...).

## Effect on the Round 2 plan (proposal, pending Round 1 approval)

- If #10 is Kitsune: switch her core colour and Ascended aura to Kitsune pink-orange foxfire.
- Make the ability VFX spike the pack suggests on **#10 with Kitsune's Fox Mirage** (decoy hex marker and
  ghost sprite at Spark; two decoys and a swap streak at Ascended). It reuses the sprite and pitch from
  Round 1. A Cerberus save spike would need keeper art that does not exist yet.
- Keep ability FX as rendering only, driven by engine events once abilities exist in the rules engine.
