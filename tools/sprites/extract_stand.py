"""Cut the standing (hands on hips) playmaker out of the handoff concept sheet.

The handoff only has jog frames, so this standing figure is the placeholder
idle pose. It is keyed off the white sheet background, scaled to the shared
character height and placed on the shared foot pivot.

Usage (Pillow required):
    python3 tools/sprites/extract_stand.py <handoff>/references/playmaker_2d_sprite_concept.png public/sprites/playmaker10
"""
import sys
from collections import deque
from pathlib import Path
from PIL import Image

W, H = 256, 352
PIVOT_Y = round(H * 0.97)
CROP = (972, 0, 1238, 846)  # the full-body figure on the concept sheet
HAIR_TOP, GROUND = 28, 838  # in crop pixels
TARGET_HEIGHT = 303


def main(src: Path, out: Path):
    im = Image.open(src).convert("RGBA").crop(CROP)
    w, h = im.size
    px = im.load()

    def background(p):
        r, g, b, _ = p
        near_white = min(r, g, b) > 228
        grey_shadow = max(r, g, b) - min(r, g, b) < 14 and max(r, g, b) > 150
        green_inset = g > r + 25 and g > b + 10
        return near_white or grey_shadow or green_inset

    # Flood-fill the background from every edge pixel.
    seen = [[False] * h for _ in range(w)]
    q = deque()
    for x in range(w):
        q.extend([(x, 0), (x, h - 1)])
    for y in range(h):
        q.extend([(0, y), (w - 1, y)])
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or seen[x][y] or not background(px[x, y]):
            continue
        seen[x][y] = True
        px[x, y] = (0, 0, 0, 0)
        q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    # Keep only the largest opaque island (drops stray bits of other panels).
    label = {}
    best = []
    for sx in range(w):
        for sy in range(h):
            if px[sx, sy][3] == 0 or (sx, sy) in label:
                continue
            comp, q = [], deque([(sx, sy)])
            label[(sx, sy)] = 1
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in label and px[nx, ny][3]:
                        label[(nx, ny)] = 1
                        q.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    keep = set(best)
    for x in range(w):
        for y in range(h):
            if px[x, y][3] and (x, y) not in keep:
                px[x, y] = (0, 0, 0, 0)

    scale = TARGET_HEIGHT / (GROUND - HAIR_TOP)
    small = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # The figure's feet are centred around x = 133 in the crop.
    frame.alpha_composite(small, (round(W / 2 - 133 * scale), round(PIVOT_Y - GROUND * scale)))
    out.mkdir(parents=True, exist_ok=True)
    frame.save(out / "cc_playmaker10_idle_front_00.png")
    print("wrote", out / "cc_playmaker10_idle_front_00.png", frame.getbbox())


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
