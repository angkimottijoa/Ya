"""
LOD2 semantic surfaces out of PLATEAU CityGML.

`citygml.py` reads a building as a footprint plus a height, which is all an
LOD1 extrusion needs. This module reads the actual geometry instead: every
bounded surface of every feature, tagged with what it is (roof, wall,
ground, road, ...) and which texture image is pasted onto it.

That tagging is the point. Project PLATEAU's own converter throws it away
and emits one block type -- "テクスチャデータの有無にかかわらず、全てのブロックが
石（Stone）として生成されます" -- so a converted city is a uniform grey mass.
Keeping the surface class costs nothing at parse time and is what lets
roofs, walls and roads come out as different blocks.

Surfaces are returned as planar rings rather than triangles. Voxelizing a
planar polygon by rasterizing it in its own plane (see `meshvoxel.py`)
handles holes with the code that already draws footprints, and sidesteps
triangulation entirely.
"""
from dataclasses import dataclass, field
from pathlib import Path
from xml.etree import ElementTree

from .citygml import _epsg_from_srs_name, _local, _LAT_LON_EPSG

# Feature packages PLATEAU ships, keyed by the token in a filename such as
# `53394525_bldg_6697_2_op.gml`. The manual notes that everything past bldg
# is only lightly tested upstream, and that tran/frn/veg carry no elevation
# of their own, so they sit at z=0 unless the caller drapes them.
FEATURE_TYPES = ("bldg", "tran", "brid", "frn", "veg", "dem")

# Semantic surface classes worth telling apart, in CityGML's own names.
ROOF = "roof"
WALL = "wall"
GROUND = "ground"
CLOSURE = "closure"
OPENING = "opening"
OTHER = "other"

_SURFACE_CLASS = {
    "RoofSurface": ROOF,
    "WallSurface": WALL,
    "GroundSurface": GROUND,
    "OuterFloorSurface": GROUND,
    "OuterCeilingSurface": ROOF,
    "ClosureSurface": CLOSURE,
    "Window": OPENING,
    "Door": OPENING,
    "TrafficArea": GROUND,
    "AuxiliaryTrafficArea": GROUND,
}

# Top-level feature elements, by package. Anything not listed still gets
# picked up by the generic sweep below; this list only drives which
# elements are treated as "one object" for LOD fallback purposes.
_FEATURE_ELEMENTS = {
    "bldg": ("Building", "BuildingPart"),
    "tran": ("Road", "Track", "Square", "Railway"),
    "brid": ("Bridge", "BridgePart"),
    "frn": ("CityFurniture",),
    "veg": ("PlantCover", "SolitaryVegetationObject"),
    "dem": ("ReliefFeature",),
}


@dataclass
class TextureRef:
    """Where a surface's pixels come from, once appearances are resolved."""

    image: str = ""            # path relative to the CityGML file
    coordinates: list = field(default_factory=list)  # per-ring [u, v, u, v...]


@dataclass
class Surface:
    """One planar polygon: an exterior ring and any holes, in lat/lon/alt."""

    rings: list = field(default_factory=list)
    feature: str = "bldg"
    surface_class: str = OTHER
    lod: int = 2
    polygon_id: str = ""
    texture: TextureRef = None
    source_path: object = None

    @property
    def exterior(self):
        return self.rings[0] if self.rings else None


def feature_type_from_name(path):
    """`53394525_bldg_6697_2_op.gml` -> `bldg`.

    Upstream does `split("_")[1]` and raises a KeyError on anything else;
    a directory of mixed PLATEAU packages should not be able to kill a run,
    so an unrecognised name comes back as None for the caller to skip.
    """
    parts = Path(path).stem.split("_")
    for part in parts[1:]:
        if part in FEATURE_TYPES:
            return part
    return None


def _ring_coordinates(ring_element):
    from .citygml import _ring_points
    return _ring_points(ring_element)


def _polygon_rings(polygon):
    """(exterior, [holes...]) for one `gml:Polygon`, or None."""
    exterior, holes = None, []
    for boundary in polygon:
        role = _local(boundary.tag)
        if role not in ("exterior", "interior"):
            continue
        for ring in boundary.iter():
            if _local(ring.tag) != "LinearRing":
                continue
            points = _ring_coordinates(ring)
            if len(points) < 3:
                continue
            if role == "exterior":
                exterior = points
            else:
                holes.append(points)
    if exterior is None:
        return None
    return [exterior] + holes


def _classify(element_stack):
    """Nearest enclosing semantic surface name, walking outwards."""
    for name in reversed(element_stack):
        if name in _SURFACE_CLASS:
            return _SURFACE_CLASS[name]
    return OTHER


def _lod_of(element_stack):
    for name in reversed(element_stack):
        if name.startswith("lod") and len(name) > 3 and name[3].isdigit():
            return int(name[3])
    return 0


def _walk_polygons(root, feature, wanted_lod, stack=None):
    """Yield `Surface`s under `root` whose LOD matches `wanted_lod`."""
    stack = stack or []
    name = _local(root.tag)
    stack.append(name)

    if name == "Polygon":
        rings = _polygon_rings(root)
        if rings:
            lod = _lod_of(stack)
            if lod == wanted_lod or wanted_lod == 0:
                polygon_id = ""
                for key, value in root.attrib.items():
                    if _local(key) == "id":
                        polygon_id = value
                        break
                yield Surface(rings=rings, feature=feature,
                              surface_class=_classify(stack), lod=lod or wanted_lod,
                              polygon_id=polygon_id)
        stack.pop()
        return

    for child in root:
        yield from _walk_polygons(child, feature, wanted_lod, stack)
    stack.pop()


def surfaces_of_feature(element, feature):
    """LOD2 surfaces of one feature, falling back to LOD1.

    The manual is explicit that LOD2 is preferred and LOD1 used only where
    LOD2 is absent, and that LOD3+ is not converted -- so the fallback is
    per feature, not per file: a tile usually holds both kinds.
    """
    for lod in (2, 1):
        found = list(_walk_polygons(element, feature, lod))
        if found:
            return found
    return []


def read_surfaces(paths, progress=None, feature_filter=None, with_source=False):
    """Stream `Surface`s from CityGML files or directories."""
    from .citygml import _expand_paths

    for path in _expand_paths(paths):
        feature = feature_type_from_name(path)
        if feature is None:
            if progress:
                progress(f"skipping {path.name}: not a recognised PLATEAU package")
            continue
        if feature_filter and feature not in feature_filter:
            continue
        if feature == "dem":
            # Terrain ships per 2nd-level mesh, roughly a hundred times the
            # area of everything else; the manual calls converting it
            # "practically impossible" and it is not what this tool is for.
            if progress:
                progress(f"skipping {path.name}: dem tiles cover a 2nd-level mesh")
            continue
        if progress:
            progress(f"reading {path.name} ({feature})")
        for surface in _read_file_surfaces(path, feature):
            if with_source:
                # Appearances live in the same file, so a surface has to
                # remember which one it came from to find its texture.
                surface.source_path = path
            yield surface


def _read_file_surfaces(path, feature):
    wanted = _FEATURE_ELEMENTS.get(feature, ())
    context = ElementTree.iterparse(str(path), events=("start", "end"))
    root = None
    epsg = None

    for event, element in context:
        if event == "start":
            if root is None:
                root = element
            continue

        name = _local(element.tag)
        if epsg is None and name == "Envelope":
            epsg = _epsg_from_srs_name(element.get("srsName"))
        if name not in wanted:
            continue
        # A BuildingPart is nested inside its Building; taking the part on
        # its own and again as part of the parent would double every wall.
        if name == "BuildingPart":
            continue

        for surface in surfaces_of_feature(element, feature):
            if epsg is not None and epsg not in _LAT_LON_EPSG:
                surface.rings = [[(p[1], p[0], p[2]) for p in ring]
                                 for ring in surface.rings]
            yield surface

        element.clear()
        if root is not None:
            root.clear()
