"""Check a sprite delivery against docs/2d-sprites/delivery-spec.md and pack it for the game.

Usage (Pillow required):
    python3 tools/sprites/import_delivery.py <delivery folder> <output folder> [--character kitsune10]

Reads:
    cc_<char>_<action>_<facing>_<nn>.png                    base frames
    cc_<char>_<action>_<facing>_<nn>_anchors.png            anchor dots in front of the body
    cc_<char>_<action>_<facing>_<nn>_anchors_back.png       anchor dots behind the body
    cc_<char>_<action>_<facing>_<nn>_gear_<slot>_mk<n>.png  painted (bending) gear overlays
    cc_gear_<slot>_mk<n>_<facing>[_L|_R].png                rigid gear pieces
    notes.json                                              stride, contact frames, core colour, gear pivots

Writes:
    cc_<char>_atlas_<page>.png, cc_<char>.json (src/sprites/schema.ts), import_report.md

Exits non-zero when a frame breaks a hard rule (wrong size, no transparency).
Everything else is reported as a warning so art can be tried in the game early.
"""
import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from PIL import Image

W, H = 256, 352
PIVOT = (128, 341)
FACINGS = ["e", "se", "sw", "w", "nw", "ne"]
PAGE = 2048

# Anchor dot colours from the delivery spec.
ANCHOR_COLOURS = {
    "head_top": (255, 0, 0),
    "brow": (0, 255, 0),
    "shoulder_L": (0, 0, 255),
    "shoulder_R": (255, 255, 0),
    "forearm_L": (255, 0, 255),
    "forearm_R": (0, 255, 255),
    "hand_L": (128, 0, 0),
    "hand_R": (0, 128, 0),
    "chest_core": (0, 0, 128),
    "back": (128, 128, 0),
    "shin_L": (128, 0, 128),
    "shin_R": (0, 128, 128),
    "heel_L": (255, 128, 0),
    "heel_R": (0, 128, 255),
    "toe_L": (128, 255, 0),
    "toe_R": (255, 0, 128),
}

# Spec action code -> game action name, frame count, fps, loop.
ACTIONS = {
    "idle": ("loco_idle", 4, 6, True),
    "run": ("loco_jog", 8, 10, True),
    "shot": ("shot_power", 7, 12, False),
    "ability": ("ability", 10, 12, False),
    "run_to_shot": ("run_to_shot", 2, 12, False),
    "run_to_idle": ("run_to_idle", 2, 12, False),
}

# Where each rigid slot attaches by default: (anchor, align-to anchor), with {s} = side.
RIGID_ANCHORS = {
    "head": ("brow", None),
    "shoulders": ("shoulder_{s}", None),
    "arms": ("forearm_{s}", "hand_{s}"),
    "legs": ("shin_{s}", "heel_{s}"),
    "boots": ("heel_{s}", "toe_{s}"),
    "core": ("chest_core", None),
}


class Report:
    def __init__(self):
        self.errors, self.warnings, self.notes = [], [], []

    def error(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)

    def note(self, msg):
        self.notes.append(msg)

    @staticmethod
    def grouped(items):
        """Fold the same problem on consecutive frames of one action and facing into one line."""
        groups = {}
        for m in items:
            g = re.match(r"(cc_\w+?_)(\d\d)(\.png: [^(]*)", m)
            key = (g.group(1), g.group(3).rstrip()) if g else (m, "")
            groups.setdefault(key, []).append(g.group(2) if g else None)
        out = []
        for (head, problem), frames in groups.items():
            out.append(f"{head}[{', '.join(frames)}]{problem}" if problem else head)
        return out

    def text(self):
        out = ["# Sprite delivery import report", ""]
        for title, items in (("Errors", self.grouped(self.errors)), ("Warnings", self.grouped(self.warnings)), ("Notes", self.notes)):
            out.append(f"## {title} ({len(items)})")
            out += [f"- {m}" for m in items] or ["- none"]
            out.append("")
        return "\n".join(out)


def find_dots(img):
    """Centroid of each anchor colour on a dot layer."""
    px = img.load()
    hits = defaultdict(list)
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            for name, (cr, cg, cb) in ANCHOR_COLOURS.items():
                if abs(r - cr) <= 20 and abs(g - cg) <= 20 and abs(b - cb) <= 20:
                    hits[name].append((x, y))
                    break
    return {n: (round(sum(p[0] for p in pts) / len(pts)), round(sum(p[1] for p in pts) / len(pts))) for n, pts in hits.items()}


def check_frame(name, img, action, rep):
    if img.size != (W, H):
        rep.error(f"{name}: canvas is {img.size[0]}x{img.size[1]}, must be {W}x{H}")
        return False
    if img.mode != "RGBA":
        rep.error(f"{name}: no alpha channel")
        return False
    a = img.getchannel("A")
    if a.getextrema()[0] > 0 or any(a.getpixel(c) for c in ((0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1))):
        rep.error(f"{name}: background is not transparent")
        return False
    box = img.getbbox()
    if not box:
        rep.error(f"{name}: frame is empty")
        return False
    bottom = box[3] - 1
    if action in ("idle", "run_to_idle") and abs(bottom - PIVOT[1]) > 4:
        rep.warn(f"{name}: soles at y={bottom}, expected {PIVOT[1]} (standing frames must sit on the foot line)")
    elif bottom > PIVOT[1] + 6:
        rep.warn(f"{name}: drawn {bottom - PIVOT[1]} px below the foot line")
    height = PIVOT[1] - box[1]
    if not 270 <= height <= 330:
        rep.warn(f"{name}: character is {height} px tall above the foot line, expected about 300")
    # Halo: light, semi-transparent pixels on the silhouette edge.
    px = img.load()
    edge = light = 0
    for y in range(box[1], box[3]):
        for x in range(box[0], box[2]):
            r, g, b, al = px[x, y]
            if 0 < al < 200:
                edge += 1
                if min(r, g, b) > 215:
                    light += 1
    if edge and light / edge > 0.15:
        rep.warn(f"{name}: pale edge halo ({light} of {edge} edge pixels are near-white)")
    return True


def trim(img):
    box = img.getbbox()
    if not box:
        return None, (0, 0)
    return img.crop(box), (box[0], box[1])


class Packer:
    """Shelf packer onto fixed-size pages."""

    def __init__(self):
        self.pages = []
        self._new_page()

    def _new_page(self):
        self.pages.append(Image.new("RGBA", (PAGE, PAGE), (0, 0, 0, 0)))
        self.x = self.y = self.row_h = 0

    def add(self, img):
        w, h = img.size
        if self.x + w > PAGE:
            self.x, self.y, self.row_h = 0, self.y + self.row_h + 1, 0
        if self.y + h > PAGE:
            self._new_page()
        page = len(self.pages) - 1
        self.pages[page].alpha_composite(img, (self.x, self.y))
        rect = [self.x, self.y, w, h]
        self.x += w + 1
        self.row_h = max(self.row_h, h)
        return page, rect


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--character", default="kitsune10")
    args = ap.parse_args()
    char, src, out = args.character, args.src, args.out
    rep = Report()
    notes = json.loads((src / "notes.json").read_text()) if (src / "notes.json").exists() else {}
    if not notes:
        rep.warn("notes.json missing: using default stride, contact frames and core colour")

    base_re = re.compile(rf"cc_{re.escape(char)}_({'|'.join(ACTIONS)})_({'|'.join(FACINGS)})_(\d\d)\.png$")
    frames = defaultdict(dict)  # action -> facing -> {index: path}
    for p in sorted(src.glob(f"cc_{char}_*.png")):
        m = base_re.match(p.name)
        if m:
            frames[m.group(1)].setdefault(m.group(2), {})[int(m.group(3))] = p

    packer = Packer()
    frame_defs, actions = {}, {}
    for code, (game_name, want_n, fps, loop) in ACTIONS.items():
        if code not in frames:
            rep.note(f"{code}: not delivered yet")
            continue
        views = {}
        for facing in FACINGS:
            got = frames[code].get(facing)
            if not got:
                rep.warn(f"{code}: facing {facing} missing (the game will mirror the opposite facing)")
                continue
            idx = sorted(got)
            if idx != list(range(len(idx))):
                rep.warn(f"{code}_{facing}: frame numbers have gaps {idx}")
            if len(idx) != want_n:
                rep.warn(f"{code}_{facing}: {len(idx)} frames, spec asks for {want_n}")
            steps = []
            for i in idx:
                path = got[i]
                key = f"{code}_{facing}_{i:02d}"
                img = Image.open(path)
                img = img.convert("RGBA") if img.mode in ("RGBA", "LA", "P") else img
                if not check_frame(path.name, img, code, rep):
                    continue
                anchors = {}
                for suffix, z in (("_anchors_back", -1), ("_anchors", 1)):
                    dots = path.with_name(path.stem + suffix + ".png")
                    if dots.exists():
                        for n, (x, y) in find_dots(Image.open(dots).convert("RGBA")).items():
                            anchors[n] = [x, y, z]
                missing = [n for n in ANCHOR_COLOURS if n not in anchors]
                if missing:
                    rep.warn(f"{path.name}: anchors missing: {', '.join(missing)}")
                t, off = trim(img)
                page, rect = packer.add(t)
                fd = {"rect": rect, "offset": list(off), "page": page, "anchors": anchors}
                for ov in sorted(src.glob(path.stem + "_gear_*.png")):
                    gm = re.search(r"_gear_(\w+?)_mk(\d)$", ov.stem)
                    if not gm:
                        rep.warn(f"{ov.name}: overlay name not understood")
                        continue
                    oimg = Image.open(ov).convert("RGBA")
                    if oimg.size != (W, H):
                        rep.error(f"{ov.name}: overlay canvas must be {W}x{H}")
                        continue
                    ot, ooff = trim(oimg)
                    if ot is None:
                        continue
                    opage, orect = packer.add(ot)
                    slot, tier = gm.group(1), gm.group(2)
                    okey = f"core_{tier}" if slot == "core" else f"{slot}_mk{tier}"
                    fd.setdefault("overlays", {})[okey] = {"rect": orect, "offset": list(ooff), "page": opage}
                frame_defs[key] = fd
                steps.append({"frame": key})
            if steps:
                views[facing] = steps
        if not views:
            continue
        n = min(len(v) for v in views.values())
        events = []
        if code == "run":
            events = [{"frame": 0, "type": "foot_contact"}, {"frame": n // 2, "type": "foot_contact"}]
        elif code == "shot":
            c = int(notes.get("shot_contact", 3))
            events = [{"frame": max(c - 1, 0), "type": "wind_up"}, {"frame": c, "type": "foot_contact", "anchor": notes.get("shot_foot", "toe_R")}, {"frame": c, "type": "ball_release"}]
        elif code == "ability":
            r = int(notes.get("ability_release", 5))
            events = [{"frame": 0, "type": "ability_focus"}, {"frame": r, "type": "ability_release"}, {"frame": n - 1, "type": "ability_resolve"}]
        act = {"fps": fps, "loop": loop, "views": views, "events": [e for e in events if e["frame"] < n]}
        if code == "run":
            act["stride_px"] = int(notes.get("stride_px", 380))
            if "stride_px" not in notes:
                rep.warn("run: stride_px not given in notes.json, assuming 380")
        actions[game_name] = act

    # Rigid gear pieces.
    gear = {}
    pivots = notes.get("gear_pivots", {})
    for p in sorted(src.glob("cc_gear_*.png")):
        gm = re.match(r"cc_gear_(\w+?)_mk(\d)_(" + "|".join(FACINGS) + r")(?:_([LR]))?\.png$", p.name)
        if not gm:
            rep.warn(f"{p.name}: rigid gear name not understood")
            continue
        slot, tier, facing, side = gm.groups()
        if slot not in RIGID_ANCHORS:
            rep.warn(f"{p.name}: unknown slot {slot}")
            continue
        key = (f"core_{tier}" if slot == "core" else f"{slot}_mk{tier}") + f"_{facing}" + (f"_{side}" if side else "")
        img = Image.open(p).convert("RGBA")
        t, off = trim(img)
        if t is None:
            continue
        page, rect = packer.add(t)
        pv = pivots.get(key)
        if pv is None:
            rep.warn(f"{p.name}: no pivot in notes.json gear_pivots['{key}'], using its centre")
            pv = [img.width / 2, img.height / 2]
        anchor, align = RIGID_ANCHORS[slot]
        s = side or "R"
        piece = {"rect": rect, "page": page, "pivot": [pv[0] - off[0], pv[1] - off[1]], "anchor": anchor.format(s=s)}
        if align:
            piece["alignTo"] = align.format(s=s)
        gear[key] = piece

    if not actions:
        rep.error("no usable frames found")

    out.mkdir(parents=True, exist_ok=True)
    images = []
    for i, page in enumerate(packer.pages):
        box = page.getbbox() or (0, 0, 1, 1)
        page = page.crop((0, 0, PAGE, box[3]))  # drop unused rows
        name = f"cc_{char}_atlas_{i}.png"
        page.save(out / name, optimize=True)
        images.append(name)
    meta = {
        "player": f"emberforge_{char}",
        "status": "production" if not rep.errors else "placeholder",
        "note": "Packed by tools/sprites/import_delivery.py; see import_report.md",
        "image": images[0],
        "images": images,
        "frameSize": [W, H],
        "pivot_normalized": [PIVOT[0] / W, PIVOT[1] / H],
        "coreColour": notes.get("core_colour", "#ff6f9e"),
        "coreCreature": notes.get("core_creature", "kitsune"),
        "views": {f: {"faces": f.upper()} for f in FACINGS},
        "layers": ["aura", "gear_back", "base", "overlays", "gear_legs", "gear_boots", "gear_arms", "gear_shoulders", "gear_head", "core", "fx"],
        "frames": frame_defs,
        "actions": actions,
        "gear": gear,
    }
    (out / f"cc_{char}.json").write_text(json.dumps(meta, indent=1))
    rep.note(f"packed {len(frame_defs)} frames and {len(gear)} rigid gear pieces onto {len(images)} atlas page(s)")
    (out / "import_report.md").write_text(rep.text())
    print(rep.text())
    sys.exit(1 if rep.errors else 0)


if __name__ == "__main__":
    main()
