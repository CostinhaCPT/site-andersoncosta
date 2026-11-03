'use client';
// Desenho das peças no padrão do Instagram do Anderson (@o.anderson.costa), igual ao modelo do Canva:
// capa com logo empilhado no topo, destaque + preço, bairro grande em Cooper Hewitt Bold e ficha com ícones de linha;
// fotos do meio limpas; último slide escurecido com símbolo, cidade, bairro e "Entre em contato / e saiba mais."
// Usado pelo Estúdio (imagens) e pelo editor de Reels (capa e encerramento do vídeo).

// Fontes servidas pelo próprio site (funcionam offline no app e não dependem do Google)
// Cooper Hewitt é a fonte dos posts feitos no Canva (Book = 400, Bold = 700)
const FONTES = [
  ['Cooper Hewitt', 400, 'cooper-hewitt-latin-400-normal'], ['Cooper Hewitt', 700, 'cooper-hewitt-latin-700-normal'],
  ['Montserrat', 400, 'montserrat-latin-400-normal'],
];
const CH = '"Cooper Hewitt", "Helvetica Neue", Arial, sans-serif';
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
  area: '<path d="M3.5 3v17M2 4.5 3.5 3 5 4.5M2 18.5 3.5 20 5 18.5"/><path d="M7.5 11.5 14.5 5l7 6.5"/><path d="M9 10.5V18h11v-7.5"/><path d="M12.5 18v-4h4v4"/><path d="M7.5 21.5h14M9 20l-1.5 1.5L9 23M20 20l1.5 1.5L20 23"/>',
  terreno: '<path d="M3 19h18"/><path d="M4 19l4-8 3 5 3-7 6 10"/><circle cx="17" cy="6" r="1.6"/>',
  dorm: '<rect x="3.5" y="5" width="17" height="7" rx="1.5"/><rect x="5.5" y="7.8" width="5.5" height="3" rx="1"/><rect x="13" y="7.8" width="5.5" height="3" rx="1"/><path d="M2 12.5h20v5H2zM3.5 17.5v2M20.5 17.5v2"/>',
  banho: '<path d="M5 21V7.5A3.5 3.5 0 0 1 8.5 4h1A3.5 3.5 0 0 1 13 7.5"/><path d="M9.5 9.5h7.5a3.8 3.8 0 0 0-7.5 0z"/><path d="M11 12.5v1M13.2 12.5v1.5M15.4 12.5v1M12 15.5v1M14.3 15.5v1M13.2 18.5v1"/><path d="M3 21h4"/>',
  ambientes: '<path d="M3 11 12 3.5l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M7.5 18.5V15a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v3.5M7 18.5h10M9.5 14v-1.5h5V14"/><path d="M10 8h4v2.5h-4z"/>',
  local: '<rect x="6" y="2.5" width="9" height="15" rx="1.5"/><path d="M14.5 21.5c2.5-2 4.5-4.2 4.5-6.5a3 3 0 0 0-6 0c0 2.3 1.5 4.5 1.5 6.5z"/><circle cx="16" cy="15" r=".9"/><path d="M9 14.5h3"/>',
  vagas: '<path d="M5 16V12.5L7 8h10l2 4.5V16"/><path d="M4 16h16v2.5H4z"/><circle cx="7.5" cy="13.5" r=".8"/><circle cx="16.5" cy="13.5" r=".8"/>',
  destaque: '<path d="M4 20.5V9l6-4.5L16 9"/><path d="M9 20.5v-5h2"/><path d="M14 12.5l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.7 1.4.5-3-2.1-2.1 3-.4z"/>',
};
// Ícones originais do modelo do Canva (recortados do PDF). Posição medida no modelo, em fração da largura:
// [x, topo em relação à linha de base do texto, largura, altura]
const ICONES_MODELO = {
  area: [0.10625, -0.02187, 0.03021, 0.02986], dorm: [0.10556, -0.01875, 0.0316, 0.02569], banho: [0.10972, -0.01806, 0.02326, 0.02326],
  ambientes: [0.10729, -0.02118, 0.02813, 0.02813], local: [0.10868, -0.02049, 0.02674, 0.02743],
};
const cacheIcone = new Map();
function icone(nome) {
  if (ICONES_MODELO[nome]) return imagem(`/marca/icones/${nome}.png`);
  if (!cacheIcone.has(nome)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${ICONES[nome] || ICONES.destaque}</svg>`;
    cacheIcone.set(nome, imagem(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`));
  }
  return cacheIcone.get(nome);
}

const dois = (n) => String(n).padStart(2, '0');
const m2 = (n) => `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m²`;

/** Linhas da ficha da capa, como no modelo: "Área Construída: 142 m²", "Dormitórios: 03 (sendo 1 suíte)"... Valores em negrito. */
export function fichaPadrao(im, textos = {}) {
  const l = [];
  const apto = /apart/i.test(im.tipo || '');
  if (im.area) l.push({ icone: 'area', rotulo: apto ? 'Área Privativa: ' : 'Área Construída: ', valor: m2(im.area) });
  if (im.quartos) l.push({ icone: 'dorm', rotulo: 'Dormitórios: ', valor: `${dois(im.quartos)}${im.suites ? ` (sendo ${im.suites} ${im.suites > 1 ? 'suítes' : 'suíte'})` : ''}` });
  if (im.banheiros) l.push({ icone: 'banho', rotulo: 'Banheiros: ', valor: dois(im.banheiros) });
  if (textos.ambientes) l.push({ icone: 'ambientes', rotulo: 'Ambientes: ', valor: textos.ambientes });
  const local = textos.localizacao || textos.diferencial;
  if (local) l.push({ icone: 'local', rotulo: 'Localização: ', valor: local });
  return l;
}

/**
 * Capa no modelo do Canva do Anderson. Post e carrossel em 3:4 (1080x1440; 1080x1350 quando a Meta publica sozinha)
 * e story/reel em 1080x1920. Medidas tiradas do modelo "Chico de Paulo".
 * d: { im, foto (url), rotulo, titulo, preco, ficha: [...] }
 * fundo: opcional, um <img>/<video>/<canvas> já pronto. quadro.semFoto: só a camada de texto (editor de Reels).
 */
export async function desenharCapa(ctx, W, H, d, fundo, quadro = {}) {
  await carregarFontes();
  if (!quadro.semFoto) {
    const img = fundo || (d.foto ? await imagem(absoluta(d.foto)).catch(() => null) : null);
    ctx.fillStyle = '#0c0c0c'; ctx.fillRect(0, 0, W, H);
    if (img) cobrir(ctx, img, 0, 0, W, H, quadro.zoom || 1, quadro.dx || 0, quadro.dy || 0);
  }
  const vertical = H / W > 1.5;
  const opac = quadro.alfa ?? 1;
  ctx.save(); ctx.globalAlpha = opac;

  // 1) a foto inteira escurece 28% (medido no modelo: cada pixel sai com 72% do brilho original)
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(0, 0, W, H);

  // posições medidas no modelo, em fração da largura a partir do topo da faixa
  const yFaixa = vertical ? H * 0.56 : H * 0.6138;            // faixa começa em 61,4% da altura, borda reta
  const yRotulo = yFaixa + W * 0.0872;                         // linha do destaque e do preço
  const tamTit = W * 0.1178;
  const yTitulo = yFaixa + W * 0.191;
  const yFicha = yFaixa + W * 0.2634;
  const yMax = vertical ? H * 0.86 : H - W * 0.035;

  // 2) faixa cinza translúcida (49%), um pouco mais clara à esquerda, como no modelo
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(66,66,66,0.49)'); g.addColorStop(0.35, 'rgba(58,58,58,0.49)'); g.addColorStop(0.65, 'rgba(40,40,40,0.49)'); g.addColorStop(1, 'rgba(38,38,38,0.49)');
  ctx.fillStyle = g; ctx.fillRect(0, yFaixa, W, H - yFaixa);

  // símbolo em alto-relevo atrás da ficha
  const relevo = await imagem('/marca/simbolo-relevo.png').catch(() => null);
  if (relevo) {
    // no modelo o símbolo ocupa 25% da largura e começa logo abaixo do título
    const rw = W * 0.303, rh = rw * relevo.height / relevo.width;
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.85 * opac;
    ctx.drawImage(relevo, (W - rw) / 2, yFaixa + W * 0.1671, rw, rh);
    ctx.restore(); ctx.globalAlpha = opac;
  }

  // logo empilhado no topo
  const logo = await imagem('/marca/anderson-costa-empilhado-branco.svg').catch(() => null);
  if (logo) { const lw = W * 0.22, lh = lw * logo.height / logo.width; ctx.drawImage(logo, (W - lw) / 2, vertical ? H * 0.1 : H * 0.06, lw, lh); }

  ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
  // bairro: Cooper Hewitt Bold, maiúsculas, centralizado; reduz se não couber em 82% da largura
  let tam = Math.round(tamTit);
  const titulo = String(d.titulo || '').toUpperCase();
  ctx.font = `700 ${tam}px ${CH}`;
  while (ctx.measureText(titulo).width > W * 0.83 && tam > 40) { tam -= 2; ctx.font = `700 ${tam}px ${CH}`; }
  const tw = Math.max(ctx.measureText(titulo).width, W * 0.6);
  ctx.textAlign = 'center'; ctx.fillText(titulo, W / 2, yTitulo); ctx.textAlign = 'left';

  // destaque à esquerda e preço à direita, nas bordas do título
  let tr = Math.round(W * 0.0285);
  ctx.font = `400 ${tr}px ${CH}`;
  const rot = String(d.rotulo || '').toUpperCase();
  const largPreco = d.preco ? ctx.measureText(d.preco).width + W * 0.04 : 0;
  while (rot && ctx.measureText(rot).width + rot.length * W * 0.0012 > tw - largPreco && tr > 16) { tr -= 1; ctx.font = `400 ${tr}px ${CH}`; }
  // destaque e preço ficam meio ponto para dentro das bordas do título
  if (rot) espacado(ctx, rot, W / 2 - tw / 2 + W * 0.005, yRotulo, W * 0.0012);
  ctx.font = `400 ${Math.round(W * 0.0285)}px ${CH}`;
  if (d.preco) espacado(ctx, d.preco, W / 2 + tw / 2 - W * 0.005, yRotulo, W * 0.0012, 'right');

  // ficha com ícones: rótulo Book + valor Bold, quebra alinhada ao texto
  const fs = Math.round(W * 0.0199), lh = W * 0.0323, ic = W * 0.031;
  const xi = W * 0.105, xt = W * 0.1448, larg = W * 0.936 - xt;
  let y = yFicha;
  for (const item of d.ficha || []) {
    if (y > yMax) break;
    const ii = await icone(item.icone).catch(() => null);
    const pos = ICONES_MODELO[item.icone];
    if (ii && pos) ctx.drawImage(ii, W * pos[0], y + W * pos[1], W * pos[2], W * pos[3]);
    else if (ii) ctx.drawImage(ii, xi, y - ic * 0.78, ic, ic);
    ctx.font = `400 ${fs}px ${CH}`;
    const wr = item.rotulo ? ctx.measureText(item.rotulo).width : 0;
    if (item.rotulo) ctx.fillText(item.rotulo, xt, y);
    ctx.font = `700 ${fs}px ${CH}`;
    let linha = '', x0 = xt + wr, disp = larg - wr;
    for (const p of String(item.valor || '').split(/\s+/).filter(Boolean)) {
      const t = linha ? `${linha} ${p}` : p;
      if (ctx.measureText(t).width > disp && linha) { ctx.fillText(linha, x0, y); y += lh; x0 = xt; disp = larg; linha = p; if (y > yMax) break; }
      else linha = t;
    }
    if (linha && y <= yMax) ctx.fillText(linha, x0, y);
    y += lh;
  }
  // CRECI discreto (a publicidade do corretor precisa do número)
  ctx.globalAlpha = 0.55 * opac; ctx.font = `400 ${Math.round(W * 0.013)}px ${CH}`;
  ctx.textAlign = 'right'; ctx.fillText('CRECI SC 68594', W - W * 0.035, vertical ? H * 0.93 : H - W * 0.018); ctx.textAlign = 'left';
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
  ctx.globalAlpha = 0.65 * (quadro.alfa ?? 1); ctx.font = `400 ${Math.round(W * 0.016)}px ${CH}`;
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
  ctx.font = `700 ${fs}px ${CH}`;
  const linhas = quebrar(ctx, texto, W * 0.8).slice(0, 3);
  const y0 = H * 0.7 - (linhas.length - 1) * fs * 1.2;
  const g = ctx.createLinearGradient(0, y0 - fs * 3, 0, H * 0.82); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, y0 - fs * 3, W, H * 0.82 - (y0 - fs * 3));
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 12;
  linhas.forEach((l, k) => ctx.fillText(l, W / 2, y0 + k * fs * 1.2));
  ctx.restore();
}

// Ambientes e Localização já preenchidos com os dados do imóvel (a IA melhora depois, se você quiser)
export const textosPadrao = (im) => ({
  ambientes: (im?.destaques || []).length ? `${im.destaques.slice(0, 3).join(', ').replace(/\.$/, '')}.` : (im?.resumo || ''),
  localizacao: im?.bairro ? `Situada no bairro ${im.bairro}, em ${im.cidade || 'Jaraguá do Sul'}.` : '',
});
