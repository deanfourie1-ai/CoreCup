# Sprite delivery spec (Round 2): #10 Kitsune

Status: approved direction from Round 1 (14 Nov 2026). Follow this so the frames work in the game without
rework. Anything marked *flexible* can change if it makes the art better, as long as it is done the same
way in every frame.

## 1. Canvas and placement

- Every frame is **256 x 352 px**, transparent PNG (RGBA, straight alpha, no matte colour).
- **Foot pivot at (128, 341)**: the point on the ground midway under the character. The standing
  character's soles rest on y = 341. Jumping or kicking frames lift off it but stay registered to it.
- Character height about **300 px** from the soles to the top of the hair, the same in every frame and view.
  At game size she is about 64 px tall, so keep shapes bold and readable at that size.
- Nothing else on the canvas: no ground shadow, background, text, guide lines or labels. The game draws the
  shadow, ring and ball.
- Clean edges: no pale fringe or halo. Paint over a mid-grey or the pitch green while working, never white.
- Shared light from the upper left. No camera drift: the same scale and perspective in every frame.

## 2. The six facings

The pitch is pointy-topped hexes, so players move and face in six directions. The camera looks north,
down at about 39 degrees.

| Code | Facing on screen | What we see |
| --- | --- | --- |
| `e` | right | side profile, facing right |
| `se` | down-right, towards camera | front three-quarter, turned right |
| `sw` | down-left, towards camera | front three-quarter, turned left |
| `w` | left | side profile, facing left |
| `nw` | up-left, away | back three-quarter, turned left |
| `ne` | up-right, away | back three-quarter, turned right |

Draw all six for the body: mirroring reverses the "10" and one-sided details. The number is on the
shorts at the front and on the shirt at the back.

## 3. Actions and frame counts

Timing is "on twos" anime style; the fps below is the playback rate.

| Action | Code | Frames | fps | Loops | Must mark |
| --- | --- | --- | --- | --- | --- |
| Idle (ready stance, breathing) | `idle` | 4 | 6 | yes | |
| Run | `run` | 8 (two strides) | 10 | yes | contact frames; stride length |
| Power shot | `shot` | 7 (run-up, plant, wind-up, **contact**, follow-through x2, recover) | 12 | no | contact frame |
| Fox Mirage (ability) | `ability` | 10 (focus, ignite, cast, release, recover) | 12 | no | release frame |
| Run to shot transition | `run_to_shot` | 2 | 12 | no | |
| Stop to idle transition | `run_to_idle` | 2 | 12 | no | |

Run cycle rules:
- Draw the run "on the spot", like a treadmill. The game moves the sprite forward at ground speed, so a
  foot on the ground must slide **backwards** in the image by the same amount each frame:
  `stride_px / 8` px per frame (about 47 px at 380) along the ground. Seen through the camera that is 47 px
  sideways for `e`/`w` and 24 px sideways for the four diagonal facings. Keep planted feet on the foot
  line; the up/down part of a diagonal stride does not fit the canvas and is left to the game. Each foot
  is on the ground for about 3 of the 8 frames. `tools/sprites/make_pose_guides.py` draws guide poses with
  this timing.
- Same scale in every frame: a crouched or airborne pose must not be drawn smaller.
- Tell us the **stride length in pixels**: how far one foot travels along the ground in one full cycle of
  two strides. Aim for a cycle of about 380 px (one hex is about 265 px wide at frame scale).

## 4. Layers (paper-doll gear)

Paint in a layered PSD or Krita file per action and facing. Export each group as its own PNG on the same
256 x 352 canvas:

| Layer group | Export | Notes |
| --- | --- | --- |
| `base` | every frame | body, face, hair, kit. No gear except the default knee pads and gloves |
| `anchors` | every frame | coloured dots, see section 5 (hidden in the final art) |
| `gear_<slot>_mk<1-3>` | **only for bending pieces**, every frame | sleeves, wrist bracers, greaves over a bending knee. Full canvas, only the piece painted |

Rigid gear (helmets and ear housings, shoulder pads, knee plates, toe caps, chest core) is **not** painted
per frame. Paint each once per facing on its own small canvas, with a note of the pixel where it meets its
anchor:
`cc_gear_<slot>_mk<n>_<facing>.png` plus `"pivot": [x, y]`.

The six slots are head, shoulders, arms, legs, boots and core. Core tiers are Spark, Surge and Ascended.
- Mk III must change the outline (new shape), not just colour or glow.
- Faces stay readable: nothing over the eyes, and the Ascended spirit (Kitsune foxfire tails) sits behind
  the body and below head height.

## 5. Anchors (where gear attaches)

On the `anchors` layer of every frame, put a **5 px solid dot** in the exact colour below at each point.
For a point hidden behind the body (a far shoulder, a far foot), use the dot on the `anchors_back` layer
instead. Our checker reads the dots and builds the JSON, so nobody has to type coordinates.

| Anchor | Where | Dot colour |
| --- | --- | --- |
| `head_top` | top of the skull (not the hair tips) | #FF0000 |
| `brow` | centre of the forehead | #00FF00 |
| `shoulder_L` / `shoulder_R` | top of each shoulder | #0000FF / #FFFF00 |
| `forearm_L` / `forearm_R` | middle of each forearm | #FF00FF / #00FFFF |
| `hand_L` / `hand_R` | centre of each glove | #800000 / #008000 |
| `chest_core` | centre of the chest emblem | #000080 |
| `back` | between the shoulder blades | #808000 |
| `shin_L` / `shin_R` | knee cap | #800080 / #008080 |
| `heel_L` / `heel_R` | back of each heel | #FF8000 / #0080FF |
| `toe_L` / `toe_R` | tip of each boot | #80FF00 / #FF0080 |

L and R are **her** left and right, not the screen's.

## 6. File names

```
cc_kitsune10_<action>_<facing>_<frame:02>.png            base
cc_kitsune10_<action>_<facing>_<frame:02>_anchors.png    anchor dots in front
cc_kitsune10_<action>_<facing>_<frame:02>_anchors_back.png
cc_kitsune10_<action>_<facing>_<frame:02>_gear_<slot>_mk<n>.png   bending gear only
cc_gear_<slot>_mk<n>_<facing>.png                        rigid gear, one per facing
```

Example: `cc_kitsune10_run_se_03.png`.

## 7. What else to send

- Source files (PSD or Krita) with the layer groups above.
- A short `notes.json`: stride length for `run`, contact frame for `shot`, release frame for `ability`,
  core colour (hex), and the pivot of each rigid gear piece.
- Portrait and squad-screen illustrations as separate large images (any size); they are not sprite frames.

## 8. Order

1. `idle` and `run` in all six facings, base plus anchors. Send these first: we test them on the pitch
   before anything else is drawn.
2. `shot`, then the two transitions.
3. Gear: shoulders Mk I to III (rigid) and boots Mk I to III (overlays) as the Round 2 proof, then the rest.
4. `ability` (Fox Mirage) and the Ascended foxfire.
