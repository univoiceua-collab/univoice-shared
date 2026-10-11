"""Збирає univoice-en.js — словник вимови англійських слів для вербалізатора.

Джерела (лише для збирання, у файл потрапляє стиснутий результат):
  - CMU Pronouncing Dictionary (cmudict.dict), ліцензія BSD: https://github.com/cmusphinx/cmudict
  - wordfreq (частотність слів), щоб узяти лише вживані слова.
Запуск: python3 tools/build_english.py шлях/до/cmudict.dict
"""
import sys
from wordfreq import zipf_frequency

MIN_ZIPF = 2.5  # слова, які трапляються хоча б ~3 рази на 10 млн слів

VOWELS = 'AA AE AH AO AW AY EH ER EY IH IY OW OY UH UW'.split()
CONSONANTS = 'B CH D DH F G HH JH K L M N NG P R S SH T TH V W Y Z ZH'.split()
STRESSED = 'ABCDEFGHIJKLMNO'
UNSTRESSED = 'abcdefghijklmno'
CONS_CODES = 'PQRSTUVWXYZpqrstuvwxyz01'


def encode(phones):
    out = []
    for p in phones:
        base, stress = p.rstrip('012'), p[len(p.rstrip('012')):]
        if base in VOWELS:
            i = VOWELS.index(base)
            out.append(UNSTRESSED[i] if stress == '0' else STRESSED[i])
        else:
            out.append(CONS_CODES[CONSONANTS.index(base)])
    return ''.join(out)


def main(path):
    entries = {}
    for line in open(path, encoding='utf-8'):
        parts = line.split('#')[0].split()
        if not parts or '(' in parts[0]:
            continue  # лише перший (основний) варіант вимови
        word = parts[0]
        if not word.isalpha() or not word.isascii() or word in entries:
            continue
        if zipf_frequency(word, 'en') < MIN_ZIPF:
            continue
        entries[word] = encode(parts[1:])
    data = '|'.join(f'{w} {p}' for w, p in sorted(entries.items()))
    header = open(__file__.replace('build_english.py', 'english_header.txt'), encoding='utf-8').read()
    with open('univoice-en.js', 'w', encoding='utf-8') as f:
        f.write(header)
        f.write("(function (root) {\n    'use strict';\n")
        f.write(f"    const data = '{data}';\n")
        f.write("    if (typeof module !== 'undefined' && module.exports) module.exports = { data };\n")
        f.write("    else root.UnivoiceEnglish = { data };\n")
        f.write("})(typeof window !== 'undefined' ? window : this);\n")
    print(len(entries), 'слів')


if __name__ == '__main__':
    main(sys.argv[1])
