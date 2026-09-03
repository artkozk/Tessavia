#!/usr/bin/env python3
"""Build native SVG assets from the user's approved Tessavie reference.

Requires opencv-python and numpy only when rebuilding the wordmark contours.
The supplied PNG is read unchanged; no replacement font or generated artwork is used.
"""
from pathlib import Path
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / 'web/brand'
reference = cv2.imread(str(ROOT / 'docs/design/tessavie-windows-reference.png'))
assert reference is not None and reference.shape == (1086, 1448, 3)
b, g, r = cv2.split(reference)
_, x = np.indices(r.shape)
ink = ((x > 550) & (r < 100) & (g < 100) & (b < 100)).astype('uint8')
contours, hierarchy = cv2.findContours(ink, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
outlines = []
letters = 0
for index, contour in enumerate(contours):
    if cv2.contourArea(contour) < 10:
        continue
    letters += int(hierarchy[0, index, 3] == -1)
    points = cv2.approxPolyDP(contour, 0.55, True).reshape(-1, 2)
    outlines.append('M' + ' '.join(f'{px},{py}' for px, py in points) + 'Z')
assert letters == 9, 'Expected eight original letters and the dot above i'
wordmark = ' '.join(outlines)

# The latest reference uses three windows; its rear frames stop before the
# next window. These intentional gaps preserve the supplied overlap geometry.
mark = '''<g fill="none" stroke-width="9.5" stroke-linejoin="round">
    <path d="M238.5 596.5h-27a19.5 19.5 0 0 1-19.5-19.5V414.5a20 20 0 0 1 20-20h196a20 20 0 0 1 20 20v21" stroke="#8a9c96"/>
    <path d="M294.5 644h-23a20 20 0 0 1-20-20V467.5a20 20 0 0 1 20-20h184a20 20 0 0 1 20 20v21" stroke="#79b3a6"/>
    <rect x="307" y="500.5" width="216" height="184" rx="20" stroke="#094f40"/>
  </g>
  <g fill="#8a9c96"><circle cx="222.5" cy="422.5" r="6.7"/><circle cx="249" cy="422.5" r="6.7"/></g>
  <g fill="#79b3a6"><circle cx="281.5" cy="475.5" r="6.7"/><circle cx="307.5" cy="475.5" r="6.7"/></g>
  <g fill="#094f40"><circle cx="337.8" cy="528.8" r="6.7"/><circle cx="364" cy="528.8" r="6.7"/></g>
  <rect x="331.5" y="568" width="38" height="71" rx="7.5" fill="#89bfb1"/>
  <g fill="none" stroke-width="13.5" stroke-linecap="round">
    <path d="M393 574.8h91.5" stroke="#859b94"/>
    <path d="M393 603.8h91.5" stroke="#c4d1cb"/>
    <path d="M393 632.8h53" stroke="#d6dfda"/>
  </g>'''

for suffix, color in [('', '#1d242c'), ('-light', '#eef2ef')]:
    # On the dark sidebar, keep the foreground window light like the reference
    # so its original dark-green outline remains visible without recoloring it.
    variant_mark = mark.replace('height="184" rx="20"', 'height="184" rx="20" fill="#faf9f5"') if suffix else mark
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="182 385 1098 309">
  {variant_mark}
  <path fill="{color}" fill-rule="evenodd" d="{wordmark}"/>
</svg>
'''
    (BRAND / f'tessavie-logo{suffix}.svg').write_text(svg, encoding='utf-8')

# A light tile keeps both original mark colors readable in browser tabs.
icon = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="44" fill="#faf9f5"/>
  <g transform="translate(-86.5 -195.7) scale(.6)">{mark}</g>
</svg>
'''
(BRAND / 'tessavie-mark.svg').write_text(icon, encoding='utf-8')
print('Built Tessavie SVGs with the original wordmark contours')
