"""Reproduce the bundled public-domain text from the explicitly supplied archive.

Download https://ebible.org/Scriptures/russyn_vpl.zip separately; no executable
code is loaded from the archive. Text only, no commentary, markup or client data.
"""
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
archive = Path(sys.argv[1])
codes = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SOL ISA JER LAM EZE DAN HOS JOE AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL MAT MAR LUK JOH ACT ROM 1CO 2CO GAL EPH PHI COL 1TH 2TH 1TI 2TI TIT PHM HEB JAM 1PE 2PE 1JO 2JO 3JO JUD REV'.split()
catalogue = re.findall(r'\{(\d+), "([^"]+)", (\d+)\}', (root/'internal/app/reading_catalog.go').read_text(encoding='utf-8'))
assert len(catalogue) == len(codes) == 66
books = {code: {} for code in codes}
with zipfile.ZipFile(archive) as z:
    text = z.read('russyn_vpl.txt').decode('utf-8-sig')
    for line in text.splitlines():
        match = re.fullmatch(r'([A-Z0-9]{3}) (\d+):(\d+) (.+)', line)
        assert match, line[:40]
        code, chapter, verse, body = match.groups()
        verses = books[code].setdefault(int(chapter), [])
        assert not verses or int(verse) > verses[-1]['verse']
        verses.append({'verse': int(verse), 'text': body})
output = root/'web/vendor/synodal'
output.mkdir(exist_ok=True)
for code, (book_id, name, count) in zip(codes, catalogue):
    chapters = books[code]
    assert set(chapters) == set(range(1, int(count)+1)), (code, len(chapters), count)
    data = {'bookId': int(book_id), 'name': name, 'translation': 'Синодальный перевод', 'source': 'https://ebible.org/russyn/', 'chapters': [chapters[i] for i in range(1, int(count)+1)]}
    (output/(book_id+'.json')).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8', newline='\n')
(output/'SOURCE.md').write_text('# Синодальный перевод\n\nИсточник: https://ebible.org/Scriptures/russyn_vpl.zip\n\nPublic Domain: https://ebible.org/russyn/copyright.htm\n\nArchive SHA256: '+hashlib.sha256(archive.read_bytes()).hexdigest()+'\n\nПолучено 08.09.2026. Только текст стихов, без введений и комментариев. Преобразование: deploy/import-synodal-text.py. Сопоставление всех 66 книг и числа глав проверяется по постоянному каталогу платформы. Личные отметки и данные сюда не включаются.\n', encoding='utf-8', newline='\n')
print('Imported', len(books), 'books;', sum(len(c) for b in books.values() for c in b.values()), 'verses')
