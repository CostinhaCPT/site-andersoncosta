'use client';
// Editor de Reels no próprio aparelho (iPhone, Mac ou PC), sem servidor e sem mensalidade.
// Monta capa no padrão do Instagram do Anderson + fotos com movimento + vídeos + encerramento,
// grava em 1080x1920 a 30 quadros por segundo e sai em MP4 (Safari e Chrome atuais).
// A música da biblioteca do Instagram entra na hora de postar pelo app (a Meta não libera para programas de fora).
import { useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '@/lib/admin/cliente';
import { brl } from '@/lib/admin/crm';
import { absoluta, carregarFontes, cobrir, desenharCapa, desenharFim, desenharLegendaCena, fichaPadrao, imagem } from '@/lib/admin/arte';
import { enviarArquivo, meta, salvarCriativo } from '@/lib/admin/estudio';

const W = 1080, H = 1920, FPS = 30, FADE = 0.3;
let seq = 0;
const nova = (o) => ({ id: `c${++seq}`, texto: '', ...o });

function formatoGravacao() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']) if (MediaRecorder.isTypeSupported(t)) return t;
  return null;
}

export default function EditorReels({ aoSalvar }) {
  const [imoveis, setImoveis] = useState([]);
  const [cod, setCod] = useState('');
  const [cenas, setCenas] = useState([]);
  const [txt, setTxt] = useState({ rotulo: '', titulo: '', ambientes: '', localizacao: '', linha1: 'Entre em contato', linha2: 'e saiba mais.', legenda: '', palavra_chave: '', resposta_dm: '' });
  const [mostrarPreco, setMostrarPreco] = useState(true);
  const [somVideos, setSomVideos] = useState(false);
  const [trilha, setTrilha] = useState(null);
  const [estado, setEstado] = useState(''); // '', 'previa', 'gravando'
  const [prog, setProg] = useState(0);
  const [saida, setSaida] = useState(null); // {blob, url, tipo}
  const [quando, setQuando] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState('');
  const palco = useRef(null);
  const parar = useRef(false);
  const im = imoveis.find((x) => x.codigo === cod);
  const formato = useMemo(formatoGravacao, []);
  const set = (k) => (e) => setTxt((t) => ({ ...t, [k]: e.target.value }));

  useEffect(() => {
    sb().from('imoveis').select('codigo,titulo,tipo,bairro,cidade,preco,preco_visivel,area,terreno,quartos,suites,banheiros,vagas,fotos,status').in('status', ['disponivel', 'reservado', 'rascunho']).order('codigo', { ascending: false })
      .then(({ data }) => setImoveis(data || []));
  }, []);
  useEffect(() => {
    if (!im) return;
    const f = im.fotos || [];
    setTxt((t) => ({ ...t, rotulo: im.terreno >= 600 && !/apart/i.test(im.tipo || '') ? `Terreno de ${Number(im.terreno).toLocaleString('pt-BR')} m²` : /apart/i.test(im.tipo || '') ? 'Apartamento' : 'Casa ampla', titulo: im.bairro || '', ambientes: '', localizacao: '', legenda: '' }));
    setCenas([nova({ tipo: 'capa', src: f[0], dur: 3.5 }), ...f.slice(1, 7).map((s) => nova({ tipo: 'foto', src: s, dur: 2.2 })), nova({ tipo: 'fim', src: f[1] || f[0], dur: 3 })]);
    setSaida(null);
  }, [cod]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = cenas.reduce((s, c) => s + Number(c.dur || 0), 0);
  const mudar = (id, k, v) => setCenas((l) => l.map((c) => (c.id === id ? { ...c, [k]: v } : c)));
  const mover = (i, d) => setCenas((l) => { const n = [...l]; const j = i + d; if (j < 1 || j > n.length - 2) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const remover = (id) => setCenas((l) => l.filter((c) => c.id !== id));
  const addFoto = (src) => setCenas((l) => [...l.slice(0, -1), nova({ tipo: 'foto', src, dur: 2.2 }), l.at(-1)]);
  const addArquivos = async (files) => {
    for (const f of files) {
      const url = URL.createObjectURL(f);
      if (f.type.startsWith('video')) {
        const dur = await new Promise((ok) => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => ok(v.duration || 4); v.onerror = () => ok(4); v.src = url; });
        setCenas((l) => [...l.slice(0, -1), nova({ tipo: 'video', src: url, dur: Math.min(6, Math.round(dur * 10) / 10), max: dur, inicio: 0 }), l.at(-1)]);
      } else addFoto(url);
    }
  };

  const gerarTextos = async () => {
    setOcupado('textos'); setMsg('');
    try { const r = await meta({ acao: 'textos', imovel: cod, tipo: 'reel' }); setTxt((t) => ({ ...t, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v)) })); }
    catch (e) { setMsg(e.message); }
    setOcupado('');
  };

  // ------------------------------------------------------------ montagem das camadas (uma vez) e reprodução
  async function preparar() {
    await carregarFontes();
    const preco = mostrarPreco && im.preco_visivel !== false && im.preco ? brl(im.preco) : '';
    const capaTxt = { im, rotulo: txt.rotulo, titulo: txt.titulo, preco, ficha: fichaPadrao(im, txt) };
    const fimTxt = { im, titulo: im.bairro, linha1: txt.linha1, linha2: txt.linha2 };
    const prontas = [];
    for (const c of cenas) {
      const camada = document.createElement('canvas'); camada.width = W; camada.height = H;
      const cx = camada.getContext('2d');
      if (c.tipo === 'capa') await desenharCapa(cx, W, H, capaTxt, null, { semFoto: true });
      else if (c.tipo === 'fim') await desenharFim(cx, W, H, fimTxt, null, { semFoto: true });
      else await desenharLegendaCena(cx, W, H, c.texto);
      let midia = null;
      if (c.tipo === 'video') {
        midia = document.createElement('video'); midia.src = c.src; midia.playsInline = true; midia.muted = !somVideos; midia.preload = 'auto'; midia.crossOrigin = 'anonymous';
        await new Promise((ok) => { midia.oncanplay = ok; midia.onerror = ok; midia.load(); setTimeout(ok, 4000); });
      } else if (c.src) midia = await imagem(absoluta(c.src)).catch(() => null);
      prontas.push({ ...c, dur: Number(c.dur) || 2, camada, midia });
    }
    return prontas;
  }

  function quadro(ctx, cena, t, k) {
    ctx.fillStyle = '#0c0c0c'; ctx.fillRect(0, 0, W, H);
    const p = Math.min(1, t / cena.dur);
    if (cena.midia) {
      if (cena.tipo === 'video') cobrir(ctx, cena.midia, 0, 0, W, H);
      else {
        // movimento suave (zoom e deslocamento alternados)
        const zoom = 1.02 + 0.08 * (k % 2 ? 1 - p : p);
        cobrir(ctx, cena.midia, 0, 0, W, H, zoom, (k % 3 === 0 ? -1 : 1) * 30 * (p - 0.5), 0);
      }
    }
    if (cena.tipo === 'fim') { ctx.fillStyle = 'rgba(12,12,14,0.5)'; ctx.fillRect(0, 0, W, H); }
    ctx.drawImage(cena.camada, 0, 0);
    // transição: escurece no começo e no fim de cada cena
    const a = t < FADE ? 1 - t / FADE : t > cena.dur - FADE ? (t - (cena.dur - FADE)) / FADE : 0;
    if (a > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a) * 0.9})`; ctx.fillRect(0, 0, W, H); }
  }

  async function tocar(gravar) {
    if (!im || !cenas.length) return;
    setMsg(''); setSaida(null); parar.current = false;
    setEstado(gravar ? 'gravando' : 'previa'); setProg(0);
    let prontas;
    try { prontas = await preparar(); } catch (e) { setMsg('Não consegui preparar: ' + e.message); setEstado(''); return; }
    const cv = palco.current; const ctx = cv.getContext('2d');
    const duracao = prontas.reduce((s, c) => s + c.dur, 0);

    // áudio: trilha opcional do aparelho + som dos vídeos (se ligado)
    let audioCtx = null, destino = null, trilhaEl = null;
    const precisaAudio = !!trilha || (somVideos && prontas.some((c) => c.tipo === 'video'));
    if (precisaAudio) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      destino = audioCtx.createMediaStreamDestination();
      if (trilha) {
        trilhaEl = new Audio(URL.createObjectURL(trilha)); trilhaEl.crossOrigin = 'anonymous';
        const g = audioCtx.createGain(); g.gain.value = 0.9;
        audioCtx.createMediaElementSource(trilhaEl).connect(g); g.connect(destino); g.connect(audioCtx.destination);
        trilhaEl._ganho = g;
      }
      if (somVideos) for (const c of prontas) if (c.tipo === 'video' && c.midia) { const s = audioCtx.createMediaElementSource(c.midia); s.connect(destino); s.connect(audioCtx.destination); }
    }

    let gravador = null; const pedacos = [];
    if (gravar) {
      if (!formato) { setMsg('Este navegador não grava vídeo. Use o Safari no iPhone ou no Mac.'); setEstado(''); return; }
      const fluxo = cv.captureStream(FPS);
      if (destino) destino.stream.getAudioTracks().forEach((t) => fluxo.addTrack(t));
      gravador = new MediaRecorder(fluxo, { mimeType: formato, videoBitsPerSecond: 6_000_000 });
      gravador.ondataavailable = (e) => e.data.size && pedacos.push(e.data);
      gravador.start(500);
    }
    if (trilhaEl) { trilhaEl.currentTime = 0; trilhaEl.play().catch(() => {}); }

    const inicio = performance.now();
    let atual = -1;
    await new Promise((fim) => {
      const passo = () => {
        const t = (performance.now() - inicio) / 1000;
        if (t >= duracao || parar.current) { fim(); return; }
        let acc = 0, k = 0;
        while (k < prontas.length - 1 && t >= acc + prontas[k].dur) { acc += prontas[k].dur; k++; }
        const cena = prontas[k];
        if (k !== atual) {
          const ant = prontas[atual]; if (ant?.tipo === 'video') ant.midia.pause();
          if (cena.tipo === 'video') { cena.midia.currentTime = Number(cena.inicio) || 0; cena.midia.play().catch(() => {}); }
          atual = k;
        }
        quadro(ctx, cena, t - acc, k);
        if (trilhaEl?._ganho && t > duracao - 1.2) trilhaEl._ganho.gain.value = Math.max(0, (duracao - t) / 1.2) * 0.9;
        setProg(t / duracao);
        requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    });
    prontas.forEach((c) => c.tipo === 'video' && c.midia?.pause());
    if (trilhaEl) trilhaEl.pause();
    if (gravador) {
      await new Promise((ok) => { gravador.onstop = ok; gravador.stop(); });
      if (!parar.current) {
        const tipo = formato.split(';')[0];
        const blob = new Blob(pedacos, { type: tipo });
        setSaida({ blob, url: URL.createObjectURL(blob), tipo });
        if (!tipo.includes('mp4')) setMsg('Saiu em WebM: o Instagram não aceita. Grave pelo Safari (iPhone ou Mac) para sair em MP4.');
      }
    }
    if (audioCtx) audioCtx.close().catch(() => {});
    setEstado(''); setProg(0);
  }

  const baixar = () => { const a = document.createElement('a'); a.href = saida.url; a.download = `${cod}-reels.${saida.tipo.includes('mp4') ? 'mp4' : 'webm'}`; a.click(); };
  const salvar = async (agora) => {
    if (!saida) return;
    if (!saida.tipo.includes('mp4')) { setMsg('Grave em MP4 (Safari) antes de salvar.'); return; }
    if (!agora && !quando) { setMsg('Escolha dia e hora, ou poste agora.'); return; }
    setOcupado('salvando'); setMsg('');
    try {
      const id = crypto.randomUUID();
      const arq = await enviarArquivo(id, 'video.mp4', saida.blob, 'video/mp4');
      const c = await salvarCriativo({ id, cod, tipo: 'reel', titulo: `Reels ${txt.titulo}`.trim(), arquivos: [arq], legenda: txt.legenda, redes: ['instagram'], modo: 'assistido', agora, quando,
        palavra_chave: txt.palavra_chave, resposta_dm: txt.resposta_dm, dados: { rotulo: txt.rotulo, titulo: txt.titulo, ambientes: txt.ambientes, localizacao: txt.localizacao } });
      setMsg(agora ? 'Pronto.' : 'Agendado. No horário o app te avisa para postar com música.');
      setTimeout(() => aoSalvar(c), 600);
    } catch (e) { setMsg('Não deu certo: ' + e.message); }
    setOcupado('');
  };

  return (
    <div className="adm-reels">
      <div>
        <div className="adm-bloco">
          <label className="adm-campo"><span>Imóvel</span>
            <select value={cod} onChange={(e) => setCod(e.target.value)}><option value="">Escolha o imóvel</option>{imoveis.map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.titulo}</option>)}</select>
          </label>
          {!formato && <p className="adm-erro">Este navegador não grava vídeo. No iPhone e no Mac, use o Safari.</p>}
        </div>
        {im && (
          <>
            <div className="adm-bloco">
              <div className="adm-bloco-topo"><h2>Cenas · {total.toFixed(1)}s</h2>
                <label className="adm-btn">+ Fotos ou vídeos do aparelho<input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { addArquivos([...(e.target.files || [])]); e.target.value = ''; }} /></label>
              </div>
              <ul className="adm-cenas">{cenas.map((c, i) => (
                <li key={c.id} className="adm-cena">
                  {c.tipo === 'video' ? <video src={c.src} muted playsInline /> : c.src ? <img src={c.src} alt="" /> : <div className="adm-cena-ic">sem foto</div>}
                  <div>
                    <b>{c.tipo === 'capa' ? 'Capa' : c.tipo === 'fim' ? 'Encerramento' : c.tipo === 'video' ? 'Vídeo' : 'Foto'}</b>
                    {(c.tipo === 'foto' || c.tipo === 'video') && <input placeholder="Texto na tela (opcional), ex.: Suíte com closet" value={c.texto} onChange={(e) => mudar(c.id, 'texto', e.target.value)} />}
                    <span className="adm-linha">
                      <label className="adm-campo"><span>Segundos</span><input type="number" step="0.1" min="1" max={c.max || 15} value={c.dur} onChange={(e) => mudar(c.id, 'dur', e.target.value)} /></label>
                      {c.tipo === 'video' && <label className="adm-campo"><span>Começa em (s)</span><input type="number" step="0.1" min="0" max={c.max || 0} value={c.inicio} onChange={(e) => mudar(c.id, 'inicio', e.target.value)} /></label>}
                    </span>
                  </div>
                  {c.tipo !== 'capa' && c.tipo !== 'fim' ? (
                    <div className="adm-cena-botoes"><button onClick={() => mover(i, -1)} aria-label="Subir">↑</button><button onClick={() => mover(i, 1)} aria-label="Descer">↓</button><button onClick={() => remover(c.id)} aria-label="Tirar">✕</button></div>
                  ) : <span />}
                </li>
              ))}</ul>
              <p className="adm-sub">Fotos do imóvel que ainda não entraram:</p>
              <div className="adm-estudio-fotos">{(im.fotos || []).filter((f) => !cenas.some((c) => c.src === f)).map((f) => <button key={f} onClick={() => addFoto(f)}><img src={f.replace(/\.(webp|jpe?g)$/i, '-p.$1')} onError={(e) => { e.currentTarget.src = f; }} alt="" /></button>)}</div>
            </div>
            <div className="adm-bloco">
              <div className="adm-bloco-topo"><h2>Textos</h2><button className="adm-btn" disabled={ocupado === 'textos'} onClick={gerarTextos}>{ocupado === 'textos' ? 'Escrevendo…' : '✦ Escrever com IA'}</button></div>
              <div className="adm-grade2">
                <label className="adm-campo"><span>Destaque da capa</span><input value={txt.rotulo} onChange={set('rotulo')} /></label>
                <label className="adm-campo"><span>Título grande (bairro)</span><input value={txt.titulo} onChange={set('titulo')} /></label>
              </div>
              <label className="adm-campo"><span>Ambientes</span><input value={txt.ambientes} onChange={set('ambientes')} /></label>
              <label className="adm-campo"><span>Localização</span><input value={txt.localizacao} onChange={set('localizacao')} /></label>
              <div className="adm-grade2">
                <label className="adm-campo"><span>Encerramento, linha 1</span><input value={txt.linha1} onChange={set('linha1')} /></label>
                <label className="adm-campo"><span>Encerramento, linha 2</span><input value={txt.linha2} onChange={set('linha2')} /></label>
              </div>
              <label className="adm-campo"><span>Legenda</span><textarea rows={8} value={txt.legenda} onChange={set('legenda')} /></label>
              <div className="adm-checks">
                <label className="adm-check"><input type="checkbox" checked={mostrarPreco} onChange={(e) => setMostrarPreco(e.target.checked)} /> Mostrar preço na capa</label>
                <label className="adm-check"><input type="checkbox" checked={somVideos} onChange={(e) => setSomVideos(e.target.checked)} /> Manter o som dos vídeos (narração)</label>
              </div>
              <label className="adm-campo"><span>Trilha própria (opcional, arquivo de áudio do aparelho). O normal é escolher a música no Instagram ao postar.</span><input type="file" accept="audio/*" onChange={(e) => setTrilha(e.target.files?.[0] || null)} /></label>
            </div>
          </>
        )}
      </div>
      <div className="adm-reels-palco">
        <canvas ref={palco} width={W} height={H} />
        {estado && <div className="adm-barra-prog"><i style={{ width: `${Math.round(prog * 100)}%` }} /></div>}
        {im && (
          <div className="adm-wa-acoes">
            {!estado ? (
              <>
                <button className="adm-btn" onClick={() => tocar(false)}>▶ Prévia</button>
                <button className="adm-btn adm-primario" disabled={!formato} onClick={() => tocar(true)}>Gerar vídeo ({Math.round(total)}s)</button>
              </>
            ) : <button className="adm-btn" onClick={() => { parar.current = true; }}>Parar</button>}
          </div>
        )}
        {estado === 'gravando' && <p className="adm-sub">Gravando em tempo real. Deixe esta tela aberta até terminar.</p>}
        {saida && (
          <div className="adm-bloco" style={{ width: '100%', maxWidth: 340 }}>
            <video src={saida.url} controls playsInline style={{ width: '100%', borderRadius: 10 }} />
            <label className="adm-campo"><span>Agendar para</span><input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} /></label>
            <div className="adm-wa-acoes">
              <button className="adm-btn adm-primario" disabled={!!ocupado} onClick={() => salvar(false)}>{ocupado === 'salvando' ? 'Salvando…' : 'Aprovar e agendar'}</button>
              <button className="adm-btn" disabled={!!ocupado} onClick={() => salvar(true)}>Postar agora</button>
              <button className="adm-link" onClick={baixar}>Baixar</button>
            </div>
          </div>
        )}
        {msg && <p className="adm-msg">{msg}</p>}
      </div>
    </div>
  );
}
