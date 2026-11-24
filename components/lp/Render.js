'use client';
// Renders a landing page built in the admin. Used by the public /lp/ page and by the admin preview.
import { useEffect, useRef, useState } from 'react';
import { SITE } from '@/lib/site';
import { brl, miniatura } from '@/lib/format';
import { videoEmbed } from '@/lib/admin/opcoes';
import { abrirWhats, evento } from '@/lib/whats';
import Analise from '@/components/Analise';
import Galeria from '@/components/Galeria';

const subst = (t, nome) => String(t || '').replaceAll('{nome}', nome || '').replace(/^,\s*/, '').replace(/\s+,/g, ',');
const paragrafos = (t) => String(t || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

export default function Render({ lp, imoveis = {}, previa = false, aoEvento = () => {} }) {
  const nome = lp.primeiro_nome || (previa ? 'Mariana' : '');
  const h = lp.hero || {};
  const primeiraFoto = (() => {
    for (const b of lp.blocos || []) {
      const c = b.dados?.codigo || b.dados?.itens?.[0]?.codigo;
      const f = c && imoveis[String(c).toUpperCase()]?.fotos?.[0];
      if (f) return f;
      const a = b.dados?.itens?.[0]?.avulso?.fotos?.[0];
      if (a) return a;
    }
    return null;
  })();
  const imagem = h.imagem || primeiraFoto;
  const temForm = (lp.blocos || []).some((b) => b.tipo === 'formulario');

  const acaoHero = (e) => {
    if (h.cta_acao === 'whatsapp' || (h.cta_acao === 'formulario' && !temForm)) {
      e.preventDefault();
      if (!previa) { aoEvento('clique', { onde: 'hero' }); abrirWhats(h.cta_mensagem || `Oi, Anderson! Vi a página "${subst(h.titulo, nome)}" e quero conversar.`, { local: 'lp' }); }
    }
  };

  return (
    <div className="lp">
      <header className="lp-topo">
        <div className="wrap"><img src="/marca/anderson-costa-horizontal-preto.svg" alt="Anderson Costa Imóveis" height="24" /><span>{SITE.creci}</span></div>
      </header>
      <section className="lp-hero" style={imagem ? { backgroundImage: `linear-gradient(180deg, rgba(7,7,7,.35), rgba(7,7,7,.85)), url(${imagem})` } : undefined}>
        <div className="wrap">
          {h.eyebrow && <span className="eyebrow">{subst(h.eyebrow, nome)}</span>}
          <h1>{subst(h.titulo, nome) || 'Título da página'}</h1>
          {h.subtitulo && <p className="lead">{subst(h.subtitulo, nome)}</p>}
          {h.cta_texto && (
            <a className="btn btn-claro" href={h.cta_acao === 'formulario' && temForm ? '#lp-form' : '#lp-conteudo'} onClick={acaoHero}>{h.cta_texto}</a>
          )}
        </div>
      </section>
      <div id="lp-conteudo">
        {(lp.blocos || []).map((b) => <Bloco key={b.id} b={b} lp={lp} imoveis={imoveis} nome={nome} previa={previa} aoEvento={aoEvento} />)}
      </div>
      <footer className="lp-rodape">
        <div className="wrap">
          <p><b>Anderson Costa</b> · Corretor de imóveis · {SITE.creci} · Jaraguá do Sul, SC</p>
          <p>Informações sujeitas a confirmação e alteração sem aviso. <a href="/politica-de-privacidade/">Política de privacidade</a></p>
        </div>
      </footer>
    </div>
  );
}

function Bloco({ b, lp, imoveis, nome, previa, aoEvento }) {
  const d = b.dados || {};
  const im = d.codigo ? imoveis[String(d.codigo).toUpperCase()] : null;
  switch (b.tipo) {
    case 'imoveis':
      return (
        <section className="lp-sec">
          <div className="wrap">
            {d.titulo && <h2>{subst(d.titulo, nome)}</h2>}
            {paragrafos(subst(d.intro, nome)).map((p, k) => <p key={k} className="muted">{p}</p>)}
            <div className="lp-imoveis">
              {(d.itens || []).map((it, k) => <CardLp key={k} it={it} i={it.codigo ? imoveis[String(it.codigo).toUpperCase()] : null} reacoes={lp.tipo === 'curadoria' && d.reacoes !== false} previa={previa} aoEvento={aoEvento} nome={nome} />)}
              {!(d.itens || []).length && previa && <p className="muted">Escolha os imóveis deste bloco.</p>}
            </div>
          </div>
        </section>
      );
    case 'imovel_destaque':
      if (!im) return previa ? <section className="lp-sec"><div className="wrap muted">Escolha o imóvel do destaque.</div></section> : null;
      return (
        <section className="lp-sec">
          <div className="wrap">
            <span className="eyebrow">{im.bairro} · {im.cidade} · {im.codigo}</span>
            <h2>{im.titulo}</h2>
            <Galeria fotos={im.fotos} titulo={im.titulo} />
            <div className="ficha">
              <div><b>{im.precoVisivel ? brl(im.preco) : 'Sob consulta'}</b><span>Preço</span></div>
              {im.area ? <div><b>{im.area} m²</b><span>Área</span></div> : null}
              {im.terreno ? <div><b>{im.terreno} m²</b><span>Terreno</span></div> : null}
              {im.quartos > 0 && <div><b>{im.quartos}</b><span>Quartos</span></div>}
              {im.suites > 0 && <div><b>{im.suites}</b><span>Suítes</span></div>}
              {im.vagas > 0 && <div><b>{im.vagas}</b><span>Vagas</span></div>}
            </div>
            {paragrafos(im.descricao).map((p, k) => <p key={k}>{p}</p>)}
            {im.atencao?.length > 0 && <div className="lp-atencao"><b>Pontos de atenção</b><ul>{im.atencao.map((a) => <li key={a}>{a}</li>)}</ul></div>}
          </div>
        </section>
      );
    case 'analise':
      return <section className="lp-sec"><div className="wrap"><AnaliseEscolha d={d} lp={lp} imoveis={imoveis} previa={previa} aoEvento={aoEvento} /></div></section>;
    case 'texto':
      return (
        <section className="lp-sec">
          <div className="wrap lp-estreito">
            {d.titulo && <h2>{subst(d.titulo, nome)}</h2>}
            {paragrafos(subst(d.texto, nome)).map((p, k) => <p key={k}>{p}</p>)}
          </div>
        </section>
      );
    case 'lista':
      return (
        <section className="lp-sec">
          <div className="wrap lp-estreito">
            {d.titulo && <h2>{subst(d.titulo, nome)}</h2>}
            <ul className="lp-lista">{(d.itens || []).filter(Boolean).map((x, k) => <li key={k}>{x}</li>)}</ul>
          </div>
        </section>
      );
    case 'video': {
      const url = videoEmbed(d.url);
      if (!url) return null;
      return (
        <section className="lp-sec">
          <div className="wrap lp-estreito">
            {d.titulo && <h2>{d.titulo}</h2>}
            <div className="lp-video"><iframe src={url} title={d.titulo || 'Vídeo'} loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
          </div>
        </section>
      );
    }
    case 'metodo':
      return (
        <section className="lp-sec escuro">
          <div className="wrap">
            <span className="eyebrow">Método Compra Segura</span>
            <h2>{d.titulo || 'Como eu trabalho'}</h2>
            <div className="passos">
              <div className="passo"><span className="n">01 · CURADORIA</span><h3>Os 3 que fazem sentido</h3><p>Entendo a rotina da família antes de mostrar qualquer imóvel e seleciono só o que atende, incluindo opções fora do site.</p></div>
              <div className="passo"><span className="n">02 · ANÁLISE DE COMPRA</span><h3>Os números na mesa</h3><p>Preço por m² comparado ao bairro, simulação de financiamento e checklist de documentos.</p></div>
              <div className="passo"><span className="n">03 · VÍDEO HONESTO</span><h3>O que é bom e o que pesa</h3><p>Um tour mostrando os pontos fortes e os pontos de atenção, para você chegar na visita sabendo o que olhar.</p></div>
            </div>
          </div>
        </section>
      );
    case 'sobre':
      return (
        <section className="lp-sec">
          <div className="wrap lp-sobre">
            <img src="/img/anderson-sofa-2.webp" alt="Anderson Costa" loading="lazy" />
            <div>{d.titulo && <h2>{d.titulo}</h2>}{paragrafos(d.texto).map((p, k) => <p key={k}>{p}</p>)}</div>
          </div>
        </section>
      );
    case 'faq':
      return (
        <section className="lp-sec">
          <div className="wrap lp-estreito">
            {d.titulo && <h2>{d.titulo}</h2>}
            {(d.itens || []).filter((x) => x.p).map((x, k) => <details key={k} className="lp-faq"><summary>{x.p}</summary><p>{x.r}</p></details>)}
          </div>
        </section>
      );
    case 'galeria':
      if (!(d.fotos || []).length) return null;
      return <section className="lp-sec"><div className="wrap">{d.titulo && <h2>{d.titulo}</h2>}<Galeria fotos={d.fotos} titulo={d.titulo || 'Fotos'} /></div></section>;
    case 'formulario':
      return <Formulario d={d} lp={lp} previa={previa} aoEvento={aoEvento} />;
    case 'cta':
      return (
        <section className="lp-sec escuro lp-cta">
          <div className="wrap lp-estreito">
            {d.titulo && <h2>{subst(d.titulo, nome)}</h2>}
            {d.texto && <p className="muted">{subst(d.texto, nome)}</p>}
            <button className="btn btn-whats" onClick={() => { if (previa) return; aoEvento('clique', { onde: 'cta' }); abrirWhats(subst(d.mensagem, nome) || 'Oi, Anderson!', { local: 'lp' }); }}>{d.botao || 'Falar no WhatsApp'}</button>
          </div>
        </section>
      );
    default:
      return null;
  }
}

function CardLp({ it, i, reacoes, previa, aoEvento, nome }) {
  const a = it.avulso;
  const dados = i || (a ? {
    titulo: a.titulo, bairro: a.bairro, cidade: a.cidade || 'Jaraguá do Sul', preco: Number(a.preco) || null, precoVisivel: !!a.preco,
    area: Number(a.area) || null, quartos: Number(a.quartos) || 0, suites: Number(a.suites) || 0, vagas: Number(a.vagas) || 0, fotos: a.fotos || [],
  } : null);
  const [reacao, setReacao] = useState(null);
  const [motivo, setMotivo] = useState(false);
  if (!dados) return previa ? <div className="lp-card muted">Imóvel {it.codigo} não encontrado ou não disponível.</div> : null;
  const ref = i?.codigo || a?.titulo || '';
  const publicado = i && !i.rascunho && i.slug;

  const reagir = (r, m) => {
    setReacao(r); setMotivo(false);
    if (previa) return;
    aoEvento('reagiu', { codigo: i?.codigo || null, titulo: dados.titulo, reacao: r, motivo: m || null });
    if (r === 'visitar') abrirWhats(`Oi, Anderson! Sou ${nome || 'eu'}, da curadoria. Quero visitar o imóvel ${i?.codigo ? `${i.codigo} (${dados.titulo})` : dados.titulo}.`, { local: 'lp_curadoria', imovel: i?.codigo });
  };

  return (
    <article className="lp-card">
      <FotosCard fotos={dados.fotos || []} titulo={dados.titulo} />
      <div className="lp-card-corpo">
        <small>{dados.bairro} · {dados.cidade}{i?.codigo ? ` · ${i.codigo}` : ''}</small>
        <h3>{dados.titulo}</h3>
        <div className="specs">{dados.area ? <span>{dados.area} m²</span> : null}{dados.quartos > 0 && <span>{dados.quartos} quartos</span>}{dados.suites > 0 && <span>{dados.suites} suíte{dados.suites > 1 ? 's' : ''}</span>}{dados.vagas > 0 && <span>{dados.vagas} vaga{dados.vagas > 1 ? 's' : ''}</span>}</div>
        <b className="lp-preco">{dados.precoVisivel && dados.preco ? brl(dados.preco) : 'Preço sob consulta'}</b>
        {it.porque && <p className="lp-porque"><b>Por que escolhi:</b> {it.porque}</p>}
        {(it.atencao || (!it.sem_atencao && (i?.atencao || [])[0])) && <p className="lp-atencao-curta"><b>Atenção:</b> {it.atencao || i.atencao[0]}</p>}
        {publicado && <a className="lp-link" href={`/imovel/${i.slug}/`} target="_blank" rel="noopener" onClick={() => !previa && aoEvento('viu_imovel', { codigo: i.codigo })}>Ver fotos e detalhes</a>}
        {reacoes && (
          <div className="lp-reacoes">
            {reacao === 'visitar' ? <p className="lp-ok">Anotado. O Anderson vai combinar a visita com você.</p>
              : reacao === 'nao' ? <p className="lp-ok">Obrigado, isso ajuda o Anderson a ajustar a busca.</p>
              : motivo ? (
                <div className="lp-motivos">
                  <span>O que pesou?</span>
                  {['Preço', 'Localização', 'Tamanho', 'Estilo do imóvel', 'Outro motivo'].map((m) => <button key={m} onClick={() => reagir('nao', m)}>{m}</button>)}
                </div>
              ) : (
                <>
                  <button className="btn btn-escuro" onClick={() => reagir('visitar')}>Quero visitar</button>
                  <button className="btn btn-borda" onClick={() => setMotivo(true)}>Não é pra mim</button>
                </>
              )}
          </div>
        )}
      </div>
    </article>
  );
}

function Formulario({ d, lp, previa, aoEvento }) {
  const [f, setF] = useState({ nome: '', whats: '' });
  const [estado, setEstado] = useState('');
  const enviar = async (e) => {
    e.preventDefault();
    const fone = f.whats.replace(/\D/g, '');
    if (f.nome.trim().length < 2 || fone.length < 10) { setEstado('erro'); return; }
    if (previa) { setEstado('ok'); return; }
    setEstado('enviando');
    const ok = await aoEvento('lead', { nome: f.nome.trim(), whatsapp: fone });
    evento('form_lp', { lp: lp.slug }, { nome: f.nome.trim(), telefone: fone });
    setEstado(ok === false ? 'falha' : 'ok');
  };
  return (
    <section className="lp-sec lp-form-sec" id="lp-form">
      <div className="wrap lp-estreito">
        {d.titulo && <h2>{d.titulo}</h2>}
        {d.texto && <p className="muted">{d.texto}</p>}
        {estado === 'ok' ? (
          <div className="lp-form-ok">
            <p><b>Recebi, {f.nome.split(' ')[0]}.</b> Te chamo no WhatsApp em breve. Se preferir adiantar, fale comigo agora:</p>
            <button className="btn btn-whats" onClick={() => !previa && abrirWhats(`Oi, Anderson! Sou ${f.nome}, deixei meu contato na página.`, { local: 'lp_form' })}>Falar no WhatsApp</button>
          </div>
        ) : (
          <form className="box" onSubmit={enviar}>
            <div className="duas">
              <div className="campo"><label htmlFor="lpn">Nome</label><input id="lpn" autoComplete="name" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required /></div>
              <div className="campo"><label htmlFor="lpw">WhatsApp</label><input id="lpw" inputMode="tel" autoComplete="tel" placeholder="(47) 9...." value={f.whats} onChange={(e) => setF({ ...f, whats: e.target.value })} required /></div>
            </div>
            {estado === 'erro' && <p className="chat-erro">Confira o nome e o WhatsApp com DDD.</p>}
            {estado === 'falha' && <p className="chat-erro">Não consegui enviar agora. Tente de novo ou fale no WhatsApp.</p>}
            <button className="btn btn-escuro btn-full" disabled={estado === 'enviando'}>{estado === 'enviando' ? 'Enviando…' : d.botao || 'Enviar'}</button>
            <p className="lgpd">Uso seus dados só para este atendimento, conforme a política de privacidade.</p>
          </form>
        )}
      </div>
    </section>
  );
}

// Imóveis com preço que a página apresenta (blocos de imóveis), na ordem em que aparecem.
function imoveisDaPagina(lp, imoveis) {
  const lista = [];
  const vistos = new Set();
  for (const b of lp.blocos || []) {
    if (b.tipo !== 'imoveis') continue;
    for (const it of b.dados?.itens || []) {
      const i = it.codigo ? imoveis[String(it.codigo).toUpperCase()] : null;
      const a = it.avulso;
      const dados = i || (a && Number(a.preco) ? {
        codigo: '', titulo: a.titulo, bairro: a.bairro, cidade: a.cidade || 'Jaraguá do Sul', preco: Number(a.preco), tipoSlug: '', aceitaFinanciamento: true,
      } : null);
      if (!dados?.preco) continue;
      const chave = dados.codigo || dados.titulo;
      if (vistos.has(chave)) continue;
      vistos.add(chave); lista.push({ chave, dados });
    }
  }
  return lista;
}

// Análise de compra: o lead escolhe de qual imóvel quer ver a análise.
function AnaliseEscolha({ d, lp, imoveis, previa, aoEvento }) {
  const fixo = d.codigo ? imoveis[String(d.codigo).toUpperCase()] : null;
  const lista = imoveisDaPagina(lp, imoveis);
  if (fixo?.preco && !lista.some((x) => x.chave === fixo.codigo)) lista.unshift({ chave: fixo.codigo, dados: fixo });
  const [sel, setSel] = useState(fixo?.codigo || lista[0]?.chave || '');
  if (!lista.length) return previa ? <p className="muted">Adicione imóveis com preço à página (ou escolha um imóvel nesta análise).</p> : null;
  const atual = lista.find((x) => x.chave === sel) || lista[0];
  return (
    <>
      {lista.length > 1 && (
        <div className="analise-escolha">
          <label htmlFor="an-sel">Análise de compra para qual imóvel?</label>
          <select id="an-sel" value={atual.chave} onChange={(e) => setSel(e.target.value)}>
            {lista.map((x) => <option key={x.chave} value={x.chave}>{x.dados.codigo ? `${x.dados.codigo} · ` : ''}{x.dados.titulo}</option>)}
          </select>
        </div>
      )}
      <Analise key={atual.chave} i={atual.dados} />
    </>
  );
}

// Fotos do card: todas as fotos, arrasta no celular, setas no computador, toque abre em tela cheia.
function FotosCard({ fotos, titulo }) {
  const ref = useRef(null);
  const [n, setN] = useState(0);
  const [aberta, setAberta] = useState(null);
  const total = fotos.length;
  const ir = (e, dir) => {
    e.preventDefault(); e.stopPropagation();
    const el = ref.current; if (!el) return;
    el.scrollTo({ left: Math.max(0, Math.min(total - 1, n + dir)) * el.clientWidth, behavior: 'smooth' });
  };
  const prox = () => setAberta((x) => (x + 1) % total);
  const ant = () => setAberta((x) => (x - 1 + total) % total);
  useEffect(() => {
    if (aberta === null) return;
    const k = (e) => { if (e.key === 'Escape') setAberta(null); if (e.key === 'ArrowRight') prox(); if (e.key === 'ArrowLeft') ant(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [aberta, total]);
  if (!total) return <div className="lp-card-foto" />;
  return (
    <div className="lp-card-foto">
      <div className="fotos-trilho" ref={ref} onScroll={() => { const el = ref.current; if (el) setN(Math.round(el.scrollLeft / el.clientWidth)); }}>
        {fotos.map((f, k) => (Math.abs(k - n) <= 1
          ? <img key={f} src={miniatura(f)} alt={k === 0 ? titulo : `${titulo}, foto ${k + 1}`} loading={k === 0 ? 'eager' : 'lazy'} decoding="async" draggable="false" onClick={() => setAberta(k)} style={{ cursor: 'zoom-in' }} />
          : <span key={f} className="foto-depois" aria-hidden="true" />))}
      </div>
      {total > 1 && <>
        {n > 0 && <button type="button" className="fotos-nav ant" aria-label="Foto anterior" onClick={(e) => ir(e, -1)}>‹</button>}
        {n < total - 1 && <button type="button" className="fotos-nav prox" aria-label="Próxima foto" onClick={(e) => ir(e, 1)}>›</button>}
        <span className="lp-foto-cont">{n + 1} / {total}</span>
      </>}
      {aberta !== null && (
        <div className="lightbox" onClick={() => setAberta(null)}>
          <img src={fotos[aberta]} alt={`${titulo}, foto ${aberta + 1}`} onClick={(e) => e.stopPropagation()} />
          <button className="x" aria-label="Fechar">×</button>
          {total > 1 && <>
            <button className="nav ant" aria-label="Anterior" onClick={(e) => { e.stopPropagation(); ant(); }}>‹</button>
            <button className="nav prox" aria-label="Próxima" onClick={(e) => { e.stopPropagation(); prox(); }}>›</button>
          </>}
          <span className="cont">{aberta + 1} / {total}</span>
        </div>
      )}
    </div>
  );
}
