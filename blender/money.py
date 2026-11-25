"""Model the money tucked into a krathong and render each piece as a sprite (Blender 5.3, Cycles).

  python blender/money_textures.py          # textures first (Pillow)
  blender -b --factory-startup -P blender/money.py -- --out blender/out/money --samples 96

Same camera, lights and frame as krathong.py, so every sprite lines up with the parts.
  note-{value}-s{slot}   a banknote folded down the middle and stuck upright on a bamboo
                         skewer behind the candle (4 slots), stacked before the candle layer
  coin-{value}-s{slot}   a coin lying on the plate in front (4 slots), stacked after the
                         front flowers
The app breaks a typed amount into notes and coins and picks these sprites by slot.

Real references: Series 17 notes are 72 mm tall and 138 to 162 mm wide, in green (20),
blue (50), red (100), purple (500) and brown (1000). Coins: 10 baht is 26 mm with a
silver ring round a gold centre, 5 baht 24 mm silver, 2 baht 21.75 mm gold, 1 baht
20 mm silver. Note faces are generic (see money_textures.py), never the real artwork.
"""
import math
import os
import random
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import krathong as k  # noqa: E402  (shared camera, lights, helpers)

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, "out", "money-tex")
TOP = 0.032  # plate top the app's per-base lift is measured from

NOTE_MM = {20: 138, 50: 144, 100: 150, 500: 156, 1000: 162}
NOTE_SCALE = 0.6  # folded small, as people do, so the notes never outgrow the krathong
# x, y on the plate (y > 0 is behind the candle), turn about Z, skewer height
NOTE_SLOTS = [(-0.052, 0.034, 0.22, 0.020), (0.052, 0.034, -0.22, 0.020),
              (-0.022, 0.062, 0.1, 0.034), (0.026, 0.064, -0.1, 0.034)]

COINS = {10: (26.0, 2.15, "bimetal"), 5: (24.0, 2.6, "silver"), 2: (21.75, 1.6, "gold"), 1: (20.0, 1.9, "silver")}
# Change counted out largest first never needs more than 4 coins (10 + 5 + 2 + 2).
COIN_SLOTS = [(-0.045, -0.055), (-0.016, -0.069), (0.012, -0.071), (-0.034, -0.08)]


# ----------------------------------------------------------------------------- materials


def image(path, non_color=False):
    img = bpy.data.images.load(path, check_existing=True)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def note_mat(value):
    name = f"Note{value}"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image(os.path.join(TEX, f"note-{value}.png"))
    tex.interpolation = "Cubic"
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    # Polymer notes: a soft sheen, slightly glossy, never metallic.
    b.inputs["Roughness"].default_value = 0.42
    b.inputs["Coat Weight"].default_value = 0.15
    b.inputs["Coat Roughness"].default_value = 0.3
    return m


def coin_mat(name, color, value, radius):
    """Metal with the embossed face from the height map, mapped over the coin's own disc."""
    key = f"{name}{value}"
    if key in bpy.data.materials:
        return bpy.data.materials[key]
    m = bpy.data.materials.new(key)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = 0.3
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1 / (2 * radius), 1 / (2 * radius), 1)
    mapping.inputs["Location"].default_value = (0.5, 0.5, 0)
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image(os.path.join(TEX, f"coin-{value}.png"), non_color=True)
    tex.extension = "CLIP"
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.7
    bump.inputs["Distance"].default_value = 0.0004
    nt.links.new(tex.outputs["Color"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    # Worn high points read brighter: let the relief nudge roughness too.
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["To Min"].default_value = 0.38
    ramp.inputs["To Max"].default_value = 0.2
    nt.links.new(tex.outputs["Color"], ramp.inputs["Value"])
    nt.links.new(ramp.outputs["Result"], b.inputs["Roughness"])
    return m


# Measured F0 (blender-pbr-materials): cupronickel sits near nickel/silver, aluminium bronze near brass.
SILVER = (0.86, 0.85, 0.82)
GOLD = (0.91, 0.74, 0.38)


# ----------------------------------------------------------------------------- geometry


def ring_bm(profile, seg=48):
    """Lathe a closed cross-section into a solid ring. Unlike krathong.lathe_bm it adds no end
    caps, so the hole stays open for the 10 baht's gold centre."""
    bm = bmesh.new()
    rings = [[bm.verts.new((r * math.cos(math.tau * i / seg), r * math.sin(math.tau * i / seg), z)) for i in range(seg)]
             for r, z in profile]
    for a, b in zip(rings, rings[1:] + rings[:1]):
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def folded_note_bm(w, h, fold=math.radians(42), cols=16):
    """A note creased down the middle, the halves swinging back from the crease."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    rows = 2
    grid = []
    for j in range(rows + 1):
        z = h * j / rows
        row = []
        for i in range(cols + 1):
            x = -w / 2 + w * i / cols
            ax = abs(x)
            # a gentle curl so the paper is not a flat card
            curl = 0.004 * (ax / (w / 2)) ** 2
            row.append(bm.verts.new((math.copysign(ax * math.cos(fold), x), ax * math.sin(fold) + curl, z)))
        grid.append(row)
    for j in range(rows):
        for i in range(cols):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            for loop, (ii, jj) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                loop[uv].uv = (ii / cols, jj / rows)
    return bm


def note(value, slot, coll):
    x, y, turn, lift = NOTE_SLOTS[slot]
    w = NOTE_MM[value] / 1000 * NOTE_SCALE
    h = 0.072 * NOTE_SCALE
    ob = k.obj(f"Note_{value}_{slot}", folded_note_bm(w, h), note_mat(value), coll,
               loc=(x, y, TOP + lift), rot=(0, 0, turn), smooth=True)
    sol = ob.modifiers.new("Thickness", "SOLIDIFY")
    sol.thickness = 0.0004
    bamboo = k.principled("Bamboo", (0.62, 0.48, 0.26), rough=0.6)
    stick = k.lathe_bm([(0.0012, 0), (0.0012, lift + h * 0.55), (0.0, lift + h * 0.55 + 0.002)], seg=8)
    k.obj(f"Skewer_{value}_{slot}", stick, bamboo, coll, loc=(x, y + 0.002, TOP - 0.004))


def coin(value, slot, coll):
    mm, thick_mm, metal = COINS[value]
    # A touch larger than life (x1.45) so a 2 cm coin still reads at sprite size.
    r, t = mm / 2000 * 1.45, thick_mm / 1000 * 1.5
    x, y = COIN_SLOTS[slot]
    rnd = random.Random(value * 31 + slot)
    rot = (rnd.uniform(-0.12, 0.12), rnd.uniform(-0.12, 0.12), rnd.uniform(0, math.tau))
    rc = r * 0.62
    # The 10 baht is a true silver ring round a gold centre, so the two never overlap (no z-fighting).
    outer = coin_mat("Silver" if metal != "gold" else "Gold", SILVER if metal != "gold" else GOLD, value, r)
    if metal == "bimetal":
        shape = ring_bm([(rc, 0), (r * 0.97, 0), (r, t * 0.15), (r, t * 0.85), (r * 0.97, t), (rc, t)])
    else:
        shape = k.lathe_bm([(0, 0), (r * 0.97, 0), (r, t * 0.15), (r, t * 0.85), (r * 0.97, t), (0, t)], seg=48)
    k.obj(f"Coin_{value}_{slot}", shape, outer, coll, loc=(x, y, TOP + 0.0004), rot=rot)
    if metal == "bimetal":  # the gold centre sits in the hole with a fine seam, as on the real coin
        centre = k.lathe_bm([(0, 0.0002), (rc * 0.975, 0.0002), (rc * 0.975, t + 0.0003), (0, t + 0.0003)], seg=48)
        k.obj(f"CoinCentre_{value}_{slot}", centre, coin_mat("Gold", GOLD, value, r), coll,
              loc=(x, y, TOP + 0.0004), rot=rot)


# ----------------------------------------------------------------------------- main


def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=os.path.join(HERE, "out", "money"))
    p.add_argument("--samples", type=int, default=96)
    p.add_argument("--only", default=None, help="comma-separated name prefixes, e.g. note-100,coin-10")
    a = p.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    os.makedirs(a.out, exist_ok=True)
    k.reset()
    k.stage()
    device = k.gpu()
    prefixes = tuple(a.only.split(",")) if a.only else None
    written = []

    def build_and_render(name, builder):
        if prefixes and not name.startswith(prefixes):
            return
        coll = k.collection(name)
        builder(coll)
        k.render_only(name, os.path.join(a.out, name + ".png"), a.samples)
        written.append(name)

    for value in NOTE_MM:
        for slot in range(len(NOTE_SLOTS)):
            build_and_render(f"note-{value}-s{slot}", lambda c, v=value, s=slot: note(v, s, c))
    for value in COINS:
        for slot in range(len(COIN_SLOTS)):
            build_and_render(f"coin-{value}-s{slot}", lambda c, v=value, s=slot: coin(v, s, c))
    print("@@JSON@@" + __import__("json").dumps({"device": device, "count": len(written)}))


if __name__ == "__main__":
    main()
