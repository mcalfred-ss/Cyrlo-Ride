"""Build launcher icons from the full source square (no tight content crop).

Tight bbox crop made the art more landscape and letterboxed inside the icon.
We keep the full 1024 frame so the pragya fills the launcher square.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(
    r"C:\Users\ceo\.cursor\projects\d-Projects-Cyrlo-Ride-2\assets"
    r"\cyrlo-ride-launcher-c1caf5de-f0a8-4201-9299-4108b03c13ca.png"
)
DST = ROOT / "assets" / "branding" / "app_icon.png"
ADAPTIVE = ROOT / "assets" / "branding" / "app_icon_adaptive_fg.png"
BACKUP = ROOT / "assets" / "branding" / "app_icon_prev.png"
SIZE = 1024


def square_on_black(im: Image.Image, scale: float) -> Image.Image:
    """Place the full source square centered on black at [scale] of canvas."""
    rgba = im.convert("RGBA").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    if scale >= 0.999:
        return rgba

    side = max(1, int(SIZE * scale))
    scaled = rgba.resize((side, side), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 255))
    offset = (SIZE - side) // 2
    canvas.paste(scaled, (offset, offset), scaled)
    return canvas


def main() -> None:
    im = Image.open(SRC)
    if DST.exists() and not BACKUP.exists():
        shutil.copy2(DST, BACKUP)

    # Full-bleed master — matches the art you provided.
    square_on_black(im, 1.0).convert("RGB").save(DST, "PNG")
    # Adaptive FG same art; flutter_launcher_icons inset handles round masks.
    square_on_black(im, 1.0).convert("RGB").save(ADAPTIVE, "PNG")
    print(f"wrote {DST}")
    print(f"wrote {ADAPTIVE}")


if __name__ == "__main__":
    main()
