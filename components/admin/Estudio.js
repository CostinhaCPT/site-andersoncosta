'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sb } from '@/lib/admin/cliente';
import { dataHora } from '@/lib/admin/ia';
import { brl } from '@/lib/admin/crm';
import { desenharCapa, desenharFim, desenharFoto, fichaPadrao, textosPadrao } from '@/lib/admin/arte';
import EditorReels from './EditorReels';
import { meta, enviarArquivo, salvarCriativo } from '@/lib/admin/estudio';

const TIPOS = { carrossel: ['Carrossel', 1080, 1440], post: ['Post', 1080, 1440], story: ['Story', 1080, 1920], reel: ['Reels (vídeo pronto)', 1080, 1920] };
const STATUS = { rascunho: 'Rascunho', agendado: 'Agendado', aguardando: 'Esperando você postar', publicando: 'Publicando', publicado: 'Publicado', erro: 'Erro', arquivado: 'Arquivado' };
const ROTULOS_PADRAO = (im) => (im?.terreno >= 600 && !/apart/i.test(im?.tipo || '') ? `Terreno de ${Number(im.terreno).toLocaleString('pt-BR')} m²` : /apart/i.test(im?.tipo || '') ? 'Apartamento' : 'Casa ampla');

export default function Estudio() {
  const [sub, setSub] = useState('criar');
  const [conexao, setConexao] = useState(null);
  const [seguidores, setSeguidores] = useState(null);
  const [postar, setPostar] = useState(null);
  useEffect(() => {
    meta({ acao: 'status' }).then(setConexao).catch((e) => setConexao({ conectado: false, motivo: e.message }));
    sb().from('perfil_metricas').select('dia,dados').order('dia', { ascending: false }).limit(30).then(({ data }) => setSeguidores(data || []));
    const id = new URLSearchParams(window.location.search).get('postar');
    if (id) sb().from('criativos').select('*').eq('id', id).maybeSingle().then(({ data }) => data && setPostar(data));
  }, []);
  const hoje = seguidores?.[0]?.dados?.followers_count, antes = seguidores?.at(-1)?.dados?.followers_count;
  if (postar) return <section className="adm-pagina"><Postar criativo={postar} aoFechar={() => { setPostar(null); setSub('agenda'); }} /></section>;
  return (
    <section className="adm-pagina adm-larga">
      <div className="adm-cabeca">
        <div>
          <h1>Estúdio</h1>
          <p className="adm-sub">
            {!conexao ? 'Verificando a Meta…' : conexao.conectado ? `Conectado: @${conexao.instagram} e ${conexao.pagina}${conexao.anuncios ? ' · anúncios liberados' : ''}` : `Meta ainda não conectada. Dá para criar, agendar e postar com música pelo app do Instagram.`}
            {hoje != null && ` · ${hoje.toLocaleString('pt-BR')} seguidores${antes != null && antes !== hoje ? ` (${hoje - antes >= 0 ? '+' : ''}${hoje - antes} em ${Math.max(1, Math.round((Date.parse(seguidores[0].dia) - Date.parse(seguidores.at(-1).dia)) / 864e5))} dias)` : ''}`}
          </p>
        </div>
      </div>
      <div className="adm-subabas">
        {[['criar', 'Criar peça'], ['reels', 'Editor de Reels'], ['agenda', 'Calendário'], ['anuncios', 'Anúncios'], ['metricas', 'Resultado por imóvel']].map(([k, n]) => <button key={k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>{n}</button>)}
      </div>
      {sub === 'criar' && <Criar conectado={!!conexao?.conectado} aoSalvar={(c) => (c?.status === 'aguardando' ? setPostar(c) : setSub('agenda'))} aoReels={() => setSub('reels')} />}
      {sub === 'reels' && <EditorReels aoSalvar={(c) => (c?.status === 'aguardando' ? setPostar(c) : setSub('agenda'))} />}
      {sub === 'agenda' && <Calendario conexao={conexao} aoPostar={setPostar} />}
      {sub === 'anuncios' && <Anuncios />}
      {sub === 'metricas' && <Resultados />}
    </section>
  );
}

// ------------------------------------------------------------------ desenho das peças (padrão do Instagram do Anderson)
async function desenhar(tipo, i, total, d) {
  const [, W, H0] = TIPOS[tipo === 'reel' ? 'story' : tipo];
  // 3:4 como no modelo; quando a Meta publica sozinha, 4:5 (limite da API para imagens)
  const H = d.automatico && H0 === 1440 ? 1350 : H0;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const capa = { im: d.im, foto: d.fotos[0], rotulo: d.rotulo, titulo: d.titulo, preco: d.preco, ficha: fichaPadrao(d.im, d) };
  if (i === 0) { await desenharCapa(ctx, W, H, capa); return cv; }
  if (tipo === 'carrossel' && i === total - 1) {
    await desenharFim(ctx, W, H, { im: d.im, foto: d.fotos[1] || d.fotos[0], titulo: d.tituloFim || d.im.bairro, linha1: d.linha1, linha2: d.linha2 });
    return cv;
  }
  await desenharFoto(ctx, W, H, d.fotos[i]);
  return cv;
}
const blobDe = (cv) => new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.92));

// ------------------------------------------------------------------ criar
function Criar({ conectado, aoSalvar, aoReels }) {
  const [imoveis, setImoveis] = useState([]);
  const [cod, setCod] = useState('');
  const [tipo, setTipo] = useState('carrossel');
  const [fotos, setFotos] = useState([]);
  const [video, setVideo] = useState(null);
  const vazio = { rotulo: '', titulo: '', ambientes: '', localizacao: '', linha1: 'Entre em contato', linha2: 'e saiba mais.', legenda: '', palavra_chave: '', resposta_dm: '' };
  const [txt, setTxt] = useState(vazio);
  const [mostrarPreco, setMostrarPreco] = useState(true);
  const [modo, setModo] = useState('assistido');
  const [redes, setRedes] = useState(['instagram']);
  const [quando, setQuando] = useState('');
  const [previas, setPrevias] = useState([]);
  const [ocupado, setOcupado] = useState('');
  const [msg, setMsg] = useState('');
  const im = imoveis.find((x) => x.codigo === cod);
  const set = (k) => (e) => setTxt((t) => ({ ...t, [k]: e.target.value }));

  useEffect(() => {
    sb().from('imoveis').select('codigo,titulo,resumo,destaques,tipo,bairro,cidade,preco,preco_visivel,area,terreno,quartos,suites,banheiros,vagas,fotos,status').in('status', ['disponivel', 'reservado', 'rascunho']).order('codigo', { ascending: false })
      .then(({ data }) => setImoveis(data || []));
  }, []);
  useEffect(() => {
    if (!im) return;
    setFotos((im.fotos || []).slice(0, 8));
    setTxt({ ...vazio, rotulo: ROTULOS_PADRAO(im), titulo: im.bairro || '', ...textosPadrao(im) });
  }, [cod]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = tipo === 'carrossel' ? Math.min(10, Math.max(2, fotos.length + 1)) : 1;
  const dados = useMemo(() => im && ({ im, fotos, ...txt, automatico: modo === 'automatico', preco: mostrarPreco && im.preco_visivel !== false && im.preco ? brl(im.preco) : '' }), [im, fotos, txt, mostrarPreco, modo]);
  const desenharTudo = useCallback(async () => {
    if (!dados || tipo === 'reel' || !fotos.length) { setPrevias([]); return; }
    const cvs = []; for (let i = 0; i < total; i++) cvs.push(await desenhar(tipo, i, total, dados));
    setPrevias(cvs);
  }, [dados, tipo, total, fotos.length]);
  useEffect(() => { const t = setTimeout(desenharTudo, 300); return () => clearTimeout(t); }, [desenharTudo]);

  const gerar = async () => {
    setOcupado('textos'); setMsg('');
    try { const r = await meta({ acao: 'textos', imovel: cod, tipo }); setTxt((t) => ({ ...t, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v)) })); }
    catch (e) { setMsg(e.message); }
    setOcupado('');
  };
  const alternarFoto = (f) => setFotos((l) => (l.includes(f) ? l.filter((x) => x !== f) : l.length >= 9 ? l : [...l, f]));
  const baixar = async () => {
    for (let i = 0; i < previas.length; i++) { const a = document.createElement('a'); a.href = previas[i].toDataURL('image/jpeg', 0.92); a.download = `${cod}-${tipo}-${i + 1}.jpg`; a.click(); await new Promise((r) => setTimeout(r, 250)); }
  };
  const salvar = async (agora) => {
    if (!im) return;
    if (tipo === 'reel' && !video) { setMsg('Escolha o vídeo, ou monte no Editor de Reels.'); return; }
    if (agora && modo === 'automatico' && !conectado) { setMsg('Para postar sozinho a Meta precisa estar conectada. Use "Com música" e poste pelo app.'); return; }
    if (!agora && !quando) { setMsg('Escolha dia e hora, ou poste agora.'); return; }
    setOcupado('salvando'); setMsg('');
    try {
      const id = crypto.randomUUID(); const arquivos = [];
      if (tipo === 'reel') {
        if (video.size > 95 * 1024 * 1024) throw new Error('Vídeo acima de 95 MB. Exporte em 1080p.');
        arquivos.push(await enviarArquivo(id, `video.${(video.name.split('.').pop() || 'mp4').toLowerCase()}`, video, video.type || 'video/mp4'));
      } else {
        for (let i = 0; i < previas.length; i++) arquivos.push(await enviarArquivo(id, `${String(i + 1).padStart(2, '0')}.jpg`, await blobDe(previas[i]), 'image/jpeg'));
      }
      const c = await salvarCriativo({ id, cod, tipo, titulo: `${txt.rotulo} ${txt.titulo}`.trim() || im.titulo, arquivos, legenda: txt.legenda, redes, modo, agora, quando,
        palavra_chave: txt.palavra_chave, resposta_dm: txt.resposta_dm, dados: { rotulo: txt.rotulo, titulo: txt.titulo, ambientes: txt.ambientes, localizacao: txt.localizacao } });
      setMsg(agora ? (modo === 'assistido' ? 'Pronto. Abrindo a tela de postagem…' : 'Publicado.') : modo === 'assistido' ? 'Agendado. No horário o app te avisa para postar com música.' : 'Agendado. Sai sozinho no horário.');
      setTimeout(() => aoSalvar(c), 700);
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
              <p className="adm-sub">Toque nas fotos na ordem em que devem aparecer {tipo === 'carrossel' ? '(a 1ª é a capa e a 2ª fecha o carrossel; até 9)' : '(usa a primeira)'}.</p>
              <div className="adm-estudio-fotos">{(im.fotos || []).map((f) => {
                const n = fotos.indexOf(f);
                return <button key={f} className={n >= 0 ? 'on' : ''} onClick={() => alternarFoto(f)}><img src={f.replace(/\.(webp|jpe?g)$/i, '-p.$1')} onError={(e) => { e.currentTarget.src = f; }} alt="" />{n >= 0 && <b>{n + 1}</b>}</button>;
              })}</div>
            </>
          )}
          {tipo === 'reel' && (
            <>
              <label className="adm-campo"><span>Vídeo vertical já editado (MP4 ou MOV, 1080p)</span><input type="file" accept="video/mp4,video/quicktime" onChange={(e) => setVideo(e.target.files?.[0] || null)} /></label>
              <p className="adm-sub">Quer montar o vídeo com as fotos e vídeos do imóvel, capa e encerramento no seu padrão? <button className="adm-link" onClick={aoReels}>Abrir o Editor de Reels</button></p>
            </>
          )}
        </div>
        {im && (
          <div className="adm-bloco">
            <div className="adm-bloco-topo"><h2>Textos</h2><button className="adm-btn" disabled={ocupado === 'textos'} onClick={gerar}>{ocupado === 'textos' ? 'Escrevendo…' : '✦ Escrever com IA'}</button></div>
            {tipo !== 'reel' && (
              <>
                <div className="adm-grade2">
                  <label className="adm-campo"><span>Destaque (acima do bairro, à esquerda)</span><input value={txt.rotulo} onChange={set('rotulo')} placeholder="Mais de 1200 m² de terreno" /></label>
                  <label className="adm-campo"><span>Título grande (bairro)</span><input value={txt.titulo} onChange={set('titulo')} placeholder={im.bairro} /></label>
                </div>
                <label className="adm-campo"><span>Ambientes</span><textarea rows={2} value={txt.ambientes} onChange={set('ambientes')} placeholder="Casa ampla com excelente padrão construtivo e espaço externo para ampliação." /></label>
                <label className="adm-campo"><span>Localização</span><textarea rows={2} value={txt.localizacao} onChange={set('localizacao')} placeholder="Situada em uma região estratégica, a 15 minutos do Centro de Jaraguá do Sul." /></label>
                {tipo === 'carrossel' && (
                  <div className="adm-grade2">
                    <label className="adm-campo"><span>Último slide, linha 1</span><input value={txt.linha1} onChange={set('linha1')} /></label>
                    <label className="adm-campo"><span>Último slide, linha 2</span><input value={txt.linha2} onChange={set('linha2')} /></label>
                  </div>
                )}
              </>
            )}
            {tipo !== 'story' && <label className="adm-campo"><span>Legenda</span><textarea rows={10} value={txt.legenda} onChange={set('legenda')} /></label>}
            <div className="adm-grade2">
              <label className="adm-campo"><span>Palavra para comentar (opcional)</span><input value={txt.palavra_chave} onChange={(e) => setTxt({ ...txt, palavra_chave: e.target.value.toUpperCase() })} placeholder="VILANOVA" /></label>
              <label className="adm-campo"><span>Mensagem automática para quem comentar</span><input value={txt.resposta_dm} onChange={set('resposta_dm')} /></label>
            </div>
            <div className="adm-checks">
              <label className="adm-check"><input type="checkbox" checked={mostrarPreco} onChange={(e) => setMostrarPreco(e.target.checked)} /> Mostrar preço</label>
            </div>
          </div>
        )}
        {im && (
          <div className="adm-bloco">
            <h2>Como publicar</h2>
            <div className="adm-checks">
              <label className="adm-check"><input type="radio" checked={modo === 'assistido'} onChange={() => setModo('assistido')} /> Com música (o app te avisa e você posta pelo Instagram)</label>
              <label className="adm-check"><input type="radio" checked={modo === 'automatico'} onChange={() => setModo('automatico')} /> Sem música (posta sozinho)</label>
            </div>
            {modo === 'automatico' && tipo !== 'story' && tipo !== 'reel' && (
              <div className="adm-checks">
                <label className="adm-check"><input type="checkbox" checked={redes.includes('instagram')} onChange={() => setRedes((r) => (r.includes('instagram') ? r.filter((x) => x !== 'instagram') : [...r, 'instagram']))} /> Instagram</label>
                <label className="adm-check"><input type="checkbox" checked={redes.includes('facebook')} onChange={() => setRedes((r) => (r.includes('facebook') ? r.filter((x) => x !== 'facebook') : [...r, 'facebook']))} /> Facebook</label>
              </div>
            )}
            <label className="adm-campo"><span>Agendar para</span><input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} /></label>
            <div className="adm-wa-acoes">
              <button className="adm-btn adm-primario" disabled={!!ocupado} onClick={() => salvar(false)}>{ocupado === 'salvando' ? 'Salvando…' : 'Aprovar e agendar'}</button>
              <button className="adm-btn" disabled={!!ocupado} onClick={() => salvar(true)}>{modo === 'assistido' ? 'Postar agora' : 'Publicar agora'}</button>
              {previas.length > 0 && <button className="adm-link" onClick={baixar}>Baixar imagens</button>}
            </div>
            <p className="adm-sub">{modo === 'assistido'
              ? 'A Meta não deixa programas de fora colocarem música da biblioteca do Instagram. Por isso, no horário marcado chega uma notificação: você toca, salva as imagens, copia a legenda e escolhe a música no Instagram. Leva menos de 1 minuto.'
              : 'Aprovar é o seu OK: nada vai ao ar sem ele. Horários que costumam funcionar: 12h, 18h30 e 21h.'}</p>
            {msg && <p className="adm-msg">{msg}</p>}
          </div>
        )}
      </div>
      <div className="adm-estudio-previa">
        {previas.length ? previas.map((cv, k) => <img key={k} src={cv.toDataURL('image/jpeg', 0.7)} alt={`Prévia ${k + 1}`} className={tipo === 'story' ? 'story' : ''} />)
          : <p className="adm-sub">{im ? (tipo === 'reel' ? 'O vídeo vai como está.' : 'Escolha as fotos.') : 'Escolha um imóvel para começar.'}</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ postar pelo Instagram (com música)
export function Postar({ criativo: c, aoFechar }) {
  const [msg, setMsg] = useState('');
  const [arquivos, setArquivos] = useState(null);
  useEffect(() => {
    Promise.all((c.arquivos || []).map(async (a, i) => {
      const b = await (await fetch(a.url)).blob();
      return new File([b], `${c.imovel_codigo || 'peca'}-${i + 1}.${a.tipo === 'video' ? 'mp4' : 'jpg'}`, { type: b.type || (a.tipo === 'video' ? 'video/mp4' : 'image/jpeg') });
    })).then(setArquivos).catch(() => setArquivos([]));
  }, [c]);
  const salvarNoCelular = async () => {
    setMsg('');
    try {
      if (arquivos?.length && navigator.canShare?.({ files: arquivos })) { await navigator.share({ files: arquivos }); setMsg('Escolha "Salvar imagens" (ou "Salvar vídeo") na janela que abriu.'); return; }
      for (const f of arquivos || []) { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); await new Promise((r) => setTimeout(r, 300)); }
      setMsg('Arquivos baixados.');
    } catch (e) { if (e.name !== 'AbortError') setMsg('Não deu: ' + e.message); }
  };
  const copiar = async () => { try { await navigator.clipboard.writeText(c.legenda || ''); setMsg('Legenda copiada. É só colar no Instagram.'); } catch { setMsg('Não consegui copiar. Segure no texto abaixo e copie.'); } };
  const postei = async () => {
    await sb().from('criativos').update({ status: 'publicado', publicado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq('id', c.id);
    aoFechar();
  };
  return (
    <div className="adm-postar">
      <button className="adm-link" onClick={aoFechar}>← Voltar</button>
      <h1>Postar {c.imovel_codigo} · {TIPOS[c.tipo]?.[0]}</h1>
      <div className="adm-postar-fotos">{(c.arquivos || []).map((a, i) => (a.tipo === 'video' ? <video key={i} src={a.url} controls playsInline /> : <img key={i} src={a.url} alt="" />))}</div>
      <ol className="adm-passos">
        <li><button className="adm-btn adm-primario" disabled={!arquivos} onClick={salvarNoCelular}>{arquivos ? '1. Salvar no celular' : 'Preparando…'}</button></li>
        {c.tipo !== 'story' && <li><button className="adm-btn" onClick={copiar}>2. Copiar legenda</button></li>}
        <li><a className="adm-btn" href="instagram://app">3. Abrir o Instagram</a> <small>Selecione as imagens na ordem, toque em <b>Adicionar música</b>, escolha a faixa e cole a legenda.</small></li>
        <li><button className="adm-btn" onClick={postei}>4. Já postei</button> <small>As métricas deste post entram sozinhas no relatório quando a Meta estiver conectada.</small></li>
      </ol>
      {msg && <p className="adm-msg">{msg}</p>}
      {c.legenda && <pre className="adm-legenda">{c.legenda}</pre>}
    </div>
  );
}

// ------------------------------------------------------------------ calendário
/** Todas as telas da peça lado a lado, para conferir antes de publicar ou anunciar. */
function Pecas({ arquivos, so_capa }) {
  const lista = (arquivos || []).slice(0, so_capa ? 1 : 10);
  if (!lista.length) return <p className="adm-sub">Esta peça ainda não tem arte.</p>;
  return <div className="adm-postar-fotos">{lista.map((a, i) => (a.tipo === 'video' ? <video key={i} src={a.url} controls playsInline /> : <a key={i} href={a.url} target="_blank" rel="noopener"><img src={a.url} alt={`Tela ${i + 1}`} /></a>))}</div>;
}

function Calendario({ conexao, aoPostar }) {
  const [lista, setLista] = useState(null);
  const [aberta, setAberta] = useState(null);
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
            {c.arquivos?.[0] && (c.arquivos[0].tipo === 'video' ? <div className="adm-peca-mini">▶</div> : <img className="adm-peca-mini" src={c.arquivos[0].url} alt="" style={{ cursor: 'pointer' }} onClick={() => setAberta(aberta === c.id ? null : c.id)} />)}
            <div>
              <b>{c.imovel_codigo} · {TIPOS[c.tipo]?.[0]}</b> <span className={`adm-tag ${c.status === 'erro' ? 't-bloq' : c.status === 'publicado' ? 't-voce' : c.status === 'aguardando' ? 't-alerta' : ''}`}>{STATUS[c.status]}</span>{c.modo === 'assistido' && <span className="adm-tag">com música</span>}
              <small>{c.status === 'publicado' ? `Publicado ${dataHora(c.publicado_em)}` : c.agendado_para ? `Agendado para ${dataHora(c.agendado_para)}` : 'Sem data'} · {c.modo === 'assistido' ? 'você posta pelo app' : (c.redes || []).join(' e ')}{c.palavra_chave ? ` · palavra ${c.palavra_chave}` : ''}</small>
              {c.metricas && Object.keys(c.metricas).length > 0 && <small>Alcance {c.metricas.reach ?? 0} · visualizações {c.metricas.views ?? 0} · curtidas {c.metricas.likes ?? 0} · envios {c.metricas.shares ?? 0} · salvos {c.metricas.saved ?? 0}</small>}
              {c.erro && <small className="adm-erro">{c.erro}</small>}
              {aberta === c.id && (<><Pecas arquivos={c.arquivos} />{c.legenda && <p className="adm-legenda-previa">{c.legenda}</p>}</>)}
              <div className="adm-wa-acoes">
                <button className="adm-link" onClick={() => setAberta(aberta === c.id ? null : c.id)}>{aberta === c.id ? 'Fechar peça' : `Ver peça${(c.arquivos || []).length > 1 ? ` (${c.arquivos.length} telas)` : ''}`}</button>
                {(c.modo === 'assistido' ? ['rascunho', 'agendado', 'aguardando', 'erro'] : []).includes(c.status) && <button className="adm-link" onClick={() => aoPostar(c)}>Postar agora</button>}
                {c.modo !== 'assistido' && ['rascunho', 'agendado', 'erro'].includes(c.status) && conexao?.conectado && <button className="adm-link" onClick={() => acao(c, 'publicar')}>Publicar agora</button>}
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
      <Pecas arquivos={criativo.arquivos} so_capa />
      {(criativo.arquivos || []).length > 1 && <p className="adm-sub">O anúncio usa só a capa acima, com o texto abaixo. As outras {criativo.arquivos.length - 1} telas do carrossel ficam no post do feed.</p>}
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
