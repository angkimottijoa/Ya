"""
Resolving CityGML appearances: what colour each surface actually is.

FORK: added. Upstream discards appearances entirely -- "テクスチャデータの
有無にかかわらず、全てのブロックが石（Stone）として生成されます" -- so a
converted city is one uniform grey mass even though PLATEAU LOD2 ships the
imagery to do better.

The structure follows MIERUNE's plateau-gis-converter (`nusamai-plateau`,
MIT), which is the reference implementation for how PLATEAU nests this:

    app:Appearance
      app:theme                      "rgbTexture"
      app:surfaceDataMember
        app:ParameterizedTexture
          app:imageURI               a JPEG beside the CityGML
          app:target uri="#poly"
            app:TexCoordList
              app:textureCoordinates ring="#ring"   u v u v ...
        app:X3DMaterial
          app:diffuseColor           "0.8 0.8 0.8"
          app:target                 "#poly"

Two details are worth copying exactly, and both were wrong in a first pass
that guessed at the schema:

* Texture coordinates are keyed by **ring** id, not by polygon id. A
  polygon with a hole has one texture target and several rings, each with
  its own coordinate list.
* `app:X3DMaterial` is the other half of the picture. Plenty of LOD2
  surfaces carry no texture but do carry a material, and its
  `diffuseColor` is a perfectly good colour for them -- far better than
  falling back to stone. nusamai defaults an absent diffuse colour to
  (0.8, 0.8, 0.8); so does this.
"""
from pathlib import Path
from xml.etree import ElementTree

import numpy as np

DEFAULT_DIFFUSE = (0.8, 0.8, 0.8)


def _local(tag):
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


class Appearances:
    """Everything one CityGML file says about how its surfaces look."""

    def __init__(self, base_dir, simplify_colors=0, downscale=4):
        self.base_dir = Path(base_dir)
        self.simplify_colors = simplify_colors
        self.downscale = downscale
        self.ring_to_texture = {}     # ring gml:id -> (image uri, uv array)
        # Some exports leave the LinearRings unnamed and only identify the
        # target polygon. Keeping both lets a lookup fall back rather than
        # silently losing the texture.
        self.polygon_to_texture = {}  # polygon gml:id -> (image uri, uv array)
        self.surface_to_material = {}  # polygon gml:id -> (r, g, b) 0-255
        self._images = {}
        self.missing_images = 0

    # ------------------------------------------------------------ parse --
    def read(self, path):
        for _event, element in ElementTree.iterparse(str(path), events=("end",)):
            name = _local(element.tag)
            if name == "ParameterizedTexture":
                self._read_texture(element)
                element.clear()
            elif name == "X3DMaterial":
                self._read_material(element)
                element.clear()
        return self

    def _read_texture(self, element):
        image_uri = None
        for child in element.iter():
            if _local(child.tag) == "imageURI" and (child.text or "").strip():
                image_uri = child.text.strip()
                break
        if image_uri is None:
            return

        for target in element.iter():
            if _local(target.tag) != "target":
                continue
            polygon_id = (target.get("uri") or "").lstrip("#")
            first = True
            for coordinates in target.iter():
                if _local(coordinates.tag) != "textureCoordinates":
                    continue
                values = np.fromstring(coordinates.text or "", dtype=np.float64, sep=" ")
                if len(values) < 6 or len(values) % 2:
                    continue
                uv = values.reshape(-1, 2)
                ring_id = (coordinates.get("ring") or "").lstrip("#")
                if ring_id:
                    self.ring_to_texture[ring_id] = (image_uri, uv)
                if first and polygon_id:
                    # The first coordinate list under a target is the
                    # exterior ring, which is the one an unnamed-ring
                    # lookup wants.
                    self.polygon_to_texture[polygon_id] = (image_uri, uv)
                    first = False

    def _read_material(self, element):
        diffuse = DEFAULT_DIFFUSE
        targets = []
        for child in element.iter():
            name = _local(child.tag)
            text = (child.text or "").strip()
            if name == "diffuseColor" and text:
                parts = [float(v) for v in text.split()]
                if len(parts) >= 3:
                    diffuse = tuple(parts[:3])
            elif name == "target" and text:
                targets.append(text.lstrip("#"))

        colour = tuple(int(round(min(max(c, 0.0), 1.0) * 255)) for c in diffuse)
        for target in targets:
            self.surface_to_material[target] = colour

    # ----------------------------------------------------------- sample --
    def texture_for(self, ring_id, polygon_id):
        """Texture for a ring, falling back to its polygon's."""
        found = self.ring_to_texture.get(ring_id) if ring_id else None
        return found or self.polygon_to_texture.get(polygon_id)

    def image(self, image_uri):
        if image_uri in self._images:
            return self._images[image_uri]

        from PIL import Image

        array = None
        try:
            with Image.open((self.base_dir / image_uri).resolve()) as handle:
                picture = handle.convert("RGB")
                if self.downscale > 1:
                    picture = picture.resize(
                        (max(1, picture.width // self.downscale),
                         max(1, picture.height // self.downscale)), Image.BOX)
                if self.simplify_colors:
                    picture = picture.quantize(
                        colors=max(2, self.simplify_colors),
                        method=Image.Quantize.MEDIANCUT).convert("RGB")
                array = np.asarray(picture, dtype=np.uint8)
        except Exception:
            self.missing_images += 1

        self._images[image_uri] = array
        return array

    def sample(self, image_uri, uv):
        array = self.image(image_uri)
        if array is None:
            return None
        height, width = array.shape[:2]
        # CityGML texture space runs v upwards from the bottom-left; image
        # rows run downwards from the top.
        u = np.clip(uv[:, 0], 0.0, 1.0)
        v = np.clip(1.0 - uv[:, 1], 0.0, 1.0)
        columns = np.clip((u * (width - 1)).astype(np.int64), 0, width - 1)
        rows = np.clip((v * (height - 1)).astype(np.int64), 0, height - 1)
        return array[rows, columns]


def affine_uv(plane_xy, ring_uv):
    """Least-squares affine map from a surface's own plane to texture UV.

    PLATEAU models flat panels, so the mapping is affine and fitting it
    once per ring makes an interior sample a matrix multiply rather than a
    search for the triangle it falls in.
    """
    count = min(len(plane_xy), len(ring_uv))
    if count < 3:
        return None
    source = np.column_stack([plane_xy[:count], np.ones(count)])
    try:
        solution, *_ = np.linalg.lstsq(source, ring_uv[:count], rcond=None)
    except np.linalg.LinAlgError:
        return None
    return solution if np.isfinite(solution).all() else None
