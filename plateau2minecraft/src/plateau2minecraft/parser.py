from pathlib import Path

import lxml.etree as et
import numpy as np

from plateau2minecraft.earcut import earcut
from plateau2minecraft.earcut.utils_3d import project3d_to_2d
from plateau2minecraft.types import TriangleMesh

_NS = {
    "gml": "http://www.opengis.net/gml",
    "bldg": "http://www.opengis.net/citygml/building/2.0",
    "brid": "http://www.opengis.net/citygml/bridge/2.0",
    "veg": "http://www.opengis.net/citygml/vegetation/2.0",
    "frn": "http://www.opengis.net/citygml/cityfurniture/2.0",
    "tran": "http://www.opengis.net/citygml/transportation/2.0",
}

_XPATH_LIST = {
    "bldg": [
        ".//bldg:Building",
        ".//bldg:WallSurface",
        ".//bldg:RoofSurface",
        ".//bldg:GroundSurface",
        ".//bldg:OuterFloorSurface",
        ".//bldg:OuterCeilingSurface",
        ".//bldg:ClosureSurface",
        ".//bldg:BuildingInstallation",
        ".//bldg:Window",
        ".//bldg:Door",
    ],
    "tran": [".//tran:Road", ".//tran:TrafficArea"],
    "brid": [
        ".//brid:Bridge",
        ".//brid:BridgePart",
        ".//brid:RoofSurface",
        ".//brid:GroundSurface",
        ".//brid:WallSurface",
        ".//brid:ClosureSurface",
        ".//brid:OuterFloorSurface",
        ".//brid:OuterCeilingSurface",
        ".//brid:BridgeConstructionElement",
        ".//brid:OuterBridgeInstallation",
        ".//brid:Door",
        ".//brid:Window",
        ".//brid:IntBridgeInstallation",
        ".//brid:BridgeFurniture",
    ],
    "frn": [".//frn:CityFurniture"],
    "veg": [".//veg:PlantCover", ".//veg:SolitaryVegetationObject"],
}

# FORK: upstream used
#     pyproj.Transformer.from_crs("epsg:6697", "epsg:3857", always_xy=True)
#
# Web Mercator is conformal but its scale is only true at the equator: at
# Tokyo's latitude a metre on the ground measures 1/cos(35.7) ~= 1.23 metres
# on the map. Heights come straight out of the CityGML in metres and are not
# scaled, so the result is a city about 23% too wide and too deep for its own
# height -- despite the README promising "生成されるブロックは一辺1m".
#
# The Japan Plane Rectangular system has no such problem: it is the national
# survey projection, its unit is the metre, and its scale factor is 0.9999 on
# the zone's central meridian. A projected coordinate, rounded, *is* a block
# coordinate. Zone IX (EPSG:6677) covers Tokyo; guess_zone picks the right one
# for anywhere else in Japan.
#
# pyproj is no longer needed for this, which also takes PROJ's datum grids out
# of the frozen Windows build.
from plateau2minecraft.projection import PlaneRectangular, guess_zone

_projector: PlaneRectangular | None = None


def set_projection_from(lat: float, lon: float, zone: int | None = None) -> PlaneRectangular:
    """Choose the plane rectangular zone the whole conversion will use.

    One zone for the run, chosen from a point inside the data: mixing zones
    across a single build would put a seam through the city.
    """
    global _projector
    _projector = PlaneRectangular(zone or guess_zone(lat, lon))
    return _projector


def _transform(lon, lat):
    """(lon, lat) arrays -> (easting, northing) in metres, as pyproj had it."""
    if _projector is None:
        raise RuntimeError("set_projection_from() must be called before parsing")
    eastings = np.empty(len(lat), dtype=np.float64)
    northings = np.empty(len(lat), dtype=np.float64)
    for i in range(len(lat)):
        eastings[i], northings[i] = _projector(lat[i], lon[i])
    return eastings, northings


def _load_polygons(doc, obj_path: str) -> list[list[np.ndarray]]:
    polygons = []
    for obj in doc.iterfind(obj_path, _NS):
        found = False
        for lod in [2, 1]:
            for polygon_path in [
                f".//bldg:lod{lod}MultiSurface//gml:Polygon",
                f".//bldg:lod{lod}Geometry//gml:Polygon",
                f".//bldg:lod{lod}Solid//gml:Polygon",
                f".//tran:lod{lod}MultiSurface//gml:Polygon",
                f".//tran:lod{lod}Geometry//gml:Polygon",
                f".//brid:lod{lod}MultiSurface//gml:Polygon",
                f".//brid:lod{lod}Geometry//gml:Polygon",
                f".//veg:lod{lod}MultiSurface//gml:Polygon",
                f".//veg:lod{lod}Geometry//gml:Polygon",
                f".//frn:lod{lod}MultiSurface//gml:Polygon",
                f".//frn:lod{lod}Geometry//gml:Polygon",
            ]:
                for polygon in obj.iterfind(polygon_path, _NS):
                    pos_list = polygon.find("./gml:exterior//gml:posList", _NS)
                    vertices = np.fromstring(pos_list.text, dtype=np.float64, sep=" ")
                    assert len(vertices) % 3 == 0
                    assert len(vertices) / 3 >= 3
                    exterior = vertices.reshape(-1, 3)[:-1]
                    rings = []
                    rings.append(exterior)
                    for pos_list in polygon.iterfind("./gml:interior//gml:posList", _NS):
                        vertices = np.fromstring(pos_list.text, dtype=np.float64, sep=" ")
                        assert len(vertices) % 3 == 0
                        # assert len(vertices) / 3 > 1000
                        vertices = vertices.reshape(-1, 3)[:-1]
                        rings.append(vertices)
                    polygons.append(rings)
                    found = True

            if found:
                break

    return polygons


def _triangulate(polygons: list[list[np.ndarray]]) -> TriangleMesh:
    vertices = []
    triangles = []
    for polygon in polygons:
        vertex = np.vstack(polygon)
        hole_indices = []
        if len(polygon) > 1:
            hi = polygon[0].shape[0]
            for ring in polygon[1:]:
                hole_indices.append(hi)
                hi += ring.shape[0]
        xx, yy = _transform(vertex[:, 1], vertex[:, 0])
        vertex[:, 0] = np.asarray(xx)
        vertex[:, 1] = np.asarray(yy)
        flatten_vertices = vertex.flatten()

        flatten_vertices = project3d_to_2d(flatten_vertices, len(polygon[0]))
        if flatten_vertices is not None and (cut := earcut(flatten_vertices, hole_indices, dim=2)):
            cut = np.asarray(cut).reshape(-1, 3)

            if len(triangles) > 0:
                max_index = np.max(np.asarray(triangles, dtype=np.int32))
                cut += max_index + 1
            else:
                max_index = 0
                cut += max_index

            vertices.extend(vertex)
            triangles.extend(cut)

    return TriangleMesh(vertices, triangles)


def get_triangle_meshs(file_path: Path, feature_type: str) -> TriangleMesh:
    obj_paths = _XPATH_LIST[feature_type]

    doc = et.parse(file_path, None)

    triangles = []
    vertices = []
    max_index = 0
    for obj_path in obj_paths:
        polygons = _load_polygons(doc, obj_path)

        if polygons:
            triangle_mesh = _triangulate(polygons)

            vertices.extend(triangle_mesh.vertices)

            t = np.asarray(triangle_mesh.triangles, dtype=np.int32)
            t += max_index
            triangles.extend(t)

            max_index = np.asarray(triangles).max() + 1
            # max_index += np.asarray(triangles).max()

    return TriangleMesh(vertices, triangles)


# ---------------------------------------------------------------- FORK --
# Upstream only ever produces one merged TriangleMesh per file: every
# polygon is triangulated and concatenated, and the gml:ids go with it.
# That is enough to place grey stone and nothing else -- an appearance is
# keyed by ring id, and a roof is only distinguishable from a wall by which
# bldg:*Surface it hung under.
#
# This reads the same documents into planar surfaces instead, keeping the
# ring id and the semantic class, and never triangulating: `planar_voxels`
# rasterizes a polygon in its own plane, so the triangles were only ever a
# detour.

from dataclasses import dataclass, field

ROOF, WALL, GROUND, CLOSURE, OPENING, OTHER = (
    "roof", "wall", "ground", "closure", "opening", "other")

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

_GML_ID = "{http://www.opengis.net/gml}id"


@dataclass
class Surface:
    """One planar polygon, in projected metres, with what it is attached."""

    rings: list = field(default_factory=list)      # [(ring_id, (n,3) array)]
    surface_class: str = OTHER
    polygon_id: str = ""
    lod: int = 2

    @property
    def exterior(self):
        return self.rings[0][1] if self.rings else None


def _local_name(tag):
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _ring_array(ring_element):
    pos_list = ring_element.find("./gml:posList", _NS)
    if pos_list is None or not (pos_list.text or "").strip():
        return None
    values = np.fromstring(pos_list.text, dtype=np.float64, sep=" ")
    if len(values) % 3 or len(values) < 9:
        return None
    # PLATEAU closes its rings; the repeated last vertex adds nothing.
    return values.reshape(-1, 3)[:-1]


def _project(points):
    """(lat, lon, alt) -> (easting, northing, altitude) in metres."""
    eastings, northings = _transform(points[:, 1], points[:, 0])
    out = np.empty_like(points)
    out[:, 0] = eastings
    out[:, 1] = northings
    out[:, 2] = points[:, 2]
    return out


def _walk(element, wanted_lod, stack, out):
    name = _local_name(element.tag)
    stack.append(name)

    if name == "Polygon":
        lod = 0
        for entry in reversed(stack):
            if entry.startswith("lod") and len(entry) > 3 and entry[3].isdigit():
                lod = int(entry[3])
                break
        if lod == wanted_lod:
            surface_class = OTHER
            for entry in reversed(stack):
                if entry in _SURFACE_CLASS:
                    surface_class = _SURFACE_CLASS[entry]
                    break

            rings = []
            for boundary in element:
                role = _local_name(boundary.tag)
                if role not in ("exterior", "interior"):
                    continue
                for ring in boundary.iter():
                    if _local_name(ring.tag) != "LinearRing":
                        continue
                    points = _ring_array(ring)
                    if points is not None and len(points) >= 3:
                        rings.append((ring.get(_GML_ID, ""), _project(points)))
            if rings:
                out.append(Surface(rings=rings, surface_class=surface_class,
                                   polygon_id=element.get(_GML_ID, ""), lod=lod))
        stack.pop()
        return

    for child in element:
        _walk(child, wanted_lod, stack, out)
    stack.pop()


# Only the top-level feature elements. Upstream's _XPATH_LIST also names the
# semantic surfaces (bldg:WallSurface, bldg:RoofSurface, ...), which are
# nested *inside* bldg:Building, so walking both finds every polygon twice.
# Upstream has the same duplication; it survives there because the voxel grid
# collapses the repeats, but it doubles the parsing work and would double-count
# anything measured per surface.
_FEATURE_ROOTS = {
    "bldg": [".//bldg:Building"],
    "tran": [".//tran:Road", ".//tran:Railway", ".//tran:Square", ".//tran:Track"],
    "brid": [".//brid:Bridge"],
    "frn": [".//frn:CityFurniture"],
    "veg": [".//veg:PlantCover", ".//veg:SolitaryVegetationObject"],
}


def get_surfaces(file_path: Path, feature_type: str) -> list[Surface]:
    """Planar surfaces of one CityGML file, LOD2 preferred over LOD1.

    The fallback is per feature, exactly as upstream's `_load_polygons`
    does it and as the manual describes: a tile normally holds both kinds,
    and taking LOD1 for the file as a whole would flatten every LOD2 roof
    in it.
    """
    doc = et.parse(file_path, None)
    obj_paths = _FEATURE_ROOTS.get(feature_type, _XPATH_LIST[feature_type])

    surfaces = []
    for obj_path in obj_paths:
        for obj in doc.iterfind(obj_path, _NS):
            for lod in (2, 1):
                found = []
                _walk(obj, lod, [], found)
                if found:
                    surfaces.extend(found)
                    break
    return surfaces
