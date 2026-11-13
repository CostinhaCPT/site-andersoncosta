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

// Realce automático (o mesmo das fotos da Domus): níveis automáticos, clareia meios-tons até brilho ~150
// sem nunca escurecer, segura o céu e dá +12% de cor e +4% de contraste. Roda antes da marca d'água.
function realcar(c) {
  const ctx = c.getContext('2d');
  const dados = ctx.getImageData(0, 0, c.width, c.height), px = dados.data, n = px.length / 4;
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) hist[(px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8]++;
  const corte = n * 0.005;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > corte) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > corte) { hi = v; break; } }
  if (hi < lo + 60) hi = Math.min(255, lo + 60);
  const k = 255 / (hi - lo);
  let media = 0;
  for (let v = 0; v < 256; v++) media += hist[v] * Math.min(255, Math.max(0, (v - lo) * k));
  media = media / n / 255;
  const g = media > 0.02 ? Math.min(1, Math.max(0.55, Math.log(150 / 255) / Math.log(media))) : 1;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    let x = Math.min(1, Math.max(0, ((v - lo) * k) / 255));
    x = Math.pow(x, g);
    x = x - 0.08 * Math.max(0, x - 0.8) ** 2;
    x = 0.5 + (x - 0.5) * 1.04;
    lut[v] = Math.round(Math.min(1, Math.max(0, x)) * 255);
  }
  for (let i = 0; i < px.length; i += 4) {
    const r = lut[px[i]], gg = lut[px[i + 1]], b = lut[px[i + 2]];
    const l = 0.299 * r + 0.587 * gg + 0.114 * b;
    px[i] = l + (r - l) * 1.12; px[i + 1] = l + (gg - l) * 1.12; px[i + 2] = l + (b - l) * 1.12;
  }
  ctx.putImageData(dados, 0, 0);
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

export async function processarFoto(file, modo = 'discreta', realce = true) {
  const fonte = await abrir(file);
  const g = redimensionar(fonte, GRANDE);
  if (realce) { try { realcar(g); } catch (e) { /* canvas bloqueado: segue sem realce */ } }
  await aplicarMarca(g, modo);
  const p = redimensionar(g, PEQUENA);
  const grande = await blob(g);
  // Thumbnail always in the same format as the full photo (site derives its name: 01.webp -> 01-p.webp)
  const pequena = grande.ext === 'webp' ? await blob(p) : { b: await new Promise((ok) => p.toBlob(ok, 'image/jpeg', 0.84)), ext: 'jpg' };
  if (pequena.ext !== grande.ext) pequena.b = await new Promise((ok) => p.toBlob(ok, 'image/jpeg', 0.84));
  return { grande: grande.b, pequena: pequena.b, ext: grande.ext, largura: g.width, altura: g.height };
}
