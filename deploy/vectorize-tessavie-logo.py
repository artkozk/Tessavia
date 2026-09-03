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
reference = cv2.imread(str(ROOT / 'docs/design/tessavie-linked-reference.png'))
assert reference is not None and reference.shape == (941, 1672, 3)
b, g, r = cv2.split(reference)
y, x = np.indices(r.shape)
ink = ((x > 600) & (r < 100) & (g < 100) & (b < 100)
    & ~((x > 1240) & (y < 440))).astype('uint8')
contours, hierarchy = cv2.findContours(ink, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
outlines = []
letters = 0
for index, contour in enumerate(contours):
    if cv2.contourArea(contour) < 10:
        continue
    letters += int(hierarchy[0, index, 3] == -1)
    points = cv2.approxPolyDP(contour, 0.55, True).reshape(-1, 2)
    outlines.append('M' + ' '.join(f'{px},{py}' for px, py in points) + 'Z')
assert letters == 8, 'Expected the eight original letters; the green dot is separate'
wordmark = ' '.join(outlines)

# Native paths follow the slanted frames, open ends and connecting node in
# the latest reference. Gradients are limited to the two original green joins.
def mark(color):
    return f'''<defs>
    <linearGradient id="front-join" gradientUnits="userSpaceOnUse" x1="449" y1="423" x2="468" y2="423"><stop stop-color="#1d634f"/><stop offset="1" stop-color="{color}"/></linearGradient>
    <linearGradient id="back-join" gradientUnits="userSpaceOnUse" x1="399" y1="515" x2="435" y2="515"><stop stop-color="{color}"/><stop offset="1" stop-color="#1d634f"/></linearGradient>
  </defs>
  <g fill="none" stroke="{color}" stroke-width="17" stroke-linejoin="round">
    <path d="M470.5 401 473 383c1.3-11.7-7.4-20.5-19-20.5H352c-12 0-20.5 9-22.1 21L316.1 495.5c-1.6 11 6 19.5 17.4 19.5H407c12 0 21-5.5 27-13"/>
    <path d="M392.5 537l-1.7 15.5c-2 16 5.2 27 19.2 27H519c12 0 20.8-7.8 23.3-21l19.9-116.5c1.8-11.5-5-19.5-17.4-19.5H433.5c-11.7 0-21.5 7.9-23.5 19.5l-8 51"/>
    <path d="M399 515h8c12 0 21-5.5 27-13" stroke="url(#back-join)"/>
    <path d="M402 493l8-51c2-11.6 11.8-19.5 23.5-19.5H468" stroke="url(#front-join)"/>
  </g>
  <circle cx="453.5" cy="500" r="26" fill="#1d634f"/>'''

for suffix, color in [('', '#2d2f33'), ('-light', '#eef2ef')]:
    # Only the graphite strokes/letters become light on the existing dark menu.
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="300 346 1098 252">
  {mark(color)}
  <path fill="{color}" fill-rule="evenodd" d="{wordmark}"/>
  <circle cx="1263.5" cy="423" r="14.5" fill="#1d634f"/>
</svg>
'''
    (BRAND / f'tessavie-logo{suffix}.svg').write_text(svg, encoding='utf-8')

# A light tile keeps both original mark colors readable in browser tabs.
icon = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="44" fill="#faf9f5"/>
  <g transform="translate(-201.25 -225.25) scale(.75)">{mark('#2d2f33')}</g>
</svg>
'''
(BRAND / 'tessavie-mark.svg').write_text(icon, encoding='utf-8')
print('Built Tessavie SVGs with the original wordmark contours')
