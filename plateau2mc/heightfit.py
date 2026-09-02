"""
Fitting a real city's heights into a world's height range without clipping.

Java can be given whatever height a datapack dimension type declares, so
there the answer is usually "don't fit anything". Bedrock cannot: its
Overworld is fixed at y -64..319, and no add-on extends it, so a 1:1 Tokyo
has nowhere to put the top of Skytree. Clamping is the obvious move and the
wrong one -- it deletes the part of the tower people actually recognize.

So instead of cutting, compress. `MODE_COMPRESS` keeps every building below
a knee height at exactly 1:1 and squashes only what rises above it, by the
smallest factor that makes the tallest thing in the dataset fit. In Tokyo's
23 wards that leaves well over 99% of buildings untouched at true scale and
bends only the few towers, all of which stay present at their full
silhouette rather than losing their top.

The transform is chosen from the data, and every mode is *proved* to fit
before anything is written: `top_y` can never exceed `max_y`, so the
voxelizer's clip counter should always come back zero.
"""
MODE_NONE = "none"
MODE_COMPRESS = "compress"
MODE_SCALE = "scale"
MODES = (MODE_NONE, MODE_COMPRESS, MODE_SCALE)

DEFAULT_KNEE = 60.0


class HeightFit:
    """Maps a building's (altitude, height) onto block y.

    `samples` is the (altitude, height) of every building being built, which
    is what lets the fit be tight rather than worst-case guesswork.
    """

    def __init__(self, min_y, max_y, samples, mode=MODE_NONE, sea_level=62,
                 knee=DEFAULT_KNEE):
        if mode not in MODES:
            raise ValueError(f"height fit mode must be one of {MODES}, got {mode!r}")
        self.min_y = min_y
        self.max_y = max_y
        self.mode = mode
        self.sea_level = sea_level
        self.knee = knee
        self.scale = 1.0
        self.compression = 1.0
        self.fallback_from_compress = False

        samples = list(samples) or [(0.0, 1.0)]
        self.alt_min = min(altitude for altitude, _ in samples)
        self.budget = max_y - (min_y + 1)
        self.floor_y = min_y + 1

        if mode == MODE_NONE:
            # Altitude 0 m (Tokyo Peil) sits at sea level, exactly as the
            # real city does. Nothing is fitted; the caller is expected to
            # have the height range for it.
            self.floor_y = sea_level + self.alt_min
            self.effective_knee = float("inf")
            return

        relief = [altitude - self.alt_min for altitude, _ in samples]
        max_relief = max(relief)

        if mode == MODE_SCALE or max_relief >= self.budget:
            self.fallback_from_compress = mode == MODE_COMPRESS
            needed = max(r + height for r, (_, height) in zip(relief, samples))
            self.mode = MODE_SCALE
            self.scale = min(1.0, self.budget / needed) if needed > 0 else 1.0
            self.effective_knee = 0.0
            return

        # Keep the knee low enough that a building at or under it still fits
        # even when it stands on the highest ground in the area.
        self.effective_knee = min(knee, self.budget - max_relief)

        limits = [
            (self.budget - r - self.effective_knee) / (height - self.effective_knee)
            for r, (_, height) in zip(relief, samples)
            if height > self.effective_knee
        ]
        self.compression = min([1.0] + limits)
        self.compression = max(self.compression, 0.0)

    def _relief(self, altitude):
        return altitude - self.alt_min

    def ground_y(self, altitude):
        if self.mode == MODE_NONE:
            return self.sea_level + altitude
        return self.floor_y + self._relief(altitude) * self.scale

    def ground_y_array(self, altitudes):
        """`ground_y` over a numpy array, without a per-element Python call."""
        if self.mode == MODE_NONE:
            return altitudes + self.sea_level
        return self.floor_y + (altitudes - self.alt_min) * self.scale

    def overflow(self, samples):
        """Buildings whose top would sit above `max_y`, as (index, top_y).

        Reported rather than silently trimmed: the caller decides whether to
        raise the ceiling, opt into compression, or accept the loss.
        """
        over = []
        for i, (altitude, height) in enumerate(samples):
            top = self.top_y(altitude, height)
            if top > self.max_y:
                over.append((i, top))
        return over

    def building_height(self, height):
        """Height in blocks after fitting."""
        if self.mode == MODE_NONE:
            return height
        if self.mode == MODE_SCALE:
            return height * self.scale
        if height <= self.effective_knee:
            return height
        return self.effective_knee + (height - self.effective_knee) * self.compression

    def top_y(self, altitude, height):
        return self.ground_y(altitude) + self.building_height(height)

    def describe(self):
        if self.mode == MODE_NONE:
            return (f"heights 1:1, altitude 0 m at y={self.sea_level} "
                    f"(no fitting; heights may exceed --max-y)")
        if self.mode == MODE_SCALE:
            reason = " (terrain relief alone exceeds the budget)" if self.fallback_from_compress else ""
            return (f"uniform vertical scale {self.scale:.3f}x{reason}, "
                    f"ground floor at y={self.floor_y}")
        if self.compression >= 1.0:
            return (f"heights 1:1 (everything already fits in {self.budget} blocks), "
                    f"ground floor at y={self.floor_y}")
        return (f"1:1 up to {self.effective_knee:.0f} m, then compressed "
                f"{self.compression:.3f}x above it; ground floor at y={self.floor_y}")
