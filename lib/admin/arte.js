'use client';
// Desenho das peças no padrão do Instagram do Anderson (@o.anderson.costa):
// capa com logo empilhado no topo, rótulo + preço, bairro grande em fonte condensada e ficha com ícones de linha;
// fotos do meio limpas; último slide escurecido com símbolo, cidade, bairro e "Entre em contato / e saiba mais."
// Usado pelo Estúdio (imagens) e pelo editor de Reels (capa e encerramento do vídeo).

// Fontes servidas pelo próprio site (funcionam offline no app e não dependem do Google)
const FONTES = [
  ['Barlow Condensed', 700, 'barlow-condensed-latin-700-normal'], ['Barlow', 300, 'barlow-latin-300-normal'],
  ['Barlow', 400, 'barlow-latin-400-normal'], ['Barlow', 700, 'barlow-latin-700-normal'], ['Montserrat', 400, 'montserrat-latin-400-normal'],
];
let fontesProntas = null;
export function carregarFontes() {
  if (fontesProntas) return fontesProntas;
  fontesProntas = Promise.all(FONTES.map(([fam, peso, arq]) => {
    const f = new FontFace(fam, `url(/fontes/${arq}.woff2)`, { weight: String(peso) });
    return f.load().then((ok) => document.fonts.add(ok)).catch(() => {});
  }));
  return fontesProntas;
}

const cacheImg = new Map();
export function imagem(src) {
  if (!cacheImg.has(src)) cacheImg.set(src, new Promise((ok, erro) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = erro; i.src = src; }));
  return cacheImg.get(src);
}
export const absoluta = (u) => (/^(https?:|blob:|data:)/.test(u) ? u : `${window.location.origin}${u.startsWith('/') ? '' : '/'}${u}`);
export function cobrir(ctx, img, x, y, w, h, zoom = 1, dx = 0, dy = 0) {
  const iw0 = img.videoWidth || img.width, ih0 = img.videoHeight || img.height;
  const r = Math.max(w / iw0, h / ih0) * zoom, iw = iw0 * r, ih = ih0 * r;
  ctx.drawImage(img, x + (w - iw) / 2 + dx, y + (h - ih) / 2 + dy, iw, ih);
}
export function quebrar(ctx, texto, larg) {
  const linhas = []; let atual = '';
  for (const p of String(texto || '').split(/\s+/).filter(Boolean)) { const t = atual ? `${atual} ${p}` : p; if (ctx.measureText(t).width > larg && atual) { linhas.push(atual); atual = p; } else atual = t; }
  if (atual) linhas.push(atual);
  return linhas;
}
/** Texto com espaçamento entre letras (o canvas do Safari não tem letterSpacing). */
function espacado(ctx, texto, x, y, esp, alinhar = 'left') {
  const letras = [...String(texto)];
  const larg = letras.reduce((s, l) => s + ctx.measureText(l).width, 0) + esp * (letras.length - 1);
  let cx = alinhar === 'center' ? x - larg / 2 : alinhar === 'right' ? x - larg : x;
  const a = ctx.textAlign; ctx.textAlign = 'left';
  for (const l of letras) { ctx.fillText(l, cx, y); cx += ctx.measureText(l).width + esp; }
  ctx.textAlign = a;
  return larg;
}

// Ícones de linha (24x24), no estilo dos posts
const ICONES = {
  area: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9 16.5h6M9 16.5l1.5-1.5M9 16.5l1.5 1.5M15 16.5 13.5 15M15 16.5 13.5 18"/>',
  terreno: '<path d="M3 19h18"/><path d="M4 19l4-8 3 5 3-7 6 10"/><circle cx="17" cy="6" r="1.6"/>',
  dorm: '<path d="M3 18V8"/><path d="M3 13h18v5"/><path d="M21 13v-2a3 3 0 0 0-3-3h-6v5"/><circle cx="7.5" cy="10.5" r="1.8"/>',
  banho: '<path d="M4 12h16v2.5a4.5 4.5 0 0 1-4.5 4.5h-7A4.5 4.5 0 0 1 4 14.5z"/><path d="M6 12V6.5A2.5 2.5 0 0 1 8.5 4c1.2 0 2.1.8 2.4 1.9"/><path d="M9.5 6.5h3M7 19l-1 2M17 19l1 2"/>',
  ambientes: '<path d="M4 20V10.5L12 4l8 6.5V20z"/><path d="M8 20v-4.5a1.5 1.5 0 0 1 1.5-1.5h5a1.5 1.5 0 0 1 1.5 1.5V20"/><path d="M7 16.5V15M17 16.5V15M10 10.5h4"/>',
  vagas: '<path d="M5 16V12.5L7 8h10l2 4.5V16"/><path d="M4 16h16v2.5H4z"/><circle cx="7.5" cy="13.5" r=".8"/><circle cx="16.5" cy="13.5" r=".8"/>',
  destaque: '<path d="M4 20.5V9l6-4.5L16 9"/><path d="M9 20.5v-5h2"/><path d="M14 12.5l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.7 1.4.5-3-2.1-2.1 3-.4z"/>',
};
const cacheIcone = new Map();
function icone(nome) {
  if (!cacheIcone.has(nome)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${ICONES[nome] || ICONES.destaque}</svg>`;
    cacheIcone.set(nome, imagem(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`));
  }
  return cacheIcone.get(nome);
}

const dois = (n) => String(n).padStart(2, '0');
const m2 = (n) => `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}m²`;

/** Linhas da ficha da capa, no formato dos posts: "Área Construída: 141m²;" etc. Valores em negrito. */
export function fichaPadrao(im, textos = {}) {
  const l = [];
  const apto = /apart/i.test(im.tipo || '');
  if (im.area) l.push({ icone: 'area', rotulo: apto ? 'Área Privativa: ' : 'Área Construída: ', valor: `${m2(im.area)};` });
  if (im.terreno && !apto) l.push({ icone: 'terreno', rotulo: 'Terreno: ', valor: `${m2(im.terreno)};` });
  if (im.quartos) l.push({ icone: 'dorm', rotulo: 'Dormitórios: ', valor: `${dois(im.quartos)}${im.suites ? `, sendo ${im.suites} ${im.suites > 1 ? 'suítes' : 'suíte'}` : ''};` });
  if (im.banheiros) l.push({ icone: 'banho', rotulo: 'Banheiros: ', valor: `${dois(im.banheiros)};` });
  if (im.vagas && !textos.ambientes) l.push({ icone: 'vagas', rotulo: 'Vagas: ', valor: `${dois(im.vagas)};` });
  if (textos.ambientes) l.push({ icone: 'ambientes', rotulo: 'Ambientes: ', valor: textos.ambientes });
  if (textos.diferencial) l.push({ icone: 'destaque', rotulo: '', valor: textos.diferencial });
  return l;
}

/**
 * Capa (post 1080x1350 ou story/reel 1080x1920).
 * d: { im, foto (url), rotulo, titulo, preco, ficha: [...], legendaFoto? }
 * fundo: opcional, um <img>/<video>/<canvas> já pronto (o editor de Reels passa o quadro do vídeo)
 */
export async function desenharCapa(ctx, W, H, d, fundo, quadro = {}) {
  await carregarFontes();
  // quadro.semFoto: desenha só a camada de texto/degradê (o editor de Reels anima a foto por baixo)
  if (!quadro.semFoto) {
    const img = fundo || (d.foto ? await imagem(absoluta(d.foto)).catch(() => null) : null);
    ctx.fillStyle = '#0c0c0c'; ctx.fillRect(0, 0, W, H);
    if (img) cobrir(ctx, img, 0, 0, W, H, quadro.zoom || 1, quadro.dx || 0, quadro.dy || 0);
  }
  const vertical = H / W > 1.5;
  const opac = quadro.alfa ?? 1;
  ctx.save(); ctx.globalAlpha = opac;
  // leve escurecida em cima (logo) e degradê forte embaixo (texto)
  let g = ctx.createLinearGradient(0, 0, 0, H * 0.3); g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.3);
  const yTexto = vertical ? H * 0.56 : H * 0.6;
  g = ctx.createLinearGradient(0, yTexto - H * 0.12, 0, H); g.addColorStop(0, 'rgba(18,18,20,0)'); g.addColorStop(0.28, 'rgba(18,18,20,0.55)'); g.addColorStop(1, 'rgba(10,10,12,0.9)');
  ctx.fillStyle = g; ctx.fillRect(0, yTexto - H * 0.12, W, H);

  const logo = await imagem('/marca/anderson-costa-empilhado-branco.svg').catch(() => null);
  if (logo) { const lw = W * 0.22, lh = lw * logo.height / logo.width; ctx.drawImage(logo, (W - lw) / 2, vertical ? H * 0.1 : H * 0.125, lw, lh); }

  // marca d'água: símbolo grande e bem suave atrás da ficha
  const simb = await imagem('/marca/simbolo-branco.svg').catch(() => null);
  if (simb) { ctx.globalAlpha = 0.07 * opac; const sw = W * 0.34; ctx.drawImage(simb, (W - sw) / 2, yTexto + H * (vertical ? 0.08 : 0.12), sw, sw * simb.height / simb.width); ctx.globalAlpha = opac; }

  ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
  // título (bairro) condensado, ajusta o tamanho para caber em uma linha
  let tam = Math.round(W * 0.118);
  ctx.font = `700 ${tam}px "Barlow Condensed", "Arial Narrow", Helvetica, sans-serif`;
  const titulo = String(d.titulo || '').toUpperCase();
  while (ctx.measureText(titulo).width > W - 2 * W * 0.1 && tam > 40) { tam -= 4; ctx.font = `700 ${tam}px "Barlow Condensed", "Arial Narrow", Helvetica, sans-serif`; }
  const tw = Math.max(ctx.measureText(titulo).width, W * 0.56);
  ctx.textAlign = 'center'; ctx.fillText(titulo, W / 2, yTexto + tam * 0.98); ctx.textAlign = 'left';
  // rótulo à esquerda e preço à direita, alinhados às bordas do título (como nos posts)
  ctx.font = `400 ${Math.round(W * 0.029)}px Barlow, Helvetica, Arial, sans-serif`;
  if (d.rotulo) espacado(ctx, d.rotulo.toUpperCase(), W / 2 - tw / 2, yTexto, W * 0.0025);
  if (d.preco) espacado(ctx, d.preco, W / 2 + tw / 2, yTexto, W * 0.0015, 'right');

  // ficha com ícones
  const fs = Math.round(W * 0.0205), lh = fs * 1.62, ic = fs * 1.45;
  let y = yTexto + tam * 0.98 + fs * 2.4;
  const xi = W * 0.055, xt = xi + ic + fs * 0.55, largT = W - xt - W * 0.07;
  const yMax = vertical ? H * 0.86 : H - fs * 1.6;
  for (const item of d.ficha || []) {
    if (y > yMax) break;
    const ii = await icone(item.icone).catch(() => null);
    if (ii) ctx.drawImage(ii, xi, y - fs * 1.05, ic, ic);
    // rótulo leve + valor em negrito, quebrando linha no valor
    ctx.font = `300 ${fs}px Barlow, Helvetica, Arial, sans-serif`;
    const wr = item.rotulo ? ctx.measureText(item.rotulo).width : 0;
    if (item.rotulo) ctx.fillText(item.rotulo, xt, y);
    ctx.font = `700 ${fs}px Barlow, Helvetica, Arial, sans-serif`;
    const pal = String(item.valor || '').split(/\s+/); let linha = '', x0 = xt + wr, primeira = true;
    for (const p of pal) {
      const t = linha ? `${linha} ${p}` : p;
      if (ctx.measureText(t).width > largT - (primeira ? wr : 0) && linha) { ctx.fillText(linha, x0, y); y += lh; x0 = xt; linha = p; primeira = false; if (y > yMax) break; }
      else linha = t;
    }
    if (linha && y <= yMax) ctx.fillText(linha, x0, y);
    y += lh;
  }
  // CRECI discreto (obrigatório na publicidade do corretor)
  ctx.globalAlpha = 0.6 * opac; ctx.font = `400 ${Math.round(W * 0.0145)}px Barlow, Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'right'; ctx.fillText('CRECI SC 68594', W - W * 0.04, vertical ? H * 0.93 : H - W * 0.03); ctx.textAlign = 'left';
  ctx.restore();
}

/** Último slide / encerramento do vídeo. d: { im, foto, linha1, linha2 } */
export async function desenharFim(ctx, W, H, d, fundo, quadro = {}) {
  await carregarFontes();
  if (!quadro.semFoto) {
    const img = fundo || (d.foto ? await imagem(absoluta(d.foto)).catch(() => null) : null);
    ctx.fillStyle = '#0c0c0c'; ctx.fillRect(0, 0, W, H);
    if (img) cobrir(ctx, img, 0, 0, W, H, quadro.zoom || 1);
  }
  ctx.save(); ctx.globalAlpha = quadro.alfa ?? 1;
  ctx.fillStyle = 'rgba(12,12,14,0.5)'; ctx.fillRect(0, 0, W, H);
  const vertical = H / W > 1.5;
  const simb = await imagem('/marca/simbolo-branco.svg').catch(() => null);
  const y0 = vertical ? H * 0.2 : H * 0.15;
  if (simb) { const sw = W * 0.15; ctx.drawImage(simb, (W - sw) / 2, y0, sw, sw * simb.height / simb.width); }
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
  ctx.font = `400 ${Math.round(W * 0.03)}px Montserrat, Helvetica, Arial, sans-serif`;
  espacado(ctx, String(d.im?.cidade || 'Jaraguá do Sul').toUpperCase(), W / 2, y0 + W * 0.2, W * 0.006, 'center');
  ctx.font = `400 ${Math.round(W * 0.075)}px Montserrat, Helvetica, Arial, sans-serif`; ctx.textAlign = 'center';
  ctx.fillText(d.titulo || d.im?.bairro || '', W / 2, y0 + W * 0.29); ctx.textAlign = 'left';
  const yb = vertical ? H * 0.68 : H * 0.72;
  ctx.font = `400 ${Math.round(W * 0.03)}px Montserrat, Helvetica, Arial, sans-serif`;
  espacado(ctx, String(d.linha1 || 'Entre em contato').toUpperCase(), W / 2, yb, W * 0.006, 'center');
  ctx.font = `400 ${Math.round(W * 0.075)}px Montserrat, Helvetica, Arial, sans-serif`; ctx.textAlign = 'center';
  ctx.fillText(d.linha2 || 'e saiba mais.', W / 2, yb + W * 0.09);
  ctx.globalAlpha = 0.65 * (quadro.alfa ?? 1); ctx.font = `400 ${Math.round(W * 0.016)}px Barlow, Helvetica, Arial, sans-serif`;
  ctx.fillText('Anderson Costa · CRECI SC 68594', W / 2, vertical ? H * 0.93 : H - W * 0.04);
  ctx.textAlign = 'left'; ctx.restore();
}

/** Foto limpa (slides do meio), como nos posts. */
export async function desenharFoto(ctx, W, H, foto) {
  const img = foto ? await imagem(absoluta(foto)).catch(() => null) : null;
  ctx.fillStyle = '#0c0c0c'; ctx.fillRect(0, 0, W, H);
  if (img) cobrir(ctx, img, 0, 0, W, H);
}

/** Legenda curta sobre a foto/vídeo no Reels (camada transparente). */
export async function desenharLegendaCena(ctx, W, H, texto) {
  await carregarFontes();
  if (!texto) return;
  ctx.save();
  const fs = Math.round(W * 0.05);
  ctx.font = `700 ${fs}px Barlow, Helvetica, Arial, sans-serif`;
  const linhas = quebrar(ctx, texto, W * 0.8).slice(0, 3);
  const y0 = H * 0.7 - (linhas.length - 1) * fs * 1.2;
  const g = ctx.createLinearGradient(0, y0 - fs * 3, 0, H * 0.82); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, y0 - fs * 3, W, H * 0.82 - (y0 - fs * 3));
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 12;
  linhas.forEach((l, k) => ctx.fillText(l, W / 2, y0 + k * fs * 1.2));
  ctx.restore();
}
