'use client';
// Resize, watermark and compress photos in the browser before upload.
const GRANDE = 1600, PEQUENA = 720;

let marca;
function carregarMarca() {
  if (!marca) marca = new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = '/marca/marca-dagua.png'; });
  return marca;
}

async function abrir(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {}
  }
  return await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('Formato de imagem não suportado')); i.src = URL.createObjectURL(file); });
}

function redimensionar(fonte, lado) {
  const w = fonte.width, h = fonte.height, k = Math.min(1, lado / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fonte, 0, 0, c.width, c.height);
  return c;
}

function retanguloArredondado(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

async function aplicarMarca(c, modo) {
  if (modo === 'nenhuma') return;
  const m = await carregarMarca();
  const ctx = c.getContext('2d');
  const base = Math.min(c.width, c.height * 1.1);
  if (modo === 'faixa') {
    // Dark plate centered, used to cover a partner's watermark
    const bw = base * 0.62, bh = bw * 0.25, x = (c.width - bw) / 2, y = (c.height - bh) / 2;
    ctx.save(); ctx.fillStyle = 'rgba(48,48,48,.86)'; retanguloArredondado(ctx, x, y, bw, bh, bh * 0.16); ctx.fill(); ctx.restore();
    const mw = bw * 0.78, mh = mw * (m.height / m.width);
    ctx.drawImage(m, (c.width - mw) / 2, (c.height - mh) / 2, mw, mh);
  } else {
    const mw = base * 0.46, mh = mw * (m.height / m.width);
    ctx.save(); ctx.globalAlpha = 0.6; ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = mw * 0.02;
    ctx.drawImage(m, (c.width - mw) / 2, (c.height - mh) / 2, mw, mh); ctx.restore();
  }
}

function blob(c) {
  return new Promise((ok) => c.toBlob((b) => {
    if (b && b.type === 'image/webp') return ok({ b, ext: 'webp' });
    c.toBlob((j) => ok({ b: j, ext: 'jpg' }), 'image/jpeg', 0.86); // Safari without WebP encoding
  }, 'image/webp', 0.82));
}

export async function processarFoto(file, modo = 'discreta') {
  const fonte = await abrir(file);
  const g = redimensionar(fonte, GRANDE);
  await aplicarMarca(g, modo);
  const p = redimensionar(g, PEQUENA);
  const grande = await blob(g);
  // Thumbnail always in the same format as the full photo (site derives its name: 01.webp -> 01-p.webp)
  const pequena = grande.ext === 'webp' ? await blob(p) : { b: await new Promise((ok) => p.toBlob(ok, 'image/jpeg', 0.84)), ext: 'jpg' };
  if (pequena.ext !== grande.ext) pequena.b = await new Promise((ok) => p.toBlob(ok, 'image/jpeg', 0.84));
  return { grande: grande.b, pequena: pequena.b, ext: grande.ext, largura: g.width, altura: g.height };
}
