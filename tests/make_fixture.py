#!/usr/bin/env python3
"""
Generates a CityGML file shaped like a real PLATEAU `_bldg_` tile.

Everything that matters to the parser is reproduced from the real product
specification: CityGML 2.0 namespaces, `srsName` EPSG:6697 with the
*latitude, longitude, altitude* axis order that implies, `bldg:lod1Solid`
extrusions with a flat bottom face, `bldg:measuredHeight` in metres, and
`uro:` attribute blocks around them that the parser has to step over.

This exists so the pipeline can be tested without shipping (or downloading)
a multi-gigabyte national dataset.
"""
import math
from pathlib import Path

HEADER = """<?xml version="1.0" encoding="UTF-8"?>
<core:CityModel
    xmlns:core="http://www.opengis.net/citygml/2.0"
    xmlns:bldg="http://www.opengis.net/citygml/building/2.0"
    xmlns:gen="http://www.opengis.net/citygml/generics/2.0"
    xmlns:gml="http://www.opengis.net/gml"
    xmlns:uro="https://www.geospatial.jp/iur/uro/2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <gml:boundedBy>
    <gml:Envelope srsName="http://www.opengis.net/def/crs/EPSG/0/6697" srsDimension="3">
      <gml:lowerCorner>{min_lat} {min_lon} 0</gml:lowerCorner>
      <gml:upperCorner>{max_lat} {max_lon} 300</gml:upperCorner>
    </gml:Envelope>
  </gml:boundedBy>
"""

FOOTER = "</core:CityModel>\n"

BUILDING = """  <core:cityObjectMember>
    <bldg:Building gml:id="bldg_{index}">
      <bldg:measuredHeight uom="m">{height}</bldg:measuredHeight>
      <bldg:storeysAboveGround>{storeys}</bldg:storeysAboveGround>
      <bldg:lod1Solid>
        <gml:Solid>
          <gml:exterior>
            <gml:CompositeSurface>
{faces}            </gml:CompositeSurface>
          </gml:exterior>
        </gml:Solid>
      </bldg:lod1Solid>
      <uro:buildingIDAttribute>
        <uro:BuildingIDAttribute>
          <uro:buildingID>TEST-{index}</uro:buildingID>
        </uro:BuildingIDAttribute>
      </uro:buildingIDAttribute>
    </bldg:Building>
  </core:cityObjectMember>
"""

FACE = """              <gml:surfaceMember>
                <gml:Polygon>
                  <gml:exterior>
                    <gml:LinearRing>
                      <gml:posList>{coords}</gml:posList>
                    </gml:LinearRing>
                  </gml:exterior>
                </gml:Polygon>
              </gml:surfaceMember>
"""

# Metres per degree near Tokyo, good enough to lay out a test block.
_LAT_PER_M = 1.0 / 111_132.0
_LON_PER_M = 1.0 / (111_320.0 * math.cos(math.radians(35.66)))


def _ring_coords(points, altitude):
    """PLATEAU writes rings closed and in lat lon alt order."""
    closed = list(points) + [points[0]]
    return " ".join(f"{lat:.9f} {lon:.9f} {altitude:.3f}" for lat, lon in closed)


def _extruded_faces(points, base_alt, height):
    top_alt = base_alt + height
    faces = [
        FACE.format(coords=_ring_coords(points, base_alt)),   # ground
        FACE.format(coords=_ring_coords(points, top_alt)),    # roof
    ]
    for i, (lat, lon) in enumerate(points):
        next_lat, next_lon = points[(i + 1) % len(points)]
        wall = (f"{lat:.9f} {lon:.9f} {base_alt:.3f} "
                f"{next_lat:.9f} {next_lon:.9f} {base_alt:.3f} "
                f"{next_lat:.9f} {next_lon:.9f} {top_alt:.3f} "
                f"{lat:.9f} {lon:.9f} {top_alt:.3f} "
                f"{lat:.9f} {lon:.9f} {base_alt:.3f}")
        faces.append(FACE.format(coords=wall))
    return "".join(faces)


def _rect(centre_lat, centre_lon, width_m, depth_m):
    half_lat = depth_m / 2 * _LAT_PER_M
    half_lon = width_m / 2 * _LON_PER_M
    return [
        (centre_lat - half_lat, centre_lon - half_lon),
        (centre_lat - half_lat, centre_lon + half_lon),
        (centre_lat + half_lat, centre_lon + half_lon),
        (centre_lat + half_lat, centre_lon - half_lon),
    ]


def build(path, centre=(35.6595, 139.7005), grid=6, spacing_m=40):
    """A grid of buildings on a gentle east-west slope, plus one tower."""
    buildings = []
    index = 0
    for row in range(grid):
        for col in range(grid):
            lat = centre[0] + (row - grid / 2) * spacing_m * _LAT_PER_M
            lon = centre[1] + (col - grid / 2) * spacing_m * _LON_PER_M
            # Heights cycle through every material tier; the ground rises
            # 1 m per column eastwards so terrain interpolation has a slope
            # to reconstruct.
            height = (8, 22, 45, 120)[(row + col) % 4]
            base_alt = 5.0 + col * 1.0
            points = _rect(lat, lon, 24, 24)
            buildings.append(BUILDING.format(
                index=index, height=f"{height:.1f}",
                storeys=max(int(height // 3), 1),
                faces=_extruded_faces(points, base_alt, height)))
            index += 1

    # One landmark-scale tower, to exercise height clamping.
    points = _rect(centre[0], centre[1], 60, 60)
    buildings.append(BUILDING.format(
        index=index, height="333.0", storeys=60,
        faces=_extruded_faces(points, 6.0, 333.0)))

    span = grid * spacing_m
    header = HEADER.format(
        min_lat=centre[0] - span * _LAT_PER_M, max_lat=centre[0] + span * _LAT_PER_M,
        min_lon=centre[1] - span * _LON_PER_M, max_lon=centre[1] + span * _LON_PER_M)

    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(header + "".join(buildings) + FOOTER, encoding="utf-8")
    return path


if __name__ == "__main__":
    import sys
    target = sys.argv[1] if len(sys.argv) > 1 else "tests/fixtures/53393599_bldg_6697_op.gml"
    print(build(target))


# --------------------------------------------------------------- LOD2 ---
# PLATEAU's LOD2 buildings carry semantic surfaces under bldg:boundedBy
# rather than a single extruded solid, each holding a lod2MultiSurface.
# The converter picks LOD2 in preference to LOD1, so the test data has to
# offer both shapes.

LOD2_BUILDING = """  <core:cityObjectMember>
    <bldg:Building gml:id="bldg_lod2_{index}">
      <bldg:measuredHeight uom="m">{height}</bldg:measuredHeight>
      <bldg:lod1Solid>
        <gml:Solid><gml:exterior><gml:CompositeSurface>
{lod1_faces}        </gml:CompositeSurface></gml:exterior></gml:Solid>
      </bldg:lod1Solid>
{bounded}    </bldg:Building>
  </core:cityObjectMember>
"""

BOUNDED_SURFACE = """      <bldg:boundedBy>
        <bldg:{kind} gml:id="{kind_lower}_{index}">
          <bldg:lod2MultiSurface>
            <gml:MultiSurface>
              <gml:surfaceMember>
                <gml:Polygon gml:id="poly_{index}">
                  <gml:exterior>
                    <gml:LinearRing>
                      <gml:posList>{coords}</gml:posList>
                    </gml:LinearRing>
                  </gml:exterior>
{holes}                </gml:Polygon>
              </gml:surfaceMember>
            </gml:MultiSurface>
          </bldg:lod2MultiSurface>
        </bldg:{kind}>
      </bldg:boundedBy>
"""

HOLE = """                  <gml:interior>
                    <gml:LinearRing>
                      <gml:posList>{coords}</gml:posList>
                    </gml:LinearRing>
                  </gml:interior>
"""


def _gabled_building(index, centre_lat, centre_lon, width_m, depth_m,
                     base_alt, eaves_height, ridge_height, window=False):
    """A house with a pitched roof: the shape LOD1 cannot represent.

    Gives the voxelizer a genuinely sloped surface to rasterize, which is
    where a naive triangle voxelizer leaves gaps.
    """
    points = _rect(centre_lat, centre_lon, width_m, depth_m)
    (s_lat, w_lon), (_, e_lon), (n_lat, _), _ = points
    mid_lat = (s_lat + n_lat) / 2
    eaves = base_alt + eaves_height
    ridge = base_alt + ridge_height

    surfaces = []
    surfaces.append(("GroundSurface", _ring_coords(points, base_alt), ""))

    # Four walls, the north and south ones gabled up to the ridge.
    for a, b in ((0, 1), (2, 3)):
        (lat_a, lon_a), (lat_b, lon_b) = points[a], points[b]
        wall = (f"{lat_a:.9f} {lon_a:.9f} {base_alt:.3f} "
                f"{lat_b:.9f} {lon_b:.9f} {base_alt:.3f} "
                f"{lat_b:.9f} {lon_b:.9f} {eaves:.3f} "
                f"{lat_a:.9f} {lon_a:.9f} {eaves:.3f} "
                f"{lat_a:.9f} {lon_a:.9f} {base_alt:.3f}")
        holes = ""
        if window:
            # A window punched into one wall, so hole handling is exercised.
            in_lat = lat_a + (lat_b - lat_a) * 0.35
            out_lat = lat_a + (lat_b - lat_a) * 0.65
            low, high = base_alt + 1.0, base_alt + eaves_height - 1.0
            holes = HOLE.format(coords=(
                f"{in_lat:.9f} {lon_a:.9f} {low:.3f} "
                f"{out_lat:.9f} {lon_a:.9f} {low:.3f} "
                f"{out_lat:.9f} {lon_a:.9f} {high:.3f} "
                f"{in_lat:.9f} {lon_a:.9f} {high:.3f} "
                f"{in_lat:.9f} {lon_a:.9f} {low:.3f}"))
            window = False
        surfaces.append(("WallSurface", wall, holes))

    for lon in (w_lon, e_lon):
        gable = (f"{s_lat:.9f} {lon:.9f} {base_alt:.3f} "
                 f"{n_lat:.9f} {lon:.9f} {base_alt:.3f} "
                 f"{n_lat:.9f} {lon:.9f} {eaves:.3f} "
                 f"{mid_lat:.9f} {lon:.9f} {ridge:.3f} "
                 f"{s_lat:.9f} {lon:.9f} {eaves:.3f} "
                 f"{s_lat:.9f} {lon:.9f} {base_alt:.3f}")
        surfaces.append(("WallSurface", gable, ""))

    # Two sloped roof planes meeting at the ridge.
    for edge_lat in (s_lat, n_lat):
        roof = (f"{edge_lat:.9f} {w_lon:.9f} {eaves:.3f} "
                f"{edge_lat:.9f} {e_lon:.9f} {eaves:.3f} "
                f"{mid_lat:.9f} {e_lon:.9f} {ridge:.3f} "
                f"{mid_lat:.9f} {w_lon:.9f} {ridge:.3f} "
                f"{edge_lat:.9f} {w_lon:.9f} {eaves:.3f}")
        surfaces.append(("RoofSurface", roof, ""))

    bounded = "".join(
        BOUNDED_SURFACE.format(kind=kind, kind_lower=kind.lower(), index=f"{index}_{i}",
                               coords=coords, holes=holes)
        for i, (kind, coords, holes) in enumerate(surfaces))

    return LOD2_BUILDING.format(
        index=index, height=f"{ridge_height:.1f}",
        lod1_faces=_extruded_faces(points, base_alt, eaves_height),
        bounded=bounded)


def build_lod2(path, centre=(35.690921, 139.700258), grid=3, spacing_m=30):
    """A block of gabled LOD2 houses, plus one plain LOD1 tower."""
    parts = []
    index = 0
    for row in range(grid):
        for col in range(grid):
            lat = centre[0] + (row - grid / 2) * spacing_m * _LAT_PER_M
            lon = centre[1] + (col - grid / 2) * spacing_m * _LON_PER_M
            parts.append(_gabled_building(
                index, lat, lon, 16, 20, base_alt=4.0 + col,
                eaves_height=6.0, ridge_height=10.0, window=(index % 2 == 0)))
            index += 1

    # One LOD1-only building, to prove the per-feature fallback works.
    points = _rect(centre[0] + 0.0009, centre[1], 30, 30)
    parts.append(BUILDING.format(
        index=999, height="60.0", storeys=20,
        faces=_extruded_faces(points, 5.0, 60.0)))

    span = grid * spacing_m + 200
    header = HEADER.format(
        min_lat=centre[0] - span * _LAT_PER_M, max_lat=centre[0] + span * _LAT_PER_M,
        min_lon=centre[1] - span * _LON_PER_M, max_lon=centre[1] + span * _LON_PER_M)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(header + "".join(parts) + FOOTER, encoding="utf-8")
    return path
