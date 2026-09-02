"""
JGD2011 geographic (lat/lon) -> Japan Plane Rectangular Coordinate System.

PLATEAU's CityGML ships coordinates in EPSG:6697 (JGD2011 geographic 3D,
axis order *latitude, longitude, ellipsoidal-ish height*). To voxelize a
city we need metres, and we need them without the ~1.23x east-west stretch
that Web Mercator introduces at Tokyo's latitude.

The right target is the national plane rectangular system: 19 zones, each a
transverse Mercator with scale factor 0.9999 on the GRS80 ellipsoid. Tokyo's
23 wards fall in zone IX (EPSG:6677, origin 36N 139-50E), where one unit is
one metre -- so a projected coordinate, rounded, *is* a Minecraft block
coordinate.

This implements the Gauss-Kruger projection directly rather than depending
on pyproj/PROJ. That keeps the Windows PyInstaller build lean (PROJ drags in
its own several-MB datum grid directory, which is a well known packaging
headache) and costs about sixty lines. The series expansion is the standard
one published by the Geospatial Information Authority of Japan, carried to
the n^5 terms; `tests/test_jgd2011.py` pins it against pyproj, which it
agrees with to within 3 mm anywhere inside any of the 19 zones -- three
orders of magnitude below the one-block-per-metre grid this feeds.
"""
import math

# GRS80, the ellipsoid JGD2011 is defined on.
_A = 6378137.0
_INV_F = 298.257222101
_K0 = 0.9999

# Origins of the 19 zones, as (latitude, longitude) in degrees. Zone k is
# EPSG:(6668 + k) under JGD2011.
ZONE_ORIGINS = {
    1: (33.0, 129.5),      2: (33.0, 131.0),      3: (36.0, 132 + 10 / 60),
    4: (33.0, 133.5),      5: (36.0, 134 + 20 / 60), 6: (36.0, 136.0),
    7: (36.0, 137 + 10 / 60), 8: (36.0, 138.5),   9: (36.0, 139 + 50 / 60),
    10: (40.0, 140 + 50 / 60), 11: (44.0, 140.25), 12: (44.0, 142.25),
    13: (44.0, 144.25),   14: (26.0, 142.0),     15: (26.0, 127.5),
    16: (26.0, 124.0),    17: (26.0, 131.0),     18: (20.0, 136.0),
    19: (26.0, 154.0),
}

# Zone IX. Covers Tokyo (mainland), Kanagawa, Saitama, Chiba, Gunma,
# Tochigi, Ibaraki, Fukushima -- i.e. every PLATEAU dataset in the Kanto
# plain, which is what this tool is aimed at.
TOKYO_ZONE = 9


def zone_to_epsg(zone):
    if zone not in ZONE_ORIGINS:
        raise ValueError(f"plane rectangular zone must be 1-19, got {zone}")
    return 6668 + zone


def guess_zone(lat, lon):
    """Nearest zone origin by great-circle-ish distance.

    Zone boundaries are legally defined per prefecture, not geometrically,
    so this is a heuristic -- correct for anything comfortably inside a
    zone (which every PLATEAU city is), and worth overriding by hand for a
    dataset that straddles a prefecture border.
    """
    def cost(item):
        _, (lat0, lon0) = item
        return (lat - lat0) ** 2 + ((lon - lon0) * math.cos(math.radians(lat))) ** 2

    return min(ZONE_ORIGINS.items(), key=cost)[0]


def _series_coefficients():
    n = 1.0 / (2.0 * _INV_F - 1.0)
    # Meridian arc coefficients (A_j) and the Gauss-Kruger alpha_j terms.
    a = [
        1 + n**2 / 4 + n**4 / 64,
        -1.5 * (n - n**3 / 16 - n**5 / 32),
        (15 / 16) * (n**2 - n**4 / 4),
        -(35 / 48) * (n**3 - (5 / 16) * n**5),
        (315 / 512) * n**4,
        -(693 / 1280) * n**5,
    ]
    alpha = [
        n / 2 - (2 / 3) * n**2 + (5 / 16) * n**3 + (41 / 180) * n**4 - (127 / 288) * n**5,
        (13 / 48) * n**2 - (3 / 5) * n**3 + (557 / 1440) * n**4 + (281 / 630) * n**5,
        (61 / 240) * n**3 - (103 / 140) * n**4 + (15061 / 26880) * n**5,
        (49561 / 161280) * n**4 - (179 / 168) * n**5,
        (34729 / 80640) * n**5,
    ]
    return n, a, alpha


_N, _A_J, _ALPHA_J = _series_coefficients()
_A_BAR = _K0 * _A / (1 + _N) * _A_J[0]


def _meridian_arc(lat_rad):
    """Distance along the meridian from the equator, times k0."""
    total = _A_J[0] * lat_rad
    for j in range(1, 6):
        total += _A_J[j] * math.sin(2 * j * lat_rad)
    return _K0 * _A / (1 + _N) * total


class PlaneRectangular:
    """Forward projection into one plane rectangular zone.

    Returns *easting, northing* in metres. Note that Japanese surveying
    convention names these the other way round (x is northing, y is
    easting); this class deliberately uses the GIS naming to avoid mixing
    up axes when feeding a raster grid.
    """

    def __init__(self, zone=TOKYO_ZONE):
        if zone not in ZONE_ORIGINS:
            raise ValueError(f"plane rectangular zone must be 1-19, got {zone}")
        self.zone = zone
        self.lat0, self.lon0 = ZONE_ORIGINS[zone]
        self.epsg = zone_to_epsg(zone)
        self._s_phi0 = _meridian_arc(math.radians(self.lat0))
        self._lon0_rad = math.radians(self.lon0)
        self._two_sqrt_n = 2 * math.sqrt(_N) / (1 + _N)

    def __call__(self, lat, lon):
        lat_rad = math.radians(lat)
        d_lon = math.radians(lon) - self._lon0_rad
        cos_l = math.cos(d_lon)
        sin_l = math.sin(d_lon)

        sin_phi = math.sin(lat_rad)
        t = math.sinh(math.atanh(sin_phi) - self._two_sqrt_n * math.atanh(self._two_sqrt_n * sin_phi))
        t_bar = math.hypot(1.0, t)

        xi = math.atan2(t, cos_l)
        eta = math.atanh(sin_l / t_bar)

        northing = xi
        easting = eta
        for j in range(1, 6):
            alpha = _ALPHA_J[j - 1]
            northing += alpha * math.sin(2 * j * xi) * math.cosh(2 * j * eta)
            easting += alpha * math.cos(2 * j * xi) * math.sinh(2 * j * eta)

        return _A_BAR * easting, _A_BAR * northing - self._s_phi0
