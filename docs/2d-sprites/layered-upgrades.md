# Visible upgrades on 2D sprites: layered paper-doll investigation

**Question:** how do we attach the six upgrade slots (head, shoulders, arms, legs, boots, core), each at
Mk I, Mk II or Mk III (core: Spark, Surge, Ascended), to hand-drawn 2D sprites so that every upgrade
visibly changes the player, in every facing and action, without baking every combination?

**Short answer:** stack separate layers on each frame, positioned by per-frame 2D anchors that replace the
old 3D sockets. Rigid pieces are one drawing per tier and view, placed and rotated from two anchors. Pieces
that bend with the body are painted per frame as overlays on the same canvas. A depth flag on each anchor
decides whether the piece goes behind or in front of the body. The Sprite Lab runs this on the placeholder
frames with all six slots and all tiers.

## Why not bake combinations

Six slots with three tiers is 3^6 = **729 looks per player**, before multiplying by facings, actions and
frames. With Round 1's modest set (3 views, idle 2 + jog 4 + shot 7 frames) that is already about 28,000
full frames per player. Layers cost roughly slots x tiers x (pieces per frame), which grows by addition
instead of multiplication. Baking still makes sense for a few art-directed hero poses (portraits, cinematics).

## The layer stack

Drawn bottom to top for each frame (`compose.ts`):

1. `aura`: Ascended creature spirit, behind everything, rooted at the `back` anchor and kept below the head
   so it never covers the face.
2. `gear_back`: every gear piece whose anchor has z = -1 (far shoulder, far arm, far leg and boot). The body
   then covers them, so only what sticks out shows, which is right for a far-side pauldron.
3. `base`: the body and kit frame.
4. Front gear in slot order: `gear_legs`, `gear_boots`, `gear_arms`, `gear_shoulders`, `gear_head`.
5. `core`: chest gem and glow (or a back vent glow when the chest faces away).
6. `fx`: independent effects such as Mk III boot thrusters.

The whole stack is composited into one canvas per player and uploaded as one texture, so the GPU sees
one quad per player regardless of how much gear is on. Mirroring for left-facing directions flips the
finished composite, which keeps gear registered to the body.

## Anchors replace 3D sockets

Each frame stores 16 anchors in frame pixels as `[x, y, z]`:

`head_top, brow, shoulder_L/R, forearm_L/R, hand_L/R, chest_core, back, shin_L/R, heel_L/R, toe_L/R`

z is +1 (in front of the body) or -1 (behind). Pieces use pairs of anchors for orientation: bracers run
forearm to hand, shin guards run shin to heel, boots run heel to toe. Per-step transforms in an action
(rotate, nudge, breathe) move the anchors with the frame, so the stand-in shot keeps gear attached.

The brief's anchor list also has `thigh_L/R` and `fx_core`, `fx_foot_L/R`. They were not needed for these
pieces; `chest_core` and `heel` double as the effect points. Add them when a piece needs them.

## Two kinds of gear art

| Kind | Use for | Cost per tier | Risk |
| --- | --- | --- | --- |
| **Anchored rigid piece**: one drawing per view, placed and rotated from anchors | Helmets, ear housings, shoulder pads, knee plates, toe caps, core gems, auras | 1 drawing x 4 views | Slides a few pixels if anchors are sloppy; cannot bend |
| **Per-frame overlay**: painted on the same canvas as each base frame | Sleeves, bracers wrapping a bending wrist, greaves over a flexing knee, anything that occludes partially | 1 drawing x every frame | Expensive, but pixel-perfect and can be partly behind and partly in front |

Recommendation: **anchored pieces by default, overlays only where a piece visibly bends or wraps.** In the
lab every piece is anchored, and that holds up for shoulders, head, core, knee plates and toe caps. The
weakest results are Mk III greaves and full boot armour on frames where the shin is foreshortened, which
are the pieces that should become per-frame overlays in production.

Overlays use the same layer names, so the compositor does not change: an overlay layer simply ships
frames instead of a single drawing and ignores anchors.

## Making every tier visibly different

Checked at 64 px tall (the strip in the lab, image in the README):

- **Mk I** adds a small brass piece in the slot's place (ear housing, small pad, bracer, knee plate, toe cap).
- **Mk II** makes it bigger and adds a second shape (visor band, stacked plates, knuckle guard, shin guard,
  heel spur and ankle cuff) and the first touch of core-colour glow.
- **Mk III** changes the silhouette: horned crest, spiked pauldrons, elbow blades, full greaves with fins,
  armoured boots with heel fins and thruster flames, plus glow strips.
- **Core**: Spark is a small pulsing gem, Surge adds a spinning spark ring and a back vent glow, Ascended
  adds the creature-spirit wings behind the body.

At 64 px, Mk II shoulders and Mk III boots are clearly different from the base kit in every facing. Mk I
pieces are visible but small; the art pass should make Mk I a bit bolder in shape, not just colour.

Faces stay readable: head gear sits on the crown and forehead, never over the eyes, and the aura stays
below head height.

## Six facings

Hex movement needs six facings: E, SE, SW, W, NW, NE. The slice draws three (side, front three-quarter,
back three-quarter, all facing screen-right) and mirrors them for W, SW and NW. Mirroring works for the
body and for symmetric gear, but the strip shows it reverses the shirt and shorts number ("10" reads "01"),
and it would put an asymmetric piece (an armband, a one-sided pauldron) on the wrong arm.

Recommendation for Round 2:

1. **Draw all six facings for the base body** (three new views). The number and any asymmetric kit detail
   make mirroring unsafe for the base layer.
2. **Allow mirroring per gear piece.** Symmetric pieces (helmets, boots, knee plates, cores, auras) can be
   flagged `mirrorable` and drawn three times; asymmetric pieces get six.
3. Alternatively keep the number off the base art as its own unmirrored decal layer, which would let the
   base mirror too. That saves drawing but adds a decal per frame and still fails for asymmetric kit.
   Worth a quick test in Round 2 before committing to six full base views.

## Team colours

Gear here is drawn with Emberforge brass. For Tidewell steel, tinting the finished pieces is not enough
(the brief is right that a flat tint ruins the light and dark tones). Ship gear in two metal sets, or paint
gear with a separate mask channel (metal, trim, glow) and recolour each channel with a palette. The second
is cheaper once the pipeline exists; Round 4 can decide.

## Asset contract for artists

- Same 256x352 canvas and foot pivot (0.5, 0.97) for every base frame and every overlay frame.
- Anchors measured on the final frames and stored in the atlas JSON per frame (the placeholder numbers in
  `tools/sprites/anchors_playmaker10.json` are only valid for those placeholder frames).
- Rigid pieces: one PNG per slot x tier x view, with their own small pivot (where it meets the anchor).
- Overlays: one PNG per slot x tier x frame, same canvas as the base.
- Layered source files (PSD/Krita) with one group per layer name above.

## Proposed Round 2 spike

Using cleaned production frames for #10 only:

1. Six-facing base for idle and jog, plus a real shot.
2. Mk I-III shoulders as anchored pieces, Mk I-III boots as per-frame overlays.
3. Spark/Surge/Ascended core with one finished creature-spirit VFX.
4. Re-run the 64 px strip and the ten-sprite test on a GPU desktop browser.
