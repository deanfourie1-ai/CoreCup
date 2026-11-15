"""Pose guide sheets for drawing #10's idle and run frames (Round 2).

For every facing it writes 256x352 guide frames: the foot line and pivot, the 300 px height line,
a stick-figure key pose from a small 3D run cycle seen through the game camera, and the 16 anchor
dots in the spec colours (front dots solid, back dots ringed). Artists draw over them; the dots
also show where each anchor belongs.

Run timing (8 frames, two strides, each foot on the ground for 3 frames):
the ground moves under her by STRIDE_PX / 8 px per frame. In the image a planted foot therefore
slides BACKWARDS by exactly that much each frame, as seen by the game camera (see PLANT_SHIFT);
once the game moves the sprite forward at ground speed, the foot stays still on the pitch.

    python3 tools/sprites/make_pose_guides.py <out dir> [--dots-only] [--canvas 320x384 --pivot-y 330]
                                              [--facings se]

--canvas/--pivot-y: the taller SE test canvas (Nov 2026 correction brief). With 54 px below the foot
line there is room for the full ground projection, so on diagonal facings the planted foot also
moves UP the image (about 26 px a frame) and the forward foot lands below the line. On the old
256x352 canvas (11 px below the feet) only the sideways part is drawn.

--dots-only also writes the frames in delivery format (base = stick figure, plus _anchors and
_anchors_back layers) so import_delivery.py can pack them and the lab can play the guide itself.
"""
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
from import_delivery import ANCHOR_COLOURS, W, H, PIVOT  # noqa: E402

STRIDE_PX = 380  # ground covered by one 8-frame loop (two strides)
STEP = STRIDE_PX / 8  # ground travel per frame
HEIGHT = 300
TILT = math.atan2(16, 20)  # game camera pitch, about 39 degrees
FACINGS = {"e": 0, "se": 60, "sw": 120, "w": 180, "nw": 240, "ne": 300}


DEPTH = False  # draw the ground's depth (up/down the image) too; set by --canvas with room below


def plant_shift(facing):
    """Image px a planted foot moves each run frame (x right, y down).

    The up/down part is only drawn when DEPTH is on (taller canvas); otherwise it is 0.
    """
    a = math.radians(FACINGS[facing])
    return (-STEP * math.cos(a), -STEP * math.sin(a) * math.sin(TILT) if DEPTH else 0.0)
THIGH = SHIN = 84

# Foot path per phase (forward px from the hip, height px). Phases 0-2 are stance:
# contact, mid-stance, push-off, each STEP further back. 3-7 are swing.
FOOT = [
    (60, 0),
    (60 - STEP, 0),
    (60 - 2 * STEP, 0),
    (-70, 26),
    (-50, 70),
    (0, 62),
    (52, 34),
    (78, 10),
]
HIP_BOB = [-4, -7, -1, 4, -4, -7, -1, 4]  # one bob per step: lowest at mid-stance (1, 5), highest in flight (3, 7)


def knee(hip, foot, forward=1):
    """Two-bone IK in the sagittal plane: (forward, up) coords, knee bends forward."""
    dx, dy = foot[0] - hip[0], foot[1] - hip[1]
    d = min(math.hypot(dx, dy), THIGH + SHIN - 0.01)
    a = math.atan2(dy, dx)
    b = math.acos((THIGH**2 + d**2 - SHIN**2) / (2 * THIGH * d))
    ang = a + b * forward
    return (hip[0] + THIGH * math.cos(ang), hip[1] + THIGH * math.sin(ang))


def skeleton(action, i):
    """Body points in character space: (forward, up, right) px, ground at up=0 under the hip."""
    P = {}
    if action == "run":
        bob = HIP_BOB[i % 8]
        hip_y = 162 + bob
        lean = 10
        for side, off, lat in (("R", 0, 1), ("L", 4, -1)):
            fx, fy = FOOT[(i + off) % 8]
            hip = (0, hip_y)
            k = knee(hip, (fx, fy + 10), forward=1)
            P[f"hip_{side}"] = (0, hip_y, 15 * lat)
            P[f"knee_{side}"] = (k[0], k[1], 16 * lat)
            P[f"heel_{side}"] = (fx - 12, fy + 10, 17 * lat)
            P[f"toe_{side}"] = (fx + 20, fy + 2, 17 * lat)
            # Arm swings against the same-side leg.
            sw = -fx / 80
            sh = (lean * 0.9, hip_y + 92, 32 * lat)
            el = (sh[0] + 28 * sw, sh[1] - 36, 36 * lat)
            ha = (el[0] + 30 + 10 * sw, el[1] + 10 + 14 * max(sw, 0), 30 * lat)
            P[f"shoulder_{side}"], P[f"elbow_{side}"], P[f"hand_{side}"] = sh, el, ha
        P["neck"] = (lean, hip_y + 100, 0)
        P["head"] = (lean + 6, hip_y + 128, 0)
    else:  # idle: ready stance, breathing, small weight shift
        br = [0, -2, -3, -1][i % 4]
        shift = [0, 2, 3, 1][i % 4]
        hip_y = 160 + br
        for side, lat, fwd in (("R", 1, 8), ("L", -1, -8)):
            P[f"hip_{side}"] = (0, hip_y, 15 * lat + shift)
            P[f"knee_{side}"] = (fwd + 6, 84 + br / 2, 20 * lat + shift / 2)
            P[f"heel_{side}"] = (fwd - 12, 10, 24 * lat)
            P[f"toe_{side}"] = (fwd + 20, 2, 26 * lat)
            sh = (0, hip_y + 92 + br * 0.6, 32 * lat + shift)
            el = (4, sh[1] - 40, 38 * lat + shift)
            P[f"shoulder_{side}"], P[f"elbow_{side}"], P[f"hand_{side}"] = sh, el, (16, el[1] - 34, 34 * lat + shift)
        P["neck"] = (0, hip_y + 100, shift)
        P["head"] = (2, hip_y + 128, shift)
    return P


def project(p, facing):
    """Character space -> frame pixels for a facing, with the depth used for front/back."""
    a = math.radians(FACINGS[facing])
    fwd = (math.cos(a), math.sin(a))  # ground (x east, z south)
    right = (-math.sin(a), math.cos(a))
    x = p[0] * fwd[0] + p[2] * right[0]
    z = p[0] * fwd[1] + p[2] * right[1]
    # Through the 39 degree camera, ground depth (towards the camera) shows as down the image.
    # On the old canvas (11 px below the feet) that part is dropped and the feet stay on the line.
    return (PIVOT[0] + x, PIVOT[1] - p[1] + (z * math.sin(TILT) if DEPTH else 0), z)


def anchors(P, facing):
    a = math.radians(FACINGS[facing])
    toward_cam = math.sin(a)  # >0 when she faces the camera
    out = {}

    def put(name, p, z=None):
        x, y, depth = project(p, facing)
        out[name] = (round(x), round(y), (1 if depth >= -3 else -1) if z is None else z)

    head = P["head"]
    put("head_top", (head[0], head[1] + 30, head[2]))
    put("brow", (head[0] + 10, head[1] + 8, head[2]), 1 if toward_cam >= -0.1 else -1)
    for s in "LR":
        sh, el, ha = P[f"shoulder_{s}"], P[f"elbow_{s}"], P[f"hand_{s}"]
        put(f"shoulder_{s}", sh)
        put(f"forearm_{s}", tuple((el[k] + ha[k]) / 2 for k in range(3)))
        put(f"hand_{s}", ha)
        put(f"shin_{s}", P[f"knee_{s}"])
        put(f"heel_{s}", P[f"heel_{s}"])
        put(f"toe_{s}", P[f"toe_{s}"])
    n = P["neck"]
    put("chest_core", (n[0] + 14, n[1] - 26, n[2]), 1 if toward_cam >= -0.1 else -1)
    put("back", (n[0] - 12, n[1] - 22, n[2]), 1 if toward_cam < -0.1 else -1)
    return out


def draw_figure(d, P, facing):
    def pt(name):
        x, y, _ = project(P[name], facing)
        return (x, y)

    def depth(name):
        return project(P[name], facing)[2]

    limbs = []
    for s in "LR":
        limbs.append((depth(f"hip_{s}"), [pt(f"hip_{s}"), pt(f"knee_{s}"), pt(f"heel_{s}"), pt(f"toe_{s}")], 13))
        limbs.append((depth(f"shoulder_{s}"), [pt(f"shoulder_{s}"), pt(f"elbow_{s}"), pt(f"hand_{s}")], 10))
    limbs.sort(key=lambda l: l[0])
    far = [l for l in limbs if l[0] < 0]
    near = [l for l in limbs if l[0] >= 0]
    for _, pts, wd in far:
        d.line(pts, fill=(150, 150, 165, 255), width=wd, joint="curve")
    # Torso and head.
    hipm = tuple((a + b) / 2 for a, b in zip(pt("hip_L"), pt("hip_R")))
    d.line([hipm, pt("neck")], fill=(90, 90, 110, 255), width=34)
    hx, hy = pt("head")
    d.ellipse((hx - 27, hy - 30, hx + 27, hy + 28), fill=(90, 90, 110, 255))
    for _, pts, wd in near:
        d.line(pts, fill=(60, 60, 78, 255), width=wd, joint="curve")


def guide_frame(action, facing, i, with_guides=True):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if with_guides:
        img.paste((236, 238, 232, 255), (0, 0, W, H))
        d.line((0, PIVOT[1], W, PIVOT[1]), fill=(220, 60, 60, 255), width=1)
        d.line((0, PIVOT[1] - HEIGHT, W, PIVOT[1] - HEIGHT), fill=(60, 120, 220, 255), width=1)
        d.line((PIVOT[0], 0, PIVOT[0], H), fill=(200, 200, 200, 255), width=1)
        d.ellipse((PIVOT[0] - 3, PIVOT[1] - 3, PIVOT[0] + 3, PIVOT[1] + 3), outline=(220, 60, 60, 255))
    P = skeleton(action, i)
    draw_figure(d, P, facing)
    A = anchors(P, facing)
    if with_guides:
        for name, (x, y, z) in A.items():
            c = ANCHOR_COLOURS[name] + (255,)
            if z > 0:
                d.rectangle((x - 2, y - 2, x + 2, y + 2), fill=c)
            else:
                d.ellipse((x - 4, y - 4, x + 4, y + 4), outline=c, width=2)
        if action == "run":
            for s, off in (("R", 0), ("L", 4)):
                ph = (i + off) % 8
                if ph <= 2:
                    x, y, _ = project(P[f"heel_{s}"], facing)
                    d.text((x - 20, y + 6), f"{s} planted", fill=(200, 40, 40, 255))
        d.text((4, 4), f"{action} {facing} {i:02d}", fill=(40, 40, 40, 255))
    return img, A


def main():
    global W, H, PIVOT, DEPTH
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--dots-only", action="store_true")
    ap.add_argument("--canvas", default=None, help="e.g. 320x384")
    ap.add_argument("--pivot-y", type=int, default=None)
    ap.add_argument("--facings", default=",".join(FACINGS))
    a = ap.parse_args()
    if a.canvas:
        W, H = (int(v) for v in a.canvas.split("x"))
        PIVOT = (W // 2, a.pivot_y if a.pivot_y is not None else H - 11)
    DEPTH = H - PIVOT[1] >= 40
    facings = a.facings.split(",")
    out = a.out
    delivery = a.dots_only
    out.mkdir(parents=True, exist_ok=True)
    sheets = {}
    for action, n in (("idle", 4), ("run", 8)):
        rows = []
        for facing in facings:
            row = []
            for i in range(n):
                g, A = guide_frame(action, facing, i)
                g.save(out / f"guide_{action}_{facing}_{i:02d}.png")
                row.append(g)
                if delivery:
                    base, _ = guide_frame(action, facing, i, with_guides=False)
                    stem = out / "delivery" / f"cc_kitsune10_{action}_{facing}_{i:02d}"
                    stem.parent.mkdir(exist_ok=True)
                    base.save(f"{stem}.png")
                    for suffix, front in (("_anchors", True), ("_anchors_back", False)):
                        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                        ld = ImageDraw.Draw(layer)
                        for name, (x, y, z) in A.items():
                            if (z > 0) == front:
                                ld.rectangle((x - 2, y - 2, x + 2, y + 2), fill=ANCHOR_COLOURS[name] + (255,))
                        layer.save(f"{stem}{suffix}.png")
            rows.append(row)
        sheet = Image.new("RGBA", (W * n, H * len(rows)), (255, 255, 255, 255))
        for r, row in enumerate(rows):
            for c, g in enumerate(row):
                sheet.paste(g, (c * W, r * H))
        sheet.save(out / f"guide_{action}_sheet.png")
        sheets[action] = sheet
    if delivery:
        (out / "delivery" / "notes.json").write_text(
            '{"stride_px": %d, "core_colour": "#ff6f9e", "core_creature": "kitsune"}' % STRIDE_PX
        )
    for f in facings:
        sx, sy = plant_shift(f)
        print(f"{f}: planted foot moves ({sx:+.0f}, {sy:+.0f}) px per frame")
    print(f"wrote guides to {out}")


if __name__ == "__main__":
    main()
