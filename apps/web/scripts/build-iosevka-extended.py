"""Build src/fonts/iosevka-extended-*.woff2 from an Iosevka release .ttc.

Usage:
    python3 scripts/build-iosevka-extended.py ~/Library/Fonts/Iosevka.ttc src/fonts

Needs fonttools and brotli, which are not project dependencies — this is run by
hand when the font is added or moved to a newer release, not by the build:

    python3 -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools brotli

The two italic faces it writes are deleted afterwards. Nothing in this app sets
code in italics and each is 1.8 MB; they are built here so that the day
something does, the file is one command away.

No npm package ships Iosevka Extended — fontsource has the default width only,
and Extended is a width variant rather than a weight. The upstream webfont
package is 255 MB because it carries every width, weight and style; this takes
the four faces the app uses out of the standard release collection instead.

The collection holds 324 faces, so it is read twice: once lazily to find the
four by name, then once per face to load and convert it. Loading all of them at
once is enough to be killed for it.
"""

import sys
from pathlib import Path

from fontTools.ttLib import TTCollection, TTFont

# Family and subfamily exactly as the release names them.
WANTED = {
    ("Iosevka Extended", "Regular"): "iosevka-extended-400-normal",
    ("Iosevka Extended", "Italic"): "iosevka-extended-400-italic",
    ("Iosevka Extended", "Bold"): "iosevka-extended-700-normal",
    ("Iosevka Extended", "Bold Italic"): "iosevka-extended-700-italic",
}

source = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

indices = {}
version = None

with TTCollection(str(source), lazy=True) as collection:
    for index, font in enumerate(collection.fonts):
        names = font["name"]
        # Name IDs 1/2, not the typographic 16/17. Iosevka puts the width in
        # the four-style family — ID 1 is "Iosevka Extended" and ID 2 is
        # "Regular" — while ID 16/17 split it the other way, as "Iosevka" and
        # "Extended". Only ID 1 carries the name CSS has to ask for.
        key = (names.getDebugName(1), names.getDebugName(2))
        if key in WANTED and key not in indices:
            indices[key] = index
            version = version or names.getDebugName(5)

missing = set(WANTED) - set(indices)
if missing:
    sys.exit(f"not in the collection: {sorted(missing)}")

for key, index in sorted(indices.items(), key=lambda item: WANTED[item[0]]):
    font = TTFont(str(source), fontNumber=index)
    font.flavor = "woff2"
    path = out / f"{WANTED[key]}.woff2"
    font.save(str(path))
    font.close()
    print(f"{path.name:36} {path.stat().st_size / 1024:7.1f} KB   {key[0]} {key[1]}")

print("version:", version)
