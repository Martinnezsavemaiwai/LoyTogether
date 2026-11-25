"""Build and render the six venue backdrops for ลอยนำกันเด้อ (Blender 5.3, Cycles).

Run headless:
  blender -b --factory-startup -P blender/venues.py -- --venue wat_arun --out blender/out/wat_arun.png
  blender -b --factory-startup -P blender/venues.py -- --venue all --samples 96

Every venue is built from code in an empty scene, so the result is reproducible.
The camera is level at water height, which puts the horizon at exactly 50% of the
frame: the web app floats krathongs on the bottom half and relies on that line.
Frame is 16:10 to match the 1440x900 SVG overlay in RiverScene.tsx. Landmarks stay
within the middle ~40% of the width so a phone in portrait still sees them.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SKILLS = os.path.join(os.path.dirname(HERE), ".claude", "skills")
sys.path.insert(0, os.path.join(SKILLS, "blender-rendering", "scripts"))
import render_batch  # noqa: E402  (blender-rendering skill)

D = 300.0  # distance from camera to the far bank, metres
CAM_H = 2.2

# --------------------------------------------------------------------------- scene


def reset():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                 bpy.data.cameras, bpy.data.worlds, bpy.data.node_groups, bpy.data.images):
        for item in list(coll):
            coll.remove(item)


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def mesh_ob(name, bm, mat=None, smooth=False, loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    if mat:
        me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    return link(ob)


# --------------------------------------------------------------------------- materials

_mats = {}


def mat(name, color, rough=0.6, emit=None, strength=0.0, metallic=0.0):
    key = (name,)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name)
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    _mats[key] = m
    return m


def lit_stone(name, warm=(1.0, 0.52, 0.16), strength=2.2, pattern=None):
    """pattern: None, "mosaic" (Wat Arun porcelain), "brick" or "laterite"."""
    strength *= 0.38
    """Floodlit masonry: brighter toward the base, like uplights at night."""
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.5, 0.3, 0.12, 1)
    bsdf.inputs["Roughness"].default_value = 0.7
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep.inputs[0])
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0
    ramp.inputs["From Max"].default_value = 90
    ramp.inputs["To Min"].default_value = strength
    ramp.inputs["To Max"].default_value = strength * 0.45
    nt.links.new(sep.outputs["Z"], ramp.inputs["Value"])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.0
    mix = nt.nodes.new("ShaderNodeMath")
    mix.operation = "MULTIPLY"
    nt.links.new(ramp.outputs[0], mix.inputs[0])
    remap = nt.nodes.new("ShaderNodeMapRange")
    remap.inputs["To Min"].default_value = 0.75
    remap.inputs["To Max"].default_value = 1.1
    nt.links.new(noise.outputs["Fac"], remap.inputs["Value"])
    nt.links.new(remap.outputs[0], mix.inputs[1])
    bsdf.inputs["Emission Color"].default_value = (*warm, 1)
    out = mix.outputs[0]
    if pattern:
        factor, tint = surface_pattern(nt, pattern, warm)
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        nt.links.new(out, mul.inputs[0])
        nt.links.new(factor, mul.inputs[1])
        out = mul.outputs[0]
        if tint is not None:
            nt.links.new(tint, bsdf.inputs["Emission Color"])
    nt.links.new(out, bsdf.inputs["Emission Strength"])
    return m


def surface_pattern(nt, kind, warm):
    """Returns (brightness factor socket, optional emission colour socket) in world-space metres."""
    tc = nt.nodes.new("ShaderNodeTexCoord")

    def rng(src, lo, hi):
        r = nt.nodes.new("ShaderNodeMapRange")
        r.inputs["To Min"].default_value = lo
        r.inputs["To Max"].default_value = hi
        nt.links.new(src, r.inputs["Value"])
        return r.outputs[0]

    if kind == "mosaic":
        # Broken porcelain pieces: bright and dim cells, some catching blue and white.
        vor = nt.nodes.new("ShaderNodeTexVoronoi")
        vor.inputs["Scale"].default_value = 3.0
        nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(vor.outputs["Color"], sep.inputs[0])
        factor = rng(sep.outputs[0], 0.65, 1.45)
        pick = nt.nodes.new("ShaderNodeMath")
        pick.operation = "GREATER_THAN"
        pick.inputs[1].default_value = 0.72
        nt.links.new(sep.outputs[1], pick.inputs[0])
        mixc = nt.nodes.new("ShaderNodeMix")
        mixc.data_type = "RGBA"
        mixc.inputs[6].default_value = (*warm, 1)
        mixc.inputs[7].default_value = (0.85, 0.9, 1.0, 1)
        nt.links.new(pick.outputs[0], mixc.inputs[0])
        return factor, mixc.outputs[2]
    if kind == "brick":
        brick = nt.nodes.new("ShaderNodeTexBrick")
        brick.inputs["Scale"].default_value = 2.5
        brick.inputs["Mortar Size"].default_value = 0.06
        brick.inputs["Color1"].default_value = (1, 1, 1, 1)
        brick.inputs["Color2"].default_value = (0.7, 0.7, 0.7, 1)
        brick.inputs["Mortar"].default_value = (0.35, 0.35, 0.35, 1)
        nt.links.new(tc.outputs["Object"], brick.inputs["Vector"])
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(brick.outputs["Color"], sep.inputs[0])
        return rng(sep.outputs[0], 0.4, 1.15), None
    # laterite: pitted, blotchy blocks
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1.5
    noise.inputs["Detail"].default_value = 10
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.inputs["Scale"].default_value = 6
    nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])
    a = rng(noise.outputs["Fac"], 0.55, 1.2)
    b = rng(vor.outputs["Distance"], 0.75, 1.05)
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    nt.links.new(a, mul.inputs[0])
    nt.links.new(b, mul.inputs[1])
    return mul.outputs[0], None


def windows_mat(name, lit=(1.0, 0.78, 0.48), density=0.55, scale=0.35):
    """Office/campus facade: a brick grid becomes rows of windows, some lit."""
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.03, 0.035, 0.06, 1)
    bsdf.inputs["Roughness"].default_value = 0.4
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, scale, scale)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    brick = nt.nodes.new("ShaderNodeTexBrick")
    brick.inputs["Color1"].default_value = (1, 1, 1, 1)
    brick.inputs["Color2"].default_value = (0, 0, 0, 1)
    brick.inputs["Mortar"].default_value = (0, 0, 0, 1)
    brick.inputs["Mortar Size"].default_value = 0.35
    brick.inputs["Brick Width"].default_value = 1.4
    brick.inputs["Scale"].default_value = 1.0
    brick.inputs["Row Height"].default_value = 1.0
    brick.offset = 0.0
    sx = nt.nodes.new("ShaderNodeSeparateXYZ")
    cx = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(mp.outputs["Vector"], sx.inputs[0])
    nt.links.new(sx.outputs["X"], cx.inputs["X"])
    nt.links.new(sx.outputs["Z"], cx.inputs["Y"])
    nt.links.new(sx.outputs["Y"], cx.inputs["Z"])
    nt.links.new(cx.outputs[0], brick.inputs["Vector"])
    # Color1/Color2 bias gives each window a random grey; threshold it to lit/unlit.
    gt = nt.nodes.new("ShaderNodeMath")
    gt.operation = "GREATER_THAN"
    gt.inputs[1].default_value = 1 - density
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(brick.outputs["Color"], sep.inputs[0])
    nt.links.new(sep.outputs[0], gt.inputs[0])
    mask = nt.nodes.new("ShaderNodeMath")
    mask.operation = "MULTIPLY"
    nt.links.new(gt.outputs[0], mask.inputs[0])
    nt.links.new(brick.outputs["Fac"], mask.inputs[1])
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    nt.links.new(brick.outputs["Fac"], inv.inputs[1])
    # Fac is 1 on mortar; lit where it is a lit brick (not mortar)
    lit_mask = nt.nodes.new("ShaderNodeMath")
    lit_mask.operation = "MULTIPLY"
    nt.links.new(gt.outputs[0], lit_mask.inputs[0])
    nt.links.new(inv.outputs[0], lit_mask.inputs[1])
    strength = nt.nodes.new("ShaderNodeMath")
    strength.operation = "MULTIPLY"
    strength.inputs[1].default_value = 3.0
    nt.links.new(lit_mask.outputs[0], strength.inputs[0])
    bsdf.inputs["Emission Color"].default_value = (*lit, 1)
    nt.links.new(strength.outputs[0], bsdf.inputs["Emission Strength"])
    return m


def water_mat():
    m = bpy.data.materials.new("Water")
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.005, 0.012, 0.03, 1)
    bsdf.inputs["Roughness"].default_value = 0.1
    bsdf.inputs["Specular IOR Level"].default_value = 0.6
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.25, 2.2, 1.0)  # ripples run across the view
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1.6
    noise.inputs["Detail"].default_value = 6
    nt.links.new(mp.outputs["Vector"], noise.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.45
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


# --------------------------------------------------------------------------- geometry


def box(name, sx, sy, sz, loc, material):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z = (v.co.z + 0.5) * sz
    return mesh_ob(name, bm, material, loc=loc)


def lathe(name, profile, loc, material, segments=12, smooth=False):
    """Spin a list of (radius, z) points around Z. Few segments read as Thai faceted stone."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = []
        for i in range(segments):
            a = 2 * math.pi * i / segments + math.pi / segments
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    bm.faces.new(list(reversed(rings[0])))
    if profile[-1][0] > 1e-4:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return mesh_ob(name, bm, material, smooth=smooth, loc=loc)


def sphere(name, r, loc, material, scale=(1, 1, 1), subdiv=2):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    for v in bm.verts:
        v.co.x *= scale[0]
        v.co.y *= scale[1]
        v.co.z *= scale[2]
    return mesh_ob(name, bm, material, smooth=True, loc=loc)


def prism_roof(name, w, depth, h, loc, material, overhang=1.15):
    """Gable roof: a triangular prism along Y with flared eaves."""
    bm = bmesh.new()
    hw = w * overhang / 2
    hd = depth / 2
    v = [bm.verts.new(p) for p in ((-hw, -hd, 0), (hw, -hd, 0), (0, -hd, h),
                                   (-hw, hd, 0), (hw, hd, 0), (0, hd, h))]
    for f in ((0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)):
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return mesh_ob(name, bm, material, loc=loc)


def tree_cluster(seed, x0, x1, y, count, material, h=(6, 14), spread=8):
    """Trees as clumps of displaced blobs with a trunk, so the skyline reads as foliage."""
    rnd = random.Random(seed)
    tex = bpy.data.textures.get("Foliage") or bpy.data.textures.new("Foliage", "CLOUDS")
    tex.noise_scale = 1.4
    bark = mat("Bark", (0.01, 0.008, 0.006), rough=0.9)
    for i in range(count):
        x = rnd.uniform(x0, x1)
        hh = rnd.uniform(*h)
        yy = y + rnd.uniform(-spread, spread)
        lathe(f"Trunk{seed}_{i}", [(hh * 0.05, 0), (hh * 0.035, hh * 0.5)], (x, yy, 0), bark, segments=5)
        for k in range(rnd.randint(3, 5)):
            r = hh * rnd.uniform(0.22, 0.34)
            ob = sphere(f"Tree{seed}_{i}_{k}", r,
                        (x + rnd.uniform(-hh * 0.25, hh * 0.25), yy + rnd.uniform(-2, 2), hh * rnd.uniform(0.55, 0.85)),
                        material, scale=(1.15, 1.0, 0.85), subdiv=3)
            d = ob.modifiers.new("Leafy", "DISPLACE")
            d.texture = tex
            d.strength = r * 0.35


def lamp_row(seed, x0, x1, y, z, n, color, strength=25, size=0.35, jitter=0.0):
    m = mat(f"Lamp{seed}", (1, 1, 1), emit=color, strength=strength)
    rnd = random.Random(seed)
    for i in range(n):
        x = x0 + (x1 - x0) * i / max(n - 1, 1)
        sphere(f"Lamp{seed}_{i}", size, (x, y + rnd.uniform(-jitter, jitter), z), m, subdiv=1)


def ground_strip(y, z=0.6, depth=400, color=(0.01, 0.012, 0.02)):
    return box("Bank", 4000, depth, z, (0, y + depth / 2, 0), mat("Bank", color, rough=0.9))


# --------------------------------------------------------------------------- props


def boat(name, x, y, length, lit=(1.0, 0.75, 0.4), heading=0.0, cabin=True):
    """A river boat: tapered hull, cabin and a string of lights along the roof."""
    hull = mat("Hull", (0.02, 0.015, 0.012), rough=0.5)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= length
        v.co.y *= length * 0.22
        v.co.z = (v.co.z + 0.5) * length * 0.12
        if v.co.z < 0.01:  # narrow keel
            v.co.y *= 0.55
        if abs(v.co.x) > length * 0.45:  # pointed ends
            v.co.y *= 0.35
    ob = mesh_ob(name, bm, hull, loc=(x, y, -0.2))
    ob.rotation_euler = (0, 0, heading)
    if cabin:
        cab = box(name + "Cabin", length * 0.55, length * 0.17, length * 0.12, (x, y, length * 0.1),
                  windows_mat(name + "Win", lit=lit, density=0.9, scale=1.5))
        cab.rotation_euler = (0, 0, heading)
    lamp = mat(name + "Lamp", (1, 1, 1), emit=lit, strength=40)
    for i in range(9):
        u = (i / 8 - 0.5) * length * 0.6
        sphere(f"{name}Bulb{i}", 0.18, (x + u * math.cos(heading), y + u * math.sin(heading), length * 0.26), lamp, subdiv=1)


def hull_mesh(name, length, beam, depth, material, bow_rise=0.0, stern_rise=0.0, loc=(0, 0, 0), heading=0.0, sections=14):
    """A boat hull lofted from rounded cross-sections along X: narrow pointed bow at +X,
    fuller stern at -X, sheer line rising toward the bow by `bow_rise`."""
    bm = bmesh.new()
    rings = []
    for i in range(sections + 1):
        u = i / sections  # 0 stern, 1 bow
        x = (u - 0.5) * length
        # plan width: full in the middle, pinched at the bow, slightly at the stern
        w = beam / 2 * (math.sin(math.pi * min(1.0, u * 1.08 + 0.04)) ** 0.55) * (1 - 0.25 * (1 - u) ** 6)
        top = depth + bow_rise * max(0.0, u - 0.55) ** 2 / 0.2025 + stern_rise * max(0.0, 0.25 - u) ** 2 / 0.0625
        keel = -depth * 0.35 * math.sin(math.pi * u) ** 0.6
        ring = []
        for k in range(7):
            t = k / 6  # around the section, port gunwale to starboard gunwale
            a = math.pi * t
            yy = -math.cos(a) * max(w, 0.02)
            zz = top - (top - keel) * math.sin(a) ** 0.7
            ring.append(bm.verts.new((x, yy, zz)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(6):
            bm.faces.new((r0[k], r0[k + 1], r1[k + 1], r1[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = mesh_ob(name, bm, material, smooth=True, loc=loc)
    ob.rotation_euler = (0, 0, heading)
    return ob


def _place(ob, x, y, heading, dx, dy, z):
    """Position a part at (dx, dy) in the boat's own frame."""
    c, s_ = math.cos(heading), math.sin(heading)
    ob.location = (x + dx * c - dy * s_, y + dx * s_ + dy * c, z)
    ob.rotation_euler = (ob.rotation_euler.x, ob.rotation_euler.y, heading)
    return ob


def cruise_boat(name, x, y, length=36.0, heading=0.0):
    """A Chao Phraya dinner cruise: white hull with a blue stripe and raised bow, a glass
    lower deck glowing warm, an open upper deck under a canopy, and strings of lights from
    a bow mast to the stern."""
    white = mat(name + "Hull", (0.75, 0.76, 0.78), rough=0.35, emit=(1.0, 0.92, 0.82), strength=0.25)
    stripe = mat(name + "Stripe", (0.05, 0.12, 0.35), rough=0.4)
    glass = windows_mat(name + "Glass", lit=(1.0, 0.82, 0.55), density=0.95, scale=2.4)
    roof = mat(name + "Roof", (0.7, 0.7, 0.72), rough=0.4, emit=(1.0, 0.9, 0.75), strength=0.3)
    bulb = mat(name + "Bulb", (1, 1, 1), emit=(1.0, 0.8, 0.45), strength=45)
    beam = length * 0.2
    hull_mesh(name, length, beam, 1.6, white, bow_rise=1.4, loc=(x, y, -0.4), heading=heading)
    _place(box(name + "StripeL", length * 0.86, 0.06, 0.35, (0, 0, 0), stripe), x, y, heading, -length * 0.02, -beam / 2 - 0.02, 0.55)
    _place(box(name + "Deck1", length * 0.7, beam * 0.86, 2.6, (0, 0, 0), glass), x, y, heading, -length * 0.06, 0, 1.2)
    _place(box(name + "Deck1Roof", length * 0.74, beam * 0.92, 0.25, (0, 0, 0), roof), x, y, heading, -length * 0.06, 0, 3.8)
    # upper deck: rail, posts and a canopy over the back two thirds
    _place(box(name + "Rail", length * 0.72, beam * 0.9, 0.9, (0, 0, 0), white), x, y, heading, -length * 0.06, 0, 4.05)
    for i in range(6):
        for side in (-1, 1):
            dx = -length * 0.38 + i * length * 0.1
            _place(box(f"{name}Post{i}{side}", 0.12, 0.12, 2.4, (0, 0, 0), roof), x, y, heading, dx, side * beam * 0.42, 4.05)
    _place(box(name + "Canopy", length * 0.56, beam * 0.95, 0.18, (0, 0, 0), roof), x, y, heading, -length * 0.13, 0, 6.45)
    mast = lathe(name + "Mast", [(0.1, 0), (0.06, 7.5)], (0, 0, 0), roof, segments=6)
    _place(mast, x, y, heading, length * 0.42, 0, 1.6)
    # dressing lights: bow mast to canopy, and along both canopy edges
    for i in range(18):
        t = i / 17
        dx = length * 0.42 * (1 - t) + (length * 0.15) * t
        z = 9.1 * (1 - t) + 6.6 * t - math.sin(t * math.pi) * 0.9
        _place(sphere(f"{name}Dress{i}", 0.14, (0, 0, 0), bulb, subdiv=1), x, y, heading, dx, 0, z)
    for i in range(14):
        for side in (-1, 1):
            dx = -length * 0.41 + i * length * 0.04
            _place(sphere(f"{name}Edge{i}{side}", 0.12, (0, 0, 0), bulb, subdiv=1), x, y, heading, dx, side * beam * 0.48, 6.4)
    point(name + "Glow", (x, y - beam, 3), 2500, (1.0, 0.8, 0.5), radius=4)


def longtail_boat(name, x, y, length=11.0, heading=0.0):
    """A long-tail boat: slim dark hull, tall curved bow wrapped in coloured garlands,
    a small canopy, and the engine on its long shaft at the stern."""
    wood = mat(name + "Wood", (0.12, 0.06, 0.03), rough=0.6, emit=(1.0, 0.6, 0.3), strength=0.12)
    garland_cols = [(1.0, 0.3, 0.5), (1.0, 0.75, 0.2), (0.4, 0.8, 1.0), (1.0, 0.5, 0.2)]
    hull_mesh(name, length, 1.5, 0.7, wood, bow_rise=1.8, loc=(x, y, -0.15), heading=heading)
    for i, c in enumerate(garland_cols):
        g = mat(f"Garland{i}", c, emit=c, strength=2.5)
        _place(sphere(f"{name}Garland{i}", 0.16, (0, 0, 0), g, scale=(1, 1, 1.6), subdiv=1), x, y, heading,
               length * 0.43 + i * 0.12, 0, 1.4 + i * 0.32)
    canopy = mat(name + "Canopy", (0.1, 0.18, 0.35), rough=0.6, emit=(0.4, 0.55, 1.0), strength=0.25)
    _place(box(name + "Canopy", length * 0.4, 1.6, 0.06, (0, 0, 0), canopy), x, y, heading, -length * 0.05, 0, 1.6)
    for dx in (-length * 0.22, length * 0.14):
        for side in (-1, 1):
            _place(box(f"{name}Pole{dx:.0f}{side}", 0.05, 0.05, 1.0, (0, 0, 0), wood), x, y, heading, dx, side * 0.6, 0.6)
    engine = mat(name + "Engine", (0.25, 0.25, 0.27), rough=0.3, metallic=0.8)
    _place(box(name + "Engine", 0.8, 0.5, 0.5, (0, 0, 0), engine), x, y, heading, -length * 0.47, 0, 0.7)
    shaft = box(name + "Shaft", 4.0, 0.08, 0.08, (0, 0, 0), engine)
    _place(shaft, x, y, heading, -length * 0.47 - 2.0, 0, 0.55)
    shaft.rotation_euler = (0, 0.18, heading)
    lamp = mat(name + "Lamp", (1, 1, 1), emit=(1.0, 0.85, 0.6), strength=30)
    _place(sphere(name + "Lamp", 0.15, (0, 0, 0), lamp, subdiv=1), x, y, heading, -length * 0.05, 0, 1.5)


def express_boat(name, x, y, length=28.0, heading=0.0):
    """Chao Phraya Express: long low white hull, open sides under a flat roof, lit inside,
    with the orange flag at the stern."""
    white = mat(name + "Hull", (0.7, 0.72, 0.74), rough=0.4, emit=(1.0, 0.92, 0.82), strength=0.15)
    inside = windows_mat(name + "Inside", lit=(0.85, 0.92, 1.0), density=0.85, scale=1.8)
    hull_mesh(name, length, 3.6, 1.0, white, bow_rise=0.5, loc=(x, y, -0.3), heading=heading)
    _place(box(name + "Cabin", length * 0.72, 3.0, 1.8, (0, 0, 0), inside), x, y, heading, -length * 0.04, 0, 0.7)
    _place(box(name + "Roof", length * 0.78, 3.4, 0.15, (0, 0, 0), white), x, y, heading, -length * 0.04, 0, 2.5)
    flag = mat(name + "Flag", (1.0, 0.45, 0.05), emit=(1.0, 0.45, 0.05), strength=1.5)
    _place(lathe(name + "FlagPole", [(0.04, 0), (0.03, 2.2)], (0, 0, 0), white, segments=5), x, y, heading, -length * 0.46, 0, 2.6)
    _place(box(name + "Flag", 1.0, 0.03, 0.6, (0, 0, 0), flag), x, y, heading, -length * 0.46 + 0.5, 0, 4.1)


def swan_boat(name, x, y, s=1.0, heading=0.0):
    """Lumphini's pedal swan boats."""
    white = mat("Swan", (0.75, 0.74, 0.7), rough=0.5, emit=(1.0, 0.95, 0.85), strength=0.9)
    beak = mat("Beak", (0.8, 0.35, 0.05), rough=0.5)
    sphere(name + "Body", 1.4 * s, (x, y, 0.4 * s), white, scale=(1.6, 1.0, 0.6))
    for k in range(7):
        t = k / 6
        sphere(f"{name}Neck{k}", 0.32 * s, (x + (1.6 - t * 0.6) * s * math.cos(heading), y + (1.6 - t * 0.6) * s * math.sin(heading),
                                            (0.9 + t * 1.9) * s), white, subdiv=1)
    hx, hy = x + 1.0 * s * math.cos(heading), y + 1.0 * s * math.sin(heading)
    sphere(name + "Head", 0.42 * s, (hx, hy, 2.9 * s), white)
    lathe(name + "Beak", [(0.15 * s, 0), (0, 0.5 * s)], (hx + 0.35 * s * math.cos(heading), hy, 2.85 * s), beak, segments=6)


CLOTHES = [(0.6, 0.12, 0.1), (0.1, 0.2, 0.5), (0.55, 0.45, 0.1), (0.15, 0.4, 0.25), (0.7, 0.7, 0.68), (0.35, 0.12, 0.4)]


def person(name, x, y, h=1.65, crouch=False, colour=None):
    """A figure in festival light: coloured clothes, faintly lit from the lanterns."""
    c = colour or CLOTHES[hash(name) % len(CLOTHES)]
    body = mat(f"Clothes{c}", c, rough=0.8, emit=c, strength=0.35)
    hh = h * (0.62 if crouch else 1.0)
    lathe(name, [(0.16, 0), (0.2, hh * 0.45), (0.17, hh * 0.78), (0.08, hh * 0.84)], (x, y, 0.5), body, segments=8, smooth=True)
    sphere(name + "Head", 0.11, (x, y, 0.5 + hh * 0.9), mat("Skin", (0.25, 0.15, 0.1), emit=(1.0, 0.7, 0.45), strength=0.25), subdiv=2)


def crowd(seed, x0, x1, y, n, spread=1.5, crouch_share=0.4):
    rnd = random.Random(seed)
    for i in range(n):
        person(f"P{seed}_{i}", rnd.uniform(x0, x1), y + rnd.uniform(-spread, spread), h=rnd.uniform(1.45, 1.8),
               crouch=rnd.random() < crouch_share)


def bamboo_pier(name, x, y, length, width=3.0):
    wood = mat("Bamboo", (0.08, 0.06, 0.035), rough=0.7, emit=(1.0, 0.7, 0.4), strength=0.08)
    for i in range(int(length / 2.5) + 1):
        for side in (-1, 1):
            lathe(f"{name}Post{i}{side}", [(0.09, -1.5), (0.09, 1.2)], (x + side * width / 2, y - i * 2.5, 0), wood, segments=6)
    box(name + "Deck", width, length, 0.15, (x, y - length / 2, 0.75), wood)


# --------------------------------------------------------------------------- sky, water, camera


def world(top, horizon, stars=1.0, glow=(1.0, 0.5, 0.2), glow_amt=0.6):
    w = bpy.data.worlds.new("Night")
    try:
        w.use_nodes = True
    except Exception:
        pass
    bpy.context.scene.world = w
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    nt.links.new(bg.outputs[0], out.inputs["Surface"])
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    zpos = nt.nodes.new("ShaderNodeMath")
    zpos.operation = "MAXIMUM"
    zpos.inputs[1].default_value = 0.0
    nt.links.new(sep.outputs["Z"], zpos.inputs[0])
    curve = nt.nodes.new("ShaderNodeMath")
    curve.operation = "POWER"
    curve.inputs[1].default_value = 0.45
    nt.links.new(zpos.outputs[0], curve.inputs[0])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (*horizon, 1)
    mix.inputs[7].default_value = (*top, 1)
    nt.links.new(curve.outputs[0], mix.inputs[0])
    color = mix.outputs[2]
    # warm glow low on the horizon (festival lights, city)
    gl = nt.nodes.new("ShaderNodeMath")
    gl.operation = "MULTIPLY"
    gl.inputs[1].default_value = -14.0
    nt.links.new(zpos.outputs[0], gl.inputs[0])
    ex = nt.nodes.new("ShaderNodeMath")
    ex.operation = "EXPONENT"
    nt.links.new(gl.outputs[0], ex.inputs[0])
    amt = nt.nodes.new("ShaderNodeMath")
    amt.operation = "MULTIPLY"
    amt.inputs[1].default_value = glow_amt
    nt.links.new(ex.outputs[0], amt.inputs[0])
    gmix = nt.nodes.new("ShaderNodeMix")
    gmix.data_type = "RGBA"
    gmix.inputs[7].default_value = (*glow, 1)
    nt.links.new(amt.outputs[0], gmix.inputs[0])
    nt.links.new(color, gmix.inputs[6])
    color = gmix.outputs[2]
    if stars > 0:
        vor = nt.nodes.new("ShaderNodeTexVoronoi")
        vor.inputs["Scale"].default_value = 420.0
        nt.links.new(tc.outputs["Generated"], vor.inputs["Vector"])
        core = nt.nodes.new("ShaderNodeMath")
        core.operation = "LESS_THAN"
        core.inputs[1].default_value = 0.05
        nt.links.new(vor.outputs["Distance"], core.inputs[0])
        sepc = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(vor.outputs["Color"], sepc.inputs[0])
        pick = nt.nodes.new("ShaderNodeMath")
        pick.operation = "GREATER_THAN"
        pick.inputs[1].default_value = 1 - 0.3 * stars
        nt.links.new(sepc.outputs[0], pick.inputs[0])
        above = nt.nodes.new("ShaderNodeMath")
        above.operation = "GREATER_THAN"
        above.inputs[1].default_value = 0.08
        nt.links.new(sep.outputs["Z"], above.inputs[0])
        s1 = nt.nodes.new("ShaderNodeMath")
        s1.operation = "MULTIPLY"
        nt.links.new(core.outputs[0], s1.inputs[0])
        nt.links.new(pick.outputs[0], s1.inputs[1])
        s2 = nt.nodes.new("ShaderNodeMath")
        s2.operation = "MULTIPLY"
        nt.links.new(s1.outputs[0], s2.inputs[0])
        nt.links.new(above.outputs[0], s2.inputs[1])
        lp = nt.nodes.new("ShaderNodeLightPath")
        s3 = nt.nodes.new("ShaderNodeMath")
        s3.operation = "MULTIPLY"
        nt.links.new(s2.outputs[0], s3.inputs[0])
        nt.links.new(lp.outputs["Is Camera Ray"], s3.inputs[1])
        smix = nt.nodes.new("ShaderNodeMix")
        smix.data_type = "RGBA"
        smix.inputs[7].default_value = (1.4, 1.45, 1.6, 1)
        nt.links.new(s3.outputs[0], smix.inputs[0])
        nt.links.new(color, smix.inputs[6])
        color = smix.outputs[2]
    nt.links.new(color, bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0


def moon(fx, fy, size_deg=3.2, strength=2.6):
    """Full moon placed by frame position: fx -0.5..0.5 from centre, fy 0..0.5 above the horizon.

    The same numbers place the SVG moon and the moonlight path on the web water layer
    (RiverScene THEMES), so the two line up. Maria come from a noise texture; a soft halo
    sphere stands in for glare.
    """
    cam = bpy.context.scene.camera.data
    half_w = math.atan(cam.sensor_width / 2 / cam.lens)
    half_h = math.atan(cam.sensor_width * 10 / 16 / 2 / cam.lens)
    ax = math.atan(math.tan(half_w) * fx * 2)
    ay = math.atan(math.tan(half_h) * fy * 2)
    dist = 5000
    loc = (math.tan(ax) * dist, dist, CAM_H + math.tan(ay) * dist)
    r = math.tan(math.radians(size_deg / 2)) * dist

    m = bpy.data.materials.new("Moon")
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 2.2
    noise.inputs["Detail"].default_value = 6.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.42
    ramp.color_ramp.elements[0].color = (0.62, 0.6, 0.55, 1)
    ramp.color_ramp.elements[1].position = 0.6
    ramp.color_ramp.elements[1].color = (1.0, 0.96, 0.86, 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = strength
    sphere("Moon", r, loc, m, subdiv=4)

    halo = bpy.data.materials.new("MoonHalo")
    nt = halo.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1.0, 0.92, 0.78, 1)
    em.inputs["Strength"].default_value = 0.5
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.5
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    nt.links.new(lw.outputs["Facing"], inv.inputs[1])
    pw = nt.nodes.new("ShaderNodeMath")
    pw.operation = "POWER"
    pw.inputs[1].default_value = 4.0
    nt.links.new(inv.outputs[0], pw.inputs[0])
    sc = nt.nodes.new("ShaderNodeMath")
    sc.operation = "MULTIPLY"
    sc.inputs[1].default_value = 0.35
    nt.links.new(pw.outputs[0], sc.inputs[0])
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(sc.outputs[0], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    halo.blend_method = "BLEND" if hasattr(halo, "blend_method") else None
    sphere("MoonHalo", r * 4.0, (loc[0], loc[1] + r * 5, loc[2]), halo, subdiv=3)

    ld = bpy.data.lights.new("Moonlight", "SUN")
    ld.energy = 0.12
    ld.color = (0.72, 0.8, 1.0)
    ld.angle = math.radians(0.6)
    ob = bpy.data.objects.new("Moonlight", ld)
    ob.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    link(ob)


def lens(mm):
    """Per-venue focal length. Reference photos of these places are mostly taken long."""
    bpy.context.scene.camera.data.lens = mm


def water():
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6000)
    mesh_ob("Water", bm, water_mat(), loc=(0, 0, 0))


def camera(lens=34):
    cd = bpy.data.cameras.new("Cam")
    cd.lens = lens
    cd.clip_start = 0.1
    cd.clip_end = 20000
    cam = bpy.data.objects.new("Cam", cd)
    cam.location = (0, -10, CAM_H)
    cam.rotation_euler = (math.radians(90), 0, 0)  # level: horizon at exactly 50%
    link(cam)
    bpy.context.scene.camera = cam


def point(name, loc, power, color, radius=1.0):
    ld = bpy.data.lights.new(name, "POINT")
    ld.energy = power
    ld.color = color
    ld.shadow_soft_size = radius
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    ob.visible_glossy = False  # light the scene, don't mirror as a blob in the water
    return link(ob)


# --------------------------------------------------------------------------- festival


def view_height(dist, margin=0.92):
    """Highest z still inside the frame at `dist` metres in front of the camera."""
    cam = bpy.context.scene.camera.data
    half_h = math.atan(cam.sensor_width * 10 / 16 / 2 / cam.lens)
    return CAM_H + math.tan(half_h) * (dist + 10) * margin


def view_half_width(dist, margin=0.98):
    cam = bpy.context.scene.camera.data
    return math.tan(math.atan(cam.sensor_width / 2 / cam.lens)) * (dist + 10) * margin


def sky_lanterns(seed, n, y0, y1, source_x=0.0, spread=0.6, low_share=0.55):
    """Khom loi (Yi Peng) paper lanterns drifting up: a slim open-bottomed paper bell lit
    from the burner inside, brightest at the bottom. Most hang low and far where the crowd
    released them; fewer climb high, and they thin out with height."""
    rnd = random.Random(seed)
    paper = []
    for k, c in enumerate(((1.0, 0.42, 0.07), (1.0, 0.5, 0.12), (1.0, 0.36, 0.05))):
        m = bpy.data.materials.new(f"Khom{k}")
        nt = m.node_tree
        b = next(nd for nd in nt.nodes if nd.type == "BSDF_PRINCIPLED")
        b.inputs["Base Color"].default_value = (*c, 1)
        geo = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Generated"], sep.inputs[0])
        rng = nt.nodes.new("ShaderNodeMapRange")
        rng.inputs["To Min"].default_value = 4.0  # hot at the burner
        rng.inputs["To Max"].default_value = 1.0
        nt.links.new(sep.outputs["Z"], rng.inputs["Value"])
        b.inputs["Emission Color"].default_value = (*c, 1)
        nt.links.new(rng.outputs[0], b.inputs["Emission Strength"])
        paper.append(m)
    for i in range(n):
        y = rnd.uniform(y0, y1)
        # low and dense near the release point, sparse and high elsewhere
        hmax = view_height(y)
        t = rnd.random() ** (2.2 if rnd.random() < low_share else 0.9)
        z = 12 + t * (hmax - 12)
        half = view_half_width(y)
        x = source_x + rnd.gauss(0, half * spread)
        x = max(-half, min(half, x))
        s = rnd.uniform(0.85, 1.15) * (1 + y / 900)  # far ones a touch bigger so they still read
        ob = lathe(f"Khom{seed}_{i}", [(0.42 * s, 0), (0.55 * s, 0.6 * s), (0.6 * s, 1.15 * s), (0.5 * s, 1.5 * s), (0.0, 1.62 * s)],
                   (x, y, z), paper[i % 3], segments=8, smooth=True)
        ob.rotation_euler = (rnd.uniform(-0.12, 0.12), rnd.uniform(-0.12, 0.12), 0)


def distant_krathongs(seed, n, y0, y1, x_scale=1.0, max_x=1e9):
    """Other people's krathongs already out on the water: a candle flame and a faint lit
    ring of flowers each, scattered thicker toward the far bank where they drift."""
    rnd = random.Random(seed)
    flame = mat("KrathongFlame", (1, 1, 1), emit=(1.0, 0.55, 0.18), strength=14)
    ring = mat("KrathongRing", (0.3, 0.2, 0.08), rough=0.6, emit=(1.0, 0.55, 0.25), strength=0.9)
    for i in range(n):
        y = y0 + (y1 - y0) * rnd.random() ** 0.6
        half = min(view_half_width(y) * x_scale, max_x)
        x = rnd.uniform(-half, half)
        sphere(f"Krathong{seed}_{i}", 0.16, (x, y, 0.42), flame, scale=(1, 1, 1.6), subdiv=1)
        lathe(f"KrathongBase{seed}_{i}", [(0.5, 0), (0.55, 0.18), (0.35, 0.26)], (x, y, 0.02), ring, segments=8)


def firework(name, centre, radius, colour, rays=40, sparks=7, seed=0):
    """A peony burst: sparks thrown out along rays, each trail fading and thinning toward
    the centre, the tips brightest, the whole shell drooping a little as it falls."""
    rnd = random.Random(seed)
    cx, cy, cz = centre
    mats = [mat(f"{name}Spark{k}", (1, 1, 1), emit=colour, strength=strength)
            for k, strength in enumerate((9, 4, 1.6))]
    for i in range(rays):
        # spread the rays evenly over a sphere, then flatten toward the viewer a touch
        zz = 1 - 2 * (i + 0.5) / rays
        a = i * math.pi * (3 - math.sqrt(5))
        rr = math.sqrt(1 - zz * zz)
        d = Vector((math.cos(a) * rr, math.sin(a) * rr * 0.4, zz))
        L = radius * rnd.uniform(0.85, 1.1)
        for k in range(sparks):
            t = (k + 1) / sparks
            p = Vector((cx, cy, cz)) + d * L * t - Vector((0, 0, radius * 0.18 * t * t))
            tier = 0 if k == sparks - 1 else (1 if k >= sparks - 3 else 2)
            sphere(f"{name}_{i}_{k}", radius * 0.016 * (0.5 + t), tuple(p), mats[tier], subdiv=1)


def lantern_string(name, pts, colours, per=10, size=0.45, strength=14):
    """Paper lanterns hung on a line between posts: each span sags in a catenary."""
    mats = [mat(f"{name}Paper{k}", (1, 1, 1), emit=c, strength=strength) for k, c in enumerate(colours)]
    k = 0
    for a, b in zip(pts, pts[1:]):
        for j in range(per):
            t = (j + 0.5) / per
            x = a[0] + (b[0] - a[0]) * t
            y = a[1] + (b[1] - a[1]) * t
            z = a[2] + (b[2] - a[2]) * t - math.sin(t * math.pi) * 1.2
            sphere(f"{name}_{k}", size, (x, y, z), mats[k % len(mats)], scale=(1, 1, 1.25), subdiv=1)
            k += 1


# --------------------------------------------------------------------------- landmarks


def prang(name, x, y, height, base_r, material, tiers=7, segments=12):
    """Khmer-style prang: a faceted tower of bulging tiers ending in a spire."""
    prof = [(base_r * 1.05, 0)]
    body = height * 0.78
    for i in range(tiers):
        t0 = i / tiers
        t1 = (i + 1) / tiers
        r0 = base_r * (1 - t0) ** 0.85
        r1 = base_r * (1 - t1) ** 0.85
        z0 = body * t0
        z1 = body * t1
        prof += [(r0 * 0.96, z0 + (z1 - z0) * 0.05), (r0 * 1.06, z0 + (z1 - z0) * 0.35),
                 (r1 * 1.02, z0 + (z1 - z0) * 0.8), (r1 * 0.9, z1)]
    prof += [(base_r * 0.06, body), (base_r * 0.035, height * 0.95), (0.0, height)]
    return lathe(name, prof, (x, y, 0), material, segments=segments)


def stepped_base(name, x, y, w, h, steps, material):
    for i in range(steps):
        s = w * (1 - i * 0.14)
        box(f"{name}_{i}", s, s, h / steps, (x, y, h * i / steps), material)
    return h


def chedi_bell(name, x, y, height, r, material):
    prof = [(r, 0), (r, height * 0.06), (r * 0.82, height * 0.08), (r * 0.82, height * 0.14),
            (r * 0.7, height * 0.16), (r * 0.98, height * 0.3), (r * 0.9, height * 0.46),
            (r * 0.5, height * 0.56), (r * 0.3, height * 0.6), (r * 0.3, height * 0.64),
            (r * 0.12, height * 0.68), (r * 0.06, height * 0.9), (0, height)]
    return lathe(name, prof, (x, y, 0), material, segments=16, smooth=True)


def lotus_bud_chedi(name, x, y, height, w, material):
    base_h = height * 0.42
    stepped_base(name + "Base", x, y, w, base_h, 4, material)
    r = w * 0.28
    prof = [(r * 0.9, 0), (r * 1.15, height * 0.06), (r * 1.05, height * 0.2),
            (r * 0.7, height * 0.3), (r * 0.25, height * 0.36), (r * 0.06, height * 0.38),
            (r * 0.05, height * 0.52), (0, height * 0.58)]
    return lathe(name + "Bud", prof, (x, y, base_h), material, segments=8, smooth=False)


def sugar_palm(name, x, y, h, material):
    lathe(name + "Trunk", [(0.35, 0), (0.25, h * 0.6), (0.2, h)], (x, y, 0), material, segments=6)
    bm = bmesh.new()
    center = bm.verts.new((0, 0, 0))
    ring = []
    for i in range(18):
        a = 2 * math.pi * i / 18
        rr = 4.5 if i % 2 == 0 else 2.0
        ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a) * 0.4, rr * math.sin(a))))
    for i in range(18):
        bm.faces.new((center, ring[i], ring[(i + 1) % 18]))
    mesh_ob(name + "Crown", bm, material, loc=(x, y, h))


def redented_lathe(name, profile, loc, material, corners=5, notch=0.86):
    """Lathe on a Thai 'redented' square plan: each side of the square is stepped in
    `corners` times, which is what gives a prang or a chedi base its many vertical edges."""
    plan = []
    n = corners
    for side in range(4):
        for k in range(n):
            t = (k + 0.5) / n * 2 - 1
            depth = notch ** (abs(t) * (n - 1) / 2 + 0.0)
            plan.append((t, depth))
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = []
        for side in range(4):
            a = side * math.pi / 2
            ca, sa = math.cos(a), math.sin(a)
            for k in range(n):
                t = (k + 0.5) / n * 2 - 1
                inset = 1 - (1 - notch) * (abs(t) ** 1.4)
                px, py = r * inset, r * t * 0.98
                ring.append(bm.verts.new((px * ca - py * sa, px * sa + py * ca, z)))
        rings.append(ring)
    seg = len(rings[0])
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    bm.faces.new(list(reversed(rings[0])))
    if profile[-1][0] > 1e-4:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return mesh_ob(name, bm, material, loc=loc)


def chofa(name, x, y, z, size, material, flip=1):
    """The slim horn at the end of a Thai temple ridge: rises, then hooks outward."""
    pts = [(0.0, 0.0), (0.05, 0.4), (0.18, 0.75), (0.42, 0.95), (0.62, 0.92)]
    for k, ((x0, z0), (x1, z1)) in enumerate(zip(pts, pts[1:])):
        L = math.hypot(x1 - x0, z1 - z0) * size
        ob = box(f"{name}_{k}", 0.16 * size, 0.16 * size, L, (x + x0 * size * flip, y, z + z0 * size), material)
        ob.rotation_euler = (0, math.atan2((x1 - x0) * flip, z1 - z0), 0)


def thai_roof(name, x, y, z, w, d, tiers, tile, gold, pitch=0.62):
    """A Thai temple roof: steep gables stacked in tiers, each tier lower roof flaring out
    under the one above, gable end toward the viewer with a gold chofa on its peak and a
    lit line along every eave."""
    top = z
    for k in range(tiers):
        tw, td = w * (1 - 0.2 * k), d * (1 - 0.1 * k)
        h = tw * pitch / 2
        prism_roof(f"{name}T{k}", tw, td, h, (x, y, top), tile, overlap_ok(k))
        box(f"{name}Eave{k}", tw * 1.16, 0.25, 0.25, (x, y - td / 2 - 0.1, top - 0.1), gold)
        top += h * 0.55
    peak = top + w * (1 - 0.2 * (tiers - 1)) * pitch / 2 * 0.45
    chofa(name + "Chofa", x, y - d * (1 - 0.1 * (tiers - 1)) / 2, peak - 0.3, w * 0.09, gold)
    return peak


def overlap_ok(k):
    return 1.15 + 0.05 * k


def thai_hall(name, x, y, w, d, h, tiers, wall, tile, gold):
    """An ordination hall or riverside sala: white columns on a lit plinth, a Thai roof."""
    box(name + "Plinth", w * 1.05, d * 1.05, h * 0.18, (x, y, 0), wall)
    box(name + "Body", w * 0.86, d * 0.9, h * 0.82, (x, y, h * 0.18), wall)
    for i in range(6):
        cx = x - w / 2 + w * (i + 0.5) / 6
        box(f"{name}Col{i}", w * 0.05, w * 0.05, h * 0.82, (cx, y - d / 2 + 0.2, h * 0.18), wall)
    return thai_roof(name + "Roof", x, y, h, w, d, tiers, tile, gold)


def city_tower(name, x, y, w, d, h, rnd, glass, beacon, crown):
    """A Bangkok office or condo tower: setbacks near the top, and one of a few crowns:
    a lit parapet, a stepped crown, a spire, or a coloured LED band."""
    box(name, w, d, h, (x, y, 0), glass)
    z = h
    for k in range(rnd.choice((0, 1, 2))):  # setbacks
        w2, d2 = w * (0.82 - 0.1 * k), d * (0.82 - 0.1 * k)
        hh = rnd.uniform(6, 14)
        box(f"{name}Set{k}", w2, d2, hh, (x, y, z), glass)
        z += hh
        w, d = w2, d2
    style = rnd.choice(("parapet", "steps", "spire", "band", "parapet"))
    if style == "parapet":
        box(name + "Crown", w * 1.02, d * 1.02, 1.2, (x, y, z), crown)
    elif style == "steps":
        for k in range(3):
            box(f"{name}Step{k}", w * (0.7 - 0.18 * k), d * (0.7 - 0.18 * k), 4, (x, y, z + k * 4), crown)
        z += 12
    elif style == "spire":
        lathe(name + "Spire", [(w * 0.08, 0), (0.15, h * 0.18)], (x, y, z), crown, segments=6)
        z += h * 0.18
    else:
        band = mat(f"Band{name}", (1, 1, 1), emit=rnd.choice(((0.3, 0.5, 1.0), (0.7, 0.3, 1.0), (0.2, 0.9, 1.0))), strength=6)
        box(name + "Band", w * 1.01, d * 1.01, 2.2, (x, y, z - 6), band)
    if h > 90:
        sphere(name + "Beacon", 0.9, (x, y, z + 1.5), beacon, subdiv=1)
    return z


def wat_arun_prang(name, x, y, height, material, z0=0.0, slim=1.0):
    """The Khmer-derived prang of Wat Arun: a tall body that swells slightly above its
    base and narrows in a long convex curve, ringed by many shallow tiers (the
    'corn-cob' outline), then a slim spire with a trident finial."""
    body = height * 0.8
    r0 = height * 0.14 * slim
    prof = [(r0 * 1.02, 0)]
    tiers = 14
    for i in range(tiers):
        t0, t1 = i / tiers, (i + 1) / tiers
        # widest at ~12% height, then a convex taper
        def rad(t):
            return r0 * (1.0 + 0.12 * math.sin(min(t / 0.24, 1) * math.pi / 2) - 0.86 * t ** 1.55)
        za, zb = body * t0, body * t1
        prof += [(rad(t0) * 0.95, za + (zb - za) * 0.08), (rad(t0) * 1.03, za + (zb - za) * 0.3),
                 (rad(t1) * 1.0, za + (zb - za) * 0.75), (rad(t1) * 0.92, zb)]
    tip_r = prof[-1][0]
    prof += [(tip_r * 0.6, body + height * 0.02), (tip_r * 0.35, body + height * 0.1),
             (tip_r * 0.12, height * 0.97), (0.0, height)]
    redented_lathe(name, prof, (x, y, z0), material, corners=5, notch=0.82)
    return prof


def terrace(name, x, y, w, h, material, rail=None, corners=5):
    """A square redented terrace with a lit balustrade on top."""
    redented_lathe(name, [(w / 2, 0), (w / 2, h * 0.85), (w / 2 * 1.04, h * 0.9), (w / 2 * 1.04, h)],
                   (x, y, 0), material, corners=corners, notch=0.9)
    if rail is not None:
        for k in range(16):
            t = k / 15 - 0.5
            sphere(f"{name}Rail{k}", 0.28, (x + t * w * 0.98, y - w / 2 - 0.2, h + 0.5), rail, subdiv=1)


def steep_stair(name, x, y, z0, z1, run, width, material):
    """Wat Arun's famously steep stairs, as a single sloped slab on the front face."""
    length = math.hypot(z1 - z0, run)
    ob = box(name, width, 0.6, length, (x, y - run / 2, z0), material)
    ob.rotation_euler = (math.atan2(run, z1 - z0), 0, 0)
    ob.location = (x, y, z0)
    return ob


def seated_buddha(name, x, y, z, h, material):
    """Seated Buddha in meditation, Sukhothai style: lotus base, crossed legs, slim torso,
    oval head with a flame ushnisha."""
    lathe(name + "Base", [(h * 0.42, 0), (h * 0.46, h * 0.08), (h * 0.38, h * 0.14)], (x, y, z), material, segments=16)
    sphere(name + "Legs", h * 0.36, (x, y, z + h * 0.2), material, scale=(1.0, 0.55, 0.32), subdiv=3)
    lathe(name + "Torso", [(h * 0.2, 0), (h * 0.22, h * 0.12), (h * 0.17, h * 0.34), (h * 0.09, h * 0.42)],
          (x, y, z + h * 0.22), material, segments=16, smooth=True)
    sphere(name + "Head", h * 0.1, (x, y, z + h * 0.72), material, scale=(0.9, 0.9, 1.2), subdiv=3)
    lathe(name + "Flame", [(h * 0.04, 0), (h * 0.03, h * 0.08), (0, h * 0.2)], (x, y, z + h * 0.8), material, segments=8)


def gold_standing_buddha(name, x, y, h, gold, halo):
    """Luang Pho Yai of Wat Burapha: a tall gilded standing Buddha, robe falling to a
    flared hem, arms at the sides, a soft glow round the head from the floodlights."""
    lathe(name + "Plinth", [(h * 0.2, 0), (h * 0.2, h * 0.05), (h * 0.15, h * 0.07), (h * 0.15, h * 0.1)],
          (x, y, 0), gold, segments=16)
    lathe(name + "Lotus", [(h * 0.11, 0), (h * 0.14, h * 0.02), (h * 0.1, h * 0.035)], (x, y, h * 0.1), gold, segments=16)
    lathe(name + "Robe", [(h * 0.1, 0), (h * 0.085, h * 0.05), (h * 0.08, h * 0.3), (h * 0.09, h * 0.52),
                          (h * 0.085, h * 0.62), (h * 0.05, h * 0.7)], (x, y, h * 0.135), gold, segments=20, smooth=True)
    for side in (-1, 1):  # arms down the sides of the robe
        ob = lathe(f"{name}Arm{side}", [(h * 0.022, 0), (h * 0.02, h * 0.3)], (x + side * h * 0.095, y, h * 0.5), gold,
                   segments=8, smooth=True)
        ob.rotation_euler = (0, math.pi + side * 0.08, 0)
    sphere(name + "Head", h * 0.048, (x, y, h * 0.89), gold, scale=(0.9, 0.9, 1.15), subdiv=3)
    lathe(name + "Ushnisha", [(h * 0.03, 0), (h * 0.02, h * 0.03), (0, h * 0.09)], (x, y, h * 0.93), gold, segments=10)
    sphere(name + "Halo", h * 0.12, (x, y + 2, h * 0.9), halo)


def thai_lamp_post(name, x, y, z, post, lamp):
    """A lakeside lamp post with a lotus-bud lantern on top."""
    lathe(name, [(0.14, 0), (0.1, 3.6)], (x, y, z), post, segments=6)
    lathe(name + "Lotus", [(0.0, 0), (0.35, 0.25), (0.4, 0.6), (0.0, 1.1)], (x, y, z + 3.6), lamp, segments=8, smooth=True)


def fountain(name, x, y, colours):
    """The lake's musical fountain caught mid-show: jets of coloured light and spray."""
    rnd = random.Random(9)
    for i, c in enumerate(colours):
        m = mat(f"{name}Jet{i}", (1, 1, 1), emit=c, strength=1.4)
        for k in range(7):
            dx = (i - len(colours) / 2) * 3 + k * 0.45
            h = rnd.uniform(4, 9) * (1.7 if k == 3 else 1.0)
            ob = lathe(f"{name}{i}_{k}", [(0.18, 0), (0.14, h * 0.75), (0.0, h)], (x + dx, y, 0.2), m, segments=6, smooth=True)
            ob.rotation_euler = (0, (k - 3) * 0.09, 0)
            # spray falling back round the top of each jet
            sphere(f"{name}Spray{i}_{k}", 0.55, (x + dx + math.sin((k - 3) * 0.09) * h, y, h), m, scale=(1.4, 1, 0.6), subdiv=1)


def standing_buddha(name, x, y, h, material):
    """A tall standing Buddha seen from far away: robe as one tapered column, head, ushnisha."""
    lathe(name + "Pedestal", [(h * 0.14, 0), (h * 0.12, h * 0.06), (h * 0.09, h * 0.08)], (x, y, 0), material, segments=12)
    lathe(name + "Robe", [(h * 0.07, 0), (h * 0.085, h * 0.25), (h * 0.08, h * 0.6), (h * 0.06, h * 0.78), (h * 0.035, h * 0.82)],
          (x, y, h * 0.08), material, segments=14, smooth=True)
    sphere(name + "Head", h * 0.045, (x, y, h * 0.94), material, scale=(0.9, 0.9, 1.15), subdiv=3)
    lathe(name + "Ushnisha", [(h * 0.02, 0), (0, h * 0.05)], (x, y, h * 0.98), material, segments=8)


def pixel_tower(name, x, y, w, h, material, seed=3):
    """King Power MahaNakhon: a slim square tower whose glass skin looks carved away by a
    band of 'pixels' that spirals up the building."""
    rnd = random.Random(seed)
    core = w * 0.62
    box(name + "Core", core, core, h, (x, y, 0), material)
    floors = int(h / 4)
    for k in range(floors):
        z = k * 4
        u = k / floors
        band = (u * 3.2) % 4  # which side the carved band is on as it climbs
        for side in range(4):
            near_band = min(abs(side - band), 4 - abs(side - band)) < 0.75
            missing = near_band and rnd.random() < 0.75
            if missing:
                # a few pixels poke out instead of the full slab
                for _ in range(2):
                    sx = rnd.uniform(-0.4, 0.4) * w
                    ox, oy = [(sx, -w / 2), (w / 2, sx), (sx, w / 2), (-w / 2, sx)][side]
                    box(f"{name}Px{k}_{side}_{_}", w * 0.12, w * 0.12, 4, (x + ox, y + oy, z), material)
                continue
            sx, sy = [(w, (w - core) / 2), ((w - core) / 2, w), (w, (w - core) / 2), ((w - core) / 2, w)][side]
            ox, oy = [(0, -(core + (w - core) / 2) / 2), ((core + (w - core) / 2) / 2, 0),
                      (0, (core + (w - core) / 2) / 2), (-(core + (w - core) / 2) / 2, 0)][side]
            box(f"{name}Slab{k}_{side}", sx, sy, 4, (x + ox, y + oy, z), material)


def dome_tower(name, x, y, w, h, material, gold):
    """State Tower, Silom: a stepped tower crowned with a gilded dome."""
    box(name, w, w, h, (x, y, 0), material)
    for k in range(4):
        box(f"{name}Step{k}", w * (0.9 - k * 0.12), w * (0.9 - k * 0.12), 5, (x, y, h + k * 5), material)
    for k in range(8):
        a = 2 * math.pi * k / 8
        box(f"{name}Col{k}", 0.9, 0.9, 9, (x + math.cos(a) * w * 0.3, y + math.sin(a) * w * 0.3, h + 20), gold)
    sphere(name + "Dome", w * 0.33, (x, y, h + 30), gold, scale=(1, 1, 0.85), subdiv=3)
    lathe(name + "Spike", [(0.8, 0), (0, 10)], (x, y, h + 37), gold, segments=8)


def arch_bridge(name, y, x0, x1, deck_z, spans, material, lamp):
    """A low road bridge across the river: deck, piers, shallow arches and lamp posts."""
    length = x1 - x0
    box(name + "Deck", length, 14, 1.4, ((x0 + x1) / 2, y, deck_z), material)
    box(name + "RailN", length, 0.4, 1.1, ((x0 + x1) / 2, y - 7, deck_z + 1.4), material)
    step = length / spans
    for i in range(spans + 1):
        px = x0 + i * step
        box(f"{name}Pier{i}", 3.2, 12, deck_z + 1, (px, y, -1), material)
    for i in range(spans):
        cx = x0 + (i + 0.5) * step
        for k in range(14):
            t = k / 13
            ax = cx + (t - 0.5) * step * 0.92
            az = deck_z - 0.2 - math.sin(t * math.pi) * deck_z * 0.25
            box(f"{name}Arch{i}_{k}", step / 13 + 0.3, 1.2, deck_z - az, (ax, y - 6.6, az), material)
    for i in range(spans * 4 + 1):
        lx = x0 + i * length / (spans * 4)
        lathe(f"{name}Post{i}", [(0.12, 0), (0.1, 5)], (lx, y - 7, deck_z + 1.4), material, segments=6)
        sphere(f"{name}Lamp{i}", 0.35, (lx, y - 7, deck_z + 6.6), lamp, subdiv=1)


def lanna_house(name, x, y, w, material_wall, material_roof, lit):
    """A riverside Lanna wooden house: raised floor, lit windows, steep two-tier roof with
    kalae crossed bargeboards at the gable."""
    box(name + "Stilts", w, w * 0.7, 2.5, (x, y, 0), material_roof)
    box(name + "Wall", w, w * 0.7, 4, (x, y, 2.5), material_wall)
    box(name + "Window", w * 0.6, 0.2, 1.6, (x, y - w * 0.35 - 0.05, 3.6), lit)
    prism_roof(name + "Roof", w * 0.7, w * 1.1, w * 0.45, (x, y, 6.5), material_roof, overhang=1.35)
    for flip in (-1, 1):
        ob = box(f"{name}Kalae{flip}", 0.3, 0.3, w * 0.35, (x, y - w * 0.55, 6.5 + w * 0.42), material_roof)
        ob.rotation_euler = (0, flip * 0.5, 0)


# --------------------------------------------------------------------------- venues


def tier_lights(name, x, y, z0, prof, every, light, scale=1.04):
    """Floodlight catching the lip of every few tiers of a prang: thin glowing rings."""
    lips = [p for i, p in enumerate(prof) if i % 4 == 2][::every]
    for k, (rad, zz) in enumerate(lips):
        if rad < 0.6:
            continue
        lathe(f"{name}Lip{k}", [(rad * scale, 0), (rad * scale, 0.35)], (x, y, z0 + zz), light, segments=20)


def wat_arun():
    """Wat Arun seen across the Chao Phraya from the Tha Tien side, as in most night photos:
    the floodlit central prang on its three steep terraces, its tiers picked out by the
    light, four satellite prangs at the corners and two mondops, the ordination hall with
    its Thai roof among the trees, riverside salas at the pier, Thonburi glowing behind,
    and krathongs drifting on the river."""
    lens(50)
    world(top=(0.002, 0.003, 0.012), horizon=(0.03, 0.025, 0.06), glow=(1.0, 0.5, 0.25), glow_amt=0.2)
    moon(0.146, 0.367)
    y = D
    ground_strip(y + 20)
    stone = lit_stone("Prang", warm=(1.0, 0.6, 0.22), strength=3.0, pattern="mosaic")
    rail = mat("Rail", (1, 1, 1), emit=(1.0, 0.82, 0.55), strength=6)
    lip = mat("PrangLip", (1, 1, 1), emit=(1.0, 0.86, 0.6), strength=5)
    cy = y + 70
    # three terraces, the lowest square ~62 m
    terrace("Terrace0", 0, cy, 56, 8, stone, rail)
    terrace("Terrace1", 0, cy, 38, 15, stone, rail)
    terrace("Terrace2", 0, cy, 26, 21, stone, rail)
    steep_stair("Stair", 0, cy - 22, 8, 21, 6, 3.2, stone)
    prof = wat_arun_prang("PrangMain", 0, cy, 64, stone, z0=21, slim=0.78)
    tier_lights("PrangMain", 0, cy, 21, prof, 2, lip)
    # the trident finial
    gold = mat("Finial", (1, 1, 1), emit=(1.0, 0.8, 0.45), strength=12)
    for dx in (-0.9, 0, 0.9):
        lathe(f"Trident{dx}", [(0.18, 0), (0.12, 3.2 if dx == 0 else 2.4), (0, 3.8 if dx == 0 else 2.9)],
              (dx, cy, 21 + 64 - 1), gold, segments=6)
    for i, (dx, dy) in enumerate(((-24, -24), (24, -24), (-24, 24), (24, 24))):
        terrace(f"SubTerrace{i}", dx, cy + dy, 9, 8, stone)
        sp = wat_arun_prang(f"PrangSub{i}", dx, cy + dy, 30, stone, z0=8, slim=0.85)
        tier_lights(f"PrangSub{i}", dx, cy + dy, 8, sp, 3, lip)
    for i, dx in enumerate((-31, 31)):
        terrace(f"MondopBase{i}", dx, cy, 6, 9, stone)
        prang(f"Mondop{i}", dx, cy, 12, 2.2, stone, tiers=5, segments=8)
        ob = bpy.data.objects[f"Mondop{i}"]
        ob.location.z = 9
    # Thai-roofed buildings: the ubosot behind the trees on the left, salas at the river
    tile = mat("ThaiTile", (0.25, 0.08, 0.03), rough=0.5, emit=(1.0, 0.42, 0.15), strength=0.45)
    tile_green = mat("ThaiTileGreen", (0.04, 0.18, 0.08), rough=0.5, emit=(0.4, 0.9, 0.5), strength=0.18)
    trim = mat("ThaiGold", (1, 1, 1), emit=(1.0, 0.78, 0.4), strength=8)
    wall = lit_stone("RiverHall", warm=(1.0, 0.75, 0.5), strength=1.6)
    thai_hall("Ubosot", -92, y + 60, 26, 40, 9, 3, wall, tile, trim)
    for i, dx in enumerate((-58, 56)):
        thai_hall(f"Sala{i}", dx, y + 22, 16, 10, 4.5, 2, wall, tile_green if i else tile, trim)
    trees = mat("Trees", (0.01, 0.015, 0.012), rough=0.9)
    tree_cluster(1, -200, -75, y + 40, 16, trees, h=(10, 18))
    tree_cluster(2, 75, 200, y + 40, 16, trees, h=(10, 18))
    # Thonburi behind: low lit buildings and a glow above them
    rnd = random.Random(76)
    for i in range(26):
        bx = rnd.uniform(-420, 420)
        if abs(bx) < 70:
            continue
        box(f"Thonburi{i}", rnd.uniform(14, 30), 18, rnd.uniform(6, 16), (bx, y + 420 + rnd.uniform(0, 300), 0),
            windows_mat(f"ThonWin{i % 3}", density=0.3, scale=0.5))
    lamp_row(3, -200, -70, y + 2, 2.5, 12, (1.0, 0.82, 0.55), strength=40, size=0.45)
    lamp_row(31, 70, 200, y + 2, 2.5, 12, (1.0, 0.82, 0.55), strength=40, size=0.45)
    point("PrangGlow", (0, y + 20, 12), 70000, (1.0, 0.72, 0.42), radius=20)
    # Chao Phraya traffic. The dinner cruise moves across the web scene as a sprite
    # (--sprite cruise), so the backdrop has only the express boat and a moored long-tail.
    if SPRITE != "cruise":
        express_boat("Express", 62, 232, 28, heading=math.radians(178))
    bamboo_pier("Tha", 46, y + 2, 12, width=5)
    longtail_boat("Longtail", 36, 112, 11, heading=math.radians(200))
    distant_krathongs(70, 55, 120, y - 6)
    lantern_string("PierKhom", [(40 + i * 3, y + 2, 4.2) for i in range(5)],
                   [(1.0, 0.55, 0.18), (1.0, 0.3, 0.25), (1.0, 0.8, 0.45)], per=4, size=0.35)
    if SPRITE == "cruise":
        cruise_boat("Cruise", 0, 175, 36, heading=0.0)


def chinese_pavilion(name, x, y, w, red, roof, gold, lamp):
    """Lumphini's Chinese pavilion on its island: red columns, a double hip roof whose
    corners sweep up, gold ridge, lanterns hung under the eaves."""
    for i, (dx, dy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1), (0, -1), (0, 1))):
        box(f"{name}Col{i}", 0.45, 0.45, 4.2, (x + dx * w * 0.42, y + dy * w * 0.32, 0.8), red)
    z = 5.0
    for k, (ww, hh) in enumerate(((w * 1.25, 1.8), (w * 0.8, 1.6))):
        # a hip roof: a squashed pyramid, then its four corners pulled up
        bm = bmesh.new()
        hw, hd = ww / 2, ww * 0.38
        base = [bm.verts.new(p) for p in ((-hw, -hd, 0), (hw, -hd, 0), (hw, hd, 0), (-hw, hd, 0))]
        for v in base:
            v.co.z += 0.7  # upturned corners
        ridge = [bm.verts.new((-hw * 0.35, 0, hh)), bm.verts.new((hw * 0.35, 0, hh))]
        bm.faces.new((base[0], base[1], ridge[1], ridge[0]))
        bm.faces.new((base[1], base[2], ridge[1]))
        bm.faces.new((base[2], base[3], ridge[0], ridge[1]))
        bm.faces.new((base[3], base[0], ridge[0]))
        bm.faces.new(list(reversed(base)))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        mesh_ob(f"{name}Roof{k}", bm, roof, loc=(x, y, z))
        box(f"{name}Ridge{k}", ww * 0.72, 0.25, 0.3, (x, y, z + hh - 0.1), gold)
        for i in range(5):
            sphere(f"{name}Lamp{k}_{i}", 0.3, (x - hw * 0.8 + i * hw * 0.4, y - hd - 0.2, z - 0.4), lamp,
                   scale=(1, 1, 1.3), subdiv=1)
        z += hh + 1.0
        if k == 0:
            box(f"{name}Drum", w * 0.55, w * 0.4, 1.0, (x, y, z - 1.0), red)


def lumphini():
    """Lumphini Park lake looking south-west toward Silom and Sathorn: rain trees on the
    far shore, the red Chinese pavilion on its island with a red footbridge, lamp posts
    along the lakeside path, swan pedal boats at the pier, and behind it all the towers:
    MahaNakhon with its pixel spiral, State Tower's gold dome, and a skyline of setbacks,
    lit crowns and LED bands with red beacons on the tallest."""
    lens(40)
    world(top=(0.005, 0.006, 0.02), horizon=(0.06, 0.04, 0.08), glow=(1.0, 0.45, 0.3), glow_amt=0.4)
    moon(-0.083, 0.378)
    y = 190
    ground_strip(y + 10)
    rnd = random.Random(7)
    beacon = mat("Beacon", (1, 0, 0), emit=(1, 0.1, 0.1), strength=60)
    crown = mat("Crown", (1, 1, 1), emit=(1.0, 0.85, 0.6), strength=5)
    for row, (depth, hmul, n0) in enumerate(((1500, 1.3, 0), (520, 1.0, 100))):
        x = -760
        i = n0
        while x < 760:
            w = rnd.uniform(20, 42)
            h = (rnd.uniform(60, 160) if abs(x) < 260 else rnd.uniform(30, 90)) * hmul
            d = rnd.uniform(18, 30)
            if not (-268 < x < -192):
                city_tower(f"Tower{i}", x + w / 2, y + depth + rnd.uniform(0, 300), w, d, h, rnd,
                           windows_mat(f"Win{i % 7}", density=rnd.uniform(0.3, 0.6),
                                       lit=rnd.choice(((1.0, 0.78, 0.48), (0.85, 0.9, 1.0)))), beacon, crown)
            x += w + rnd.uniform(4, 16)
            i += 1
    pixel = windows_mat("MahaNakhon", lit=(0.85, 0.9, 1.0), density=0.6, scale=0.6)
    pixel_tower("MahaNakhon", -230, y + 900, 34, 300, pixel)
    sphere("MahaNakhonBeacon", 1.2, (-230, y + 900, 302), beacon)
    gold = mat("Gold", (0.8, 0.55, 0.2), emit=(1.0, 0.75, 0.35), strength=4.0)
    dome_tower("StateTower", 170, y + 1300, 46, 220, windows_mat("StateWin", lit=(1.0, 0.85, 0.6), density=0.5), gold)
    trees = mat("Trees", (0.008, 0.014, 0.01), rough=0.9)
    tree_cluster(4, -300, 300, y + 25, 70, trees, h=(12, 24), spread=14)
    # the lakeside path: lamp posts, each with its globe
    post = mat("LampPost", (0.05, 0.05, 0.06), rough=0.5, metallic=0.6)
    globe = mat("LampGlobe", (1, 1, 1), emit=(1.0, 0.82, 0.55), strength=26)
    for i in range(26):
        lx = -170 + i * 13.6
        lathe(f"PathPost{i}", [(0.12, 0), (0.08, 4.0)], (lx, y + 3, 0.6), post, segments=6)
        sphere(f"PathGlobe{i}", 0.42, (lx, y + 3, 4.9), globe, subdiv=2)
    point("Pavilion", (0, y + 8, 6), 7500, (1.0, 0.7, 0.4), radius=4)
    # the Chinese pavilion on its island, a red bridge to it
    red = mat("PavilionRed", (0.45, 0.04, 0.03), rough=0.5, emit=(1.0, 0.2, 0.1), strength=0.9)
    roof = mat("PavilionRoof", (0.05, 0.18, 0.12), rough=0.5, emit=(0.3, 0.9, 0.6), strength=0.25)
    trim = mat("PavilionGold", (1, 1, 1), emit=(1.0, 0.78, 0.4), strength=7)
    lantern = mat("RedLantern", (1, 1, 1), emit=(1.0, 0.18, 0.08), strength=16)
    sphere("PavilionIsland", 14, (62, 152, -4), mat("IslandGround", (0.01, 0.012, 0.015)), scale=(1.4, 0.8, 0.35))
    chinese_pavilion("ChinesePavilion", 62, 150, 9, red, roof, trim, lantern)
    for k in range(16):
        t = k / 15
        bx = 62 - 13 - t * 30
        box(f"RedBridge{k}", 2.1, 3.0, 0.35, (bx, 146 - t * 8, 0.9 + math.sin(t * math.pi) * 2.4), red)
    point("PavilionGlow", (62, 140, 5), 3500, (1.0, 0.5, 0.3), radius=3)
    # swan boats rafted together at a pier on the left, close enough to read
    bamboo_pier("SwanPier", -38, 74, 8, width=4)
    for i, (sx, sy, hd) in enumerate(((-44, 64, 0.3), (-39, 62, 0.1), (-34, 65, -0.2), (-29, 63, 0.2), (36, 92, 2.9))):
        swan_boat(f"SwanBoat{i}", sx, sy, s=1.0, heading=hd)
    distant_krathongs(71, 45, 110, y - 6)
    lantern_string("SwanKhom", [(-44 + i * 3, 74, 3.6) for i in range(5)],
                   [(1.0, 0.55, 0.18), (1.0, 0.3, 0.25), (1.0, 0.8, 0.45)], per=3, size=0.3)


def lotus_bud_tower(name, x, y, z0, height, w, material):
    """The lotus-bud chedi of Wat Mahathat Sukhothai on its own: a redented square body in
    three diminishing tiers, a narrow neck, then the closed lotus bud on a ribbed collar and
    a tall pinnacle of stacked rings."""
    prof = [(w / 2, 0), (w / 2, height * 0.12), (w * 0.44, height * 0.13), (w * 0.44, height * 0.22),
            (w * 0.38, height * 0.23), (w * 0.38, height * 0.3), (w * 0.3, height * 0.31), (w * 0.3, height * 0.36)]
    redented_lathe(name + "Body", prof, (x, y, z0), material, corners=5, notch=0.84)
    zb = z0 + height * 0.36
    # collar of upturned petals, then the bud itself: full at the shoulder, drawn to a point
    lathe(name + "Collar", [(w * 0.22, 0), (w * 0.3, height * 0.025), (w * 0.27, height * 0.05)],
          (x, y, zb), material, segments=16)
    r = w * 0.25
    lathe(name + "Bud", [(r * 0.78, 0), (r * 1.05, height * 0.05), (r * 1.1, height * 0.1), (r * 0.95, height * 0.17),
                         (r * 0.6, height * 0.23), (r * 0.22, height * 0.27), (r * 0.12, height * 0.28)],
          (x, y, zb + height * 0.05), material, segments=16, smooth=True)
    zp = zb + height * 0.33
    rings = [(r * 0.16, 0), (r * 0.2, height * 0.01), (r * 0.13, height * 0.02)]
    zz = height * 0.02
    for k in range(6):  # stacked rings narrowing up the pinnacle
        rr = r * 0.13 * (1 - k / 7)
        rings += [(rr * 1.4, zz + height * 0.008), (rr, zz + height * 0.02)]
        zz += height * 0.028
    rings += [(r * 0.03, zz + height * 0.05), (0.0, zz + height * 0.12)]
    lathe(name + "Pinnacle", rings, (x, y, zp), material, segments=12)


def attharot_mondop(name, x, y, h, brick, plaster):
    """One of the two brick mondops beside the main chedi, each open to the front with a
    huge standing Buddha (Phra Attharot) filling it, his head clearing the broken walls."""
    w, d = h * 0.42, h * 0.28
    box(name + "Back", w, 1.6, h * 0.86, (x, y + d / 2, 0), brick)
    for side in (-1, 1):
        box(f"{name}Wall{side}", 1.6, d, h * 0.8, (x + side * (w / 2 - 0.8), y, 0), brick)
    box(name + "Step", w + 2, d + 2, 1.2, (x, y, 0), brick)
    standing_buddha(name + "Buddha", x, y - 0.5, h, plaster)


def sukhothai():
    """Wat Mahathat, Sukhothai Historical Park, across the moat on Loy Krathong Tian Phao
    night: the lotus-bud chedi on its square base ringed by four Khmer corner towers, the
    two brick mondops of the standing Buddhas either side, smaller lotus-bud chedis, the
    vihara's laterite columns with a seated Buddha among them, candles along the moat,
    and krathongs on the water."""
    lens(45)
    world(top=(0.003, 0.004, 0.016), horizon=(0.035, 0.03, 0.07), glow=(1.0, 0.5, 0.2), glow_amt=0.18)
    moon(0.111, 0.333, size_deg=3.6)
    y = 240
    ground_strip(y + 10)
    stone = lit_stone("Laterite", warm=(1.0, 0.55, 0.25), strength=2.4, pattern="laterite")
    brick = lit_stone("Brick", warm=(1.0, 0.42, 0.2), strength=1.6, pattern="brick")
    plaster = lit_stone("Plaster", warm=(1.0, 0.72, 0.45), strength=2.0)
    white = lit_stone("BuddhaPlaster", warm=(1.0, 0.86, 0.7), strength=2.6)
    cy = y + 48
    stepped_base("Platform", 0, y + 25, 150, 1.6, 1, brick)
    # the main chedi: three square terraces, then the lotus-bud tower
    terrace("MahathatT0", 0, cy, 30, 4, brick, corners=3)
    terrace("MahathatT1", 0, cy, 25, 8, brick, corners=3)
    terrace("MahathatT2", 0, cy, 20, 12, brick, corners=3)
    lotus_bud_tower("Mahathat", 0, cy, 12, 46, 16, stone)
    # four Khmer-style corner towers on the corners of the base
    for i, (dx, dy) in enumerate(((-14, -14), (14, -14), (-14, 14), (14, 14))):
        prang(f"Corner{i}", dx, cy + dy, 22, 2.6, plaster, tiers=6, segments=8)
    # the standing Buddhas in their mondops either side
    for i, dx in enumerate((-27, 27)):
        attharot_mondop(f"Attharot{i}", dx, cy + 2, 17, brick, white)
    for i, dx in enumerate((-44, 44)):
        lotus_bud_chedi(f"Small{i}", dx, cy + 6, 17, 7, stone)
    # vihara in front: columns in rows, a big seated Buddha at the back of the hall
    band = mat("PillarBand", (0.6, 0.55, 0.5), emit=(1.0, 0.75, 0.5), strength=0.6)
    for i, dx in enumerate((-24, -17, -10, 10, 17, 24)):
        for row, dy in enumerate((0, 7)):
            hh = 4 if (i + row) % 3 else 3
            for k in range(hh):
                box(f"Pillar{i}{row}_{k}", 1.9, 1.9, 3.0, (dx, y + 22 + dy, 1.6 + k * 3.2), stone)
                box(f"PillarBand{i}{row}_{k}", 2.0, 2.0, 0.25, (dx, y + 22 + dy, 4.6 + k * 3.2), band)
    seated_buddha("Buddha", 0, y + 32, 1.6, 13, white)
    dark = mat("Palm", (0.006, 0.008, 0.01), rough=0.9)
    for i, (dx, h) in enumerate(((-92, 22), (-80, 18), (84, 24), (98, 19), (-140, 20), (135, 21))):
        sugar_palm(f"Palm{i}", dx, y + 18, h, dark)
    tree_cluster(6, -260, -110, y + 45, 16, dark, h=(8, 14))
    tree_cluster(7, 110, 260, y + 45, 16, dark, h=(8, 14))
    # candles along the moat edge and round the platform for Tian Phao
    lamp_row(8, -80, 80, y + 4, 1.2, 70, (1.0, 0.68, 0.3), strength=40, size=0.25)
    lamp_row(9, -74, 74, y + 12.5, 1.9, 60, (1.0, 0.7, 0.32), strength=30, size=0.2)
    point("ChediGlow", (0, y + 12, 10), 40000, (1.0, 0.65, 0.35), radius=15)
    distant_krathongs(10, 60, 110, y - 4)
    # no fireworks here: the web scene animates them over the backdrop (RiverScene FX)


def ridge(name, y, x0, x1, profile, material, n=160):
    """A far hill range as a vertical curtain whose top follows profile(u), u 0..1 across."""
    bm = bmesh.new()
    top, bot = [], []
    for i in range(n + 1):
        u = i / n
        x = x0 + (x1 - x0) * u
        top.append(bm.verts.new((x, 0, max(profile(u), 1.0))))
        bot.append(bm.verts.new((x, 0, -5.0)))
    for i in range(n):
        bm.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    tops = [(v.co.x, v.co.z) for v in top]
    return mesh_ob(name, bm, material, loc=(0, y, 0)), tops


def truss_bridge(name, y, x0, x1, deck_z, depth, panels, steel, deck_mat, lamp):
    """Chiang Mai's old Iron Bridge (Saphan Lek): a footbridge of riveted Warren trusses on
    two river piers, its top chords hung with lanterns for the festival."""
    length = x1 - x0
    box(name + "Deck", length, 5.5, 0.5, ((x0 + x1) / 2, y, deck_z), deck_mat)
    step = length / panels
    for side in (-1, 1):
        yy = y + side * 2.8
        box(f"{name}Bottom{side}", length, 0.35, 0.45, ((x0 + x1) / 2, yy, deck_z + 0.4), steel)
        box(f"{name}Top{side}", length, 0.35, 0.45, ((x0 + x1) / 2, yy, deck_z + depth), steel)
        for i in range(panels + 1):
            box(f"{name}Post{side}_{i}", 0.3, 0.3, depth, (x0 + i * step, yy, deck_z + 0.4), steel)
        for i in range(panels):
            diag = math.hypot(step, depth)
            lean = math.atan2(step, depth) * (1 if i % 2 else -1)
            # a diagonal from one panel corner at the deck to the opposite one at the top
            foot = x0 + i * step if i % 2 else x0 + (i + 1) * step
            ob = box(f"{name}Diag{side}_{i}", 0.22, 0.22, diag, (foot, yy, deck_z + 0.4), steel)
            ob.rotation_euler = (0, lean, 0)
    for i, px in enumerate((x0 + length / 3, x0 + 2 * length / 3)):
        box(f"{name}Pier{i}", 3.0, 7.0, deck_z + 1.5, (px, y, -1.5), deck_mat)
    for i in range(panels * 2 + 1):
        lx = x0 + i * length / (panels * 2)
        sphere(f"{name}Lamp{i}", 0.3, (lx, y - 3.1, deck_z + depth + 0.6), lamp, subdiv=1)


def chiang_mai():
    """The Ping river in Chiang Mai on Yi Peng night, looking upstream past riverside Lanna
    houses to the Iron Bridge hung with lanterns. Doi Suthep rises in layers behind the
    city, the road up to Wat Phra That a thread of lights to the gold chedi near the top,
    and the sky is full of khom loi lanterns drifting up from the bridge."""
    lens(40)
    world(top=(0.004, 0.006, 0.02), horizon=(0.05, 0.04, 0.07), glow=(1.0, 0.55, 0.25), glow_amt=0.3)
    moon(-0.111, 0.356)
    # Doi Suthep and Doi Pui: two ridges, the far one paler in the haze, peak to the left
    far = mat("RidgeFar", (0.02, 0.025, 0.045), rough=1, emit=(0.08, 0.09, 0.16), strength=0.5)
    near = mat("RidgeNear", (0.008, 0.01, 0.02), rough=1, emit=(0.03, 0.035, 0.07), strength=0.35)

    def far_prof(u):
        return 160 + 420 * math.exp(-((u - 0.3) / 0.22) ** 2) + 25 * math.sin(u * 23) + 12 * math.sin(u * 61 + 1)

    def near_prof(u):
        return (80 + 300 * math.exp(-((u - 0.36) / 0.18) ** 2) + 90 * math.exp(-((u - 0.75) / 0.12) ** 2)
                + 14 * math.sin(u * 37) + 6 * math.sin(u * 97 + 2))

    ridge("DoiPui", 6200, -5200, 5200, far_prof, far)
    _, tops = ridge("DoiSuthep", 4300, -3600, 3600, near_prof, near)
    # the gold chedi just below the summit and the road climbing to it
    px, pz = max(tops, key=lambda t: t[1])
    sx, sz = px - 160, pz - 38
    gold = mat("PhraThat", (1, 1, 1), emit=(1.0, 0.78, 0.38), strength=60)
    lathe("PhraThatChedi", [(12, 0), (12, 7), (8, 17), (2.0, 34), (0, 44)], (sx, 4290, sz), gold, segments=10)
    sphere("PhraThatGlow", 32, (sx, 4300, sz + 10), mat("PhraThatHaze", (1, 1, 1), emit=(1.0, 0.7, 0.35), strength=1.2))
    road = mat("RoadLight", (1, 1, 1), emit=(1.0, 0.8, 0.5), strength=14)
    x, z = 600.0, 8.0
    k = 0
    rnd_road = random.Random(30)
    while z < sz - 4 and k < 600:
        # switchbacks: the road swings left and right as it climbs toward the temple
        tx = sx + (math.sin(k * 0.06) + 0.35 * math.sin(k * 0.23 + 1)) * 300 * (1 - z / sz)
        x += (tx - x) * 0.08
        z += sz / 300
        if k % 4 == 0 and rnd_road.random() < 0.7:  # street lamps, some out
            sphere(f"Road{k}", 2.4, (x, 4280, z), road, subdiv=1)
        k += 1
    # the city at the foot of the hills: a wide band of lights
    rnd = random.Random(31)
    for i in range(380):
        yy = rnd.uniform(1500, 3800)
        half = view_half_width(yy)
        c = rnd.choice(((1.0, 0.75, 0.42), (1.0, 0.85, 0.65), (0.8, 0.9, 1.0)))
        sphere(f"City{i}", rnd.uniform(0.8, 2.0), (rnd.uniform(-half, half), yy, rnd.uniform(1, 18)),
               mat(f"CityLight{c}", (1, 1, 1), emit=c, strength=30), subdiv=1)
    # the two banks run away from the camera toward the bridge
    bank = mat("Bank", (0.01, 0.012, 0.02), rough=0.9)
    for side in (-1, 1):
        bm = bmesh.new()
        v = [bm.verts.new(p) for p in ((side * 60, 20, 0.8), (side * 600, 20, 0.8), (side * 600, 900, 0.8), (side * 60, 900, 0.8))]
        bm.faces.new(v if side > 0 else list(reversed(v)))
        mesh_ob(f"Bank{side}", bm, bank)
    box("FarBank", 1400, 2000, 0.8, (0, 900 + 1000, 0), bank)
    steel = mat("IronBridge", (0.12, 0.14, 0.16), rough=0.5, metallic=0.6, emit=(1.0, 0.75, 0.45), strength=0.35)
    deck = mat("BridgeDeck", (0.18, 0.16, 0.14), rough=0.7, emit=(1.0, 0.75, 0.45), strength=0.3)
    lamp = mat("BridgeLamp", (1, 1, 1), emit=(1.0, 0.8, 0.5), strength=30)
    truss_bridge("SaphanLek", 330, -64, 64, 6, 6.5, 12, steel, deck, lamp)
    yipeng = [(1.0, 0.62, 0.22), (1.0, 0.3, 0.25), (1.0, 0.82, 0.5), (1.0, 0.4, 0.55)]
    for side, yy in ((-1, 327), (1, 333)):
        lantern_string(f"BridgeKhom{side}", [(-64 + i * 16, yy, 12.9) for i in range(9)], yipeng, per=6, size=0.55)
    wood = mat("Teak", (0.05, 0.03, 0.02), rough=0.8, emit=(1.0, 0.6, 0.3), strength=0.12)
    roof = mat("LannaRoof", (0.02, 0.016, 0.014), rough=0.7)
    lit = mat("HouseWindow", (1, 1, 1), emit=(1.0, 0.72, 0.4), strength=8)
    rnd = random.Random(12)
    for side in (-1, 1):
        for k in range(9):
            yy = 70 + k * 30
            xx = side * (70 + rnd.uniform(0, 5))
            lanna_house(f"House{side}_{k}", xx, yy, 14 + rnd.uniform(-2, 4), wood, roof, lit)
        # lantern lines strung along the riverside restaurants
        lantern_string(f"BankKhom{side}", [(side * 61, 30 + i * 28, 4.2) for i in range(11)], yipeng, per=5, size=0.42)
        for i in range(11):
            lathe(f"BankPost{side}_{i}", [(0.12, 0), (0.1, 4.4)], (side * 61, 30 + i * 28, 0.8), wood, segments=6)
    trees = mat("Trees", (0.008, 0.012, 0.01), rough=0.9)
    tree_cluster(12, -420, -170, 420, 40, trees, h=(10, 20), spread=140)
    tree_cluster(13, 170, 420, 420, 40, trees, h=(10, 20), spread=140)
    tree_cluster(14, -200, 200, 470, 30, trees, h=(10, 18), spread=40)
    point("BridgeGlow", (0, 300, 12), 30000, (1.0, 0.6, 0.35), radius=12)
    crowd(42, -60, 60, 330, 40, spread=1.5, crouch_share=0.0)
    for side in (-1, 1):
        crowd(43 + side, side * 62, side * 64, 200, 40, spread=120, crouch_share=0.5)
    distant_krathongs(44, 70, 110, 320, max_x=55)
    sky_lanterns(45, 260, 260, 2600, source_x=-40, spread=0.45)


def roi_et():
    """Bueng Phalanchai, Roi Et: the 101 m Roi Et Tower (Ho Wot) with its crown shaped like
    a wot pan-pipe, the island with its Thai pavilion reached by a footbridge, lotus-bud
    lamp posts along the lake, the musical fountain mid-show, and Luang Pho Yai, the tall
    gilded standing Buddha of Wat Burapha, over the city to the right."""
    lens(42)
    world(top=(0.003, 0.005, 0.02), horizon=(0.04, 0.04, 0.09), glow=(1.0, 0.6, 0.3), glow_amt=0.22)
    moon(-0.090, 0.356)
    y = D
    ground_strip(y + 10)
    tx, ty = 10, y + 200
    gold = mat("HoWotGold", (0.8, 0.55, 0.2), emit=(1.0, 0.72, 0.35), strength=2.4, metallic=0.6)
    glass = windows_mat("HoWotGlass", lit=(1.0, 0.85, 0.6), density=0.7, scale=0.9)
    lathe("HoWotPlinth", [(14, 0), (13, 4), (8, 6), (8, 8)], (tx, ty, 0), gold, segments=24)
    # slim tapered shaft with gold fins running up it
    lathe("HoWotShaft", [(5.2, 0), (4.6, 60), (4.2, 72)], (tx, ty, 8), glass, segments=24)
    for i in range(12):
        a = 2 * math.pi * i / 12
        ob = box(f"Fin{i}", 0.7, 1.6, 70, (tx + math.cos(a) * 5.0, ty + math.sin(a) * 5.0, 8), gold)
        ob.rotation_euler = (0, 0, a)
    ring = mat("HoWotRing", (1, 1, 1), emit=(1.0, 0.85, 0.55), strength=9)
    for k in range(6):  # light rings round the shaft at each floor band
        lathe(f"HoWotBand{k}", [(5.4 - k * 0.12, 0), (5.4 - k * 0.12, 0.5)], (tx, ty, 14 + k * 11), ring, segments=24)
    top = 80
    lathe("HoWotDeck", [(5, 0), (9, 3), (9, 7), (6, 9)], (tx, ty, top), glass, segments=24)
    lathe("HoWotDeckRim", [(9.4, 0), (9.4, 0.9)], (tx, ty, top + 3), gold, segments=24)
    # the wot: a ring of pipes, longest in the middle, fanning out like a crown
    for ring_i, (n, rr, ln, tilt) in enumerate(((18, 6.5, 14, 0.32), (12, 3.6, 20, 0.18), (6, 1.4, 26, 0.06))):
        for i in range(n):
            a = 2 * math.pi * (i + ring_i * 0.5) / n
            L = ln + 2 * math.sin(i * 1.7)
            ob = lathe(f"Pipe{ring_i}_{i}", [(0.75, 0), (0.65, L), (0, L + 1.0)],
                       (tx + math.cos(a) * rr, ty + math.sin(a) * rr, top + 8), gold, segments=8)
            ob.rotation_euler = (-math.sin(a) * tilt, math.cos(a) * tilt, 0)
    point("TowerTop", (tx, ty - 14, top + 14), 4000, (1.0, 0.85, 0.6), radius=3)
    # island in the lake with a Thai pavilion and a footbridge
    trees = mat("Trees", (0.008, 0.013, 0.012), rough=0.9)
    sphere("Island", 26, (-95, y - 20, -5), mat("IslandGround", (0.01, 0.012, 0.015)), scale=(1.6, 0.7, 0.3))
    tree_cluster(14, -125, -65, y - 12, 10, trees, h=(7, 12), spread=4)
    tile = mat("SalaRoof", (0.4, 0.12, 0.05), emit=(1.0, 0.45, 0.2), strength=0.7)
    trim = mat("SalaGold", (1, 1, 1), emit=(1.0, 0.78, 0.4), strength=8)
    thai_hall("Sala", -95, y - 28, 12, 9, 4.5, 2, lit_stone("SalaLit", strength=1.8), tile, trim)
    deck = mat("FootBridge", (0.2, 0.18, 0.15), emit=(1.0, 0.75, 0.45), strength=0.5)
    box("FootBridge", 70, 2.5, 0.5, (-30, y - 26, 1.6), deck)
    lamp_row(18, -65, 5, y - 27.5, 2.6, 15, (1.0, 0.8, 0.5), strength=40, size=0.22)
    buddha_gold = mat("BuddhaGold2", (0.8, 0.5, 0.12), emit=(1.0, 0.6, 0.18), strength=2.4, metallic=0.6)
    halo = mat("BuddhaHalo", (1, 1, 1), emit=(1.0, 0.6, 0.25), strength=0.25)
    gold_standing_buddha("LuangPhoYai", 330, y + 700, 68, buddha_gold, halo)
    tree_cluster(15, -320, -150, y + 30, 26, trees, h=(8, 16))
    tree_cluster(16, 70, 320, y + 30, 26, trees, h=(8, 16))
    rnd = random.Random(5)
    beacon = mat("Beacon", (1, 0, 0), emit=(1, 0.1, 0.1), strength=60)
    crown = mat("Crown", (1, 1, 1), emit=(1.0, 0.85, 0.6), strength=4)
    for i in range(22):
        bx = rnd.uniform(-420, 420)
        if -40 < bx < 60:
            continue
        city_tower(f"City{i}", bx, y + 300 + rnd.uniform(0, 400), rnd.uniform(15, 30), 20, rnd.uniform(10, 30), rnd,
                   windows_mat(f"RoiWin{i % 3}", density=0.35), beacon, crown)
    # lotus-bud lamp posts along the shore instead of bare bulbs
    post = mat("LotusPost", (0.08, 0.07, 0.06), rough=0.5, metallic=0.5)
    lotus = mat("LotusLamp", (1, 1, 1), emit=(1.0, 0.75, 0.4), strength=18)
    for i in range(36):
        thai_lamp_post(f"ShorePost{i}", -260 + i * 520 / 35, y + 1.5, 0.6, post, lotus)
    point("ShoreGlow", (0, y + 5, 4), 12500, (1.0, 0.65, 0.35), radius=10)
    crowd(51, -200, 200, y + 3, 70, spread=2)
    fountain("Fountain", -42, y - 95, [(0.2, 0.7, 1.0), (1.0, 0.3, 0.7), (0.4, 1.0, 0.6), (1.0, 0.75, 0.3)])
    distant_krathongs(72, 60, 120, y - 6)


def ellipse_pts(cx, cy, rx, ry, n=96):
    return [(cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n)) for i in range(n)]


def ellipse_ring(name, cx, cy, rx0, ry0, rx1, ry1, z0, z1, material, n=96):
    """A raised ring between two ellipses (the pool curb), closed top, inner and outer walls."""
    bm = bmesh.new()
    inner = ellipse_pts(cx, cy, rx0, ry0, n)
    outer = ellipse_pts(cx, cy, rx1, ry1, n)
    ib = [bm.verts.new((x, y, z0)) for x, y in inner]
    it = [bm.verts.new((x, y, z1)) for x, y in inner]
    ob = [bm.verts.new((x, y, z0)) for x, y in outer]
    ot = [bm.verts.new((x, y, z1)) for x, y in outer]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((it[i], it[j], ot[j], ot[i]))
        bm.faces.new((ib[i], ib[j], it[j], it[i]))
        bm.faces.new((ob[j], ob[i], ot[i], ot[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return mesh_ob(name, bm, material)


def surnapha_tower(name, x, y):
    """Ho Suranapha, SUT's lotus tower (students call it Ho Haeo, the water chestnut
    tower), about 82 m. Modelled from photos: a round stepped white plinth, a slim
    white column with a vertical strip of stair windows, then the head: a ribbed bowl,
    a dark band of viewing-deck windows at its widest, a gold dome covered in a lattice
    of openings that glow at night, a ring of lotus-petal tips, and a thin spire with a
    red aviation light."""
    white = lit_stone(name + "White", warm=(1.0, 0.9, 0.78), strength=1.6)
    gold = mat(name + "Gold", (0.85, 0.66, 0.36), rough=0.45, metallic=0.3, emit=(1.0, 0.78, 0.45), strength=1.6)
    lattice = lit_stone(name + "Lattice", warm=(1.0, 0.7, 0.32), strength=6.0, pattern="mosaic")
    deck = windows_mat(name + "Deck", lit=(1.0, 0.86, 0.6), density=0.8, scale=1.2)
    slot = mat(name + "Slot", (0.02, 0.02, 0.03), emit=(1.0, 0.85, 0.6), strength=0.8)

    # plinth: three round steps and a low planter ring
    for k, (r, h) in enumerate(((9.0, 0.8), (7.2, 0.8), (5.4, 0.8))):
        lathe(f"{name}Step{k}", [(r, 0), (r, h)], (x, y, k * 0.8), white, segments=32)
    lathe(name + "Planter", [(11.5, 0), (11.5, 0.9), (10.8, 0.9)], (x, y, 0), white, segments=40)
    # column, slightly tapered
    z0 = 2.4
    col_h = 56.0
    lathe(name + "Column", [(2.3, 0), (2.1, col_h * 0.5), (1.95, col_h)], (x, y, z0), white, segments=28, smooth=True)
    box(name + "StairSlot", 0.7, 0.3, col_h * 0.8, (x, y - 2.15, z0 + col_h * 0.1), slot)
    # head
    hz = z0 + col_h
    lathe(name + "Bowl", [(1.95, 0), (3.2, 1.2), (5.0, 3.0), (5.8, 4.4)], (x, y, hz), gold, segments=36, smooth=True)
    # ribs lie along the bowl, from the column out to the deck
    slope = math.atan2(5.8 - 1.95, 4.4)
    for i in range(24):
        a = 2 * math.pi * i / 24
        ob = box(f"{name}Rib{i}", 0.25, 0.4, math.hypot(3.85, 4.4) + 0.2,
                 (x + math.cos(a) * 2.05, y + math.sin(a) * 2.05, hz), white)
        ob.rotation_euler = (0, slope, a)
    lathe(name + "DeckBand", [(5.9, 0), (5.9, 2.6)], (x, y, hz + 4.4), deck, segments=40)
    lathe(name + "DeckRim", [(6.2, 0), (6.2, 0.35)], (x, y, hz + 7.0), white, segments=40)
    lathe(name + "Dome", [(5.9, 0), (5.6, 1.6), (4.6, 3.4), (3.0, 4.8), (1.3, 5.6)], (x, y, hz + 7.35), lattice, segments=36, smooth=True)
    # lotus petal tips round the crown
    for i in range(16):
        a = 2 * math.pi * i / 16
        px, py = x + math.cos(a) * 2.4, y + math.sin(a) * 2.4
        ob = lathe(f"{name}Petal{i}", [(0.45, 0), (0.3, 0.9), (0, 2.0)], (px, py, hz + 11.6), gold, segments=6)
        ob.rotation_euler = (-math.sin(a) * 0.35, math.cos(a) * 0.35, 0)
    top = hz + 12.9
    lathe(name + "Spire", [(0.55, 0), (0.3, 3), (0.12, 9), (0.05, 11)], (x, y, top), white, segments=10)
    sphere(name + "Beacon", 0.45, (x, y, top + 11.2), mat("TowerBeacon", (1, 0, 0), emit=(1.0, 0.04, 0.12), strength=12), subdiv=1)
    point(name + "Uplight", (x, y - 10, 2), 6000, (1.0, 0.9, 0.75), radius=2)
    point(name + "HeadGlow", (x, y - 14, hz + 6), 9000, (1.0, 0.72, 0.38), radius=3)


def festoon(name, pts, bulb, per=12, sag=0.9, size=0.16):
    """Festoon lights: bare warm bulbs on a wire slung between poles, sagging in each span."""
    k = 0
    for a, b in zip(pts, pts[1:]):
        for j in range(per):
            t = (j + 0.5) / per
            x = a[0] + (b[0] - a[0]) * t
            y = a[1] + (b[1] - a[1]) * t
            z = a[2] + (b[2] - a[2]) * t - math.sin(t * math.pi) * sag
            sphere(f"{name}_{k}", size, (x, y, z), bulb, subdiv=1)
            k += 1


def beam_mat(name, colour, strength=1.2, alpha=0.12):
    """A stage light beam: faint glowing air, mostly see-through."""
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*colour, 1)
    em.inputs["Strength"].default_value = strength
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = alpha
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return m


def led_screen_mat(name):
    """The stage screen showing a festival graphic: a soft gold-to-violet wash with a
    brighter lotus-shaped bloom in the middle."""
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (0, 0, 0, 1)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.25, 0.04, 0.6, 1)
    ramp.color_ramp.elements[1].color = (0.9, 0.35, 0.05, 1)
    nt.links.new(sep.outputs["X"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 0.9
    return m


def sut():
    """SUT fountain plaza on Loy Krathong night, after event photos on sut.ac.th and the
    university's Facebook pages: an oval fountain pool with a raised stone curb lit by an
    LED strip, people crouching at the edge to float krathongs, market tents and a stage
    truss around the plaza, and Ho Suranapha (the lotus tower students call Ho Haeo) behind with its head lit gold."""
    world(top=(0.003, 0.006, 0.02), horizon=(0.03, 0.04, 0.07), glow=(1.0, 0.7, 0.4), glow_amt=0.15, stars=1.2)
    moon(-0.056, 0.367)
    # the camera stands at the near curb (y -8), so the water fills the bottom of the frame
    cx, cy, rx, ry = 0.0, 22.0, 34.0, 30.0
    curb = mat("Curb", (0.42, 0.33, 0.26), rough=0.7, emit=(1.0, 0.7, 0.45), strength=0.18)
    plaza = mat("Plaza", (0.05, 0.045, 0.04), rough=0.85)
    led = mat("LedStrip", (1, 1, 1), emit=(1.0, 0.8, 0.45), strength=22)
    ellipse_ring("Curb", cx, cy, rx, ry, rx + 1.4, ry + 1.4, -0.2, 0.75, curb)
    ellipse_ring("Led", cx, cy, rx - 0.02, ry - 0.02, rx + 0.02, ry + 0.02, 0.5, 0.58, led)
    # paving all round the pool: a big ring from the curb outwards
    bm = bmesh.new()
    n = 96
    inner = [bm.verts.new((x, y, 0.6)) for x, y in ellipse_pts(cx, cy, rx + 1.4, ry + 1.4, n)]
    outer = [bm.verts.new((x, y, 0.6)) for x, y in ellipse_pts(cx, cy, 3000, 3000, n)]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((inner[i], inner[j], outer[j], outer[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh_ob("Plaza", bm, plaza)
    # the fountain jets are off on festival night (see the 2566 photos), so the pool is open water

    surnapha_tower("Suranapha", 26, 280)

    # red-roofed campus buildings behind the plaza
    wall = windows_mat("SutWin", lit=(1.0, 0.82, 0.55), density=0.35, scale=0.5)
    roof = mat("RedRoof", (0.35, 0.08, 0.04), rough=0.6, emit=(1.0, 0.35, 0.18), strength=0.25)
    rnd = random.Random(22)
    for i, (bx, w, h) in enumerate(((-150, 70, 12), (-60, 60, 14), (90, 80, 12), (180, 60, 10))):
        by = 260 + rnd.uniform(0, 40)
        box(f"Hall{i}", w, 26, h, (bx, by, 0), wall)
        prism_roof(f"HallRoof{i}", 28, w + 6, 9, (bx, by, h), roof, overhang=1.25).rotation_euler = (0, 0, math.pi / 2)
    trees = mat("Trees", (0.007, 0.012, 0.012), rough=0.9)
    tree_cluster(22, -260, 260, 330, 50, trees, h=(8, 16), spread=30)

    # market tents round the far side of the pool, lit from inside
    colors = [(0.5, 0.15, 0.1), (0.15, 0.15, 0.45), (0.15, 0.35, 0.15), (0.45, 0.3, 0.1), (0.5, 0.12, 0.3)]
    stone = mat("TentPole", (0.3, 0.3, 0.3))
    for k in range(18):
        a = math.radians(15 + k * 150 / 17)
        x = cx + (rx + 12) * math.cos(a)
        yy = cy + (ry + 12) * math.sin(a)
        c = colors[k % len(colors)]
        canvas = mat(f"Tent{k % len(colors)}", c, emit=tuple(v * 1.6 for v in c), strength=0.9)
        for px in (-2.8, 2.8):
            for py in (-2.8, 2.8):
                box(f"TentPole{k}{px}{py}", 0.12, 0.12, 2.6, (x + px, yy + py, 0.6), stone)
        lathe(f"TentRoof{k}", [(4.2, 0), (0.1, 2.0), (0, 2.1)], (x, yy, 3.2), canvas, segments=4)
        point(f"TentLight{k}", (x, yy, 2.8), 260, (1.0, 0.82, 0.55), radius=1.2)

    # stage truss on the left, as in the 2566 photos
    steel = mat("Truss", (0.5, 0.5, 0.52), rough=0.4, metallic=0.8, emit=(0.8, 0.85, 1.0), strength=0.2)
    sx, sy = -48, 74
    for i in range(7):
        x = sx + i * 5
        box(f"TrussPost{i}", 0.4, 0.4, 11, (x, sy, 0.6), steel)
        for flip in (1, -1):
            ob = box(f"TrussDiag{i}{flip}", 0.25, 0.25, math.hypot(5, 5.5), (x + 2.5, sy, 6), steel)
            ob.rotation_euler = (0, math.atan2(5, 5.5) * flip, 0)
    box("TrussTop", 31, 0.5, 0.5, (sx + 15, sy, 11.4), steel)
    box("Stage", 30, 10, 1.4, (sx + 15, sy + 5, 0.6), mat("StageDeck", (0.05, 0.04, 0.05)))
    for k, c in enumerate(((1.0, 0.4, 0.7), (0.6, 0.5, 1.0), (1.0, 0.8, 0.5))):
        point(f"StageLight{k}", (sx + 6 + k * 9, sy - 2, 10), 2500, c, radius=1.0)

    point("PlazaFill", (0, 40, 16), 18000, (1.0, 0.8, 0.55), radius=10)

    # festival lights: poles round the back of the plaza with festoons slung between them,
    # and a few long runs criss-crossing high over the far half of the pool
    bulb = mat("FestoonBulb", (1, 1, 1), emit=(1.0, 0.78, 0.42), strength=30)
    pole = mat("FestoonPole", (0.12, 0.12, 0.13), rough=0.5, metallic=0.5)
    ring = []
    for k in range(13):
        a = math.radians(8 + k * 164 / 12)
        px, py = cx + (rx + 21) * math.cos(a), cy + (ry + 21) * math.sin(a)
        lathe(f"FestoonPole{k}", [(0.12, 0), (0.09, 8.5)], (px, py, 0.6), pole, segments=6)
        ring.append((px, py, 8.9))
    festoon("FestoonRing", ring, bulb, per=14, sag=1.4)
    for i, (a0, a1) in enumerate(((20, 120), (60, 160), (40, 140))):
        p0 = ring[round((a0 - 8) / 164 * 12)]
        p1 = ring[round((a1 - 8) / 164 * 12)]
        festoon(f"FestoonCross{i}", [p0, p1], bulb, per=46, sag=3.2, size=0.14)
    # paper lanterns under the eaves of every tent
    paper = [mat(f"TentLantern{k}", (1, 1, 1), emit=c, strength=12)
             for k, c in enumerate(((1.0, 0.25, 0.2), (1.0, 0.7, 0.25), (1.0, 0.4, 0.6)))]
    for k in range(18):
        a = math.radians(15 + k * 150 / 17)
        x = cx + (rx + 12) * math.cos(a)
        yy = cy + (ry + 12) * math.sin(a)
        for j, dx in enumerate((-2.2, 0.0, 2.2)):
            sphere(f"TentLantern{k}_{j}", 0.32, (x + dx, yy - 3.2, 2.9), paper[(k + j) % 3], scale=(1, 1, 1.3), subdiv=1)
    # the stage: an LED screen in the truss and beams from the top
    box("StageScreen", 18, 0.4, 6, (sx + 15, sy + 0.6, 2.6), led_screen_mat("StageScreen"))
    for k, (c, lean) in enumerate((((1.0, 0.4, 0.8), -0.35), ((0.5, 0.6, 1.0), -0.12), ((1.0, 0.8, 0.5), 0.12),
                                    ((0.6, 0.4, 1.0), 0.35))):
        ob = lathe(f"StageBeam{k}", [(0.2, 0), (2.6, 26)], (sx + 5 + k * 7, sy - 0.5, 11.2), beam_mat(f"Beam{k}", c), segments=12)
        ob.rotation_euler = (0.25, lean + math.pi, 0)
    # Ho Suranapha dressed for the night: a ring of lights round the viewing deck
    tower_ring = mat("TowerRing", (1, 1, 1), emit=(1.0, 0.82, 0.5), strength=25)
    for k in range(32):
        a = 2 * math.pi * k / 32
        sphere(f"TowerRingBulb{k}", 0.22, (26 + math.cos(a) * 6.5, 280 + math.sin(a) * 6.5, 2.4 + 56 + 7.2), tower_ring, subdiv=1)
    # people crouching or standing at the curb to float krathongs
    rnd = random.Random(61)
    flame = mat("HandFlame", (1, 1, 1), emit=(1.0, 0.6, 0.22), strength=30)
    for i in range(120):
        a = rnd.uniform(math.radians(-20), math.radians(200))
        rr = 1.0 + rnd.uniform(0.6, 2.2)
        x = cx + (rx + rr) * math.cos(a)
        yy = cy + (ry + rr) * math.sin(a)
        if yy < 18:
            continue
        crouch = rnd.random() < 0.55
        person(f"P61_{i}", x, yy, h=rnd.uniform(1.45, 1.8), crouch=crouch)
        if crouch:  # the krathong in their hands, its candle lit, about to go on the water
            inward = Vector((cx - x, cy - yy, 0)).normalized() * 0.5
            sphere(f"P61Krathong{i}", 0.08, (x + inward.x, yy + inward.y, 1.2), flame, scale=(1, 1, 1.6), subdiv=1)


VENUES = {"wat_arun": wat_arun, "lumphini": lumphini, "sukhothai": sukhothai,
          "chiang_mai": chiang_mai, "roi_et": roi_et, "sut": sut}


def build(venue):
    reset()
    _mats.clear()
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    camera()
    water()
    VENUES[venue]()
    sc.cycles.max_bounces = 4
    sc.cycles.glossy_bounces = 2
    sc.cycles.sample_clamp_indirect = 8


def render_water_mask(out, res):
    """Where the water is visible: white on black, for the web water layer to ripple only
    the pool and leave curbs and paving still."""
    sc = bpy.context.scene
    black = bpy.data.materials.new("MaskBlack")
    nt = black.node_tree
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (0, 0, 0, 1)
    nt.links.new(e.outputs[0], o.inputs["Surface"])
    white = black.copy()
    white.name = "MaskWhite"
    next(n for n in white.node_tree.nodes if n.type == "EMISSION").inputs["Color"].default_value = (1, 1, 1, 1)
    for ob in list(bpy.data.objects):
        if ob.type == "LIGHT":
            bpy.data.objects.remove(ob)
        elif ob.type == "MESH":
            ob.data.materials.clear()
            ob.data.materials.append(white if ob.name == "Water" else black)
    w = sc.world.node_tree
    w.nodes.clear()
    wo = w.nodes.new("ShaderNodeOutputWorld")
    bg = w.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (0, 0, 0, 1)
    w.links.new(bg.outputs[0], wo.inputs["Surface"])
    sc.cycles.samples = 4
    sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "BW"
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


SPRITE = None


def render_sprite(prefix, out, res):
    """Render only the objects named prefix* on a transparent background from the scene
    camera, for the web scene to move over the backdrop."""
    sc = bpy.context.scene
    for ob in bpy.data.objects:
        if ob.type == "MESH" and not ob.name.startswith(prefix):
            ob.hide_render = True
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.cycles.samples = 64
    sc.render.filepath = out
    try:
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Punchy"
    except TypeError:
        pass
    bpy.ops.render.render(write_still=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--venue", default="all")
    p.add_argument("--out", default=os.path.join(HERE, "out", "{venue}.png"))
    p.add_argument("--samples", type=int, default=96)
    p.add_argument("--res", type=int, nargs=2, default=[1920, 1200])
    p.add_argument("--save", action="store_true")
    p.add_argument("--sprite", default=None, help="render only this moving prop, e.g. cruise (wat_arun)")
    p.add_argument("--mask", action="store_true", help="also render {venue}-mask.png (where the water is)")
    a = p.parse_args(args)
    todo = list(VENUES) if a.venue == "all" else [a.venue]
    global SPRITE
    SPRITE = a.sprite
    if a.sprite:
        build(todo[0])
        render_sprite(a.sprite.capitalize(), a.out.format(venue=f"{todo[0]}-{a.sprite}"), a.res)
        print("@@JSON@@" + __import__("json").dumps({"sprite": a.sprite}))
        return
    results = []
    for v in todo:
        build(v)
        out = a.out.format(venue=v)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        res = render_batch.run(engine="CYCLES", preset="final", res=a.res, percent=100,
                               samples=a.samples, out=out.replace(".png", "####"), format="PNG",
                               view="AgX", look="AgX - Punchy")
        src = res["files"][0]
        if os.path.exists(out):
            os.remove(out)
        os.replace(src, out)
        if a.save:
            bpy.ops.wm.save_as_mainfile(filepath=out.replace(".png", ".blend"))
        if a.mask:
            render_water_mask(out.replace(".png", "-mask.png"), (480, 300))
        results.append({"venue": v, "file": out, "sec": res["sec_per_image"], "device": res.get("device"),
                        "objects": len(bpy.data.objects)})
    print("@@JSON@@" + __import__("json").dumps(results))


if __name__ == "__main__":
    main()
