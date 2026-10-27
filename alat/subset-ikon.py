#!/usr/bin/env python3
"""chemint · subset Font Awesome (v2.62)

Membuat ikon/fa-subset.css + ikon/fa-*-subset.woff2 yang HANYA berisi ikon
yang benar-benar dipakai chemint (dipindai dari app.js, meja.js, panggung.js,
showreel.js, index.html, gaya.css). Ganti CDN cdnjs font-awesome/all.min.css
(±100 KB CSS + ±300 KB fon) dengan berkas swa-saji yang ikut cache service worker.

Jalankan ulang SETIAP kali menambah ikon baru (uji/uji-v262.cjs akan gagal
bila ada ikon dipakai tetapi belum masuk subset):

  npm i --no-save @fortawesome/fontawesome-free@6.5.1
  pip install fonttools brotli
  python3 alat/subset-ikon.py
"""
import os, re, sys, json
from fontTools import subset

AKAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FA = os.path.join(AKAR, 'node_modules', '@fortawesome', 'fontawesome-free')
SUMBER = ['app.js', 'meja.js', 'panggung.js', 'showreel.js', 'index.html', 'gaya.css']
# Nama kelas yang dibentuk dari potongan string:
#   app.js  fa-${… ? 'compress' : 'expand'}   ·   fa-arrow-trend-${naik ? 'up' : 'down'}
TAMBAHAN = ['fa-compress', 'fa-expand', 'fa-arrow-trend-up', 'fa-arrow-trend-down']

def main():
    if not os.path.isdir(FA):
        sys.exit('Pasang dulu: npm i --no-save @fortawesome/fontawesome-free@6.5.1')
    teks = ''.join(open(os.path.join(AKAR, f), encoding='utf8').read() for f in SUMBER if os.path.exists(os.path.join(AKAR, f)))
    dipakai = set(re.findall(r'(?<![\w-])fa-[a-z0-9]+(?:-[a-z0-9]+)*', teks)) | set(TAMBAHAN)

    css = open(os.path.join(FA, 'css', 'all.css'), encoding='utf8').read()
    # Aturan ikon: ".fa-a::before, .fa-b::before { content: "\f00c"; }"
    aturan_ikon = list(re.finditer(r'((?:\.fa-[a-z0-9-]+::?before,?\s*)+)\{\s*content:\s*"\\([0-9a-f]+)";\s*\}', css))
    peta = {}   # nama → kode
    for m in aturan_ikon:
        for n in re.findall(r'\.(fa-[a-z0-9-]+)::?before', m.group(1)):
            peta[n] = m.group(2)
    ikon = sorted(n for n in dipakai if n in peta)

    # Kerangka (bukan aturan ikon): kelas dasar, ukuran, animasi, @font-face.
    kerangka = css
    for m in reversed(aturan_ikon):
        kerangka = kerangka[:m.start()] + kerangka[m.end():]
    # Buang @font-face v4-shim & fon lama; arahkan url ke subset.
    kerangka = re.sub(r'@font-face\s*\{[^}]*fa-v4compatibility[^}]*\}', '', kerangka)
    kerangka = kerangka.replace('../webfonts/fa-solid-900.woff2', 'fa-solid-subset.woff2') \
                       .replace('../webfonts/fa-regular-400.woff2', 'fa-regular-subset.woff2') \
                       .replace('../webfonts/fa-brands-400.woff2', 'fa-brands-subset.woff2')
    kerangka = re.sub(r',\s*url\("\.\./webfonts/[^"]+\.ttf"\)\s*format\("truetype"\)', '', kerangka)
    # Utilitas FA yang tidak dipakai chemint (rotate, flip, stack, beat…) dibiarkan:
    # ukurannya kecil dan tidak memengaruhi gaya halaman.
    kode = sorted({peta[n] for n in ikon})
    baris = [f'.{n}::before{{content:"\\{peta[n]}"}}' for n in ikon]
    kepala = ('/* chemint · Font Awesome Free 6.5.1 — SUBSET (alat/subset-ikon.py)\n'
              ' * Lisensi ikon CC BY 4.0, fon SIL OFL 1.1, kode MIT — https://fontawesome.com/license/free\n'
              f' * {len(ikon)} ikon. Jangan diedit manual; jalankan ulang skripnya. */\n')
    keluar = os.path.join(AKAR, 'ikon')
    os.makedirs(keluar, exist_ok=True)
    open(os.path.join(keluar, 'fa-subset.css'), 'w', encoding='utf8').write(kepala + kerangka.strip() + '\n' + '\n'.join(baris) + '\n')

    for gaya, berkas in [('solid', 'fa-solid-900'), ('regular', 'fa-regular-400'), ('brands', 'fa-brands-400')]:
        o = subset.Options(); o.flavor = 'woff2'; o.layout_features = ['*']; o.notdef_outline = True
        f = subset.load_font(os.path.join(FA, 'webfonts', berkas + '.ttf'), o)
        cm = f.getBestCmap() or {}
        kode_ada = [int(k, 16) for k in kode if int(k, 16) in cm]
        s = subset.Subsetter(o); s.populate(unicodes=kode_ada); s.subset(f)
        subset.save_font(f, os.path.join(keluar, f'fa-{gaya}-subset.woff2'), o)

    tak_dikenal = sorted(n for n in dipakai - set(peta) if (n + '-${') not in teks
                         if not re.match(r'fa-(subset|solid|regular|brands|spin|fw|lg|xs|sm|[0-9]+x|rotate|flip|beat|fade|shake|bounce|pulse|stack|border|pull|li|ul|inverse|sharp|classic|duotone|layers)', n))
    json.dump({'ikon': ikon, 'tak_dikenal': tak_dikenal}, open(os.path.join(keluar, 'daftar.json'), 'w'), indent=1)
    print(f'{len(ikon)} ikon · {len(kode)} glif → ikon/')
    if tak_dikenal: print('Nama fa-* yang tidak dikenal FA 6.5.1 (sudah kosong sejak dulu):', ', '.join(tak_dikenal))

if __name__ == '__main__':
    main()
