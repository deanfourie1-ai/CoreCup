"""Clean and register the 12 prototype jog frames from the 2D sprite handoff.

The handoff frames were cropped automatically from a concept sheet, so each
view row sits on a different ground line, the side row is drawn about 3% smaller,
and every frame has a baked grey ground shadow (the side row also has a grey
baseline). The game draws its own shadow, so this script:

1. removes the low-saturation grey shadow/baseline pixels near the feet,
2. scales each row so the character is the same height in every view,
3. shifts each row so the ground line sits on the shared foot pivot (0.5, 0.97).

Usage (Pillow required):
    python3 tools/sprites/clean_prototype.py <handoff>/sprite_prototype public/sprites/playmaker10

Output: cc_playmaker10_jog_{view}_{nn}.png frames plus a 4x3 atlas png.
"""
import sys
from pathlib import Path
from PIL import Image

W, H = 256, 352
PIVOT_Y = round(H * 0.97)  # 341

# Measured from the handoff frames: ground line (centre of the baked shadow)
# and top of hair, per view row.
ROWS = {
    "front_three_quarter": {"ground": 320, "top": 17},
    "side": {"ground": 309, "top": 17},
    "back_three_quarter": {"ground": 329, "top": 27},
}
TARGET_HEIGHT = 303  # ground-to-hair height of the front row


def is_shadow(p, y, ground):
    r, g, b, a = p
    if a == 0 or y < ground - 14:
        return False
    sat = max(r, g, b) - min(r, g, b)
    return sat < 22 and max(r, g, b) > 105


def main(src: Path, out: Path):
    out.mkdir(parents=True, exist_ok=True)
    atlas = Image.new("RGBA", (W * 4, H * 3), (0, 0, 0, 0))
    for row, (view, m) in enumerate(ROWS.items()):
        scale = TARGET_HEIGHT / (m["ground"] - m["top"])
        for i in range(4):
            im = Image.open(src / f"cc_playmaker_jog_{view}_{i:02d}.png").convert("RGBA")
            px = im.load()
            for y in range(H):
                for x in range(W):
                    if is_shadow(px[x, y], y, m["ground"]):
                        px[x, y] = (0, 0, 0, 0)
            # Scale about the ground point, then move the ground point to the pivot.
            sw, sh = round(W * scale), round(H * scale)
            scaled = im.resize((sw, sh), Image.LANCZOS) if scale != 1 else im
            gx, gy = W / 2 * scale, m["ground"] * scale
            frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            frame.alpha_composite(scaled, (round(W / 2 - gx), round(PIVOT_Y - gy)))
            frame.save(out / f"cc_playmaker10_jog_{view}_{i:02d}.png")
            atlas.alpha_composite(frame, (i * W, row * H))
    atlas.save(out / "cc_playmaker10_proto_atlas.png", optimize=True)
    print("wrote", out)


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
