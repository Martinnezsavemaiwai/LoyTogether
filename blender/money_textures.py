"""Textures for the money props: banknote faces and coin relief maps (system Python + Pillow).

  python blender/money_textures.py

Writes blender/out/money-tex/note-{value}.png (face colour) and coin-{value}.png
(greyscale height for the embossed face). The notes follow the real Series 17 colours
and proportions but are generic designs: no portrait, no Bank of Thailand artwork or
text, because reproducing a banknote image needs the bank's approval.
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "money-tex")
FONT_BOLD = "C:/Windows/Fonts/tahomabd.ttf"
FONT = "C:/Windows/Fonts/tahoma.ttf"

# value: (width mm, body colour, deep print colour, light tint)
NOTES = {
    20: (138, (74, 154, 99), (34, 96, 56), (196, 232, 204)),
    50: (144, (63, 115, 200), (32, 72, 150), (196, 214, 244)),
    100: (150, (207, 74, 67), (140, 40, 36), (246, 205, 198)),
    500: (156, (141, 92, 188), (86, 52, 128), (224, 206, 240)),
    1000: (162, (142, 112, 82), (88, 64, 44), (230, 216, 196)),
}
THAI_DIGITS = str.maketrans("0123456789", "๐๑๒๓๔๕๖๗๘๙")
PX_PER_MM = 10


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def note(value):
    mm, body, deep, light = NOTES[value]
    w, h = mm * PX_PER_MM, 72 * PX_PER_MM
    img = Image.new("RGB", (w, h), body)
    d = ImageDraw.Draw(img)
    # Soft vertical shading, lighter through the middle like printed underprint.
    for y in range(h):
        t = 1 - abs(y / h - 0.5) * 2
        d.line([(0, y), (w, y)], fill=mix(body, light, 0.18 * t))
    # Fine guilloche: interleaved sine lines across the whole face.
    for k in range(26):
        amp, phase = 28 + k % 5 * 6, k * 0.47
        pts = [(x, h * (k + 0.5) / 26 + amp * math.sin(x / 70 + phase)) for x in range(0, w + 20, 12)]
        d.line(pts, fill=mix(body, light, 0.35), width=2)
    # Rosette on the left third.
    cx, cy, r = int(w * 0.3), h // 2, int(h * 0.3)
    rr = r * 0.55
    for k in range(48):
        a = k / 48 * math.tau
        x, y = cx + r * 0.45 * math.cos(a), cy + r * 0.45 * math.sin(a)
        d.ellipse([x - rr, y - rr, x + rr, y + rr], outline=mix(body, light, 0.55), width=2)
    # Watermark window on the right: a pale oval.
    wx, wy = int(w * 0.8), h // 2
    d.ellipse([wx - 110, wy - 170, wx + 110, wy + 170], fill=mix(body, (255, 255, 255), 0.62))
    # Security stripe.
    sx = int(w * 0.62)
    d.rectangle([sx, 0, sx + 26, h], fill=mix(deep, (210, 210, 220), 0.35))
    for y in range(0, h, 24):
        d.rectangle([sx + 6, y, sx + 20, y + 12], fill=mix(deep, (255, 255, 255), 0.6))
    # Frame and corner panels.
    d.rectangle([18, 18, w - 18, h - 18], outline=mix(deep, light, 0.2), width=6)
    d.rectangle([34, 34, w - 34, h - 34], outline=mix(body, light, 0.5), width=2)
    big = ImageFont.truetype(FONT_BOLD, 150 if value < 1000 else 128)
    small = ImageFont.truetype(FONT_BOLD, 74)
    label = f"{value:,}"
    d.text((70, 52), label, font=big, fill=(255, 255, 255))
    d.text((w - 70, h - 56), label, font=big, fill=mix(deep, (255, 255, 255), 0.1), anchor="rd")
    d.text((70, h - 60), str(value).translate(THAI_DIGITS), font=small, fill=mix(deep, light, 0.25), anchor="ld")
    # Not a real note: a small line instead of the issuer's name.
    d.text((sx - 30, 70), "ลอยนำกันเด้อ", font=ImageFont.truetype(FONT, 46), fill=mix(deep, light, 0.3), anchor="ra")
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img.save(os.path.join(OUT, f"note-{value}.png"))


def coin(value):
    """Height map for a coin face: raised rim, dotted ring, the numeral in the centre."""
    s = 512
    img = Image.new("L", (s, s), 90)
    d = ImageDraw.Draw(img)
    d.ellipse([0, 0, s - 1, s - 1], fill=90)
    d.ellipse([10, 10, s - 11, s - 11], outline=230, width=26)
    for k in range(60):
        a = k / 60 * math.tau
        x, y = s / 2 + 200 * math.cos(a), s / 2 + 200 * math.sin(a)
        d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=200)
    font = ImageFont.truetype(FONT_BOLD, 230 if value < 10 else 190)
    d.text((s / 2, s / 2 + 6), str(value), font=font, fill=255, anchor="mm")
    d.text((s / 2, s / 2 + 150), "บาท", font=ImageFont.truetype(FONT_BOLD, 64), fill=220, anchor="mm")
    img = img.filter(ImageFilter.GaussianBlur(2.2))
    img.save(os.path.join(OUT, f"coin-{value}.png"))


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for v in NOTES:
        note(v)
    for v in (10, 5, 2, 1):
        coin(v)
    print("wrote", sorted(os.listdir(OUT)))
