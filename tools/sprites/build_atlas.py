"""Pack the placeholder playmaker frames into one atlas PNG plus JSON metadata.

Inputs: the cleaned frames from clean_prototype.py and extract_stand.py, and the
hand-measured anchors in anchors_playmaker10.json (next to this script).

Usage (Pillow required):
    python3 tools/sprites/build_atlas.py <cleaned frames dir> public/sprites/playmaker10

The JSON follows the schema in src/sprites/schema.ts. Actions reference source
frames by name and may add a small transform (rot in degrees about the foot
pivot, dx/dy in frame pixels, sy vertical scale). The placeholder shot is built
that way from side jog frames because the handoff has no shot drawings yet.
"""
import json
import sys
from pathlib import Path
from PIL import Image

W, H = 256, 352
COLS = 4
HERE = Path(__file__).parent

FRAMES = ["idle_front_00"] + [
    f"jog_{v}_{i:02d}" for v in ("front_three_quarter", "side", "back_three_quarter") for i in range(4)
]


def jog(view):
    return [{"frame": f"jog_{view}_{i:02d}"} for i in range(4)]


ACTIONS = {
    "loco_idle": {
        "fps": 2,
        "loop": True,
        "views": {
            "front": [{"frame": "idle_front_00"}, {"frame": "idle_front_00", "sy": 1.012}],
        },
        "events": [],
    },
    "loco_jog": {
        "fps": 7,
        "loop": True,
        "views": {
            "front_three_quarter": jog("front_three_quarter"),
            "side": jog("side"),
            "back_three_quarter": jog("back_three_quarter"),
        },
        "events": [{"frame": 0, "type": "foot_contact"}, {"frame": 2, "type": "foot_contact"}],
    },
    "shot_power": {
        "fps": 10,
        "loop": False,
        "views": {
            "side": [
                {"frame": "jog_side_02", "dx": -6},
                {"frame": "jog_side_01", "rot": -3},
                {"frame": "jog_side_03", "rot": -9, "dx": -8},
                {"frame": "jog_side_00", "rot": 7, "dx": 6},
                {"frame": "jog_side_00", "rot": 11, "dx": 10, "dy": -5},
                {"frame": "jog_side_02", "rot": 3, "dx": 4},
                {"frame": "jog_side_02"},
            ]
        },
        "events": [
            {"frame": 2, "type": "wind_up"},
            {"frame": 3, "type": "foot_contact", "anchor": "toe_L"},
            {"frame": 3, "type": "ball_release"},
        ],
    },
}


def main(src: Path, out: Path):
    anchors = json.loads((HERE / "anchors_playmaker10.json").read_text())
    rows = (len(FRAMES) + COLS - 1) // COLS
    atlas = Image.new("RGBA", (W * COLS, H * rows), (0, 0, 0, 0))
    frames = {}
    for n, name in enumerate(FRAMES):
        x, y = (n % COLS) * W, (n // COLS) * H
        atlas.alpha_composite(Image.open(src / f"cc_playmaker10_{name}.png").convert("RGBA"), (x, y))
        frames[name] = {"rect": [x, y, W, H], "anchors": anchors[name]}
    out.mkdir(parents=True, exist_ok=True)
    atlas.save(out / "cc_playmaker10_atlas.png", optimize=True)
    meta = {
        "player": "emberforge_playmaker_10",
        "status": "placeholder",
        "note": "Frames are cropped from AI-generated handoff concept art and only cleaned/registered automatically. Not production art.",
        "image": "cc_playmaker10_atlas.png",
        "frameSize": [W, H],
        "pivot_normalized": [0.5, 0.97],
        "coreColour": "#ffb43c",
        "views": {
            "front": {"faces": "S"},
            "front_three_quarter": {"faces": "SE"},
            "side": {"faces": "E"},
            "back_three_quarter": {"faces": "NE"},
        },
        "layers": ["aura", "gear_back", "base", "gear_legs", "gear_boots", "gear_arms", "gear_shoulders", "gear_head", "core", "fx"],
        "frames": frames,
        "actions": ACTIONS,
    }
    (out / "cc_playmaker10.json").write_text(json.dumps(meta, indent=1))
    print("wrote atlas", atlas.size, "and json")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
