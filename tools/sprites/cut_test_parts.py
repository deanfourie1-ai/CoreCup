"""Rough test pieces for rig_bake.py, cut from one finished painting (no artist parts yet).

    python3 tools/sprites/cut_test_parts.py <painting.png> <anchors json> <out dir>

Each opaque pixel goes to the nearest bone (weighted by bone thickness), then every piece is grown
a few pixels into its neighbours so joints overlap when they bend. Hidden areas (behind a limb)
are missing, so expect small holes; real painted parts fix that. Joint positions are for the
Round 2 SE Kitsune idle painting; change JOINTS for another pose.
"""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

JOINTS = {
    "neck": (128, 124), "waist": (126, 186), "pony": (112, 72), "head_top": (146, 40),
    "shoulder_R": (100, 140), "elbow_R": (72, 170), "wrist_R": (60, 200), "hand_R": (57, 214),
    "shoulder_L": (163, 136), "elbow_L": (168, 165), "wrist_L": (183, 192), "hand_L": (188, 206),
    "hip_R": (108, 204), "knee_R": (85, 262), "ankle_R": (62, 312), "toe_R": (52, 336),
    "hip_L": (148, 204), "thighcut_L": (152, 228), "thighcut_R": (102, 228), "knee_L": (165, 258), "ankle_L": (162, 310), "toe_L": (186, 334),
}
# part: (bone start, bone end, half thickness)
BONES = {
    "head": ("head_top", "neck", 44),
    "torso": ("neck", "waist", 34),
    "pelvis": ("waist", None, 42),
    "upperarm_L": ("shoulder_L", "elbow_L", 12), "forearm_L": ("elbow_L", "hand_L", 12),
    "upperarm_R": ("shoulder_R", "elbow_R", 12), "forearm_R": ("elbow_R", "hand_R", 12),
    "thigh_L": ("thighcut_L", "knee_L", 16), "shin_L": ("knee_L", "ankle_L", 15), "boot_L": ("ankle_L", "toe_L", 15),
    "thigh_R": ("thighcut_R", "knee_R", 16), "shin_R": ("knee_R", "ankle_R", 15), "boot_R": ("ankle_R", "toe_R", 15),
}
GROW = 7


def seg_dist(px, py, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    t = np.clip(((px - ax) * dx + (py - ay) * dy) / max(dx * dx + dy * dy, 1e-6), 0, 1)
    return np.hypot(px - (ax + t * dx), py - (ay + t * dy))


def main():
    src, anchors_json, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    img = Image.open(src).convert("RGBA")
    arr = np.array(img)
    alpha = arr[:, :, 3] > 8
    h, w = alpha.shape
    ys, xs = np.mgrid[0:h, 0:w]
    J = JOINTS
    hipmid = ((J["hip_L"][0] + J["hip_R"][0]) / 2, (J["hip_L"][1] + J["hip_R"][1]) / 2 + 8)
    names, dists = [], []
    for name, (a, b, r) in BONES.items():
        pa = J[a]
        pb = J[b] if b else hipmid
        names.append(name)
        dists.append(seg_dist(xs, ys, pa, pb) - r)
    owner = np.argmin(np.stack(dists), axis=0)
    for k, name in enumerate(names):
        m = Image.fromarray(((owner == k) & alpha).astype(np.uint8) * 255)
        m = m.filter(ImageFilter.MaxFilter(GROW * 2 + 1))
        mask = (np.array(m) > 0) & alpha
        part = arr.copy()
        part[~mask] = 0
        Image.fromarray(part).save(out / f"part_{name}.png")
    anchors = json.loads(anchors_json.read_text())
    rig = {"joints": {k: list(v) for k, v in J.items()}, "anchors": anchors,
           "order": ["upperarm_L", "forearm_L", "boot_L", "shin_L", "thigh_L", "boot_R", "shin_R", "thigh_R",
                     "pelvis", "torso", "head", "upperarm_R", "forearm_R"]}
    (out / "rig.json").write_text(json.dumps(rig, indent=1))
    print(f"cut {len(names)} pieces into {out}")


if __name__ == "__main__":
    main()
