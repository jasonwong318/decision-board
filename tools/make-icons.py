#!/usr/bin/env python3
"""Generate the PWA icons.

    python3 tools/make-icons.py

Draws at 4x and downsamples so the strokes come out antialiased without
pulling in an SVG rasteriser. Re-run this if the brand colours change.
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
SS = 4  # supersampling factor

RED = (200, 16, 46, 255)
GROOVE = (61, 17, 25, 255)
WELL = (53, 17, 26, 255)
BALL = (233, 234, 236, 255)
BALL_EDGE = (141, 144, 153, 255)


def draw_icon(size, inset, rounded):
    """inset: fraction of the canvas kept clear around the artwork."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=RED)
    else:
        d.rectangle([0, 0, s - 1, s - 1], fill=RED)

    # Map artwork coordinates (0..1) into the safe area.
    span = 1 - inset * 2

    def p(x, y):
        return (int((inset + x * span) * s), int((inset + y * span) * s))

    stroke = max(1, int(s * span * 0.062))

    def cap(x, y):
        """PIL lines have butt ends; a dot at each joint fakes a round cap."""
        cx, cy = p(x, y)
        d.ellipse([cx - stroke // 2, cy - stroke // 2, cx + stroke // 2, cy + stroke // 2],
                  fill=GROOVE)

    # Entry channel, then two levels of forks — the board's whole idea in one glyph.
    d.line([p(0.5, 0.13), p(0.5, 0.30)], fill=GROOVE, width=stroke)
    for target in (0.27, 0.73):
        d.line([p(0.5, 0.30), p(target, 0.52)], fill=GROOVE, width=stroke)
    for parent, kids in ((0.27, (0.15, 0.39)), (0.73, (0.61, 0.85))):
        for kid in kids:
            d.line([p(parent, 0.52), p(kid, 0.72)], fill=GROOVE, width=stroke)
            cap(kid, 0.72)
    for joint in ((0.5, 0.30), (0.27, 0.52), (0.73, 0.52)):
        cap(*joint)

    # Three landing bins, echoing the physical board's X / retry / check.
    for left, right in ((0.06, 0.34), (0.38, 0.62), (0.66, 0.94)):
        x0, y0 = p(left, 0.78)
        x1, y1 = p(right, 0.95)
        d.rounded_rectangle([x0, y0, x1, y1], radius=int(s * span * 0.035), fill=WELL)

    # The ball, waiting at the entry.
    r = int(s * span * 0.085)
    cx, cy = p(0.5, 0.13)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BALL, outline=BALL_EDGE,
              width=max(1, int(s * span * 0.008)))

    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    targets = [
        ("icon-192.png", 192, 0.06, True),
        ("icon-512.png", 512, 0.06, True),
        # Maskable icons get cropped to a circle by the launcher, so the artwork
        # sits inside the inner 80% and the red bleeds to the edges.
        ("icon-maskable-512.png", 512, 0.18, False),
    ]
    for name, size, inset, rounded in targets:
        path = OUT / name
        draw_icon(size, inset, rounded).save(path)
        print(f"wrote {path.relative_to(OUT.parent)} ({size}x{size})")


if __name__ == "__main__":
    main()
