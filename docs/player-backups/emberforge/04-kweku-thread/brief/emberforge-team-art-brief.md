# Core Cup: art brief for the rest of Emberforge, plus Kitsune's remaining moves

Kitsune #10's run is approved in all six directions. This brief covers what comes next:

- **Part A:** the other four Emberforge players.
- **Part B:** Kitsune's idle, shot and Fox Mirage.

Work on one thing at a time. Each step is tested in the game, and Déan approves it before the next one starts.

## How everything is judged

Each step is judged in the game, at the normal match camera and normal speed, with the player in the centre and near the edges of the screen.

**Small things nobody notices in play are fine:**
- a little foot slide
- an imperfect alternating leg

**These get sent back:**
- visible skipping or hopping
- body or head jolts
- size changes
- cut-off body parts
- a puppet or cut-out look
- halos or stray pixels
- the kit not matching
- facing the wrong way

**Close-ups and ability moments get a higher bar**, because players watch them up close.

## Rules for every delivery (these worked for Kitsune)

1. **One PNG per frame, on a truly transparent background.**
   - Never cut frames from a board or contact sheet.
   - A frame sheet is fine only when the poses don't overlap and every pose sits fully inside its own cell.
2. **Canvas and placement.**
   - The canvas is **320 x 384**, with the feet on **y = 330** and the middle of the hips at **x = 160** in every frame.
   - Hollis's canvas is larger; see Part A.
3. **Draw the whole figure in every frame.** Hair, hands, feet and trailing legs must all fit inside the canvas, with some space to spare.
4. **Keep the same kit in every direction**, matching the approved Kitsune SE run:
   - maroon jersey with gold trim
   - **black shorts**
   - **gold shoulder pads**
   - maroon and gold socks
   - the player's number readable on the back views
5. **Label directions as they look on screen.**
   - **NE** runs up and to the right, away from the camera.
   - **NW** runs up and to the left.
   - SE, E, SW and W follow the same pattern.
   - Draw each direction separately. Don't mirror.
6. **Don't bake in effects:** no shadow, ground ring, glow or labels. Effects (fire, auras, foxfire) go on separate layers, so the game can time them.
7. **File names:** `cc_<player>_<action>_<direction>_<nn>.png`, for example `cc_hollis_run_se_00.png`.
8. **Include the editable source file.**
9. **Include a short notes.json** giving:
   - the stride: how far the player travels over one run loop, in pixels
   - the contact frame for a shot
   - the release frame for an ability

## Part A: the other four Emberforge players

Use the creature-core character sheets as the design reference for each player's look, spirit motif and colours. They are in `corecup-nine-creature-core-character-sheets.zip`.

The players are **anime athletes with small robot tells**: ear housing, cheek seam, elbow and knee caps, neck ring and the chest core. They are not bulky machines.

| Player | Role | Core and ability | Height vs Kitsune | Build |
| --- | --- | --- | --- | --- |
| **Hollis Stonewright** | Keeper | Golem: Stone Wall | **About 1.15x** (about 340 px) | Broad and solid; should clearly read as the biggest |
| **Lan Shuyi** | Defender | Qilin: Guardian Aura | About 1.05x | Sturdy and balanced |
| **Kweku Thread** | Midfielder | Anansi: Web Pass | About 1.0x | Lean, long limbs |
| **Iggy Vale** | Striker | Phoenix: Flame Shot | About 0.97x | Light and quick |

The heights are a suggestion, so Déan can change them. Kitsune is about 295 px from soles to the top of her head.

- **Hollis's canvas:** **384 x 448**, with the feet on **y = 394** and the hips at **x = 192**. The game draws every player at the same pixel scale, so a bigger drawing on a bigger canvas reads bigger on the pitch.
- **The others:** they use Kitsune's 320 x 384 canvas.

**Order for each player.** Finish one player before starting the next.

1. **Idle (4 frames) and run (8 frames), SE only.** Stop here for the game test and Déan's OK. This catches problems before all six directions are drawn.
2. **Idle and run in the other five directions:** E, W, SW, NE, NW.
3. **Role moves:**
   - **Hollis, keeper:**
     - a ready stance (4 frames, looped)
     - a **dive to each side** (6 frames each: load, launch, full stretch, **save/contact**, land, recover)
     - a **catch and hold** (4 frames)
     - Draw these facing E (out from the goal) first.
   - **Iggy:** a shot (7 frames, as in Part B).
   - **Lan Shuyi:** a tackle (6 frames: approach, plant, **contact**, follow-through x2, recover).
   - **Kweku:** a pass (6 frames: plant, swing, **contact**, follow-through x2, recover).
4. **Their ability.** Draw only Spark and Ascended. Surge isn't approved for any core yet.

Suggested order of players: **Hollis first** (the size and keeper moves are the most different), then Iggy, Lan Shuyi and Kweku.

## Part B: Kitsune's remaining moves

Frame counts follow the Round 1 spec. Keep her exact look, scale and kit from the approved run.

1. **Idle: 4 frames, all six directions.**
   - A ready stance with gentle breathing.
   - She should match the run's size and hip position, so idle-to-run doesn't pop.
   - Do SE first, then the other five.
2. **Shot: 7 frames** (run-up, plant, wind-up, **contact**, follow-through x2, recover).
   - Do E first, since that is towards the opponent's goal, then the other five.
   - Mark the contact frame in notes.json.
   - Also draw two short transitions, 2 frames each:
     - run to shot
     - run to idle
3. **Fox Mirage: 10 frames** (focus, ignite, cast, **release**, recover).
   - SE first.
   - **Her look while the ability is active:** the **fox ears and the red face mark** appear from "ignite" and stay until "recover" ends. This is Déan's call.
   - **Foxfire:** pink-orange, on a separate layer, not painted onto her.
   - **Decoys:** the game builds the decoy ghosts from her own sprite, so don't draw separate decoy figures.
   - **Spark** (one decoy hex) and **Ascended** (two decoys, then she swaps places with one) use the same body animation. Ascended adds the foxfire tails behind her, also on a separate layer.
   - **Surge:** not approved, so don't draw it.
   - This is a highlight moment, so it gets the higher bar: clean at close zoom, not just at match scale.

## What comes back after each step

- A short clip at the normal match camera and speed.
- Only the issues you can see in play.
- A verdict: **approve**, **one targeted fix**, or **hold**.
