"""
CityGML appearances: which image is pasted onto which polygon.

PLATEAU LOD2 tiles ship a sibling folder of JPEGs and an `app:Appearance`
block tying them to polygons by gml:id. The official converter ignores all
of it and emits stone; this reads it, so a facade can come out the colour
it actually is.

The structure, as modelled in MIERUNE's plateau-gis-converter and defined
by CityGML 2.0:

    app:Appearance
      app:surfaceDataMember
        app:ParameterizedTexture
          app:imageURI            -> a path relative to the CityGML file
          app:target uri="#poly"  -> the polygon the image lands on
            app:TexCoordList
              app:textureCoordinates ring="#ring"  -> u v u v ... per ring

Textures are read lazily and cached: one tile can reference a few thousand
JPEGs, and only the ones inside the requested radius are ever opened.
"""
from pathlib import Path
from xml.etree import ElementTree

import numpy as np

from .citygml import _local


class TextureAtlas:
    """Polygon id -> (image path, exterior-ring UVs), plus a decoded cache."""

    def __init__(self, base_dir, simplify_colors=0, downscale=0):
        self.base_dir = Path(base_dir)
        self.simplify_colors = simplify_colors
        self.downscale = downscale
        self._targets = {}
        self._images = {}
        self.missing = 0

    def __len__(self):
        return len(self._targets)

    def add_target(self, polygon_id, image_uri, uvs):
        if polygon_id and image_uri and len(uvs) >= 3:
            self._targets[polygon_id] = (image_uri, uvs)

    def uv_for(self, polygon_id):
        return self._targets.get(polygon_id)

    def image(self, image_uri):
        """Decoded texture as an (h, w, 3) uint8 array, or None."""
        if image_uri in self._images:
            return self._images[image_uri]

        from PIL import Image

        path = (self.base_dir / image_uri).resolve()
        array = None
        try:
            with Image.open(path) as handle:
                picture = handle.convert("RGB")
                if self.downscale > 1:
                    picture = picture.resize(
                        (max(1, picture.width // self.downscale),
                         max(1, picture.height // self.downscale)),
                        Image.BOX)
                if self.simplify_colors:
                    # Median-cut down to a handful of colours before block
                    # matching. A facade JPEG is full of compression noise
                    # and per-pixel lighting; matching that directly gives
                    # a speckled wall, whereas flattening it first gives
                    # the flat panels the building actually has.
                    picture = picture.quantize(
                        colors=max(2, self.simplify_colors),
                        method=Image.Quantize.MEDIANCUT).convert("RGB")
                array = np.asarray(picture, dtype=np.uint8)
        except Exception:
            self.missing += 1
            array = None

        self._images[image_uri] = array
        return array

    def sample(self, image_uri, uv):
        """Nearest-neighbour lookup of (n, 2) UV coordinates."""
        array = self.image(image_uri)
        if array is None:
            return None
        height, width = array.shape[:2]
        # CityGML texture space has v running up from the bottom-left, the
        # opposite of image row order.
        u = np.clip(uv[:, 0], 0.0, 1.0)
        v = np.clip(1.0 - uv[:, 1], 0.0, 1.0)
        columns = np.clip((u * (width - 1)).astype(np.int64), 0, width - 1)
        rows = np.clip((v * (height - 1)).astype(np.int64), 0, height - 1)
        return array[rows, columns]


def read_appearances(path, simplify_colors=0, downscale=0):
    """Build a `TextureAtlas` for one CityGML file."""
    atlas = TextureAtlas(Path(path).parent, simplify_colors, downscale)

    context = ElementTree.iterparse(str(path), events=("end",))
    for _event, element in context:
        if _local(element.tag) != "ParameterizedTexture":
            continue

        image_uri = None
        for child in element.iter():
            if _local(child.tag) == "imageURI" and (child.text or "").strip():
                image_uri = child.text.strip()
                break
        if image_uri is None:
            element.clear()
            continue

        for target in element.iter():
            if _local(target.tag) != "target":
                continue
            polygon_id = (target.get("uri") or "").lstrip("#")
            if not polygon_id:
                continue
            # The first textureCoordinates under a target is the exterior
            # ring; the rest map holes, which the sampler does not need.
            for coordinates in target.iter():
                if _local(coordinates.tag) != "textureCoordinates":
                    continue
                values = np.fromstring(coordinates.text or "", dtype=np.float64, sep=" ")
                if len(values) >= 6 and len(values) % 2 == 0:
                    atlas.add_target(polygon_id, image_uri, values.reshape(-1, 2))
                break

        element.clear()

    return atlas


def affine_uv(plane_xy, ring_uv):
    """Least-squares affine map from in-plane coordinates to texture UV.

    A textured CityGML polygon carries one UV per exterior vertex, and the
    mapping between the polygon's plane and the image is affine for the
    flat panels PLATEAU models. Fitting it once per polygon means an
    interior sample's UV costs a matrix multiply rather than a search for
    the triangle it falls in.
    """
    count = min(len(plane_xy), len(ring_uv))
    if count < 3:
        return None
    source = np.column_stack([plane_xy[:count], np.ones(count)])
    try:
        solution, *_ = np.linalg.lstsq(source, ring_uv[:count], rcond=None)
    except np.linalg.LinAlgError:
        return None
    if not np.isfinite(solution).all():
        return None
    return solution
