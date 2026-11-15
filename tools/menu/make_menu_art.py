"""Cut the main menu art out of Deans approved concept images.

The menu background is painted key art (public/menu/key-art-kitsune.webp,
delivered by the design agent at 2560x1440). This script only cuts the squad
portraits: Kitsune's from the approved "visual direction" sheet and the rest
from the creature-core character sheets.

Usage:
  python3 tools/menu/make_menu_art.py <motion_direction.png> <character_sheets_dir> public/menu

Crops are fixed boxes for these exact sheets (1448x1086 and 1122x1402).
Replace the outputs with painted portraits when the design agent makes them.
"""
import sys
from pathlib import Path

from PIL import Image

KITSUNE_PORTRAIT_BOX = (118, 70, 334, 266)  # portrait beside "KITSUNE #10" (has her goggles)
SHEET_PORTRAIT_BOX = (745, 135, 950, 305)   # portrait panel, top right of each sheet

SHEETS = {
    'golem': '04_golem_stone_wall.png',
    'qilin': '07_qilin_guardian_aura.png',
    'anansi': '05_anansi_web_pass.png',
    'phoenix': '01_phoenix_flame_shot.png',
}


def save(im: Image.Image, path: Path, width: int) -> None:
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(path, 'WEBP', quality=88, method=6)
    print(path, im.size)


def main() -> None:
    motion, sheets_dir, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    m = Image.open(motion).convert('RGB')
    save(m.crop(KITSUNE_PORTRAIT_BOX), out / 'portrait-kitsune.webp', 320)
    for core, name in SHEETS.items():
        sheet = Image.open(sheets_dir / name).convert('RGB')
        save(sheet.crop(SHEET_PORTRAIT_BOX), out / f'portrait-{core}.webp', 320)


if __name__ == '__main__':
    main()
