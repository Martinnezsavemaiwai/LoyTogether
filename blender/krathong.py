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
from mathutils import Matrix, Vector

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


# --------------------------------------------------------------------------- realistic parts: helpers


def gradient_mat(name, base, tip, rough=0.45, sss=0.4, sheen=0.0, coat=0.0, axis="Y"):
    """Petal or leaf colour that runs from `base` at the root to `tip` at the far end, using the
    object's own generated coordinates (0 at the root, 1 at the tip along `axis`)."""
    if name in _mats:
        return _mats[name]
    m = principled(name, base, rough=rough, sss=sss, coat=coat)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Sheen Weight"].default_value = sheen
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Generated"], sep.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (*base, 1)
    mix.inputs[7].default_value = (*tip, 1)
    nt.links.new(sep.outputs[axis], mix.inputs[0])
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    # fine veins so petals do not read as plastic
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 18
    wave.inputs["Distortion"].default_value = 2.0
    nt.links.new(coord.outputs["Generated"], wave.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def petal2_bm(length, width, cup=0.5, curl=0.0, point=0.6, seg=10, cols=6, taper=1.15, ruffle=0.0):
    """A petal along +Y: rounded or pointed (`point`), cupped across, tip curling back by `curl`."""
    bm = bmesh.new()
    grid = []
    for i in range(seg + 1):
        u = i / seg
        # widest a little past the middle, narrowing to a point or a round tip
        # taper > 1 ends the petal in a fine thread; 1.0 closes it cleanly at the tip
        w = (math.sin(min(u * taper, 1) * math.pi) ** (0.6 + point * 0.8)) * width / 2 + 1e-4
        row = []
        for j in range(cols + 1):
            v = (j / cols) * 2 - 1
            x = v * w
            y = u * length * math.cos(curl * u)
            z = (v * v) * w * cup + u * u * length * 0.3 - math.sin(curl * u) * u * length * 0.5
            z += ruffle * w * u * math.sin(v * math.pi * 2.5 + u * 4.0)  # frilled edge
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for i in range(seg):
        for j in range(cols):
            bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.0006)
    return bm


def folded_leaf_bm(w, h, depth):
    """Banana leaf folded into a pointed petal (กลีบแหลม): two triangles meeting on a ridge that
    bulges outward (+Y), tip at the top. Flat faces with crisp folds, as folded leaf looks."""
    bm = bmesh.new()
    left = bm.verts.new((-w / 2, 0, 0))
    right = bm.verts.new((w / 2, 0, 0))
    tip = bm.verts.new((0, depth * 0.15, h))
    ridge = bm.verts.new((0, depth, h * 0.38))
    root = bm.verts.new((0, depth * 0.55, 0))
    for f in ((left, root, ridge), (root, right, ridge), (left, ridge, tip), (ridge, right, tip)):
        bm.faces.new(f)
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.0009)
    return bm


def rolled_leaf_bm(r0, h, turns=1.6, seg=28, rows=4, thick=0.0008, flare=0.0):
    """Banana leaf rolled into a rosebud (กลีบกุหลาบ): a spiral sheet, outer turns taller."""
    bm = bmesh.new()
    th_max = turns * math.tau
    grid = []
    for i in range(seg + 1):
        th = th_max * i / seg
        t = th / th_max
        # a tight heart that stands tallest, outer turns lower and opening out at the lip,
        # the rim cut on a slant like a rolled leaf tip, so the spiral reads from above
        r = r0 * (0.12 + 0.88 * t)
        top = h * (1.0 - 0.3 * t) * (1 + 0.12 * math.cos(th))
        col = []
        for j in range(rows + 1):
            v = j / rows
            rr = r * (1 + flare * t * v * v)
            col.append(bm.verts.new((rr * math.cos(th), rr * math.sin(th), top * v)))
        grid.append(col)
    for i in range(seg):
        for j in range(rows):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=thick)
    return bm


def tube_bm(points, radius, seg=8):
    """Sweep a circle along a closed path (for the bread braid)."""
    bm = bmesh.new()
    n = len(points)
    rings = []
    for i, p in enumerate(points):
        a, b = Vector(points[(i - 1) % n]), Vector(points[(i + 1) % n])
        t = (b - a).normalized()
        side = t.cross(Vector((0, 0, 1))).normalized()
        up = side.cross(t).normalized()
        rings.append([bm.verts.new(Vector(p) + (side * math.cos(k / seg * math.tau) + up * math.sin(k / seg * math.tau)) * radius)
                      for k in range(seg)])
    for i in range(n):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(seg):
            bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def leaf_shiny(name, color):
    """Banana leaf: waxy, a little glossy, veins running across the strip."""
    if name in _mats:
        return _mats[name]
    m = leaf_mat(name, color)
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = 0.32
    b.inputs["Coat Weight"].default_value = 0.25
    b.inputs["Coat Roughness"].default_value = 0.25
    return m


def trunk_skin_mat():
    """Outside of a banana stem: pale green with long vertical striations."""
    if "TrunkSkin2" in _mats:
        return _mats["TrunkSkin2"]
    m = principled("TrunkSkin2", (0.2, 0.32, 0.1), rough=0.45, sss=0.3)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 60
    wave.inputs["Distortion"].default_value = 0.6
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (0.16, 0.27, 0.08, 1)
    mix.inputs[7].default_value = (0.36, 0.48, 0.2, 1)
    nt.links.new(wave.outputs["Fac"], mix.inputs[0])
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.2
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def trunk_cut_mat():
    """Cut face of a banana stem: concentric leaf sheaths with spongy air cells between."""
    if "TrunkCut2" in _mats:
        return _mats["TrunkCut2"]
    m = principled("TrunkCut2", (0.82, 0.84, 0.64), rough=0.4, sss=0.45)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    rings = nt.nodes.new("ShaderNodeTexWave")
    rings.wave_type = "RINGS"
    rings.inputs["Scale"].default_value = 30
    rings.inputs["Distortion"].default_value = 1.2
    cells = nt.nodes.new("ShaderNodeTexVoronoi")
    cells.inputs["Scale"].default_value = 700
    nt.links.new(coord.outputs["Object"], rings.inputs["Vector"])
    nt.links.new(coord.outputs["Object"], cells.inputs["Vector"])
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[0].default_value = 1.0  # the sheath rings are geometry now; only the air cells here
    nt.links.new(cells.outputs["Distance"], mul.inputs[1])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (0.78, 0.8, 0.62, 1)
    mix.inputs[7].default_value = (0.96, 0.95, 0.84, 1)
    nt.links.new(mul.outputs[0], mix.inputs[0])
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.7
    nt.links.new(mul.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def crust_mat():
    """Egg-washed bread crust: golden brown, darker where it rose, a soft sheen."""
    if "Crust2" in _mats:
        return _mats["Crust2"]
    m = principled("Crust2", (0.55, 0.28, 0.08), rough=0.55, sss=0.25, coat=0.35)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 35
    nz.inputs["Detail"].default_value = 6
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (0.26, 0.1, 0.02, 1)
    mix.inputs[7].default_value = (0.58, 0.3, 0.08, 1)
    nt.links.new(nz.outputs["Fac"], mix.inputs[0])
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    fine = nt.nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 400
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    nt.links.new(fine.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def crust_top_mat():
    """Top of the loaf: deeper golden brown, glossy with egg wash, criss-cross score marks."""
    if "CrustTop" in _mats:
        return _mats["CrustTop"]
    m = principled("CrustTop", (0.45, 0.2, 0.05), rough=0.4, sss=0.2, coat=0.6)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Coat Roughness"].default_value = 0.2
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 28
    nz.inputs["Detail"].default_value = 6
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (0.22, 0.08, 0.015, 1)
    mix.inputs[7].default_value = (0.5, 0.24, 0.05, 1)
    nt.links.new(nz.outputs["Fac"], mix.inputs[0])
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    coord = nt.nodes.new("ShaderNodeTexCoord")
    score = []
    for angle in (0.6, -0.6):
        rotate = nt.nodes.new("ShaderNodeVectorRotate")
        rotate.rotation_type = "Z_AXIS"
        rotate.inputs["Angle"].default_value = angle
        nt.links.new(coord.outputs["Object"], rotate.inputs["Vector"])
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.inputs["Scale"].default_value = 22
        wave.inputs["Distortion"].default_value = 0.3
        nt.links.new(rotate.outputs["Vector"], wave.inputs["Vector"])
        cut = nt.nodes.new("ShaderNodeMapRange")
        cut.inputs["From Min"].default_value = 0.9
        cut.inputs["From Max"].default_value = 1.0
        nt.links.new(wave.outputs["Fac"], cut.inputs["Value"])
        score.append(cut)
    both = nt.nodes.new("ShaderNodeMath")
    both.operation = "MAXIMUM"
    nt.links.new(score[0].outputs["Result"], both.inputs[0])
    nt.links.new(score[1].outputs["Result"], both.inputs[1])
    fine = nt.nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 380
    height = nt.nodes.new("ShaderNodeMath")
    height.operation = "SUBTRACT"
    nt.links.new(fine.outputs["Fac"], height.inputs[0])
    height.inputs[1].default_value = 0.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.5
    nt.links.new(height.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    # score marks open onto the paler crumb
    shade = nt.nodes.new("ShaderNodeMix")
    shade.data_type = "RGBA"
    shade.inputs[7].default_value = (0.78, 0.55, 0.28, 1)
    shade.inputs[0].default_value = 0.0  # no score marks: a smooth glossy dome reads as bread
    nt.links.new(mix.outputs[2], shade.inputs[6])
    nt.links.new(shade.outputs[2], b.inputs["Base Color"])
    return m


PIN = None


def pin_mat():
    return principled("Pin", (0.9, 0.9, 0.92), rough=0.15, metallic=1.0)


# --------------------------------------------------------------------------- bases


def banana_plate(shape, coll, top=0.03):
    """A slice of banana stem wrapped in leaf, its top covered with fresh leaf. Plate top = `top`."""
    wrap = leaf_shiny("LeafDark2", (0.02, 0.12, 0.03))
    face = leaf_shiny("LeafLight2", (0.05, 0.22, 0.05))
    slab(f"Plate_{shape}", shape, R, 0.0, top - 0.002, wrap, coll)
    slab(f"Top_{shape}", shape, R * 0.94, top - 0.002, top, face, coll)


def base_banana(shape, coll, rose=False):
    banana_plate(shape, coll)
    dark = leaf_shiny("LeafDark2", (0.02, 0.12, 0.03))
    light = leaf_shiny("LeafLight2", (0.05, 0.22, 0.05))
    pin = pin_mat()
    if rose:
        # leaf rolled into rosebuds, two staggered rows round the rim
        rows = ((22, 0.95, 0.03, 0.022, -0.3), (22, 0.82, 0.026, 0.019, -0.16))
        for row, (n, scale, r0, h, tilt) in enumerate(rows):
            pts = shape_outline(shape, n * 2)
            for i in range(n):
                x, y = pts[(i * 2 + row) % (n * 2)]
                leaf = light if (i + row) % 2 else dark
                at, rot = (x * R * scale, y * R * scale, 0.018 + row * 0.0006), outward_rot(x, y, tilt)
                bud = rolled_leaf_bm(r0 * 0.62, h, turns=2.6, seg=72, rows=6, thick=0.0012, flare=0.5)
                # each bud's slanted tip faces its own way, as hand-rolled ones do
                bmesh.ops.rotate(bud, verts=bud.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(i * 1.3 + row, 3, "Z"))
                obj(f"Fold{row}_{i}_{shape}", bud, leaf, coll, loc=at, rot=rot)
        return
    # leaf folded into pointed petals (กลีบแหลม), three rows overlapping like scales,
    # each pinned at the root as a real one is
    rows = ((18, 0.93, 0.046, 0.046, -0.42), (18, 0.85, 0.04, 0.04, -0.3), (16, 0.75, 0.034, 0.034, -0.18))
    for row, (n, scale, w, h, tilt) in enumerate(rows):
        pts = shape_outline(shape, n * 2)
        for i in range(n):
            x, y = pts[(i * 2 + row % 2) % (n * 2)]
            px, py = x * R * scale, y * R * scale
            mat = (dark, light, dark)[row]
            fold = obj(f"Fold{row}_{i}_{shape}", folded_leaf_bm(w, h, depth=0.011), mat, coll,
                       loc=(px, py, 0.012 + row * 0.004), rot=outward_rot(x, y, tilt), smooth=False)
            if row < 2:
                # the pin goes through the lower fold, on the line from the root up the ridge
                bpy.context.view_layer.update()
                at = fold.matrix_world @ Vector((0, 0.011 * 0.73, h * 0.152))
                obj(f"FoldPin{row}_{i}_{shape}", uv_sphere(0.0013, 8, 6), pin, coll, loc=at)


def base_flower(shape, coll):
    """Lotus petals round a leaf-covered plate (กระทงกลีบบัว): white at the root, pink at the tip."""
    banana_plate(shape, coll, top=0.026)
    outer = gradient_mat("LotusPetalOuter", (0.95, 0.86, 0.86), (0.86, 0.25, 0.45), rough=0.38, sss=0.5)
    inner = gradient_mat("LotusPetalInner", (0.98, 0.93, 0.92), (0.92, 0.45, 0.6), rough=0.38, sss=0.5)
    for row, (n, scale, mat, tilt, ln) in enumerate(((20, 0.93, outer, 0.45, 0.06), (20, 0.8, inner, 0.9, 0.05))):
        pts = shape_outline(shape, n * 2)
        for i in range(n):
            x, y = pts[(i * 2 + row) % (n * 2)]
            bm = petal2_bm(ln, 0.038 if row == 0 else 0.032, cup=0.7, curl=0.15, point=0.85)
            obj(f"Petal{row}_{i}_{shape}", bm, mat, coll, loc=(x * R * scale * 0.86, y * R * scale * 0.86, 0.02),
                rot=outward_rot(x, y, tilt))


def base_bread(shape, coll):
    """Bread krathong: a puffed, egg-washed loaf with a braid round the rim. Top = 0.034."""
    crust = crust_mat()
    ob = slab(f"Bread_{shape}", shape, R * 0.97, 0.0, 0.03, crust, coll)
    ob.modifiers["Bevel"].width = 0.012
    ob.modifiers["Bevel"].segments = 6
    sub = ob.modifiers.new("Sub", "SUBSURF")
    sub.levels = sub.render_levels = 2
    disp = ob.modifiers.new("Puff", "DISPLACE")
    tex = bpy.data.textures.get("BreadPuff") or bpy.data.textures.new("BreadPuff", "CLOUDS")
    tex.noise_scale = 0.03
    disp.texture = tex
    disp.strength = 0.003
    top = slab(f"Crumb_{shape}", shape, R * 0.82, 0.026, 0.034, crust_top_mat(), coll)
    top.modifiers["Bevel"].width = 0.004
    top.modifiers["Bevel"].segments = 4
    # three strands twisted round the rim
    base = shape_outline(shape, 120)
    for strand in range(3):
        pts = []
        for i, (x, y) in enumerate(base):
            a = i / len(base) * math.tau * 14 + strand * math.tau / 3
            rr = R * 0.9 + math.cos(a) * 0.004
            pts.append((x * rr, y * rr, 0.031 + math.sin(a) * 0.004))
        obj(f"Braid{strand}_{shape}", tube_bm(pts, 0.0055, seg=10), crust, coll)


def trunk_cut_green():
    """The greener sheaths between the pale ones on a cut banana stem."""
    if "TrunkCutGreen" in _mats:
        return _mats["TrunkCutGreen"]
    base = trunk_cut_mat()
    m = base.copy()
    m.name = "TrunkCutGreen"
    mix = next(n for n in m.node_tree.nodes if n.type == "MIX")
    mix.inputs[6].default_value = (0.32, 0.46, 0.16, 1)
    mix.inputs[7].default_value = (0.5, 0.64, 0.28, 1)
    _mats["TrunkCutGreen"] = m
    return m


def base_trunk(shape, coll):
    """A thick slice of banana stem: striated green skin, and on the cut face the leaf sheaths
    as real nested rings, pale and green in turn, each standing a hair proud of the last so
    the rings read from the camera. Top = 0.056."""
    slab(f"Trunk_{shape}", shape, R, 0.0, 0.055, trunk_skin_mat(), coll)
    pale, green = trunk_cut_mat(), trunk_cut_green()
    scales = (0.985, 0.86, 0.72, 0.58, 0.44, 0.3, 0.16)
    for i, sc in enumerate(scales):
        ring = slab(f"TrunkSheath{i}_{shape}", shape, R * sc, 0.0545 - i * 0.0005, 0.0558 + i * 0.00025,
                    pale if i % 2 == 0 else green, coll)
        ring.modifiers["Bevel"].width = 0.0005
        ring.modifiers["Bevel"].segments = 2


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


def ring_of(name, coll, mat, x, y, z, rings, s, jitter=0.0, seed=0, taper=1.15):
    """Petals in rings round a centre. rings: (count, offset radius, tilt, length, width, cup, curl, point, dz)."""
    rnd = random.Random(seed)
    for k, (n, r, tilt, ln, wd, cup, curl, point, dz) in enumerate(rings):
        for i in range(n):
            a = i / n * math.tau + k * 0.37 + rnd.uniform(-jitter, jitter)
            size = rnd.uniform(0.92, 1.08)  # no two petals alike, and never sharing a plane
            bm = petal2_bm(ln * s * size, wd * s * size, cup=cup * rnd.uniform(0.9, 1.1), curl=curl, point=point, seg=8, cols=4, taper=taper)
            obj(f"{name}_{k}_{i}", bm, mat, coll,
                loc=(x + math.sin(a) * r * s, y + math.cos(a) * r * s,
                     z + (dz + (0.0007 if i % 2 else -0.0007) + rnd.uniform(-0.0004, 0.0004)) * s),
                rot=(tilt + (0.08 if i % 2 else -0.08) + rnd.uniform(-jitter, jitter),
                     rnd.uniform(-0.06, 0.06) + rnd.uniform(-jitter, jitter) * 0.5, -a))


def place(name, bm, mat, coll, m):
    """Link a part whose transform is the matrix `m` (no scale)."""
    loc, q, _ = m.decompose()
    return obj(name, bm, mat, coll, loc=loc, rot=q.to_euler("XYZ"))


def marigold_head(name, coll, x, y, z, s, rnd):
    """African marigold (ดาวเรือง) as threaded on a krathong: a full pompom of frilled florets
    springing from every side of the head (golden-angle spacing, so none line up), deep
    orange at the heart, brighter at the tips, cupped by a green calyx."""
    petal = gradient_mat("MarigoldPetal5", (0.85, 0.15, 0.0), (1.0, 0.4, 0.0), rough=0.5, sss=0.1, sheen=0.0)
    heart = principled("MarigoldHeart", (0.7, 0.12, 0.0), rough=0.6, sss=0.1)
    calyx = principled("MarigoldCalyx", (0.12, 0.3, 0.06), rough=0.45)
    core_r = 0.0066 * s
    centre = Vector((x, y, z + 0.0095 * s))
    obj(f"{name}_heart", uv_sphere(core_r, 14, 10), heart, coll, loc=centre)
    obj(f"{name}_calyx", lathe_bm([(0.0, 0), (0.0035 * s, 0.0008 * s), (0.0056 * s, 0.0038 * s), (0.005 * s, 0.0056 * s)], seg=16),
        calyx, coll, loc=(x, y, z + 0.0012 * s))
    n, golden = 120, math.pi * (3 - math.sqrt(5))
    max_polar = 2.0  # a little past the equator; the calyx hides the rest
    for i in range(n):
        polar = math.acos(1 - (1 - math.cos(max_polar)) * (i + 0.5) / n)
        az = i * golden + rnd.uniform(-0.15, 0.15)
        d = Vector((math.sin(polar) * math.cos(az), math.sin(polar) * math.sin(az), math.cos(polar)))
        size = rnd.uniform(0.85, 1.1) * (1.08 if polar > 1.0 else 0.92)  # bigger round the sides
        bm = petal2_bm(0.0088 * s * size, 0.0076 * s * size, cup=0.55, curl=0.45, point=0.1, seg=8, cols=4,
                       ruffle=rnd.uniform(0.25, 0.45), taper=1.0)
        # petal +Y points out along d; spin each about that axis so the frills never match
        frame = d.to_track_quat("Y", "Z").to_matrix().to_4x4() @ Matrix.Rotation(rnd.uniform(-0.6, 0.6), 4, "Y")
        place(f"{name}_f{i}", bm, petal, coll,
              Matrix.Translation(centre + d * core_r * rnd.uniform(0.7, 0.85)) @ frame)


def rose_head(name, coll, x, y, z, s, rnd):
    """A red rose in a single spiral: the heart wrapped tight into a cone, each petal after
    it set a golden angle round, lower, wider and more open, the outer ones rolling their
    edges back, on a green calyx."""
    petal = gradient_mat("Rose4", (0.24, 0.0, 0.015), (0.6, 0.005, 0.05), rough=0.45, sss=0.1, sheen=0.3)
    calyx = principled("RoseCalyx", (0.1, 0.26, 0.06), rough=0.45)
    obj(f"{name}_heart", lathe_bm([(0.0, 0), (0.0022 * s, 0.002 * s), (0.0026 * s, 0.009 * s), (0.0, 0.0145 * s)], seg=14),
        petal, coll, loc=(x, y, z + 0.0025 * s))
    obj(f"{name}_calyx", lathe_bm([(0.0, 0), (0.0035 * s, 0.0008 * s), (0.0052 * s, 0.0032 * s), (0.0046 * s, 0.0045 * s)], seg=14),
        calyx, coll, loc=(x, y, z + 0.0008 * s))
    n, golden = 17, math.pi * (3 - math.sqrt(5))
    for i in range(n):
        t = i / (n - 1)
        a = i * golden + rnd.uniform(-0.08, 0.08)
        r = (0.0012 + 0.0055 * t) * s
        bm = petal2_bm((0.0115 + 0.009 * t) * s, (0.011 + 0.012 * t) * s, cup=1.7 - 1.0 * t, curl=0.1 + 0.9 * t * t,
                       point=0.12, seg=8, cols=6, taper=1.0)
        obj(f"{name}_p{i}", bm, petal, coll,
            loc=(x + math.sin(a) * r, y + math.cos(a) * r, z + (0.0035 + 0.0018 * (1 - t) + rnd.uniform(-0.0003, 0.0003)) * s),
            rot=(1.42 - 1.35 * t + rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), -a))


def chrysanthemum_head(name, coll, x, y, z, s, rnd):
    """Yellow chrysanthemum (เบญจมาศ), the incurved kind: a dome of long quilled florets that
    curve up and in toward the centre, buttery at the tips, deeper gold within."""
    petal = gradient_mat("Chrysanthemum5", (0.9, 0.42, 0.0), (1.0, 0.74, 0.0), rough=0.45, sss=0.0)
    calyx = principled("ChrysCalyx", (0.12, 0.3, 0.06), rough=0.45)
    core_r = 0.0045 * s
    centre = Vector((x, y, z + 0.0085 * s))
    obj(f"{name}_heart", uv_sphere(core_r, 12, 8), principled("ChrysHeart", (0.85, 0.5, 0.0), rough=0.5), coll, loc=centre)
    obj(f"{name}_calyx", lathe_bm([(0.0, 0), (0.0026 * s, 0.0008 * s), (0.0038 * s, 0.0034 * s), (0.0034 * s, 0.0046 * s)], seg=16),
        calyx, coll, loc=(x, y, z + 0.0012 * s))
    n, golden = 120, math.pi * (3 - math.sqrt(5))
    max_polar = 2.2
    for i in range(n):
        polar = math.acos(1 - (1 - math.cos(max_polar)) * (i + 0.5) / n)
        az = i * golden + rnd.uniform(-0.12, 0.12)
        d = Vector((math.sin(polar) * math.cos(az), math.sin(polar) * math.sin(az), math.cos(polar)))
        size = rnd.uniform(0.9, 1.1) * (0.75 + 0.35 * min(polar, 1.6) / 1.6)  # longer round the sides
        bm = petal2_bm(0.0118 * s * size, 0.0032 * s * size, cup=1.6, curl=-0.55, point=0.2, seg=8, cols=4, taper=1.0)
        frame = d.to_track_quat("Y", "Z").to_matrix().to_4x4() @ Matrix.Rotation(rnd.uniform(-0.4, 0.4), 4, "Y")
        place(f"{name}_f{i}", bm, petal, coll, Matrix.Translation(centre + d * core_r * rnd.uniform(0.6, 0.8)) @ frame)


def orchid_flower(name, coll, frame, s, mats):
    """A Dendrobium (หวายมาดาม) facing +Z of `frame`: a slim dorsal sepal on top, two lateral
    sepals below, two broad round petals at the shoulders, a rolled darker lip at the bottom
    and the little white column in the throat. Each layer sits a hair above the last."""
    petal, lip, column = mats
    throat = principled("OrchidThroat", (0.95, 0.78, 0.18), rough=0.4)
    rz = lambda deg: Matrix.Rotation(math.radians(deg), 4, "Z")
    rx = lambda r: Matrix.Rotation(r, 4, "X")
    up = lambda dz: Matrix.Translation((0, 0, dz * s))
    for k, deg in enumerate((0, 128, -128)):  # sepals
        place(f"{name}_sepal{k}", petal2_bm(0.0145 * s, 0.0058 * s, cup=0.2, curl=0.35, point=0.75, seg=10, cols=4),
              petal, coll, frame @ up(0.0) @ rz(deg) @ rx(-0.22))
    for k, deg in enumerate((62, -62)):  # broad petals
        place(f"{name}_petal{k}", petal2_bm(0.0155 * s, 0.0125 * s, cup=0.15, curl=0.3, point=0.25, seg=10, cols=6),
              petal, coll, frame @ up(0.0007) @ rz(deg) @ rx(-0.18))
    # the lip rolls up into a tube round the column and flares at its frilled edge
    place(f"{name}_lip", petal2_bm(0.0135 * s, 0.0122 * s, cup=1.1, curl=0.5, point=0.15, seg=10, cols=6),
          lip, coll, frame @ up(0.0016) @ rz(180) @ rx(0.05))
    # yellow throat where the lip meets the column
    place(f"{name}_throat", scaled(uv_sphere(0.0016 * s, 10, 8), 1.1, 1.0, 0.45), throat, coll,
          frame @ up(0.0031) @ Matrix.Translation((0, -0.0022 * s, 0)))
    place(f"{name}_column", scaled(uv_sphere(0.0019 * s, 10, 8), 0.8, 1.2, 0.8), column, coll,
          frame @ up(0.0026) @ Matrix.Translation((0, 0.0012 * s, 0)))


def orchid_spray(name, coll, x, y, z, s, rnd):
    """Two orchid flowers and a bud on a short stem, tipped a little toward the viewer."""
    mats = (gradient_mat("OrchidPetal4", (0.86, 0.5, 0.86), (0.46, 0.02, 0.4), rough=0.32, sss=0.5, sheen=0.2),
            gradient_mat("OrchidLip5", (0.62, 0.08, 0.42), (0.24, 0.0, 0.17), rough=0.3, sss=0.4),
            principled("OrchidColumn", (0.98, 0.95, 0.85), rough=0.4))
    stem = principled("OrchidStem", (0.18, 0.32, 0.1), rough=0.45)
    spin = rnd.uniform(0, math.tau)
    base = Matrix.Translation((x, y, z)) @ Matrix.Rotation(spin, 4, "Z")
    toward_camera = lambda m: Matrix.Translation(m.to_translation()) @ Matrix.Rotation(0.62, 4, "X") @         Matrix.Rotation(rnd.uniform(-0.7, 0.7), 4, "Z")  # lip mostly toward the viewer
    main = base @ Matrix.Translation((0, 0, 0.007 * s))
    orchid_flower(f"{name}_a", coll, toward_camera(main), s, mats)
    second = base @ Matrix.Translation((0.0125 * s, 0.009 * s, 0.009 * s))
    orchid_flower(f"{name}_b", coll, toward_camera(second), s * 0.72, mats)
    # stem from the plate through the back of both flowers, ending in a closed bud
    pts = [base @ Vector(p) for p in ((-0.004 * s, 0.006 * s, 0.0005), (0.004 * s, 0.009 * s, 0.006 * s),
                                      (0.011 * s, 0.012 * s, 0.008 * s), (0.017 * s, 0.017 * s, 0.009 * s))]
    for k, (p0, p1) in enumerate(zip(pts, pts[1:])):
        d = p1 - p0
        rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        place(f"{name}_stem{k}", lathe_bm([(0.0009 * s, 0), (0.0009 * s, d.length)], seg=8), stem, coll,
              Matrix.Translation(p0) @ rot)
    tip = pts[-1]
    bud_dir = (pts[-1] - pts[-2]).to_track_quat("Z", "Y").to_matrix().to_4x4()
    place(f"{name}_bud", lathe_bm([(0.0, 0), (0.0024 * s, 0.002 * s), (0.0026 * s, 0.005 * s), (0.0, 0.0095 * s)], seg=12),
          gradient_mat("OrchidBud3", (0.42, 0.5, 0.22), (0.62, 0.1, 0.48), rough=0.35, sss=0.4, axis="Z"), coll,
          Matrix.Translation(tip) @ bud_dir)


def flower(kind, name, coll, loc, s=1.0):
    x, y, z = loc
    seed = hash(name) & 0xffff
    if kind == "marigold":
        marigold_head(name, coll, x, y, z, s, random.Random(seed))
    elif kind == "rose":
        rose_head(name, coll, x, y, z, s, random.Random(seed))
    elif kind == "orchid":
        orchid_spray(name, coll, x, y, z, s, random.Random(seed))
    elif kind == "lotus":
        # a folded lotus (บัวพับกลีบ) as it is offered: the outer petals creased and turned
        # out like a star, the inner ones still wrapped into a pointed bud, a green cup below
        petal = gradient_mat("LotusPetal3", (0.97, 0.9, 0.84), (0.86, 0.26, 0.48), rough=0.35, sss=0.55, sheen=0.25)
        inner = gradient_mat("LotusInner3", (0.95, 0.84, 0.8), (0.82, 0.22, 0.44), rough=0.32, sss=0.55, axis="Z")
        cup = principled("LotusCalyx", (0.14, 0.32, 0.1), rough=0.4)
        obj(f"{name}_cup", lathe_bm([(0.0, 0), (0.0045 * s, 0.0008 * s), (0.0062 * s, 0.003 * s), (0.0055 * s, 0.0048 * s)], seg=16),
            cup, coll, loc=(x, y, z))
        # the closed heart: a pointed core with wrapped petals round it
        obj(f"{name}_core", lathe_bm([(0.0, 0), (0.005 * s, 0.003 * s), (0.0068 * s, 0.012 * s), (0.0055 * s, 0.026 * s),
                                      (0.0024 * s, 0.036 * s), (0.0, 0.041 * s)], seg=18),
            inner, coll, loc=(x, y, z + 0.002 * s))
        ring_of(name + "_wrap", coll, petal, x, y, z, [
            (5, 0.005, 1.38, 0.037, 0.017, 1.4, 0.0, 0.7, 0.003),
        ], s, jitter=0.05, seed=seed, taper=1.0)
        ring_of(name, coll, petal, x, y, z, [
            (6, 0.006, 0.75, 0.024, 0.016, 0.8, 0.0, 0.85, 0.004),   # half open, standing out
            (8, 0.0072, 0.05, 0.02, 0.015, 0.55, 0.9, 0.85, 0.0025),  # folded back flat, tips turned under
        ], s, jitter=0.1, seed=seed + 1, taper=1.0)
    elif kind == "jasmine":
        # Arabian jasmine (มะลิลา) as it is set on a krathong: a little posy of three open
        # star flowers with a pale yellow eye, pointed buds held in green calyxes, on two leaves
        petal = gradient_mat("JasminePetal", (0.9, 0.92, 0.82), (1.0, 0.99, 0.96), rough=0.38, sss=0.7)
        bud = gradient_mat("JasmineBud2", (0.62, 0.74, 0.48), (0.99, 0.98, 0.94), rough=0.35, sss=0.6, axis="Z")
        eye = principled("JasmineEye", (0.92, 0.82, 0.42), rough=0.5)
        green = leaf_shiny("JasmineLeaf", (0.04, 0.2, 0.04))
        rnd = random.Random(seed)
        turn = rnd.uniform(0, math.tau)
        for k, da in enumerate((0.0, math.pi * 0.95)):  # two leaves under the posy
            obj(f"{name}_leaf{k}", petal2_bm(0.02 * s, 0.009 * s, cup=0.35, curl=0.2, point=0.8, seg=10, cols=4), green, coll,
                loc=(x, y, z + 0.0012 * s), rot=(-0.12, 0, turn + da))
        spots = [(0.0, 0.0045, 0.0062), (0.0062, -0.0032, 0.0048), (-0.0062, -0.0032, 0.0052)]
        for k, (dx, dy, dz) in enumerate(spots):
            c, sn = math.cos(turn), math.sin(turn)
            fx, fy = x + (dx * c - dy * sn) * s, y + (dx * sn + dy * c) * s
            ring_of(f"{name}_open{k}", coll, petal, fx, fy, z + dz * s,
                    [(8, 0.0008, 0.1, 0.0094, 0.0038, 0.35, -0.1, 0.35, 0.0)], s, jitter=0.1, seed=seed + k)
            obj(f"{name}_eye{k}", scaled(uv_sphere(0.0011 * s, 8, 6), 1, 1, 0.6), eye, coll,
                loc=(fx, fy, z + (dz + 0.0008) * s))
        for k in range(3):  # buds tucked between the flowers, leaning out
            a = turn + k / 3 * math.tau + math.pi / 3 + rnd.uniform(-0.2, 0.2)
            bx, by = x + math.sin(a) * 0.0058 * s, y + math.cos(a) * 0.0058 * s
            lean = (-rnd.uniform(0.45, 0.7), 0, -a)  # negative X tips +Z outward
            at = (bx, by, z + 0.003 * s)
            obj(f"{name}_bud{k}", lathe_bm([(0.0, 0), (0.0012 * s, 0.0008 * s), (0.0026 * s, 0.0045 * s),
                                            (0.0028 * s, 0.008 * s), (0.0018 * s, 0.0118 * s), (0.0, 0.0146 * s)], seg=14),
                bud, coll, loc=at, rot=lean)
            # green calyx cupping the foot of the bud
            obj(f"{name}_cal{k}", lathe_bm([(0.0, -0.0004 * s), (0.0016 * s, 0.0), (0.0027 * s, 0.0026 * s),
                                            (0.0026 * s, 0.0034 * s)], seg=14),
                green, coll, loc=at, rot=lean)
    elif kind == "chrysanthemum":
        chrysanthemum_head(name, coll, x, y, z, s, random.Random(seed))


def flower_ring(kind, shape, colls, top):
    """colls[(side, phase)] -> collection. Nine slots; slot i belongs to phase i % 3."""
    scale = 1.15 if kind == "lotus" else 1.4
    for i, (x, y) in enumerate(shape_outline(shape, 9)):
        coll = colls[("back" if y > 0 else "front", i % 3)]
        flower(kind, f"{kind}_{shape}_{i}", coll, (x * R * 0.6, y * R * 0.6, top), s=scale)


# --------------------------------------------------------------------------- candle, incense, decoration


def candle(colour, coll, top):
    body = principled(f"Wax_{colour}", CANDLES[colour], rough=0.35, sss=0.6)
    # the top has melted into a shallow pool with a raised lip, as a lit candle does
    bm = lathe_bm([(0.011, 0), (0.011, 0.1), (0.0108, 0.1035), (0.0094, 0.1032), (0.006, 0.1006), (0.0, 0.1)], seg=32)
    o = obj(f"Candle_{colour}", bm, body, coll, loc=(0, 0, top))
    for i in range(4):
        a = i * 1.7
        drip = scaled(uv_sphere(0.003, 10, 8), 1, 1, 3)
        obj(f"Drip_{colour}_{i}", drip, body, coll, loc=(math.sin(a) * 0.011, math.cos(a) * 0.011, top + 0.09 - i * 0.008))
    wick = principled("Wick", (0.05, 0.03, 0.02), rough=0.9)
    obj(f"Wick_{colour}", lathe_bm([(0.0008, 0), (0.0008, 0.009), (0, 0.01)], 6), wick, coll, loc=(0, 0, top + 0.0995))
    flame = principled("Flame", (1, 0.6, 0.2), emit=(1.0, 0.62, 0.22), strength=40)
    bm = lathe_bm([(0.0, 0), (0.0045, 0.004), (0.005, 0.01), (0.003, 0.018), (0.0, 0.03)], 16)
    obj(f"Flame_{colour}", bm, flame, coll, loc=(0, 0, top + 0.108))
    core = principled("FlameCore", (1, 1, 1), emit=(1.0, 0.95, 0.8), strength=80)
    obj(f"FlameCore_{colour}", lathe_bm([(0.0, 0), (0.002, 0.003), (0.0016, 0.008), (0.0, 0.013)], 12), core, coll,
        loc=(0, 0, top + 0.108))
    return o


def incense(coll, top):
    stick = principled("Incense", (0.35, 0.18, 0.08), rough=0.8)
    dyed = principled("IncenseRed", (0.6, 0.03, 0.03), rough=0.6)
    ember = principled("Ember", (1, 0.3, 0.1), emit=(1.0, 0.25, 0.05), strength=30)
    for i, (dx, lean) in enumerate(((0.026, 0.12), (0.032, 0.2), (0.038, 0.28))):
        st = obj(f"Incense{i}", lathe_bm([(0.0012, 0.05), (0.0012, 0.13), (0.0, 0.131)], 6), stick, coll,
                 loc=(dx, 0.01, top - 0.01), rot=(0, lean, 0))
        obj(f"IncenseBase{i}", lathe_bm([(0.00135, 0), (0.00135, 0.05), (0.0, 0.0505)], 6), dyed, coll,
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
    """A few Thai coins laid on the plate (older krathongs): bimetal 10 baht and silver 1 and 5 baht."""
    gold = principled("CoinGold", (0.85, 0.62, 0.25), rough=0.25, metallic=1.0)
    silver = principled("CoinSilver", (0.82, 0.82, 0.85), rough=0.22, metallic=1.0)
    rnd = random.Random(10)
    spots = [(-0.06, -0.05), (-0.03, -0.072), (0.005, -0.08), (0.04, -0.07), (0.065, -0.045), (-0.075, -0.02)]
    for i, (x, y) in enumerate(spots):
        r = 0.0130 if i % 3 == 0 else 0.0105
        coin = lathe_bm([(r, 0), (r, 0.0022), (r * 0.9, 0.0026), (0, 0.0026)], seg=32)
        mat = silver
        obj(f"Coin_{shape}_{i}", coin, mat, coll, loc=(x, y, top + 0.0005),
            rot=(rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), 0))
        if i % 3 == 0:  # gold centre of the bimetal 10 baht
            obj(f"CoinCentre_{shape}_{i}", lathe_bm([(r * 0.62, 0), (r * 0.62, 0.0028), (0, 0.0028)], seg=32),
                gold, coll, loc=(x, y, top + 0.0007))


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
