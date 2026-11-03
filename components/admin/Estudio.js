'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sb, BUCKET, urlPublica } from '@/lib/admin/cliente';
import { SITE } from '@/lib/site';
import { dataHora, deLocal } from '@/lib/admin/ia';
import { brl } from '@/lib/admin/crm';

// ------------------------------------------------------------------ chamada à função "meta"
async function meta(body) {
  const { data: { session } } = await sb().auth.getSession();
  const r = await fetch(`${SITE.supabaseUrl}/functions/v1/meta`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, apikey: SITE.supabaseKey }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.erro) throw new Error(j.erro || 'falha');
  return j;
}

const TIPOS = { carrossel: ['Carrossel', 1080, 1350], post: ['Post', 1080, 1350], story: ['Story', 1080, 1920], reel: ['Reels (vídeo)', 1080, 1920] };
const STATUS = { rascunho: 'Rascunho', agendado: 'Agendado', publicando: 'Publicando', publicado: 'Publicado', erro: 'Erro', arquivado: 'Arquivado' };
const absoluta = (u) => (/^https?:/.test(u) ? u : `${window.location.origin}${u.startsWith('/') ? '' : '/'}${u}`);

export default function Estudio() {
  const [sub, setSub] = useState('criar');
  const [conexao, setConexao] = useState(null);
  const [seguidores, setSeguidores] = useState(null);
  useEffect(() => {
    meta({ acao: 'status' }).then(setConexao).catch((e) => setConexao({ conectado: false, motivo: e.message }));
    sb().from('perfil_metricas').select('dia,dados').order('dia', { ascending: false }).limit(30).then(({ data }) => setSeguidores(data || []));
  }, []);
  const hoje = seguidores?.[0]?.dados?.followers_count, antes = seguidores?.at(-1)?.dados?.followers_count;
  return (
    <section className="adm-pagina adm-larga">
      <div className="adm-cabeca">
        <div>
          <h1>Estúdio</h1>
          <p className="adm-sub">
            {!conexao ? 'Verificando a Meta…' : conexao.conectado ? `Conectado: @${conexao.instagram} e ${conexao.pagina}${conexao.anuncios ? ' · anúncios liberados' : ''}` : `Meta não conectada: ${conexao.motivo} Você ainda pode criar e baixar as peças.`}
            {hoje != null && ` · ${hoje.toLocaleString('pt-BR')} seguidores${antes != null && antes !== hoje ? ` (${hoje - antes >= 0 ? '+' : ''}${hoje - antes} em ${Math.max(1, Math.round((Date.parse(seguidores[0].dia) - Date.parse(seguidores.at(-1).dia)) / 864e5))} dias)` : ''}`}
          </p>
        </div>
      </div>
      <div className="adm-subabas">
        {[['criar', 'Criar peça'], ['agenda', 'Calendário'], ['anuncios', 'Anúncios'], ['metricas', 'Resultado por imóvel']].map(([k, n]) => <button key={k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>{n}</button>)}
      </div>
      {sub === 'criar' && <Criar conectado={!!conexao?.conectado} aoSalvar={() => setSub('agenda')} />}
      {sub === 'agenda' && <Calendario conexao={conexao} />}
      {sub === 'anuncios' && <Anuncios />}
      {sub === 'metricas' && <Resultados />}
    </section>
  );
}

// ------------------------------------------------------------------ desenho das peças (canvas)
let fontesProntas = null;
function carregarFontes() {
  if (fontesProntas) return fontesProntas;
  if (!document.getElementById('fontes-estudio')) {
    const l = document.createElement('link'); l.id = 'fontes-estudio'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Syncopate:wght@400;700&display=swap';
    document.head.appendChild(l);
  }
  fontesProntas = Promise.all(['400 40px Montserrat', '600 40px Montserrat', '700 40px Montserrat', '400 40px Syncopate', '700 40px Syncopate'].map((f) => document.fonts.load(f).catch(() => {})));
  return fontesProntas;
}
const cacheImg = new Map();
function imagem(src) {
  if (!cacheImg.has(src)) cacheImg.set(src, new Promise((ok, erro) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = erro; i.src = src; }));
  return cacheImg.get(src);
}
function cobrir(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height), iw = img.width * r, ih = img.height * r;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}
function quebrar(ctx, texto, larg) {
  const linhas = []; let atual = '';
  for (const p of String(texto || '').split(/\s+/)) { const t = atual ? `${atual} ${p}` : p; if (ctx.measureText(t).width > larg && atual) { linhas.push(atual); atual = p; } else atual = t; }
  if (atual) linhas.push(atual);
  return linhas;
}
function escrever(ctx, texto, x, y, larg, alt, max = 99) {
  const l = quebrar(ctx, texto, larg).slice(0, max);
  l.forEach((t, i) => ctx.fillText(t, x, y + i * alt));
  return y + l.length * alt;
}
const ficha = (im) => [im.area ? `${im.area} m²` : null, im.quartos ? `${im.quartos} quartos` : null, im.suites ? `${im.suites} ${im.suites > 1 ? 'suítes' : 'suíte'}` : null, im.vagas ? `${im.vagas} vagas` : null].filter(Boolean).join('  ·  ');

async function desenhar(tipo, i, total, d) {
  await carregarFontes();
  const [, W, H] = TIPOS[tipo === 'reel' ? 'story' : tipo];
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const claro = d.estilo === 'claro', fundo = claro ? '#f6f6f5' : '#070707', tinta = claro ? '#070707' : '#ffffff';
  const simbolo = await imagem(claro ? '/marca/simbolo-preto.svg' : '/marca/simbolo-branco.svg').catch(() => null);
  const logo = await imagem(claro ? '/marca/anderson-costa-horizontal-preto.svg' : '/marca/anderson-costa-horizontal-branco.svg').catch(() => null);
  const fotos = d.fotos;
  const ultimo = tipo === 'carrossel' && i === total - 1;
  ctx.fillStyle = fundo; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'top';

  if (ultimo) {
    // Slide final: chamada
    ctx.fillStyle = tinta;
    if (simbolo) ctx.drawImage(simbolo, 80, 90, 120, 120 * simbolo.height / simbolo.width);
    ctx.font = '700 76px Montserrat, Helvetica, Arial, sans-serif'; let y = escrever(ctx, d.fechamento || 'Quer ver de perto?', 80, 420, W - 160, 92, 4);
    ctx.font = '400 40px Montserrat'; ctx.globalAlpha = 0.85;
    y = escrever(ctx, d.palavra ? `Comente ${d.palavra} que eu te mando a curadoria completa por mensagem.` : 'Me chame no WhatsApp e receba a curadoria completa.', 80, y + 40, W - 160, 56, 5);
    ctx.globalAlpha = 1;
    if (logo) ctx.drawImage(logo, 80, H - 230, 520, 520 * logo.height / logo.width);
    ctx.font = '600 30px Montserrat, Helvetica, Arial, sans-serif'; ctx.fillText('CRECI SC 68594', 80, H - 120);
    return cv;
  }
  const foto = fotos[Math.min(i, fotos.length - 1)];
  const img = foto ? await imagem(absoluta(foto)).catch(() => null) : null;

  if (tipo === 'story' || tipo === 'reel') {
    const hf = Math.round(H * 0.64);
    if (img) cobrir(ctx, img, 0, 0, W, hf);
    const g = ctx.createLinearGradient(0, hf - 260, 0, hf); g.addColorStop(0, 'rgba(7,7,7,0)'); g.addColorStop(1, fundo);
    ctx.fillStyle = g; ctx.fillRect(0, hf - 260, W, 260);
    if (simbolo) ctx.drawImage(simbolo, 70, 80, 90, 90 * simbolo.height / simbolo.width);
    ctx.fillStyle = tinta; ctx.font = '400 30px Syncopate, Helvetica, Arial, sans-serif'; ctx.fillText(`${(d.im.bairro || '').toUpperCase()} · ${(d.im.cidade || '').toUpperCase()}`, 70, hf + 50);
    ctx.font = '700 70px Montserrat, Helvetica, Arial, sans-serif'; let y = escrever(ctx, d.gancho || d.im.titulo, 70, hf + 110, W - 140, 84, 3);
    ctx.font = '400 36px Montserrat, Helvetica, Arial, sans-serif'; ctx.globalAlpha = 0.85; ctx.fillText(ficha(d.im), 70, y + 24); ctx.globalAlpha = 1;
    if (d.preco) { ctx.font = '600 44px Montserrat, Helvetica, Arial, sans-serif'; ctx.fillText(d.preco, 70, y + 90); }
    ctx.font = '600 30px Montserrat, Helvetica, Arial, sans-serif'; ctx.fillText(d.palavra ? `Responda ${d.palavra} e receba a curadoria` : 'Responda este story', 70, H - 170);
    ctx.globalAlpha = 0.7; ctx.font = '400 26px Montserrat, Helvetica, Arial, sans-serif'; ctx.fillText('Anderson Costa · CRECI SC 68594', 70, H - 110); ctx.globalAlpha = 1;
    return cv;
  }

  if (img) cobrir(ctx, img, 0, 0, W, H);
  if (i === 0) {
    // Capa
    const g = ctx.createLinearGradient(0, H * 0.45, 0, H); g.addColorStop(0, 'rgba(7,7,7,0)'); g.addColorStop(1, 'rgba(7,7,7,0.88)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const s2 = await imagem('/marca/simbolo-branco.svg').catch(() => null);
    if (s2) ctx.drawImage(s2, 70, 70, 96, 96 * s2.height / s2.width);
    ctx.fillStyle = '#fff'; ctx.font = '400 28px Syncopate, Helvetica, Arial, sans-serif'; ctx.fillText(`${(d.im.bairro || '').toUpperCase()} · ${(d.im.cidade || '').toUpperCase()}`, 70, H - 470);
    ctx.font = '700 76px Montserrat, Helvetica, Arial, sans-serif';
    const linhas = quebrar(ctx, d.gancho || d.im.titulo, W - 140).slice(0, 3);
    linhas.forEach((t, k) => ctx.fillText(t, 70, H - 420 + k * 90));
    ctx.font = '400 34px Montserrat, Helvetica, Arial, sans-serif'; ctx.globalAlpha = 0.9; ctx.fillText(ficha(d.im), 70, H - 130); ctx.globalAlpha = 1;
    if (tipo === 'carrossel') { ctx.font = '600 28px Montserrat, Helvetica, Arial, sans-serif'; ctx.textAlign = 'right'; ctx.fillText('Arraste  →', W - 70, 90); ctx.textAlign = 'left'; }
    if (d.preco) { ctx.font = '600 36px Montserrat, Helvetica, Arial, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(d.preco, W - 70, H - 130); ctx.textAlign = 'left'; }
    return cv;
  }
  // Slides do meio: foto com caixa de texto
  const s = d.slides[i - 1];
  if (s) {
    ctx.font = '400 36px Montserrat, Helvetica, Arial, sans-serif';
    const linhas = quebrar(ctx, s.texto, W - 220).slice(0, 4);
    const altCaixa = 120 + linhas.length * 50;
    ctx.fillStyle = claro ? 'rgba(246,246,245,0.94)' : 'rgba(7,7,7,0.82)';
    ctx.fillRect(60, H - altCaixa - 60, W - 120, altCaixa);
    ctx.fillStyle = tinta; ctx.font = '700 46px Montserrat, Helvetica, Arial, sans-serif'; ctx.fillText(s.titulo, 100, H - altCaixa - 30);
    ctx.font = '400 36px Montserrat, Helvetica, Arial, sans-serif'; linhas.forEach((t, k) => ctx.fillText(t, 100, H - altCaixa + 40 + k * 50));
  }
  ctx.fillStyle = '#fff'; ctx.font = '600 26px Montserrat, Helvetica, Arial, sans-serif'; ctx.textAlign = 'right'; ctx.globalAlpha = 0.9; ctx.fillText(`${i + 1}/${total}`, W - 70, 70); ctx.globalAlpha = 1; ctx.textAlign = 'left';
  return cv;
}
const blobDe = (cv) => new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.9));

// ------------------------------------------------------------------ criar
function Criar({ conectado, aoSalvar }) {
  const [imoveis, setImoveis] = useState([]);
  const [cod, setCod] = useState('');
  const [tipo, setTipo] = useState('carrossel');
  const [fotos, setFotos] = useState([]);
  const [video, setVideo] = useState(null);
  const [txt, setTxt] = useState({ gancho: '', slides: [], legenda: '', palavra_chave: '', resposta_dm: '', fechamento: 'Quer ver de perto?' });
  const [estilo, setEstilo] = useState('escuro');
  const [mostrarPreco, setMostrarPreco] = useState(true);
  const [redes, setRedes] = useState(['instagram']);
  const [quando, setQuando] = useState('');
  const [previas, setPrevias] = useState([]);
  const [ocupado, setOcupado] = useState('');
  const [msg, setMsg] = useState('');
  const im = imoveis.find((x) => x.codigo === cod);

  useEffect(() => {
    sb().from('imoveis').select('codigo,titulo,bairro,cidade,preco,preco_visivel,area,quartos,suites,vagas,fotos,status').in('status', ['disponivel', 'reservado', 'rascunho']).order('codigo', { ascending: false })
      .then(({ data }) => setImoveis(data || []));
  }, []);
  useEffect(() => { if (im) setFotos((im.fotos || []).slice(0, 6)); setTxt((t) => ({ ...t, gancho: '', slides: [], legenda: '' })); }, [cod]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = tipo === 'carrossel' ? Math.min(10, Math.max(2, fotos.length + 1)) : 1;
  const dados = useMemo(() => im && ({ im, fotos, gancho: txt.gancho, slides: txt.slides, palavra: txt.palavra_chave, fechamento: txt.fechamento, estilo, preco: mostrarPreco && im.preco_visivel && im.preco ? brl(im.preco) : '' }), [im, fotos, txt, estilo, mostrarPreco]);
  const desenharTudo = useCallback(async () => {
    if (!dados || tipo === 'reel' || !fotos.length) { setPrevias([]); return; }
    const cvs = []; for (let i = 0; i < total; i++) cvs.push(await desenhar(tipo, i, total, dados));
    setPrevias(cvs);
  }, [dados, tipo, total, fotos.length]);
  useEffect(() => { const t = setTimeout(desenharTudo, 250); return () => clearTimeout(t); }, [desenharTudo]);

  const gerar = async () => {
    setOcupado('textos'); setMsg('');
    try { const r = await meta({ acao: 'textos', imovel: cod, tipo }); setTxt((t) => ({ ...t, ...r })); }
    catch (e) { setMsg(e.message); }
    setOcupado('');
  };
  const alternarFoto = (f) => setFotos((l) => (l.includes(f) ? l.filter((x) => x !== f) : l.length >= 9 ? l : [...l, f]));
  const baixar = async () => {
    for (let i = 0; i < previas.length; i++) { const a = document.createElement('a'); a.href = previas[i].toDataURL('image/jpeg', 0.92); a.download = `${cod}-${tipo}-${i + 1}.jpg`; a.click(); await new Promise((r) => setTimeout(r, 250)); }
  };
  const salvar = async (agora) => {
    if (!im) return;
    if (tipo === 'reel' && !video) { setMsg('Escolha o vídeo.'); return; }
    if (agora && !conectado) { setMsg('Conecte a Meta antes de publicar. Por enquanto, baixe as imagens.'); return; }
    if (!agora && !quando) { setMsg('Escolha dia e hora, ou publique agora.'); return; }
    setOcupado('salvando'); setMsg('');
    try {
      const id = crypto.randomUUID(); const arquivos = [];
      if (tipo === 'reel') {
        if (video.size > 48 * 1024 * 1024) throw new Error('Vídeo acima de 48 MB. Exporte em 1080p.');
        const caminho = `criativos/${id}/video.${(video.name.split('.').pop() || 'mp4').toLowerCase()}`;
        const { error } = await sb().storage.from(BUCKET).upload(caminho, video, { contentType: video.type || 'video/mp4' });
        if (error) throw error;
        arquivos.push({ url: urlPublica(caminho), caminho, tipo: 'video' });
      } else {
        for (let i = 0; i < previas.length; i++) {
          const caminho = `criativos/${id}/${String(i + 1).padStart(2, '0')}.jpg`;
          const { error } = await sb().storage.from(BUCKET).upload(caminho, await blobDe(previas[i]), { contentType: 'image/jpeg' });
          if (error) throw error;
          arquivos.push({ url: urlPublica(caminho), caminho, tipo: 'imagem' });
        }
      }
      const { error } = await sb().from('criativos').insert({
        id, imovel_codigo: cod, tipo, titulo: txt.gancho || im.titulo, arquivos, legenda: txt.legenda, redes: tipo === 'story' || tipo === 'reel' ? ['instagram'] : redes,
        status: agora ? 'rascunho' : 'agendado', agendado_para: agora ? null : deLocal(quando), palavra_chave: txt.palavra_chave || null, resposta_dm: txt.resposta_dm || null,
      });
      if (error) throw error;
      if (agora) await meta({ acao: 'publicar', id });
      setMsg(agora ? 'Publicado.' : 'Agendado. Sai sozinho no horário.');
      setTimeout(aoSalvar, 900);
    } catch (e) { setMsg('Não deu certo: ' + e.message); }
    setOcupado('');
  };

  return (
    <div className="adm-estudio">
      <div className="adm-estudio-form">
        <div className="adm-bloco">
          <label className="adm-campo"><span>Imóvel</span>
            <select value={cod} onChange={(e) => setCod(e.target.value)}><option value="">Escolha o imóvel</option>{imoveis.map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.titulo}</option>)}</select>
          </label>
          <div className="adm-subabas">{Object.entries(TIPOS).map(([k, [n]]) => <button key={k} className={tipo === k ? 'on' : ''} onClick={() => setTipo(k)}>{n}</button>)}</div>
          {im && tipo !== 'reel' && (
            <>
              <p className="adm-sub">Toque nas fotos na ordem em que devem aparecer {tipo === 'carrossel' ? '(a primeira é a capa, até 9)' : '(usa a primeira)'}.</p>
              <div className="adm-estudio-fotos">{(im.fotos || []).map((f) => {
                const n = fotos.indexOf(f);
                return <button key={f} className={n >= 0 ? 'on' : ''} onClick={() => alternarFoto(f)}><img src={f.replace(/\.(webp|jpe?g)$/i, '-p.$1')} onError={(e) => { e.currentTarget.src = f; }} alt="" />{n >= 0 && <b>{n + 1}</b>}</button>;
              })}</div>
            </>
          )}
          {tipo === 'reel' && <label className="adm-campo"><span>Vídeo vertical (MP4 ou MOV, até 48 MB, 1080p)</span><input type="file" accept="video/mp4,video/quicktime" onChange={(e) => setVideo(e.target.files?.[0] || null)} /></label>}
        </div>
        {im && (
          <div className="adm-bloco">
            <div className="adm-bloco-topo"><h2>Textos</h2><button className="adm-btn" disabled={ocupado === 'textos'} onClick={gerar}>{ocupado === 'textos' ? 'Escrevendo…' : '✦ Escrever com IA'}</button></div>
            {tipo !== 'reel' && <label className="adm-campo"><span>Frase da capa</span><input value={txt.gancho} onChange={(e) => setTxt({ ...txt, gancho: e.target.value })} placeholder={im.titulo} /></label>}
            {tipo === 'carrossel' && fotos.slice(1).map((_, k) => (
              <div key={k} className="adm-grade2">
                <label className="adm-campo"><span>Slide {k + 2}: título</span><input value={txt.slides[k]?.titulo || ''} onChange={(e) => { const s = [...txt.slides]; s[k] = { ...(s[k] || {}), titulo: e.target.value }; setTxt({ ...txt, slides: s }); }} /></label>
                <label className="adm-campo"><span>Texto</span><input value={txt.slides[k]?.texto || ''} onChange={(e) => { const s = [...txt.slides]; s[k] = { ...(s[k] || {}), texto: e.target.value }; setTxt({ ...txt, slides: s }); }} /></label>
              </div>
            ))}
            {tipo === 'carrossel' && <label className="adm-campo"><span>Último slide</span><input value={txt.fechamento} onChange={(e) => setTxt({ ...txt, fechamento: e.target.value })} /></label>}
            {tipo !== 'story' && <label className="adm-campo"><span>Legenda</span><textarea rows={7} value={txt.legenda} onChange={(e) => setTxt({ ...txt, legenda: e.target.value })} /></label>}
            <div className="adm-grade2">
              <label className="adm-campo"><span>Palavra para comentar (vira mensagem automática)</span><input value={txt.palavra_chave} onChange={(e) => setTxt({ ...txt, palavra_chave: e.target.value.toUpperCase() })} placeholder="CURADORIA" /></label>
              <label className="adm-campo"><span>Mensagem automática</span><input value={txt.resposta_dm} onChange={(e) => setTxt({ ...txt, resposta_dm: e.target.value })} /></label>
            </div>
            <div className="adm-checks">
              <label className="adm-check"><input type="radio" checked={estilo === 'escuro'} onChange={() => setEstilo('escuro')} /> Fundo preto</label>
              <label className="adm-check"><input type="radio" checked={estilo === 'claro'} onChange={() => setEstilo('claro')} /> Fundo claro</label>
              <label className="adm-check"><input type="checkbox" checked={mostrarPreco} onChange={(e) => setMostrarPreco(e.target.checked)} /> Mostrar preço</label>
            </div>
          </div>
        )}
        {im && (
          <div className="adm-bloco">
            <h2>Onde e quando</h2>
            <div className="adm-checks">
              <label className="adm-check"><input type="checkbox" checked={redes.includes('instagram')} onChange={() => setRedes((r) => (r.includes('instagram') ? r.filter((x) => x !== 'instagram') : [...r, 'instagram']))} /> Instagram</label>
              <label className="adm-check"><input type="checkbox" disabled={tipo === 'story' || tipo === 'reel'} checked={redes.includes('facebook') && tipo !== 'story' && tipo !== 'reel'} onChange={() => setRedes((r) => (r.includes('facebook') ? r.filter((x) => x !== 'facebook') : [...r, 'facebook']))} /> Facebook</label>
            </div>
            <label className="adm-campo"><span>Agendar para</span><input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} /></label>
            <div className="adm-wa-acoes">
              <button className="adm-btn adm-primario" disabled={!!ocupado} onClick={() => salvar(false)}>{ocupado === 'salvando' ? 'Salvando…' : 'Aprovar e agendar'}</button>
              <button className="adm-btn" disabled={!!ocupado} onClick={() => salvar(true)}>Publicar agora</button>
              {previas.length > 0 && <button className="adm-link" onClick={baixar}>Baixar imagens</button>}
            </div>
            <p className="adm-sub">Aprovar é o seu OK: nada vai ao ar sem ele. Horários que costumam funcionar: 12h, 18h30 e 21h.</p>
            {msg && <p className="adm-msg">{msg}</p>}
          </div>
        )}
      </div>
      <div className="adm-estudio-previa">
        {previas.length ? previas.map((cv, k) => <img key={k} src={cv.toDataURL('image/jpeg', 0.7)} alt={`Prévia ${k + 1}`} className={tipo === 'story' ? 'story' : ''} />)
          : <p className="adm-sub">{im ? (tipo === 'reel' ? 'O vídeo vai como está. O editor de Reels chega na próxima entrega.' : 'Escolha as fotos.') : 'Escolha um imóvel para começar.'}</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ calendário
function Calendario({ conexao }) {
  const [lista, setLista] = useState(null);
  const [msg, setMsg] = useState('');
  const [anuncioDe, setAnuncioDe] = useState(null);
  const carregar = () => sb().from('criativos').select('*').neq('status', 'arquivado').order('agendado_para', { ascending: false, nullsFirst: true }).order('criado_em', { ascending: false }).limit(100).then(({ data }) => setLista(data || []));
  useEffect(() => { carregar(); }, []);
  const acao = async (c, a) => {
    setMsg('');
    try {
      if (a === 'publicar') { await meta({ acao: 'publicar', id: c.id }); setMsg('Publicado.'); }
      if (a === 'pausar') await sb().from('criativos').update({ status: 'rascunho', agendado_para: null }).eq('id', c.id);
      if (a === 'arquivar') await sb().from('criativos').update({ status: 'arquivado' }).eq('id', c.id);
    } catch (e) { setMsg(e.message); }
    carregar();
  };
  if (!lista) return <p className="adm-sub">Carregando…</p>;
  if (anuncioDe) return <NovoAnuncio criativo={anuncioDe} aoFechar={() => setAnuncioDe(null)} />;
  return (
    <div>
      {msg && <p className="adm-msg">{msg}</p>}
      {!lista.length ? <p className="adm-sub">Nenhuma peça ainda. Comece em "Criar peça".</p> : (
        <ul className="adm-lista adm-pecas">{lista.map((c) => (
          <li key={c.id} className="adm-fila">
            {c.arquivos?.[0] && (c.arquivos[0].tipo === 'video' ? <div className="adm-peca-mini">▶</div> : <img className="adm-peca-mini" src={c.arquivos[0].url} alt="" />)}
            <div>
              <b>{c.imovel_codigo} · {TIPOS[c.tipo]?.[0]}</b> <span className={`adm-tag ${c.status === 'erro' ? 't-bloq' : c.status === 'publicado' ? 't-voce' : ''}`}>{STATUS[c.status]}</span>
              <small>{c.status === 'publicado' ? `Publicado ${dataHora(c.publicado_em)}` : c.agendado_para ? `Agendado para ${dataHora(c.agendado_para)}` : 'Sem data'} · {(c.redes || []).join(' e ')}{c.palavra_chave ? ` · palavra ${c.palavra_chave}` : ''}</small>
              {c.metricas && Object.keys(c.metricas).length > 0 && <small>Alcance {c.metricas.reach ?? 0} · visualizações {c.metricas.views ?? 0} · curtidas {c.metricas.likes ?? 0} · envios {c.metricas.shares ?? 0} · salvos {c.metricas.saved ?? 0}</small>}
              {c.erro && <small className="adm-erro">{c.erro}</small>}
              <div className="adm-wa-acoes">
                {['rascunho', 'agendado', 'erro'].includes(c.status) && conexao?.conectado && <button className="adm-link" onClick={() => acao(c, 'publicar')}>Publicar agora</button>}
                {c.status === 'agendado' && <button className="adm-link" onClick={() => acao(c, 'pausar')}>Tirar da agenda</button>}
                {c.ig_permalink && <a className="adm-link" href={c.ig_permalink} target="_blank" rel="noopener">Ver no Instagram</a>}
                {c.tipo !== 'reel' && c.tipo !== 'story' && conexao?.anuncios && <button className="adm-link" onClick={() => setAnuncioDe(c)}>Virar anúncio</button>}
                <button className="adm-link" onClick={() => acao(c, 'arquivar')}>Arquivar</button>
              </div>
            </div>
          </li>
        ))}</ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ anúncios
function NovoAnuncio({ criativo, aoFechar }) {
  const [f, setF] = useState({ orcamento_dia: 20, dias: 7, raio_km: 25, idade_min: 30, idade_max: 65, categoria_moradia: false, texto: criativo.legenda || '' });
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState(null); const [ocupado, setOcupado] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const criar = async () => {
    setOcupado(true); setMsg('');
    try { setOk(await meta({ acao: 'anuncio', criativo_id: criativo.id, ...f })); } catch (e) { setMsg(e.message); }
    setOcupado(false);
  };
  return (
    <div className="adm-bloco">
      <button className="adm-link" onClick={aoFechar}>← Voltar</button>
      <h2>Anúncio de {criativo.imovel_codigo}: conversas no WhatsApp</h2>
      <p className="adm-sub">O anúncio é criado <b>pausado</b>. Nada é gasto até você ativar.</p>
      <div className="adm-grade2">
        <label className="adm-campo"><span>Orçamento por dia (R$)</span><input type="number" min="6" value={f.orcamento_dia} onChange={set('orcamento_dia')} /></label>
        <label className="adm-campo"><span>Quantos dias</span><input type="number" min="1" max="60" value={f.dias} onChange={set('dias')} /></label>
        <label className="adm-campo"><span>Raio a partir de Jaraguá (km)</span><input type="number" min="5" max="80" value={f.raio_km} onChange={set('raio_km')} /></label>
        <label className="adm-campo"><span>Idade</span><span className="adm-linha"><input type="number" value={f.idade_min} onChange={set('idade_min')} /><input type="number" value={f.idade_max} onChange={set('idade_max')} /></span></label>
      </div>
      <label className="adm-campo"><span>Texto do anúncio</span><textarea rows={5} value={f.texto} onChange={set('texto')} /></label>
      <label className="adm-check"><input type="checkbox" checked={f.categoria_moradia} onChange={set('categoria_moradia')} /> Categoria especial de moradia (limita idade e raio; marque se a Meta exigir)</label>
      <p className="adm-sub">Total máximo: {brl(Number(f.orcamento_dia) * Number(f.dias))}.</p>
      {ok ? <p className="adm-msg">Criado e pausado. <a className="adm-link" href={ok.link} target="_blank" rel="noopener">Conferir no Gerenciador</a> ou ative na aba Anúncios.</p>
        : <button className="adm-btn adm-primario" disabled={ocupado} onClick={criar}>{ocupado ? 'Criando…' : 'Criar anúncio pausado'}</button>}
      {msg && <p className="adm-erro">{msg}</p>}
    </div>
  );
}

function Anuncios() {
  const [lista, setLista] = useState(null); const [msg, setMsg] = useState('');
  const carregar = () => sb().from('anuncios').select('*').order('criado_em', { ascending: false }).limit(50).then(({ data }) => setLista(data || []));
  useEffect(() => { carregar(); }, []);
  const mudar = async (a, ativar) => {
    if (ativar && !confirm(`Ativar o anúncio? Ele vai gastar até ${brl(a.orcamento_dia)} por dia por ${a.dias} dias.`)) return;
    setMsg(''); try { await meta({ acao: 'anuncio_status', id: a.id, ativar }); } catch (e) { setMsg(e.message); } carregar();
  };
  if (!lista) return <p className="adm-sub">Carregando…</p>;
  return (
    <div>
      {msg && <p className="adm-erro">{msg}</p>}
      {!lista.length ? <p className="adm-sub">Nenhum anúncio. No Calendário, toque em "Virar anúncio" numa peça.</p> : (
        <ul className="adm-lista">{lista.map((a) => {
          const m = a.metricas || {};
          return (
            <li key={a.id} className="adm-fila"><div>
              <b>{a.nome}</b> <span className={`adm-tag ${a.status === 'ativo' ? 't-voce' : a.status === 'erro' ? 't-bloq' : ''}`}>{a.status.replace('_', ' ')}</span>
              <small>{brl(a.orcamento_dia)}/dia · {a.dias} dias · {a.raio_km} km</small>
              {m.gasto != null && <small>Gasto {brl(m.gasto)} · alcance {m.alcance} · conversas {m.conversas}{m.conversas ? ` · ${brl(m.gasto / m.conversas)} por conversa` : ''}</small>}
              {a.erro && <small className="adm-erro">{a.erro}</small>}
              {['criado_pausado', 'pausado'].includes(a.status) && <button className="adm-btn adm-primario" onClick={() => mudar(a, true)}>Ativar</button>}
              {a.status === 'ativo' && <button className="adm-btn" onClick={() => mudar(a, false)}>Pausar</button>}
            </div></li>
          );
        })}</ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ resultado por imóvel
function Resultados() {
  const [linhas, setLinhas] = useState(null);
  useEffect(() => {
    (async () => {
      const c = sb();
      const [{ data: crs }, { data: ads }, { data: leads }, { data: vis }] = await Promise.all([
        c.from('criativos').select('imovel_codigo,metricas,status').eq('status', 'publicado'),
        c.from('anuncios').select('imovel_codigo,metricas'),
        c.from('leads').select('imoveis_interesse,imovel_codigo,etapa'),
        c.from('visitas').select('imovel_codigo,status'),
      ]);
      const m = new Map();
      const de = (k) => { if (!m.has(k)) m.set(k, { cod: k, pecas: 0, alcance: 0, envios: 0, gasto: 0, conversas: 0, leads: 0, visitas: 0, propostas: 0 }); return m.get(k); };
      for (const x of crs || []) if (x.imovel_codigo) { const r = de(x.imovel_codigo); r.pecas++; r.alcance += x.metricas?.reach || 0; r.envios += x.metricas?.shares || 0; }
      for (const x of ads || []) if (x.imovel_codigo) { const r = de(x.imovel_codigo); r.gasto += x.metricas?.gasto || 0; r.conversas += x.metricas?.conversas || 0; }
      for (const l of leads || []) for (const k of new Set([...(l.imoveis_interesse || []), l.imovel_codigo].filter(Boolean))) { const r = de(k); r.leads++; if (['proposta', 'venda'].includes(l.etapa)) r.propostas++; }
      for (const v of vis || []) if (v.imovel_codigo && ['confirmada', 'realizada'].includes(v.status)) de(v.imovel_codigo).visitas++;
      setLinhas([...m.values()].sort((a, b) => b.leads - a.leads || b.alcance - a.alcance));
    })();
  }, []);
  if (!linhas) return <p className="adm-sub">Carregando…</p>;
  if (!linhas.length) return <p className="adm-sub">Ainda sem dados. Eles aparecem conforme você publica e os leads chegam.</p>;
  return (
    <div className="adm-tabela-rolagem">
      <table className="adm-tabela">
        <thead><tr><th>Imóvel</th><th>Peças</th><th>Alcance</th><th>Envios</th><th>Gasto</th><th>Conversas</th><th>Leads</th><th>Visitas</th><th>Propostas</th><th>Custo por lead</th></tr></thead>
        <tbody>{linhas.map((r) => <tr key={r.cod}><td><b>{r.cod}</b></td><td>{r.pecas}</td><td>{r.alcance.toLocaleString('pt-BR')}</td><td>{r.envios}</td><td>{r.gasto ? brl(r.gasto) : '-'}</td><td>{r.conversas}</td><td>{r.leads}</td><td>{r.visitas}</td><td>{r.propostas}</td><td>{r.gasto && r.leads ? brl(r.gasto / r.leads) : '-'}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
