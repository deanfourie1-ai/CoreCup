# Kweku Thread: art brief

Kweku Thread is the Emberforge midfielder, with the **Anansi core** and the **Web Pass** ability. He has no in-game art yet. This brief lists everything that needs drawing for him, in order.

**Send each step as soon as it's done.** Claude tests it in the game at the normal match camera and replies with **approve**, **one fix** or **hold**. Wait for Déan's OK before starting the next step.

## Who he is

- **Look:** the main reference is `kweku-full-body-reference.png`, a full-body drawing facing SW. Match its face, hair, headband, kit details and style. Use his board, `boards-v1/kweku-thread-board.png`, only for the angles the drawing doesn't show (side, back).
- **Don't flip the reference to make SE.** Draw SE yourself. Flipping moves the sleeve spider to the other arm.
- **Build:** lean, with long limbs. He's an anime athlete with small robot details (ear cuffs, gold bracer, chest core), not a bulky machine.
- **Hair:** black locs (#252020) with gold cuffs, tied up high with a maroon-and-gold headband. Some locs fall around his face.
- **Face:** gold marks on his cheek, no beard, small gold stud earring (no hoops).
- **Skin:** warm brown (#713B28).
- **Height:** about **305 px** from soles to the top of his hair, on the 320 x 384 canvas. That's a little taller than Kitsune (300) and Lan (298), and shorter than Hollis (337).
- **Kit:** use the locked Emberforge kit from `team-kit.json`, not the board's slightly different swatches:
  - maroon jersey #66202E with gold trim #D29445
  - charcoal shorts #2A2428
  - maroon socks #742536 with **two thin gold bands**
  - gold shoulder pads, knee guards and wrist cuffs
  - dark fingerless gloves #252020
  - amber chest core #FF9E24
- **Jersey details:** a gold spider on his right sleeve, a belt, and longer tails at the sides. He has chunky gold bracers on both forearms.

## Rules for every frame

These are the same rules that worked for Hollis and Lan.

1. **Each frame is its own clean PNG on a truly transparent background.** Never cut frames from a board, contact sheet or small reference sheet.
2. **Canvas:** **320 x 384**, or larger with the same proportions (for example 1145 x 1374).
   - **Feet on y = 330.**
   - **Hips centred on x = 160** in every frame.
3. **Same size in every frame and every facing.** A crouched or mid-stride pose isn't drawn smaller.
4. **Draw the whole figure.** Hair, hands and trailing feet stay inside the canvas, with space to spare.
5. **Draw every facing yourself.** Never mirror one facing to make another: mirroring moves the sleeve spider and his other one-sided details.
6. **Same kit and style in every facing:** same line weight, head size, colours and outline. A turn must not look like a different character.
7. **Leave out:** shadow, glow, ground, labels, background, and any pale or white fringe.
8. **Style:** "Saturday Anime" two-tone cel shading, bold ink lines, light from the upper left. Match the approved sprites in `corecup-in-game-sprites.zip`.

## Facings

The facings are named by how they look on screen:

| Facing | Direction on screen |
| --- | --- |
| **SE** | down-right, front three-quarter |
| **E** | right, side profile |
| **W** | left, side profile |
| **SW** | down-left, front three-quarter |
| **NE** | up-right, back three-quarter |
| **NW** | up-left, back three-quarter |

## What to draw, in order

| Step | What | Frames | Notes |
| --- | --- | --- | --- |
| 1 | **SE idle + SE run** | 4 + 8 | Use the guide `guides/kweku-se-guide.png`; its blue ghost shows angle and size only. **Stop here for the game test.** |
| 2 | **E idle + run** | 4 + 8 | |
| 3 | **W idle + run** | 4 + 8 | |
| 4 | **SW idle + run** | 4 + 8 | |
| 5 | **NE idle + run** | 4 + 8 | |
| 6 | **NW idle + run** | 4 + 8 | |
| 7 | **Pass, facing E first** | 6 | Plant, swing, **contact**, follow-through x2, recover. The other facings come after Déan approves E. |
| 8 | **Web Pass ability, SE first** | 8 to 12 | Body animation only. See below. |

**Idle:** 4 frames of a ready stance, with a gentle breathing loop. It plays at 6 fps.

**Run:** 8 frames, drawn on the spot (the game moves him). It plays at 10 fps.
- The legs must alternate: contact, pass, then the other leg. Each leg leads once per loop.
- The hips bob down and up **twice per loop**, evenly.
- No hops, leaps or head jolts.

**Web Pass:** the purple web (#742399) is drawn by the game as an effect, so don't paint it onto him.
- Draw only the body: a reaching, flowing pass, with the release clearly marked.
- If you want to supply web strands, put them on a separate transparent layer.
- **Spark** (a pass that can't be intercepted) and **Ascended** (it also curves around one robot) use the same body animation.
- **Don't draw Surge.** It isn't approved.

## File names and delivery

- **Names:** `cc_kweku_<idle|run|pass|ability>_<facing>_<nn>.png`, with frames numbered from 00. For example: `cc_kweku_run_se_03.png`.
- **With each delivery, include:**
  - the editable source file
  - a short `notes.json` with the run stride (how far he travels over one loop, if you have a view), the pass **contact** frame and the ability **release** frame

## How it's judged

Each step is judged **in the game, at the normal match camera and normal speed**, with Kweku in the centre and near the screen edges.

**Fine:** small details nobody can see at match size, and a little foot slide.

**Sent back:**
- visible hopping or skipping
- a frozen stride
- a size pop between frames or facings
- body or head jolts
- cut-off hair or limbs
- halos or stray pixels
- a kit that doesn't match
- facing the wrong way
- a frame that looks like a different character

The pass and ability get a higher bar, because players see them up close.
