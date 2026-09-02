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
