"""Cut-out rig: pose painted body pieces along the pose guides and bake game frames.

    python3 tools/sprites/rig_bake.py <parts dir> <delivery out dir> [--facing se]

<parts dir> holds the pieces from parts-rig-spec.md (part_*.png, all on the 256 x 352 canvas in
their rest position) and rig.json:
    {"joints": {"neck": [x, y], "waist": [..], "shoulder_L": [..], "elbow_L": [..], "wrist_L": [..],
                "hip_L": [..], "knee_L": [..], "ankle_L": [..], ... same for _R},
     "anchors": {"head_top": [x, y, z], ... all 16, on the rest pose}}
(rig.json can be written from part_joints.png by hand or with a small script.)

Motion comes from make_pose_guides.py: the guide skeleton is projected for the facing, and each
piece copies its bone's change of angle from the guide's rest (idle frame 0) pose. Legs use
two-bone IK so the ankle follows the guide's foot path exactly; that keeps planted feet planted.
Painted limbs are not the guide's length, so all guide motion is scaled by the leg-length ratio s
and the delivery's stride_px is 380 * s.

Writes delivery-format frames (base + _anchors + _anchors_back) and notes.json, ready for
import_delivery.py.
"""
import argparse
import json
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
import make_pose_guides as G  # noqa: E402
from import_delivery import ANCHOR_COLOURS, W, H  # noqa: E402

SIDES = ("L", "R")


def v(a, b):
    return (b[0] - a[0], b[1] - a[1])


def ang(a, b):
    return math.atan2(b[1] - a[1], b[0] - a[0])


def dist(a, b):
    return math.hypot(b[0] - a[0], b[1] - a[1])


def rot(p, centre, th, to):
    """Rotate p about centre by th, then move centre to `to`."""
    x, y = p[0] - centre[0], p[1] - centre[1]
    c, s = math.cos(th), math.sin(th)
    return (to[0] + c * x - s * y, to[1] + s * x + c * y)


def ik(hip, ankle, l1, l2, bend_sign):
    """Knee for a two-bone leg in screen space; bend_sign picks which side the knee goes."""
    d = dist(hip, ankle)
    d = min(max(d, abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3)
    a = ang(hip, ankle)
    b = math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))
    th = a + b * bend_sign
    return (hip[0] + l1 * math.cos(th), hip[1] + l1 * math.sin(th))


def guide_points(action, i, facing):
    P = G.skeleton(action, i)
    out = {}
    for k, p in P.items():
        x, y, _ = G.project(p, facing)
        out[k] = (x, y)
    out["hipmid"] = ((out["hip_L"][0] + out["hip_R"][0]) / 2, (out["hip_L"][1] + out["hip_R"][1]) / 2)
    return out


class Rig:
    def __init__(self, parts_dir: Path, facing: str):
        self.facing = facing
        cfg = json.loads((parts_dir / "rig.json").read_text())
        self.J = {k: tuple(v) for k, v in cfg["joints"].items()}
        self.anchors = cfg["anchors"]
        self.order = cfg.get("order") or [
            "hair", "upperarm_L", "forearm_L", "boot_L", "shin_L", "thigh_L",
            "boot_R", "shin_R", "thigh_R", "pelvis", "torso", "head", "upperarm_R", "forearm_R",
        ]
        self.parts = {}
        for name in self.order:
            p = parts_dir / f"part_{name}.png"
            if p.exists():
                self.parts[name] = Image.open(p).convert("RGBA")
        J = self.J
        self.hipmid = ((J["hip_L"][0] + J["hip_R"][0]) / 2, (J["hip_L"][1] + J["hip_R"][1]) / 2)
        self.rest = guide_points("idle", 0, facing)
        g, r = self.rest, J
        leg_p = sum(dist(r[f"hip_{s}"], r[f"knee_{s}"]) + dist(r[f"knee_{s}"], r[f"ankle_{s}"]) for s in SIDES)
        leg_g = sum(dist(g[f"hip_{s}"], g[f"knee_{s}"]) + dist(g[f"knee_{s}"], g[f"heel_{s}"]) for s in SIDES)
        self.s = leg_p / leg_g

    def pose(self, action, i):
        """Per-part (rest pivot, rotation, target pivot) for one frame."""
        J, g0, s = self.J, self.rest, self.s
        g = guide_points(action, i, self.facing)
        moved = lambda name, gk: (J[name][0] + (g[gk][0] - g0[gk][0]) * s, J[name][1] + (g[gk][1] - g0[gk][1]) * s)  # noqa: E731
        T = {}
        # Pelvis follows the guide's hips.
        hm = (self.hipmid[0] + (g["hipmid"][0] - g0["hipmid"][0]) * s, self.hipmid[1] + (g["hipmid"][1] - g0["hipmid"][1]) * s)
        T["pelvis"] = (self.hipmid, 0.0, hm)
        # Torso turns about the waist by the guide's spine lean.
        lean = ang(g["hipmid"], g["neck"]) - ang(g0["hipmid"], g0["neck"])
        waist = rot(J["waist"], self.hipmid, 0, hm)
        T["torso"] = (J["waist"], lean, waist)
        neck = rot(J["neck"], J["waist"], lean, waist)
        T["head"] = (J["neck"], lean * 0.5, neck)
        if "pony" in J:
            pony = rot(J["pony"], J["neck"], lean * 0.5, neck)
            # Hair trails behind the run: swing against the bob.
            sway = 0.08 * math.sin(i / 8 * 2 * math.pi) if action == "run" else 0.02 * math.sin(i / 4 * 2 * math.pi)
            T["hair"] = (J["pony"], lean * 0.5 + sway, pony)
        else:
            T["hair"] = T["head"]
        for sd in SIDES:
            # Arms: forward kinematics from the guide's angle changes.
            sh = rot(J[f"shoulder_{sd}"], J["waist"], lean, waist)
            a1 = ang(g[f"shoulder_{sd}"], g[f"elbow_{sd}"]) - ang(g0[f"shoulder_{sd}"], g0[f"elbow_{sd}"])
            T[f"upperarm_{sd}"] = (J[f"shoulder_{sd}"], a1, sh)
            el = rot(J[f"elbow_{sd}"], J[f"shoulder_{sd}"], a1, sh)
            a2 = ang(g[f"elbow_{sd}"], g[f"hand_{sd}"]) - ang(g0[f"elbow_{sd}"], g0[f"hand_{sd}"])
            T[f"forearm_{sd}"] = (J[f"elbow_{sd}"], a2, el)  # a2 is already an absolute change
            # Legs: IK so the ankle lands exactly where the guide's foot is.
            hip = (J[f"hip_{sd}"][0] + hm[0] - self.hipmid[0], J[f"hip_{sd}"][1] + hm[1] - self.hipmid[1])
            ankle = moved(f"ankle_{sd}", f"heel_{sd}")
            l1 = dist(J[f"hip_{sd}"], J[f"knee_{sd}"])
            l2 = dist(J[f"knee_{sd}"], J[f"ankle_{sd}"])
            # Bend the knee to the same side as the guide's knee.
            gh, gk, ga = g[f"hip_{sd}"], g[f"knee_{sd}"], g[f"heel_{sd}"]
            cross = (ga[0] - gh[0]) * (gk[1] - gh[1]) - (ga[1] - gh[1]) * (gk[0] - gh[0])
            knee = ik(hip, ankle, l1, l2, 1 if cross < 0 else -1)
            th = ang(hip, knee) - ang(J[f"hip_{sd}"], J[f"knee_{sd}"])
            T[f"thigh_{sd}"] = (J[f"hip_{sd}"], th, hip)
            ts = ang(knee, ankle) - ang(J[f"knee_{sd}"], J[f"ankle_{sd}"])
            T[f"shin_{sd}"] = (J[f"knee_{sd}"], ts, knee)
            tb = ang(g[f"heel_{sd}"], g[f"toe_{sd}"]) - ang(g0[f"heel_{sd}"], g0[f"toe_{sd}"])
            ankle_real = rot(J[f"ankle_{sd}"], J[f"knee_{sd}"], ts, knee)
            T[f"boot_{sd}"] = (J[f"ankle_{sd}"], tb, ankle_real)
        return T

    # Which part carries each anchor.
    ANCHOR_PART = {
        "head_top": "head", "brow": "head", "chest_core": "torso", "back": "torso",
        "shoulder_L": "torso", "shoulder_R": "torso", "forearm_L": "forearm_L", "forearm_R": "forearm_R",
        "hand_L": "forearm_L", "hand_R": "forearm_R", "shin_L": "shin_L", "shin_R": "shin_R",
        "heel_L": "boot_L", "heel_R": "boot_R", "toe_L": "boot_L", "toe_R": "boot_R",
    }

    def bake(self, action, i):
        T = self.pose(action, i)
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for name in self.order:
            part = self.parts.get(name)
            if part is None or name not in T:
                continue
            (px, py), th, (tx, ty) = T[name]
            c, s = math.cos(-th), math.sin(-th)
            # Output pixel -> source pixel (inverse of rotate-about-pivot-then-move).
            a, b = c, -s
            d, e = s, c
            coeffs = (a, b, px - a * tx - b * ty, d, e, py - d * tx - e * ty)
            img.alpha_composite(part.transform((W, H), Image.AFFINE, coeffs, resample=Image.BICUBIC))
        anchors = {}
        for name, (x, y, z) in self.anchors.items():
            pv, th, to = T[self.ANCHOR_PART[name]]
            nx, ny = rot((x, y), pv, th, to)
            anchors[name] = (round(nx), round(ny), z)
        return img, anchors


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("parts", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--facing", default="se")
    ap.add_argument("--character", default="kitsune10")
    a = ap.parse_args()
    rig = Rig(a.parts, a.facing)
    a.out.mkdir(parents=True, exist_ok=True)
    for action, n in (("idle", 4), ("run", 8)):
        for i in range(n):
            img, anchors = rig.bake(action, i)
            stem = a.out / f"cc_{a.character}_{action}_{a.facing}_{i:02d}"
            img.save(f"{stem}.png")
            for suffix, front in (("_anchors", True), ("_anchors_back", False)):
                layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                d = ImageDraw.Draw(layer)
                for name, (x, y, z) in anchors.items():
                    if (z > 0) == front:
                        d.rectangle((x - 2, y - 2, x + 2, y + 2), fill=ANCHOR_COLOURS[name] + (255,))
                layer.save(f"{stem}{suffix}.png")
    stride = round(G.STRIDE_PX * rig.s)
    (a.out / "notes.json").write_text(json.dumps({"stride_px": stride, "core_colour": "#ff6f9e", "core_creature": "kitsune"}))
    print(f"baked {a.facing}: leg scale {rig.s:.2f}, stride_px {stride}, planted foot moves {G.plant_shift(a.facing)[0] * rig.s:+.1f} px per frame")


if __name__ == "__main__":
    main()
