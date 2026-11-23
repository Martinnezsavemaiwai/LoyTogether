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


def swan_boat(name, x, y, s=1.0, heading=0.0):
    """Lumphini's pedal swan boats."""
    white = mat("Swan", (0.75, 0.74, 0.7), rough=0.5, emit=(1.0, 0.95, 0.85), strength=0.15)
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


def moon(x_deg, y_deg, size_deg=4.2, strength=7.0):
    """A visible full moon placed by its angle from the view centre, plus soft moonlight."""
    dist = 5000
    ax, ay = math.radians(x_deg), math.radians(y_deg)
    loc = (math.tan(ax) * dist, dist, CAM_H + math.tan(ay) * dist)
    r = math.tan(math.radians(size_deg / 2)) * dist
    m = mat("Moon", (1, 1, 1), emit=(1.0, 0.95, 0.82), strength=strength)
    sphere("Moon", r, loc, m, subdiv=3)
    ld = bpy.data.lights.new("Moonlight", "SUN")
    ld.energy = 0.12
    ld.color = (0.72, 0.8, 1.0)
    ld.angle = math.radians(0.6)
    ob = bpy.data.objects.new("Moonlight", ld)
    ob.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    link(ob)


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


# --------------------------------------------------------------------------- venues


def wat_arun():
    world(top=(0.002, 0.003, 0.012), horizon=(0.02, 0.02, 0.05), glow=(1.0, 0.5, 0.25), glow_amt=0.12)
    moon(14, 13, strength=6)
    y = D
    ground_strip(y + 20)
    stone = lit_stone("Prang", warm=(1.0, 0.55, 0.16), strength=3.0, pattern="mosaic")
    # Proportions after the night photo: a slim central prang about 4.5x taller than its base,
    # four satellite prangs at about 45% height standing close around it.
    stepped_base("Terrace", 0, y + 60, 62, 12, 4, stone)
    prang("PrangMain", 0, y + 60, 84, 10.5, stone, tiers=10, segments=12)
    for i, (dx, dy) in enumerate(((-24, -14), (24, -14), (-24, 16), (24, 16))):
        stepped_base(f"SubBase{i}", dx, y + 60 + dy, 12, 4, 2, stone)
        prang(f"PrangSub{i}", dx, y + 60 + dy, 38, 4.2, stone, tiers=8, segments=10)
    for i, dx in enumerate((-50, 50)):
        prang(f"Mondop{i}", dx, y + 40, 18, 2.6, stone, tiers=5, segments=8)
    roof = mat("Roof", (0.06, 0.035, 0.02), emit=(1.0, 0.5, 0.2), strength=0.25)
    wall = lit_stone("RiverHall", warm=(1.0, 0.65, 0.35), strength=1.2)
    for i, dx in enumerate((-85, 80)):
        box(f"Hall{i}", 18, 12, 5, (dx, y + 25, 0), wall)
        prism_roof(f"HallRoof{i}", 20, 14, 7, (dx, y + 25, 5), roof)
    trees = mat("Trees", (0.01, 0.015, 0.012), rough=0.9)
    tree_cluster(1, -260, -100, y + 30, 18, trees, h=(8, 16))
    tree_cluster(2, 100, 260, y + 30, 18, trees, h=(8, 16))
    lamp_row(3, -260, -110, y + 2, 2.5, 12, (0.7, 0.85, 1.0), strength=40, size=0.5)
    lamp_row(31, 110, 260, y + 2, 2.5, 12, (0.7, 0.85, 1.0), strength=40, size=0.5)
    point("PrangGlow", (0, y + 20, 10), 50000, (1.0, 0.7, 0.4), radius=20)
    # Chao Phraya traffic: a dinner cruise and a ferry
    boat("Cruise", -60, 130, 32, lit=(1.0, 0.8, 0.5), heading=0.0)
    boat("Ferry", 75, 190, 20, lit=(0.8, 0.9, 1.0), heading=0.05)
    bamboo_pier("Tha", 70, y + 2, 12, width=5)

def lumphini():
    world(top=(0.005, 0.006, 0.02), horizon=(0.05, 0.035, 0.07), glow=(1.0, 0.45, 0.3), glow_amt=0.35)
    moon(12, 13, strength=5)
    y = D
    ground_strip(y + 10)
    rnd = random.Random(7)
    x = -460
    i = 0
    while x < 460:
        w = rnd.uniform(18, 36)
        h = rnd.uniform(40, 120) if abs(x) < 160 else rnd.uniform(25, 70)
        depth = rnd.uniform(18, 30)
        b = box(f"Tower{i}", w, depth, h, (x + w / 2, y + 260 + rnd.uniform(0, 120), 0),
                windows_mat(f"Win{i}", density=rnd.uniform(0.35, 0.6)))
        if h > 120:
            sphere(f"Beacon{i}", 0.8, (b.location.x, b.location.y, h + 1),
                   mat("Beacon", (1, 0, 0), emit=(1, 0.1, 0.1), strength=40))
        x += w + rnd.uniform(2, 10)
        i += 1
    hotel = windows_mat("Hotel", lit=(0.85, 0.6, 1.0), density=0.5)
    box("SpireTower", 30, 22, 85, (-150, y + 230, 0), hotel)
    lathe("GoldSpire", [(9, 0), (8, 4), (3, 10), (1.2, 22), (0.2, 40), (0, 42)], (-150, y + 230, 85),
          mat("Gold", (0.8, 0.55, 0.2), emit=(1.0, 0.75, 0.35), strength=4.0), segments=8)
    trees = mat("Trees", (0.008, 0.014, 0.01), rough=0.9)
    tree_cluster(4, -300, 300, y + 25, 60, trees, h=(10, 20), spread=12)
    lamp_row(5, -120, 120, y + 3, 3.5, 24, (1.0, 0.75, 0.4), strength=30, size=0.4)
    point("Pavilion", (0, y + 8, 6), 7500, (1.0, 0.7, 0.4), radius=4)
    for i, (sx, sy, hd) in enumerate(((-70, y - 6, 0.4), (-62, y - 9, -0.2), (-54, y - 5, 0.1), (48, y - 8, 2.9), (57, y - 6, 3.3))):
        swan_boat(f"SwanBoat{i}", sx, sy, s=1.2, heading=hd)


def sukhothai():
    world(top=(0.003, 0.004, 0.016), horizon=(0.035, 0.03, 0.07), glow=(1.0, 0.5, 0.2), glow_amt=0.18)
    moon(16, 13, strength=6.5, size_deg=5)
    y = D
    ground_strip(y + 10)
    stone = lit_stone("Laterite", warm=(1.0, 0.55, 0.25), strength=2.4, pattern="laterite")
    brick = lit_stone("Brick", warm=(1.0, 0.42, 0.2), strength=1.6, pattern="brick")
    stepped_base("Platform", 0, y + 25, 140, 3, 1, brick)
    # chedi: square stepped base, square body with a niche, lotus-bud top and spire
    stepped_base("MahathatBase", 0, y + 34, 30, 16, 3, brick)
    box("MahathatBody", 13, 13, 14, (0, y + 34, 16), stone)
    box("Niche", 5, 1, 8, (0, y + 27.4, 18), mat("NicheDark", (0.02, 0.012, 0.008)))
    for k, w in enumerate((12, 10, 8)):
        box(f"MahathatNeck{k}", w, w, 2, (0, y + 34, 30 + k * 2), stone)
    r = 6.2
    lathe("MahathatBud", [(r * 0.8, 0), (r * 1.1, 4), (r * 1.0, 11), (r * 0.65, 17), (r * 0.25, 21),
                          (r * 0.1, 22), (r * 0.08, 34), (0, 37)], (0, y + 34, 36), stone, segments=8)
    lotus_bud_chedi("ChediL", -36, y + 40, 26, 11, stone)
    lotus_bud_chedi("ChediR", 36, y + 40, 26, 11, stone)
    # banded laterite pillars of the old vihara in front
    band = mat("PillarBand", (0.6, 0.55, 0.5), emit=(1.0, 0.75, 0.5), strength=0.6)
    for i, dx in enumerate((-30, -22, -14, 14, 22, 30)):
        for k in range(4):
            box(f"Pillar{i}_{k}", 2.2, 2.2, 3.0, (dx, y + 18, 3 + k * 3.3), stone)
            box(f"PillarBand{i}_{k}", 2.3, 2.3, 0.3, (dx, y + 18, 6 + k * 3.3), band)
    dark = mat("Palm", (0.006, 0.008, 0.01), rough=0.9)
    for i, (dx, h) in enumerate(((-110, 22), (-95, 18), (100, 24), (118, 19), (-170, 20), (165, 21))):
        sugar_palm(f"Palm{i}", dx, y + 15, h, dark)
    tree_cluster(6, -300, -130, y + 40, 16, dark, h=(8, 14))
    tree_cluster(7, 130, 300, y + 40, 16, dark, h=(8, 14))
    lamp_row(8, -70, 70, y + 4, 1.2, 60, (1.0, 0.68, 0.3), strength=40, size=0.3)
    point("ChediGlow", (0, y + 12, 10), 40000, (1.0, 0.65, 0.35), radius=15)

def chiang_mai():
    world(top=(0.004, 0.007, 0.02), horizon=(0.03, 0.032, 0.07), glow=(1.0, 0.55, 0.25), glow_amt=0.2)
    moon(-14, 13, strength=6)
    y = D
    ground_strip(y + 10)
    # Doi Suthep behind the city
    mountain = mat("Mountain", (0.012, 0.016, 0.03), rough=1)
    bm2 = bmesh.new()
    pts = []
    for i in range(61):
        u = -1 + 2 * i / 60
        h = (math.cos(u * 2.4 - 0.3) * 0.55 + 0.45) * 230 + 20 * math.sin(u * 9)
        pts.append((u * 2400, max(h, 5)))
    verts_top = [bm2.verts.new((x, 0, z)) for x, z in pts]
    verts_bot = [bm2.verts.new((x, 0, 0)) for x, _ in pts]
    for i in range(60):
        bm2.faces.new((verts_bot[i], verts_bot[i + 1], verts_top[i + 1], verts_top[i]))
    mesh_ob("DoiSuthep", bm2, mountain, loc=(0, 2400, 0))
    sphere("TempleOnHill", 3, (300, 2390, 170), mat("HillTemple", (1, 1, 1), emit=(1, 0.8, 0.4), strength=30))
    roof = mat("Roof", (0.02, 0.016, 0.014), rough=0.7)
    wall = lit_stone("WatWall", warm=(1.0, 0.7, 0.4), strength=1.4)
    for i, (dx, s) in enumerate(((-40, 1.0), (40, 0.8))):
        box(f"Hall{i}", 30 * s, 40 * s, 9 * s, (dx, y + 50, 0), wall)
        prism_roof(f"Roof{i}a", 34 * s, 44 * s, 12 * s, (dx, y + 50, 9 * s), roof)
        prism_roof(f"Roof{i}b", 24 * s, 34 * s, 11 * s, (dx, y + 50, 15 * s), roof)
        prism_roof(f"Roof{i}c", 14 * s, 26 * s, 9 * s, (dx, y + 50, 21 * s), roof)
    chedi_bell("ChediCM", 0, y + 40, 52, 11, lit_stone("ChediGold", warm=(1.0, 0.78, 0.4), strength=3.0))
    trees = mat("Trees", (0.008, 0.012, 0.01), rough=0.9)
    tree_cluster(12, -320, -80, y + 30, 30, trees, h=(8, 16))
    tree_cluster(13, 80, 320, y + 30, 30, trees, h=(8, 16))
    # strings of Yi Peng lanterns along the bank
    colors = [(1.0, 0.7, 0.3), (1.0, 0.3, 0.3), (1.0, 0.85, 0.6), (1.0, 0.45, 0.6)]
    for row in range(2):
        for i in range(34):
            u = i / 33
            x = -160 + u * 320
            z = 9 + row * 2.2 - math.sin(u * math.pi) * 3
            c = colors[(i + row) % 4]
            sphere(f"Yipeng{row}_{i}", 0.45, (x, y + 4 + row, z),
                   mat(f"Yp{(i + row) % 4}", (1, 1, 1), emit=c, strength=18), scale=(1, 1, 1.3), subdiv=1)
    point("BankGlow", (0, y + 6, 8), 15000, (1.0, 0.6, 0.35), radius=10)
    bamboo_pier("RaftPier", -40, y + 1, 26, width=4)
    crowd(41, -44, -36, y - 14, 10, spread=8, crouch_share=0.6)
    crowd(42, -150, 150, y + 3, 60, spread=2)


def roi_et():
    world(top=(0.003, 0.005, 0.02), horizon=(0.035, 0.035, 0.08), glow=(1.0, 0.6, 0.3), glow_amt=0.18)
    moon(-16, 13, strength=6)
    y = D
    ground_strip(y + 10)
    tx, ty = 10, y + 40
    # Ho Wot 101: a cylinder of glass floors ringed by gold bands, crowned by a wot (bundle of pipes)
    glass = windows_mat("HoWotGlass", lit=(1.0, 0.85, 0.6), density=0.75, scale=0.9)
    gold = mat("HoWotGold", (0.8, 0.55, 0.2), emit=(1.0, 0.72, 0.35), strength=2.2, metallic=0.6)
    lathe("HoWotPlinth", [(12, 0), (11, 4), (7, 6), (7, 8)], (tx, ty, 0), gold, segments=24)
    floors = 14
    for k in range(floors):
        z = 8 + k * 4.4
        lathe(f"HoWotFloor{k}", [(6, 0), (6, 3.6)], (tx, ty, z), glass, segments=24)
        lathe(f"HoWotBand{k}", [(6.6, 0), (6.6, 0.8)], (tx, ty, z + 3.6), gold, segments=24)
    top = 8 + floors * 4.4
    lathe("HoWotDeck", [(8, 0), (8, 1.5), (5, 3)], (tx, ty, top), gold, segments=24)
    for i in range(24):
        a = 2 * math.pi * i / 24
        ring = 1.4 if i % 2 else 3.4
        ln = 14 + (6 if i % 2 else 0) + 2 * math.sin(i * 1.3)
        ob = lathe(f"Pipe{i}", [(0.8, 0), (0.7, ln), (0, ln + 1.2)],
                   (tx + math.cos(a) * ring, ty + math.sin(a) * ring, top + 3), gold, segments=8)
        ob.rotation_euler = (-math.sin(a) * 0.08, math.cos(a) * 0.08, 0)
    point("TowerTop", (tx, ty - 10, top + 10), 2000, (1.0, 0.85, 0.6), radius=2)
    trees = mat("Trees", (0.008, 0.013, 0.012), rough=0.9)
    sphere("Island", 30, (-80, y + 20, -6), mat("IslandGround", (0.01, 0.012, 0.015)), scale=(1.6, 0.6, 0.3))
    tree_cluster(14, -120, -40, y + 22, 12, trees, h=(7, 13), spread=4)
    roof = mat("SalaRoof", (0.4, 0.12, 0.05), emit=(1.0, 0.45, 0.2), strength=0.6)
    box("Sala", 10, 8, 4, (-80, y + 16, 2.5), lit_stone("SalaLit", strength=1.6))
    prism_roof("SalaRoof", 12, 10, 5, (-80, y + 16, 6.5), roof)
    tree_cluster(15, -320, -150, y + 30, 26, trees, h=(8, 16))
    tree_cluster(16, 70, 320, y + 30, 26, trees, h=(8, 16))
    lamp_row(17, -260, 260, y + 1.5, 1.0, 110, (1.0, 0.72, 0.35), strength=45, size=0.28)
    point("ShoreGlow", (0, y + 5, 4), 12500, (1.0, 0.65, 0.35), radius=10)
    crowd(51, -200, 200, y + 3, 70, spread=2)

def sut():
    """SUT Technopolis fountain plaza: a long rectangular pool with an LED-lit stone curb,
    market tents and a steel truss canopy behind, after the event photos on sut.ac.th."""
    world(top=(0.003, 0.006, 0.02), horizon=(0.03, 0.04, 0.07), glow=(1.0, 0.7, 0.4), glow_amt=0.15, stars=1.2)
    moon(-12, 13, strength=6.5)
    pool_w, pool_len = 46.0, 150.0
    stone = mat("Curb", (0.25, 0.22, 0.18), rough=0.7)
    plaza = mat("Plaza", (0.03, 0.028, 0.026), rough=0.8)
    led = mat("LedStrip", (1, 1, 1), emit=(1.0, 0.8, 0.45), strength=25)
    for side in (-1, 1):
        box(f"Plaza{side}", 400, pool_len + 400, 0.6, (side * (pool_w / 2 + 200), pool_len / 2 - 10, 0), plaza)
        box(f"Curb{side}", 1.2, pool_len, 0.9, (side * (pool_w / 2 + 0.6), pool_len / 2 - 10, 0), stone)
        box(f"Led{side}", 0.12, pool_len, 0.1, (side * (pool_w / 2 + 0.05), pool_len / 2 - 10, 0.45), led)
    box("PlazaFar", pool_w + 4, 300, 0.6, (0, pool_len - 10 + 150, 0), plaza)
    box("CurbFar", pool_w + 2.4, 1.2, 0.9, (0, pool_len - 10 + 0.6, 0), stone)
    box("LedFar", pool_w, 0.12, 0.1, (0, pool_len - 10 - 0.05, 0.45), led)
    rnd = random.Random(31)
    colors = [(0.5, 0.15, 0.1), (0.15, 0.15, 0.45), (0.15, 0.35, 0.15), (0.45, 0.3, 0.1)]
    for side in (-1, 1):
        for k in range(9):
            yy = 15 + k * 14
            c = colors[rnd.randrange(4)]
            canvas = mat(f"Tent{side}{k}", c, emit=tuple(v * 1.6 for v in c), strength=0.8)
            x = side * (pool_w / 2 + 9)
            for px in (-3.5, 3.5):
                for py in (-3.5, 3.5):
                    box(f"TentPole{side}{k}{px}{py}", 0.15, 0.15, 3, (x + px, yy + py, 0), stone)
            lathe(f"TentRoof{side}{k}", [(5.2, 0), (0.1, 2.4), (0, 2.5)], (x, yy, 3), canvas, segments=4)
            point(f"TentLight{side}{k}", (x, yy, 2.6), 300, (1.0, 0.82, 0.55), radius=1.5)
    steel = mat("Truss", (0.5, 0.5, 0.52), rough=0.4, metallic=0.8, emit=(0.8, 0.85, 1.0), strength=0.15)
    cy = pool_len + 30
    for i in range(13):
        x = -60 + i * 10
        for flip in (1, -1):
            ob = box(f"TrussDiag{i}{flip}", 0.4, 0.4, math.hypot(10, 12), (x, cy, 10), steel)
            ob.rotation_euler = (0, math.atan2(10, 12) * flip, 0)
        box(f"TrussPost{i}", 0.6, 0.6, 22, (x, cy, 0), steel)
    box("TrussTop", 124, 0.6, 0.6, (0, cy, 22), steel)
    box("TrussMid", 124, 0.6, 0.6, (0, cy, 10), steel)
    rnd = random.Random(22)
    blocks = [(-90, 40, 22), (-40, 55, 30), (40, 50, 26), (95, 45, 20)]
    for i, (bx_, w, h) in enumerate(blocks):
        box(f"Faculty{i}", w, 24, h, (bx_, cy + 70 + rnd.uniform(0, 30), 0),
            windows_mat(f"SutWin{i}", lit=(0.85, 0.92, 1.0), density=0.35, scale=0.5))
    trees = mat("Trees", (0.007, 0.012, 0.012), rough=0.9)
    tree_cluster(22, -200, 200, cy + 40, 40, trees, h=(7, 14), spread=14)
    point("PlazaFill", (0, 60, 18), 30000, (1.0, 0.8, 0.55), radius=10)
    # people crouching at the curb to float krathongs, like the event photos
    for side in (-1, 1):
        crowd(61 + side, side * (pool_w / 2 + 1.6), side * (pool_w / 2 + 2.6), 95, 26, spread=50, crouch_share=0.6)

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


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--venue", default="all")
    p.add_argument("--out", default=os.path.join(HERE, "out", "{venue}.png"))
    p.add_argument("--samples", type=int, default=96)
    p.add_argument("--res", type=int, nargs=2, default=[1920, 1200])
    p.add_argument("--save", action="store_true")
    a = p.parse_args(args)
    todo = list(VENUES) if a.venue == "all" else [a.venue]
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
        results.append({"venue": v, "file": out, "sec": res["sec_per_image"], "device": res.get("device"),
                        "objects": len(bpy.data.objects)})
    print("@@JSON@@" + __import__("json").dumps(results))


if __name__ == "__main__":
    main()
