"""Build a fake #10 delivery in the delivery-spec format from the Round 1 placeholder atlas.

It lets us test import_delivery.py and the six-facing engine before real art exists:
    python3 tools/sprites/make_test_delivery.py /tmp/delivery
    python3 tools/sprites/import_delivery.py /tmp/delivery public/sprites/kitsune10_test

The left-hand facings are mirrored copies (real art draws them), so the shirt number reads
reversed there. Gear is crude coloured shapes: boots as per-frame overlays, shoulder pads as
rigid pieces, which are the two Round 2 proof slots in the spec.
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
from import_delivery import ANCHOR_COLOURS, W, H  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "public/sprites/playmaker10"
CHAR = "kitsune10"
LEFT = {"w": "e", "sw": "se", "nw": "ne"}
LEGACY = {"e": "side", "se": "front_three_quarter", "ne": "back_three_quarter"}
TIER_COL = {1: (150, 156, 168, 255), 2: (230, 120, 40, 255), 3: (255, 210, 80, 255)}


def frame_image(atlas, fd):
    x, y, w, h = fd["rect"]
    ox, oy = fd.get("offset", [0, 0])
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    img.alpha_composite(atlas.crop((x, y, x + w, y + h)), (ox, oy))
    return img, {k: tuple(v) for k, v in fd["anchors"].items()}


def mirror(img, anchors):
    return img.transpose(Image.FLIP_LEFT_RIGHT), {k: (W - 1 - x, y, z) for k, (x, y, z) in anchors.items()}


def dots(anchors, z_want):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for name, (x, y, z) in anchors.items():
        if (z >= 0) == (z_want >= 0):
            d.rectangle((x - 2, y - 2, x + 2, y + 2), fill=ANCHOR_COLOURS[name] + (255,))
    return img


def boots_overlay(anchors, tier):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for s in "LR":
        hx, hy, _ = anchors[f"heel_{s}"]
        tx, ty, _ = anchors[f"toe_{s}"]
        r = 3 + tier
        d.line((hx, hy, tx, ty), fill=TIER_COL[tier], width=2 * r)
        if tier == 3:  # Mk III changes the outline: a fin on the heel
            d.polygon([(hx, hy - 4), (hx - 10, hy - 16), (hx + 4, hy - 6)], fill=TIER_COL[tier])
    return img


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    meta = json.loads((SRC / "cc_playmaker10.json").read_text())
    atlas = Image.open(SRC / meta["image"]).convert("RGBA")
    frames, acts = meta["frames"], meta["actions"]

    def jog(view):
        return [s["frame"] for s in acts["loco_jog"]["views"][view]]

    plan = {
        "idle": {f: ["idle_front_00"] * 4 for f in LEGACY},
        "run": {f: jog(v) * 2 for f, v in LEGACY.items()},
        "shot": {f: [s["frame"] for s in acts["shot_power"]["views"]["side"]] for f in LEGACY},
    }
    for action, facings in plan.items():
        for facing, names in list(facings.items()) + [(l, facings[r]) for l, r in LEFT.items()]:
            for i, name in enumerate(names):
                img, anchors = frame_image(atlas, frames[name])
                if facing in LEFT:
                    img, anchors = mirror(img, anchors)
                stem = f"cc_{CHAR}_{action}_{facing}_{i:02d}"
                img.save(out / f"{stem}.png")
                dots(anchors, 1).save(out / f"{stem}_anchors.png")
                dots(anchors, -1).save(out / f"{stem}_anchors_back.png")
                for tier in (1, 2, 3):
                    boots_overlay(anchors, tier).save(out / f"{stem}_gear_boots_mk{tier}.png")

    # Rigid shoulder pads: one small drawing per facing and side, pivot where it sits on the shoulder.
    pivots = {}
    for tier in (1, 2, 3):
        for facing in list(LEGACY) + list(LEFT):
            for side in "LR":
                w, h = 18 + 6 * tier, 12 + 4 * tier
                img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
                d = ImageDraw.Draw(img)
                d.ellipse((0, 0, w - 1, h - 1), fill=TIER_COL[tier], outline=(30, 20, 20, 255), width=2)
                if tier == 3:
                    d.polygon([(w // 2, 0), (w - 2, -12 + h // 2), (w - 4, h // 2)], fill=(255, 111, 158, 255))
                name = f"cc_gear_shoulders_mk{tier}_{facing}_{side}.png"
                img.save(out / name)
                pivots[f"shoulders_mk{tier}_{facing}_{side}"] = [w / 2, h * 0.65]

    notes = {
        "stride_px": 720,  # the placeholder 4-frame loop covers 360 px; it is played twice
        "shot_contact": 3,
        "shot_foot": "toe_L",
        "core_colour": "#ff6f9e",
        "core_creature": "kitsune",
        "gear_pivots": pivots,
    }
    (out / "notes.json").write_text(json.dumps(notes, indent=1))
    print(f"wrote test delivery to {out}")


if __name__ == "__main__":
    main()
