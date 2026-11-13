"""Prepara fotos de imóveis próprios/parceiros (AC-*) para o site: realce de luz e cor + selo Anderson Costa.

Uso: python3 scripts/selar_fotos.py <pasta_com_fotos_originais> <codigo, ex. AC-0031>
Gera public/fotos/<codigo>/NN.webp (lado maior 1600 px) e NN-p.webp (miniatura 720 px).
O realce é o mesmo da sincronização da Domus e do envio pelo admin (aprovado em 12/11/2026).
"""
import glob, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SELO = Image.open(os.path.join(RAIZ, 'public/marca/selo-wordmark.png')).convert('RGBA')


def realcar(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    lum = (a[..., 0] * 77 + a[..., 1] * 150 + a[..., 2] * 29) / 256
    lo, hi = np.percentile(lum, 0.5), np.percentile(lum, 99.5)
    hi = max(hi, lo + 60)
    x = np.clip((a - lo) / (hi - lo), 0, 1)
    media = np.clip((lum - lo) / (hi - lo), 0, 1).mean()
    g = min(1.0, max(0.55, np.log(150 / 255) / np.log(media))) if media > 0.02 else 1.0  # só clareia
    x = x ** g
    x = x - 0.08 * np.maximum(0, x - 0.8) ** 2          # segura o céu
    x = np.clip(0.5 + (x - 0.5) * 1.04, 0, 1) * 255     # +4% de contraste
    l = (0.299 * x[..., 0] + 0.587 * x[..., 1] + 0.114 * x[..., 2])[..., None]
    x = l + (x - l) * 1.12                               # +12% de cor
    return Image.fromarray(np.clip(x, 0, 255).astype(np.uint8))


def selar(im):
    W, H = im.size
    S = min(W, H); bw = round(0.36 * S); bh = round(bw / 2.5); x = (W - bw) // 2; y = (H - bh) // 2
    vidro = im.crop((x, y, x + bw, y + bh)).filter(ImageFilter.GaussianBlur(max(6, bh / 9) * 1.2)).convert('RGBA')
    vidro = Image.alpha_composite(vidro, Image.new('RGBA', (bw, bh), (12, 12, 12, 120)))
    mask = Image.new('L', (bw, bh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, bw - 1, bh - 1), radius=round(bh * 0.22), fill=255)
    im.paste(vidro.convert('RGB'), (x, y), mask)
    mw = round(bw * 0.74); m = SELO.resize((mw, round(SELO.height * mw / SELO.width)), Image.LANCZOS)
    im.paste(m, ((W - m.width) // 2, (H - m.height) // 2), m)
    return im


def main(origem, codigo):
    destino = os.path.join(RAIZ, 'public/fotos', codigo.lower())
    os.makedirs(destino, exist_ok=True)
    fotos = sorted(f for f in glob.glob(os.path.join(origem, '*')) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')))
    for i, f in enumerate(fotos, 1):
        im = Image.open(f).convert('RGB')
        k = 1600 / max(im.size)
        if k < 1: im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        im = selar(realcar(im))
        im.save(os.path.join(destino, f'{i:02d}.webp'), 'WEBP', quality=80)
        t = 720 / max(im.size)
        im.resize((round(im.width * t), round(im.height * t)), Image.LANCZOS).save(os.path.join(destino, f'{i:02d}-p.webp'), 'WEBP', quality=78)
    print(codigo, len(fotos), 'fotos')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
