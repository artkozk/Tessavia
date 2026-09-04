"""Rebuild the local Unicode/CLDR catalog from pinned, hash-verified sources."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', type=Path, default=ROOT / '.artifacts/emoji-sources')
args = parser.parse_args()
args.source_dir.mkdir(parents=True, exist_ok=True)
manifest = json.loads(Path(__file__).with_name('sources.json').read_text())
for source in manifest:
    path = args.source_dir / source['file']
    if not path.exists():
        path.write_bytes(urllib.request.urlopen(source['url'], timeout=60).read())
    if hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
        raise SystemExit(f"Source checksum mismatch: {source['file']}")

def key(value):
    return value.replace('\ufe0f', '')

labels = {}
for lang in ('ru', 'en'):
    labels[lang] = {}
    for prefix in ('annotations', 'annotationsDerived'):
        for node in ET.parse(args.source_dir / f'{prefix}-{lang}.xml').iter('annotation'):
            entry = labels[lang].setdefault(key(node.attrib['cp']), {})
            entry['name' if node.get('type') == 'tts' else 'keywords'] = node.text or ''

groups = ['Смайлы и эмоции', 'Люди и жесты', 'Животные и природа', 'Еда и напитки',
          'Путешествия и места', 'Занятия и спорт', 'Предметы', 'Символы', 'Флаги']
group_ids = {}
items = []
for line in (args.source_dir / 'emoji-test.txt').read_text(encoding='utf-8').splitlines():
    if line.startswith('# group:'):
        group = line.split(':', 1)[1].strip()
        if group != 'Component':
            group_ids.setdefault(group, len(group_ids))
    match = re.match(r'^([0-9A-F ]+)\s*; fully-qualified\s*# \S+ E[\d.]+ (.+)$', line)
    if not match or group == 'Component':
        continue
    value = ''.join(chr(int(code, 16)) for code in match[1].split())
    ru, en = labels['ru'].get(key(value), {}), labels['en'].get(key(value), {})
    items.append([value, ru.get('name', match[2]), en.get('name', match[2]),
                  ' '.join(dict.fromkeys((ru.get('keywords', '') + ' ' + en.get('keywords', '')).split(' | '))),
                  group_ids[group], value])

bases = {key(row[0]): row[0] for row in items}
for row in items:
    stripped = key(''.join(ch for ch in row[0] if not 0x1F3FB <= ord(ch) <= 0x1F3FF))
    # Two-color handshake uses a different ZWJ skeleton from the neutral glyph.
    row[5] = bases.get(stripped, '🤝' if stripped == '🫱\u200d🫲' else row[0])

(ROOT / 'web/vendor/emoji-17.0-cldr48.2.json').write_text(json.dumps(
    {'version': 'Unicode 17.0 / CLDR 48.2', 'groups': groups, 'items': items},
    ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8', newline='\n')
(ROOT / 'web/vendor/UNICODE-LICENSE.txt').write_bytes((args.source_dir / 'LICENSE.txt').read_bytes())
(ROOT / 'internal/emoji/sequences.txt').write_text(''.join(row[0] + '\n' for row in items), encoding='utf-8', newline='\n')
print(f'{len(items)} sequences, {len(set(row[5] for row in items))} base choices, {len(group_ids)} groups')
