"""
Streaming reader for PLATEAU building CityGML.

Only what voxelization needs is pulled out of each `bldg:Building`: a ground
outline, the altitude that outline sits at, and how tall the building is.
Everything else in the file (semantic surfaces, textures, the large
`uro:` attribute blocks PLATEAU adds) is skipped.

Version-agnostic by construction: elements are matched on their *local*
name, so CityGML 2.0 files (PLATEAU 2020-2023, `citygml/building/2.0` +
`gml`) and CityGML 3.0 files (`building/3.0` + `gml/3.2`) both parse
without a namespace table to keep updated.

Parsing is `iterparse`-based and drops each building's subtree as soon as it
has been read, because a single ward's `_bldg_` GML runs to hundreds of
megabytes -- more than enough to make a DOM parse thrash.
"""
import re
from dataclasses import dataclass, field
from pathlib import Path
from xml.etree import ElementTree

# EPSG codes whose axis order is (latitude, longitude) rather than the
# (longitude, latitude) most GIS tooling assumes. PLATEAU tags its files
# 6697 (JGD2011 geographic 3D); the others show up in older or trimmed
# exports of the same data.
_LAT_LON_EPSG = {4326, 4612, 6668, 6697, 6667, 10162}

_DEFAULT_STOREY_HEIGHT = 3.0
_FLAT_FACE_TOLERANCE = 0.6  # metres of z spread still counted as "flat"


def _local(tag):
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _epsg_from_srs_name(srs_name):
    if not srs_name:
        return None
    match = re.search(r"(\d{4,5})\s*$", srs_name.strip())
    return int(match.group(1)) if match else None


@dataclass
class Building:
    """One building, in the file's own geographic coordinates.

    `rings` is a list of (is_exterior, [(lat, lon, alt), ...]). A building
    with a courtyard contributes one exterior ring and one interior ring;
    a building split into `bldg:BuildingPart`s contributes one exterior
    ring per part, which is why this is a list rather than a single
    outline plus holes.
    """

    gml_id: str = ""
    rings: list = field(default_factory=list)
    measured_height: float = None
    storeys_above_ground: int = None
    usage: str = None
    base_alt: float = 0.0
    top_alt: float = 0.0

    @property
    def height(self):
        """Best available height in metres, in preference order.

        `bldg:measuredHeight` is the authoritative attribute and is present
        on essentially every PLATEAU building. The geometric span is the
        fallback for LOD1 solids that omit it, and storeys x 3 m is the
        last resort before giving up and using one storey.
        """
        if self.measured_height and self.measured_height > 0:
            return self.measured_height
        span = self.top_alt - self.base_alt
        if span > 0.5:
            return span
        if self.storeys_above_ground:
            return self.storeys_above_ground * _DEFAULT_STOREY_HEIGHT
        return _DEFAULT_STOREY_HEIGHT

    def centroid(self):
        for is_exterior, ring in self.rings:
            if is_exterior and ring:
                lat = sum(p[0] for p in ring) / len(ring)
                lon = sum(p[1] for p in ring) / len(ring)
                return lat, lon
        return None


def _parse_coordinates(text, dimension):
    values = [float(v) for v in text.split()]
    if dimension not in (2, 3):
        dimension = 3 if len(values) % 3 == 0 else 2
    points = []
    for i in range(0, len(values) - dimension + 1, dimension):
        alt = values[i + 2] if dimension == 3 else 0.0
        points.append((values[i], values[i + 1], alt))
    return points


def _ring_points(ring_element):
    """All coordinates under one `gml:LinearRing`, in file axis order."""
    points = []
    for child in ring_element.iter():
        name = _local(child.tag)
        if name not in ("posList", "pos", "coordinates") or not (child.text or "").strip():
            continue
        dimension = int(child.get("srsDimension") or ring_element.get("srsDimension") or 0)
        text = child.text.replace(",", " ") if name == "coordinates" else child.text
        points.extend(_parse_coordinates(text, dimension))
    return points


def _collect_polygons(element):
    """Every `gml:Polygon` under `element`, as (exterior_ring, [holes...])."""
    polygons = []
    for polygon in element.iter():
        if _local(polygon.tag) != "Polygon":
            continue
        exterior, holes = None, []
        for boundary in polygon:
            role = _local(boundary.tag)
            if role not in ("exterior", "interior"):
                continue
            for ring in boundary.iter():
                if _local(ring.tag) != "LinearRing":
                    continue
                points = _ring_points(ring)
                if len(points) < 3:
                    continue
                if role == "exterior":
                    exterior = points
                else:
                    holes.append(points)
        if exterior:
            polygons.append((exterior, holes))
    return polygons


def _named_child(element, *names):
    """Depth-first search for the first descendant with one of `names`."""
    wanted = set(names)
    for child in element.iter():
        if _local(child.tag) in wanted:
            return child
    return None


def _ground_polygons(polygons):
    """Pick the footprint faces out of a solid's full set of faces.

    An LOD1 solid is a vertical extrusion, so its faces are one flat
    bottom, one flat top, and vertical walls. Selecting the flat faces
    sitting at the solid's minimum altitude isolates the bottom; walls have
    a large z spread and the roof sits at the top. LOD2 solids add sloped
    roof faces, which the same test rejects for the same reason.
    """
    if not polygons:
        return []
    min_z = min(point[2] for exterior, _ in polygons for point in exterior)
    ground = []
    for exterior, holes in polygons:
        zs = [point[2] for point in exterior]
        if max(zs) - min(zs) <= _FLAT_FACE_TOLERANCE and min(zs) <= min_z + _FLAT_FACE_TOLERANCE:
            ground.append((exterior, holes))
    # A solid whose bottom face is missing (some LOD2 buildings are open at
    # the base) falls back to every face, and the rasterizer's union of
    # overlapping rings still recovers the correct outline.
    return ground or polygons


def _read_building(element):
    building = Building()
    for key, value in element.attrib.items():
        if _local(key) == "id":
            building.gml_id = value
            break

    footprint_source = None
    for names in (("lod0FootPrint",), ("lod1Solid",), ("lod0RoofEdge",),
                  ("lod2Solid", "lod2MultiSurface"), ("lod3Solid", "lod3MultiSurface")):
        footprint_source = _named_child(element, *names)
        if footprint_source is not None:
            break
    if footprint_source is None:
        return None

    polygons = _collect_polygons(footprint_source)
    if not polygons:
        return None

    all_z = [point[2] for exterior, holes in polygons for point in exterior]
    building.base_alt = min(all_z)
    building.top_alt = max(all_z)

    for exterior, holes in _ground_polygons(polygons):
        building.rings.append((True, exterior))
        for hole in holes:
            building.rings.append((False, hole))

    for child in element.iter():
        name = _local(child.tag)
        text = (child.text or "").strip()
        if not text:
            continue
        if name == "measuredHeight" and building.measured_height is None:
            try:
                building.measured_height = float(text)
            except ValueError:
                pass
        elif name == "storeysAboveGround" and building.storeys_above_ground is None:
            try:
                building.storeys_above_ground = int(float(text))
            except ValueError:
                pass
        elif name == "usage" and building.usage is None:
            building.usage = text

    return building


def read_buildings(paths, progress=None):
    """Yield `Building`s from one or more CityGML files or directories.

    Also yields nothing for non-building PLATEAU packages (`_tran_`,
    `_luse_`, ...) rather than failing, so a whole extracted `udx/` tree can
    be pointed at this directly.
    """
    for path in _expand_paths(paths):
        if progress:
            progress(f"reading {path.name}")
        yield from _read_file(path)


def _expand_paths(paths):
    if isinstance(paths, (str, Path)):
        paths = [paths]
    found = []
    for entry in paths:
        entry = Path(entry)
        if entry.is_dir():
            found.extend(sorted(entry.rglob("*.gml")))
        else:
            found.append(entry)
    return found


def _read_file(path):
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
        if name != "Building":
            continue

        if epsg is None:
            epsg = _epsg_from_srs_name(element.get("srsName")) or _epsg_from_srs_name(
                root.get("srsName") if root is not None else None)

        building = _read_building(element)
        if building is not None:
            if epsg is not None and epsg not in _LAT_LON_EPSG:
                # (lon, lat) ordering: swap so downstream code only ever
                # sees (lat, lon).
                building.rings = [(is_ext, [(p[1], p[0], p[2]) for p in ring])
                                  for is_ext, ring in building.rings]
            yield building

        element.clear()
        if root is not None:
            root.clear()


def data_extent(paths, progress=None):
    """(min_lat, min_lon, max_lat, max_lon) over the tiles' own envelopes.

    Every PLATEAU tile opens with a `gml:boundedBy` envelope, so the area a
    download covers can be found by reading a few hundred bytes per file
    rather than parsing any of them. That is what lets the tool centre
    itself on whatever was handed to it, instead of making the user look up
    a latitude first.
    """
    bounds = None
    for path in _expand_paths(paths):
        corners = _envelope_of(path)
        if corners is None:
            continue
        if progress:
            progress(f"extent of {path.name}")
        if bounds is None:
            bounds = list(corners)
        else:
            bounds[0] = min(bounds[0], corners[0])
            bounds[1] = min(bounds[1], corners[1])
            bounds[2] = max(bounds[2], corners[2])
            bounds[3] = max(bounds[3], corners[3])
    return tuple(bounds) if bounds else None


def _envelope_of(path):
    lower = upper = None
    epsg = None
    try:
        for _event, element in ElementTree.iterparse(str(path), events=("end",)):
            name = _local(element.tag)
            if name == "lowerCorner":
                lower = [float(v) for v in (element.text or "").split()]
            elif name == "upperCorner":
                upper = [float(v) for v in (element.text or "").split()]
            elif name == "Envelope":
                epsg = _epsg_from_srs_name(element.get("srsName"))
                break
    except (ElementTree.ParseError, ValueError, OSError):
        return None

    if not lower or not upper or len(lower) < 2 or len(upper) < 2:
        return None
    if epsg is not None and epsg not in _LAT_LON_EPSG:
        lower = [lower[1], lower[0]]
        upper = [upper[1], upper[0]]
    return (lower[0], lower[1], upper[0], upper[1])
