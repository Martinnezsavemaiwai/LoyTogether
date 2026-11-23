"""Model every krathong part and render each as a transparent sprite (Blender 5.3, Cycles).

  blender -b --factory-startup -P blender/krathong.py -- --out blender/out/krathong --samples 96

Layers, back to front, as the web app stacks them (KrathongArt.tsx):
  (rim-front-{shape}-{base} holds the folds/petals on the near side of the plate; it is
   stacked after the front flowers so the folds overlap them as they do in a real krathong)
  base-{shape}-{base}               plate, folds or block (6 bases x 3 shapes)
  beads-back-{shape}-{colour}       bead ring, back half
  garland-back-{shape}              jasmine buds on the rim, back half
  flower-back-{shape}-{kind}-p{n}   flowers in ring slots i % 3 == n, back half
  candle-{colour}                   candle and flame (same for every shape)
  incense                           three incense sticks
  coins-{shape}                     coins laid on the plate
  flower-front-..., beads-front-..., garland-front-...
Flowers come in three phases so up to three kinds can share one ring.
One orthographic camera frames all of them identically, so the layers line up.
The frame matches the 220x190 viewBox of the SVG fallback (KrathongSvg.tsx).
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

R = 0.12  # plate radius, metres
RES = (640, 552)  # 220:190

SHAPES = ["lotus", "circle", "heart"]
BASES = ["banana_leaf", "banana_rose", "flower", "bread", "banana_trunk", "ice"]
FLOWERS = ["marigold", "rose", "orchid", "lotus", "jasmine", "chrysanthemum"]
CANDLES = {"golden": (0.85, 0.48, 0.08), "white": (0.95, 0.92, 0.85), "pink": (0.95, 0.5, 0.65), "red": (0.75, 0.08, 0.1)}
BEADS = ["gold", "purple", "pink", "pearl"]

# --------------------------------------------------------------------------- helpers


def reset():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                 bpy.data.cameras, bpy.data.worlds, bpy.data.collections):
        for item in list(coll):
            coll.remove(item)


def collection(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(c)
    return c


def obj(name, bm, mat, coll, loc=(0, 0, 0), rot=(0, 0, 0), smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.rotation_euler = rot
    coll.objects.link(ob)
    return ob


_mats = {}


def principled(name, color, rough=0.5, sss=0.0, emit=None, strength=0.0, metallic=0.0,
               transmission=0.0, ior=1.45, coat=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Subsurface Weight"].default_value = sss
    b.inputs["Subsurface Radius"].default_value = (0.01, 0.006, 0.004)
    b.inputs["Transmission Weight"].default_value = transmission
    b.inputs["IOR"].default_value = ior
    b.inputs["Coat Weight"].default_value = coat
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    _mats[name] = m
    return m


def leaf_mat(name, color):
    """Banana leaf: glossy green with fine parallel veins."""
    if name in _mats:
        return _mats[name]
    m = principled(name, color, rough=0.35, sss=0.15)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 90
    wave.inputs["Distortion"].default_value = 1.5
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    ramp = nt.nodes.new("ShaderNodeMix")
    ramp.data_type = "RGBA"
    ramp.inputs[6].default_value = (*color, 1)
    ramp.inputs[7].default_value = (color[0] * 1.5, color[1] * 1.35, color[2] * 1.2, 1)
    nt.links.new(wave.outputs["Fac"], ramp.inputs[0])
    nt.links.new(ramp.outputs[2], b.inputs["Base Color"])
    return m


def noisy(name, color, scale=60, strength=0.5, rough=0.6, sss=0.2):
    if name in _mats:
        return _mats[name]
    m = principled(name, color, rough=rough, sss=sss)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = scale
    nz.inputs["Detail"].default_value = 8
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    nt.links.new(nz.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def shape_outline(shape, n):
    pts = []
    for i in range(n):
        t = i / n * math.pi * 2
        if shape == "heart":
            hx = 16 * math.sin(t) ** 3
            hy = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
            # SVG y points down-screen = toward the camera; here +Y is away from camera.
            pts.append((hx / 16, (hy + 2) / 15))
        else:
            r = 0.9 + 0.14 * abs(math.cos(4 * t)) ** 0.6 if shape == "lotus" else 1.0
            pts.append((math.sin(t) * r, math.cos(t) * r))
    return pts


def slab(name, shape, radius, z0, z1, mat, coll, n=96, bevel=True):
    bm = bmesh.new()
    pts = shape_outline(shape, n)
    bottom = [bm.verts.new((x * radius, y * radius, z0)) for x, y in pts]
    top = [bm.verts.new((x * radius, y * radius, z1)) for x, y in pts]
    bm.faces.new(list(reversed(bottom)))
    bm.faces.new(top)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = obj(name, bm, mat, coll)
    if bevel:
        m = ob.modifiers.new("Bevel", "BEVEL")
        m.width = min(0.004, (z1 - z0) * 0.3)
        m.segments = 3
    return ob


def uv_sphere(r, seg=16, rings=10):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    return bm


def lathe_bm(profile, seg=16):
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z))
                      for i in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if profile[0][0] > 0:
        bm.faces.new(list(reversed(rings[0])))
    if profile[-1][0] > 0:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def scaled(bm, sx, sy, sz):
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    return bm


def petal_bm(length, width, cup=0.4, seg=8):
    """A cupped petal lying along +Y, curling up toward +Z."""
    bm = bmesh.new()
    grid = []
    for i in range(seg + 1):
        u = i / seg
        row = []
        w = math.sin(u * math.pi) ** 0.8 * width / 2 + 1e-4
        for j in range(5):
            v = (j / 4) * 2 - 1
            x = v * w
            y = u * length
            z = (v * v) * w * cup + (u ** 2) * length * 0.35
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for i in range(seg):
        for j in range(4):
            bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.0008)
    return bm


def outward_rot(x, y, tilt):
    """Rotation that points local +Y outward from the centre and tips it up by `tilt`."""
    heading = math.atan2(x, y)
    return (tilt, 0, -heading)


# --------------------------------------------------------------------------- bases


def base_banana(shape, coll, rose=False):
    dark = leaf_mat("LeafDark", (0.015, 0.1, 0.025))
    light = leaf_mat("LeafLight", (0.04, 0.2, 0.045))
    slab(f"Plate_{shape}", shape, R, 0.0, 0.028, dark, coll)
    slab(f"Top_{shape}", shape, R * 0.93, 0.028, 0.03, light, coll)
    for row, (n, scale, tilt) in enumerate(((20, 1.0, 0.95), (20, 0.8, 1.15))):
        pts = shape_outline(shape, n)
        for i, (x, y) in enumerate(pts):
            off = 0.5 if row else 0.0
            if row:
                t = (i + off) / n * math.pi * 2
                x, y = shape_outline(shape, n * 2)[(i * 2 + 1) % (n * 2)]
            px, py = x * R * scale * 0.96, y * R * scale * 0.96
            if rose:
                bm = lathe_bm([(0.009, 0), (0.012, 0.012), (0.008, 0.026), (0.002, 0.03)], seg=10)
                bm = scaled(bm, 1, 0.7, 1)
                ob = obj(f"Fold{row}_{i}_{shape}", bm, light if row else dark, coll, loc=(px, py, 0.02),
                         rot=outward_rot(x, y, -0.35))
            else:
                # a leaf folded into a pointed cone (กลีบแหลม), flattened front to back
                bm = scaled(lathe_bm([(0.012, 0), (0.008, 0.02), (0.0, 0.044)], seg=4), 1, 0.45, 1)
                ob = obj(f"Fold{row}_{i}_{shape}", bm, light if row else dark, coll, loc=(px, py, 0.016),
                         rot=outward_rot(x, y, -0.5), smooth=False)


def base_flower(shape, coll):
    outer = principled("PetalPink", (0.75, 0.15, 0.32), rough=0.4, sss=0.4)
    inner = principled("PetalWhite", (0.9, 0.7, 0.76), rough=0.4, sss=0.4)
    slab(f"Plate_{shape}", shape, R * 0.95, 0.0, 0.026, leaf_mat("LeafDark", (0.015, 0.1, 0.025)), coll)
    for row, (n, scale, mat, tilt) in enumerate(((22, 0.95, outer, -0.25), (22, 0.75, inner, -0.6))):
        for i, (x, y) in enumerate(shape_outline(shape, n)):
            if row:
                x, y = shape_outline(shape, n * 2)[(i * 2 + 1) % (n * 2)]
            bm = petal_bm(0.045, 0.03, cup=0.5)
            obj(f"Petal{row}_{i}_{shape}", bm, mat, coll, loc=(x * R * scale * 0.85, y * R * scale * 0.85, 0.02),
                rot=outward_rot(x, y, tilt))


def base_bread(shape, coll):
    crust = noisy("Bread", (0.42, 0.2, 0.05), scale=120, strength=0.6, rough=0.8, sss=0.3)
    ob = slab(f"Bread_{shape}", shape, R, 0.0, 0.032, crust, coll)
    ob.modifiers["Bevel"].width = 0.012
    ob.modifiers["Bevel"].segments = 5
    crumb = noisy("Crumb", (0.62, 0.42, 0.2), scale=200, strength=0.8, rough=0.9)
    slab(f"Crumb_{shape}", shape, R * 0.86, 0.031, 0.034, crumb, coll)


def base_trunk(shape, coll):
    skin = noisy("TrunkSkin", (0.4, 0.46, 0.2), scale=30, strength=0.3, rough=0.5, sss=0.3)
    slab(f"Trunk_{shape}", shape, R, 0.0, 0.055, skin, coll)
    cut = principled("TrunkCut", (0.68, 0.72, 0.48), rough=0.45, sss=0.4)
    nt = cut.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "RINGS"
    wave.inputs["Scale"].default_value = 18
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.3
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    slab(f"TrunkTop_{shape}", shape, R * 0.985, 0.055, 0.0565, cut, coll, bevel=False)


def base_ice(shape, coll):
    """Clear ice disc with petals frozen inside (กระทงน้ำแข็ง)."""
    ice = principled("Ice", (0.85, 0.95, 1.0), rough=0.06, transmission=1.0, ior=1.31)
    nt = ice.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 40
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.15
    nt.links.new(nz.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    ob = slab(f"Ice_{shape}", shape, R, 0.0, 0.05, ice, coll)
    ob.modifiers["Bevel"].width = 0.008
    ob.modifiers["Bevel"].segments = 4
    rnd = random.Random(5)
    frozen = [principled("FrozenPink", (0.9, 0.3, 0.5), rough=0.5, sss=0.3),
              principled("FrozenYellow", (0.95, 0.65, 0.1), rough=0.5, sss=0.3),
              principled("FrozenWhite", (0.95, 0.95, 0.95), rough=0.5, sss=0.3)]
    for i in range(26):
        a = rnd.uniform(0, math.pi * 2)
        r = R * rnd.uniform(0.15, 0.8)
        bm = petal_bm(0.02, 0.014, cup=0.3)
        obj(f"Frozen{i}_{shape}", bm, frozen[i % 3], coll, loc=(math.sin(a) * r, math.cos(a) * r, rnd.uniform(0.012, 0.035)),
            rot=(rnd.uniform(-0.8, 0.8), rnd.uniform(-0.8, 0.8), rnd.uniform(0, 6.28)))
    bubble = principled("Bubble", (1, 1, 1), rough=0.0, transmission=1.0, ior=1.0)
    for i in range(40):
        a = rnd.uniform(0, math.pi * 2)
        r = R * rnd.uniform(0, 0.9)
        obj(f"Bubble{i}_{shape}", uv_sphere(rnd.uniform(0.0008, 0.002), 8, 6), bubble, coll,
            loc=(math.sin(a) * r, math.cos(a) * r, rnd.uniform(0.006, 0.044)))


def split_front_rim(coll, front):
    """Move folds/petals on the near half (y < 0) into their own layer."""
    for ob in list(coll.objects):
        if ob.name.startswith(("Fold", "Petal")) and ob.location.y < 0:
            coll.objects.unlink(ob)
            front.objects.link(ob)
    return len(front.objects)


BASE_BUILDERS = {
    "banana_leaf": lambda s, c: base_banana(s, c),
    "banana_rose": lambda s, c: base_banana(s, c, rose=True),
    "flower": base_flower,
    "bread": base_bread,
    "banana_trunk": base_trunk,
    "ice": base_ice,
}
BASE_TOP = {"banana_leaf": 0.03, "banana_rose": 0.03, "flower": 0.026, "bread": 0.034, "banana_trunk": 0.056, "ice": 0.05}

# --------------------------------------------------------------------------- flowers


def flower(kind, name, coll, loc, s=1.0):
    x, y, z = loc
    if kind == "marigold":
        m = noisy("Marigold", (0.95, 0.42, 0.02), scale=900, strength=1.0, rough=0.7, sss=0.3)
        bm = scaled(uv_sphere(0.017 * s, 24, 14), 1, 1, 0.75)
        o = obj(name, bm, m, coll, loc=(x, y, z + 0.01 * s))
        d = o.modifiers.new("Disp", "DISPLACE")
        tex = bpy.data.textures.get("MarigoldTex") or bpy.data.textures.new("MarigoldTex", "VORONOI")
        tex.noise_scale = 0.004
        d.texture = tex
        d.strength = 0.004 * s
        sub = o.modifiers.new("Sub", "SUBSURF")
        sub.levels = sub.render_levels = 2
        o.modifiers.move(1, 0)
    elif kind == "rose":
        m = principled("Rose", (0.5, 0.02, 0.06), rough=0.45, sss=0.4)
        for k, (n, r, tilt) in enumerate(((5, 0.01, 0.9), (5, 0.006, 1.25), (3, 0.002, 1.5))):
            for i in range(n):
                a = i / n * math.pi * 2 + k * 0.6
                bm = petal_bm(0.018 * s * (1 - k * 0.2), 0.02 * s * (1 - k * 0.2), cup=0.9)
                obj(f"{name}_{k}_{i}", bm, m, coll, loc=(x + math.sin(a) * r * s, y + math.cos(a) * r * s, z + 0.002),
                    rot=(tilt * -1 + 1.57 - 0.6, 0, -a))
    elif kind == "orchid":
        m = principled("Orchid", (0.55, 0.12, 0.6), rough=0.35, sss=0.5)
        lip = principled("OrchidLip", (0.95, 0.85, 0.95), rough=0.35, sss=0.4)
        for i in range(5):
            a = i / 5 * math.pi * 2
            bm = petal_bm(0.022 * s, 0.016 * s, cup=0.2)
            obj(f"{name}_{i}", bm, m, coll, loc=(x, y, z + 0.006), rot=(-0.2, 0, -a))
        obj(f"{name}_lip", scaled(uv_sphere(0.005 * s, 12, 8), 1, 1, 0.6), lip, coll, loc=(x, y, z + 0.009))
    elif kind == "lotus":
        m = principled("LotusBud", (0.92, 0.45, 0.6), rough=0.35, sss=0.5)
        sep = principled("Sepal", (0.12, 0.35, 0.12), rough=0.4)
        bm = lathe_bm([(0.0, 0), (0.008, 0.004), (0.012, 0.016), (0.009, 0.03), (0.0, 0.045)], seg=16)
        obj(name, scaled(bm, s, s, s), m, coll, loc=(x, y, z))
        for i in range(4):
            a = i / 4 * math.pi * 2
            bm = petal_bm(0.014 * s, 0.012 * s, cup=0.6)
            obj(f"{name}_sep{i}", bm, sep, coll, loc=(x, y, z + 0.002), rot=(-1.1, 0, -a))
    elif kind == "jasmine":
        m = principled("Jasmine", (0.97, 0.96, 0.9), rough=0.4, sss=0.5)
        rnd = random.Random(hash(name) & 0xffff)
        for k in range(5):
            cx, cy = x + rnd.uniform(-0.01, 0.01) * s, y + rnd.uniform(-0.01, 0.01) * s
            for i in range(5):
                a = i / 5 * math.pi * 2
                bm = petal_bm(0.008 * s, 0.006 * s, cup=0.2)
                obj(f"{name}_{k}_{i}", bm, m, coll, loc=(cx, cy, z + 0.004 + k * 0.001), rot=(-0.1, 0, -a))
    elif kind == "chrysanthemum":
        m = principled("Chrysanthemum", (0.98, 0.78, 0.08), rough=0.5, sss=0.3)
        for k, (n, tilt, ln) in enumerate(((22, -0.15, 0.02), (16, -0.6, 0.016), (10, -1.1, 0.011))):
            for i in range(n):
                a = i / n * math.pi * 2 + k * 0.2
                bm = petal_bm(ln * s, 0.004 * s, cup=0.8)
                obj(f"{name}_{k}_{i}", bm, m, coll, loc=(x, y, z + 0.004 + k * 0.002), rot=(tilt, 0, -a))


def flower_ring(kind, shape, colls, top):
    """colls[(side, phase)] -> collection. Nine slots; slot i belongs to phase i % 3."""
    scale = 1.15 if kind == "lotus" else 1.4
    for i, (x, y) in enumerate(shape_outline(shape, 9)):
        coll = colls[("back" if y > 0 else "front", i % 3)]
        flower(kind, f"{kind}_{shape}_{i}", coll, (x * R * 0.6, y * R * 0.6, top), s=scale)


# --------------------------------------------------------------------------- candle, incense, decoration


def candle(colour, coll, top):
    body = principled(f"Wax_{colour}", CANDLES[colour], rough=0.35, sss=0.6)
    bm = lathe_bm([(0.011, 0), (0.011, 0.1), (0.009, 0.104), (0.0, 0.104)], seg=24)
    o = obj(f"Candle_{colour}", bm, body, coll, loc=(0, 0, top))
    for i in range(4):
        a = i * 1.7
        drip = scaled(uv_sphere(0.003, 10, 8), 1, 1, 3)
        obj(f"Drip_{colour}_{i}", drip, body, coll, loc=(math.sin(a) * 0.011, math.cos(a) * 0.011, top + 0.09 - i * 0.008))
    wick = principled("Wick", (0.05, 0.03, 0.02), rough=0.9)
    obj(f"Wick_{colour}", lathe_bm([(0.0008, 0), (0.0008, 0.008), (0, 0.009)], 6), wick, coll, loc=(0, 0, top + 0.104))
    flame = principled("Flame", (1, 0.6, 0.2), emit=(1.0, 0.62, 0.22), strength=40)
    bm = lathe_bm([(0.0, 0), (0.0045, 0.004), (0.005, 0.01), (0.003, 0.018), (0.0, 0.03)], 16)
    obj(f"Flame_{colour}", bm, flame, coll, loc=(0, 0, top + 0.108))
    core = principled("FlameCore", (1, 1, 1), emit=(1.0, 0.95, 0.8), strength=80)
    obj(f"FlameCore_{colour}", lathe_bm([(0.0, 0), (0.002, 0.003), (0.0016, 0.008), (0.0, 0.013)], 12), core, coll,
        loc=(0, 0, top + 0.108))
    return o


def incense(coll, top):
    stick = principled("Incense", (0.35, 0.18, 0.08), rough=0.8)
    ember = principled("Ember", (1, 0.3, 0.1), emit=(1.0, 0.25, 0.05), strength=30)
    for i, (dx, lean) in enumerate(((0.026, 0.12), (0.032, 0.2), (0.038, 0.28))):
        st = obj(f"Incense{i}", lathe_bm([(0.0012, 0), (0.0012, 0.13), (0.0, 0.131)], 6), stick, coll,
                 loc=(dx, 0.01, top - 0.01), rot=(0, lean, 0))
        bpy.context.view_layer.update()  # matrix_world is stale until the layer updates
        tip = st.matrix_world @ Vector((0, 0, 0.13))
        obj(f"Ember{i}", uv_sphere(0.0018, 8, 6), ember, coll, loc=tip)


BEAD_MAT = {
    "gold": lambda: principled("BeadGold", (0.9, 0.65, 0.2), rough=0.2, metallic=1.0),
    "purple": lambda: principled("BeadPurple", (0.45, 0.25, 0.85), rough=0.15, coat=1.0),
    "pink": lambda: principled("BeadPink", (0.95, 0.4, 0.65), rough=0.15, coat=1.0),
    "pearl": lambda: principled("Pearl", (0.95, 0.93, 0.88), rough=0.12, coat=1.0, sss=0.2),
}


def beads(colour, shape, front, back, top):
    m = BEAD_MAT[colour]()
    for i, (x, y) in enumerate(shape_outline(shape, 30)):
        obj(f"Bead_{shape}_{colour}_{i}", uv_sphere(0.0042, 12, 8), m, back if y > 0 else front,
            loc=(x * R * 0.87, y * R * 0.87, top + 0.003))
    for i in range(34):  # a strand swagged across the front
        u = i / 33
        x = -R * 0.9 + u * R * 1.8
        y = -R * 0.62 - math.sin(u * math.pi) * R * 0.2
        z = top - 0.006 - math.sin(u * math.pi) * 0.018
        obj(f"Strand_{shape}_{colour}_{i}", uv_sphere(0.0028, 10, 6), m, front, loc=(x, y, z))


def garland(shape, front, back, top):
    """Jasmine buds round the rim and a jasmine swag with a rose and leaf tassel at the front."""
    m = principled("Jasmine", (0.97, 0.96, 0.9), rough=0.4, sss=0.5)
    rose = principled("Rose", (0.5, 0.02, 0.06), rough=0.45, sss=0.4)
    leaf = leaf_mat("LeafLight", (0.04, 0.2, 0.045))
    for i, (x, y) in enumerate(shape_outline(shape, 28)):
        obj(f"Bud_{shape}_{i}", scaled(uv_sphere(0.0035, 8, 6), 1, 1, 1.5), m, back if y > 0 else front,
            loc=(x * R * 0.8, y * R * 0.8, top + 0.004))
    for i in range(40):
        u = i / 39
        x = -R * 0.85 + u * R * 1.7
        y = -R * 0.66 - math.sin(u * math.pi) * R * 0.26
        z = top - 0.008 - math.sin(u * math.pi) * 0.024
        bud = scaled(uv_sphere(0.0042, 10, 8), 1, 1, 1.6)
        obj(f"Garland_{shape}_{i}", bud, rose if i == 20 else m, front, loc=(x, y, z), rot=(0.6, 0, u * 3))
    for side in (-1, 1):
        obj(f"Tassel_{shape}_{side}", petal_bm(0.02, 0.01, cup=0.4), leaf, front,
            loc=(side * 0.004, -R * 0.94, top - 0.034), rot=(-2.2, 0, 0))


def coins(shape, coll, top):
    """A few Thai coins laid on the plate: bimetal 10 baht and silver 1 and 5 baht."""
    gold = principled("CoinGold", (0.85, 0.62, 0.25), rough=0.25, metallic=1.0)
    silver = principled("CoinSilver", (0.82, 0.82, 0.85), rough=0.22, metallic=1.0)
    rnd = random.Random(10)
    spots = [(-0.06, -0.05), (-0.03, -0.072), (0.005, -0.08), (0.04, -0.07), (0.065, -0.045), (-0.075, -0.02)]
    for i, (x, y) in enumerate(spots):
        r = 0.0130 if i % 3 == 0 else 0.0105
        coin = lathe_bm([(r, 0), (r, 0.0022), (r * 0.9, 0.0026), (0, 0.0026)], seg=32)
        mat = gold if i % 3 == 0 else silver
        obj(f"Coin_{shape}_{i}", coin, mat, coll, loc=(x, y, top + 0.0005),
            rot=(rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), 0))
        if i % 3 == 0:  # silver centre of the bimetal coin
            obj(f"CoinCentre_{shape}_{i}", lathe_bm([(r * 0.62, 0), (r * 0.62, 0.0028), (0, 0.0028)], seg=32),
                silver, coll, loc=(x, y, top + 0.0007))


# --------------------------------------------------------------------------- stage


def stage():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.render.film_transparent = True
    sc.cycles.film_transparent_glass = True
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.image_settings.media_type = "IMAGE"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Punchy"
    sc.cycles.use_denoising = True
    sc.cycles.transmission_bounces = 8
    w = bpy.data.worlds.new("Night")
    sc.world = w
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.02, 0.03, 0.07, 1)
    bg.inputs["Strength"].default_value = 1.0
    cd = bpy.data.cameras.new("Cam")
    cd.type = "ORTHO"
    cd.ortho_scale = 0.31
    cam = bpy.data.objects.new("Cam", cd)
    el = math.radians(24)
    target = Vector((0, 0, 0.068))
    cam.location = target + Vector((0, -math.cos(el), math.sin(el))) * 1.5
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(cam)
    sc.camera = cam

    def light(name, kind, energy, color, loc, size=0.2):
        ld = bpy.data.lights.new(name, kind)
        ld.energy, ld.color = energy, color
        if kind == "AREA":
            ld.size = size
        else:
            ld.shadow_soft_size = size
        o = bpy.data.objects.new(name, ld)
        o.location = loc
        o.rotation_euler = (Vector((0, 0, 0.05)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        sc.collection.objects.link(o)

    light("Moon", "AREA", 16, (0.7, 0.8, 1.0), (-0.6, -0.4, 0.8), size=0.6)
    light("Rim", "AREA", 18, (0.6, 0.7, 1.0), (0.4, 0.7, 0.4), size=0.4)
    light("CandleGlow", "POINT", 3.0, (1.0, 0.62, 0.3), (0, 0, 0.17), size=0.01)
    light("Fill", "AREA", 2.5, (1.0, 0.85, 0.7), (0.5, -0.8, 0.3), size=0.8)


def render_only(coll_name, path, samples):
    for c in bpy.data.collections:
        c.hide_render = c.name != coll_name
    glow = bpy.data.objects.get("CandleGlow")
    if glow:  # the plate should not carry a warm spot when no candle is chosen
        glow.hide_render = coll_name.startswith(("base-", "rim-"))
    sc = bpy.context.scene
    sc.cycles.samples = samples
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def gpu():
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for backend in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = backend
        except TypeError:
            continue
        prefs.refresh_devices()
        if any(d.type != "CPU" for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type != "CPU"
            bpy.context.scene.cycles.device = "GPU"
            return backend
    return "CPU"


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "krathong"))
    p.add_argument("--samples", type=int, default=96)
    p.add_argument("--only", default=None, help="comma-separated name prefixes, e.g. base-,rim-")
    a = p.parse_args(args)
    os.makedirs(a.out, exist_ok=True)
    written = []
    reset()
    stage()
    device = gpu()

    prefixes = tuple(a.only.split(",")) if a.only else None

    def want(key):
        return prefixes is None or key.startswith(prefixes)

    def render(coll):
        if want(coll.name):
            render_only(coll.name, os.path.join(a.out, coll.name + ".png"), a.samples)
            written.append(coll.name)

    for colour in CANDLES:  # candles are the same for every shape
        coll = collection(f"candle-{colour}")
        candle(colour, coll, top=0.03)
        render(coll)
    coll = collection("incense")
    incense(coll, top=0.03)
    render(coll)
    top = 0.032  # parts sit on a mid-height plate; the web app nudges them per base
    for shape in SHAPES:
        for base in BASES:
            coll = collection(f"base-{shape}-{base}")
            BASE_BUILDERS[base](shape, coll)
            rim = collection(f"rim-front-{shape}-{base}")
            has_rim = split_front_rim(coll, rim)
            render(coll)
            if has_rim:
                render(rim)
        for kind in FLOWERS:
            colls = {(side, ph): collection(f"flower-{side}-{shape}-{kind}-p{ph}")
                     for side in ("back", "front") for ph in range(3)}
            flower_ring(kind, shape, colls, top)
            for c in colls.values():
                render(c)
        for colour in BEADS:
            front, back = collection(f"beads-front-{shape}-{colour}"), collection(f"beads-back-{shape}-{colour}")
            beads(colour, shape, front, back, top)
            render(back)
            render(front)
        front, back = collection(f"garland-front-{shape}"), collection(f"garland-back-{shape}")
        garland(shape, front, back, top)
        render(back)
        render(front)
        coll = collection(f"coins-{shape}")
        coins(shape, coll, top)
        render(coll)
    print("@@JSON@@" + __import__("json").dumps({"device": device, "count": len(written)}))


if __name__ == "__main__":
    main()
