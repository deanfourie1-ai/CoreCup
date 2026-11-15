"""Cut the main menu art out of Deans approved concept images.

The menu has no painted key art of its own yet, so it borrows:
  * the hero shot from the approved Kitsune "visual direction" sheet, and
  * head-and-shoulders portraits from the creature-core character sheets.

Usage:
  python3 tools/menu/make_menu_art.py <motion_direction.png> <character_sheets_dir> public/menu

Crops are fixed boxes for these exact sheets (1448x1086 and 1122x1402).
Replace the outputs with real key art when the design agent paints some.
"""
import sys
from pathlib import Path

from PIL import Image, ImageFilter

HERO_BOX = (340, 0, 1448, 500)          # Kitsune running with the foxfire spirit
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
    hero = m.crop(HERO_BOX)
    # Hide the sheet's title text (top-left corner) under blurred sky taken
    # from just below it; the menu's left fade covers the rest.
    patch = hero.crop((0, 58, 330, 88)).resize((330, 58)).filter(ImageFilter.GaussianBlur(6))
    hero.paste(patch, (0, 0))
    save(hero, out / 'hero-kitsune.webp', 1600)
    save(m.crop(KITSUNE_PORTRAIT_BOX), out / 'portrait-kitsune.webp', 320)
    for core, name in SHEETS.items():
        sheet = Image.open(sheets_dir / name).convert('RGB')
        save(sheet.crop(SHEET_PORTRAIT_BOX), out / f'portrait-{core}.webp', 320)


if __name__ == '__main__':
    main()
