'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sb, BUCKET, urlPublica } from '@/lib/admin/cliente';
import { processarFoto } from '@/lib/admin/imagem';
import { slugify } from '@/lib/admin/opcoes';
import { chamarAdmin, dataCurta, fone } from '@/lib/admin/ia';
import { BLOCOS, MODELOS, novoBloco, novoId, slugAleatorio } from '@/lib/lp';
import { mapearImovel } from '@/lib/mapear.mjs';
import { SITE } from '@/lib/site';
import Render from '@/components/lp/Render';

const COLS_IM = 'codigo,slug,status,titulo,resumo,descricao,destaques,atencao,tipo,cidade,bairro,preco,preco_visivel,area,terreno,quartos,suites,banheiros,vagas,condominio,iptu,aceita_permuta,aceita_financiamento,fotos,video,ref_m2,ref_amostra';
const linkDe = (slug) => `${SITE.dominio}/lp/${slug}`;

function useImoveis() {
  const [lista, setLista] = useState([]);
  useEffect(() => {
    sb().from('imoveis').select(COLS_IM).in('status', ['disponivel', 'reservado', 'rascunho']).order('codigo')
      .then(({ data }) => setLista(data || []));
  }, []);
  const mapa = useMemo(() => Object.fromEntries(lista.map((m) => [m.codigo, { ...mapearImovel(m), rascunho: m.status === 'rascunho' }])), [lista]);
  return { lista, mapa };
}

function metricas(evs) {
  const sessoes = new Set(evs.filter((e) => e.tipo === 'abriu').map((e) => e.sessao || e.id)).size;
  const leads = evs.filter((e) => e.tipo === 'lead').length;
  const cliques = evs.filter((e) => e.tipo === 'clique').length;
  const visitar = evs.filter((e) => e.tipo === 'reagiu' && e.dados?.reacao === 'visitar').length;
  const conv = sessoes ? ((leads + cliques) / sessoes) * 100 : 0;
  return { sessoes, leads, cliques, visitar, conv };
}

export default function Lps() {
  const [lps, setLps] = useState(null);
  const [eventos, setEventos] = useState([]);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(null);
  const [criando, setCriando] = useState(null);
  const im = useImoveis();

  const carregar = useCallback(async () => {
    const { data, error } = await sb().from('lps').select('*, leads(id,nome,whatsapp)').neq('status', 'arquivada').order('atualizado_em', { ascending: false });
    if (error) { setErro(error.message); return; }
    setLps(data);
    const { data: ev } = await sb().from('lp_eventos').select('lp_id,tipo,sessao,dados,id').gte('criado_em', new Date(Date.now() - 90 * 864e5).toISOString()).limit(5000);
    setEventos(ev || []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  if (editando) return <EditorLp lp={editando} im={im} eventos={eventos.filter((e) => e.lp_id === editando.id)} aoFechar={(m) => { setEditando(null); if (m) carregar(); }} aoAbrir={setEditando} />;

  return (
    <section className="adm-pagina">
      <div className="adm-cabeca">
        <div><h1>Landing pages</h1><p className="adm-sub">Curadorias para leads e páginas para anúncios.</p></div>
      </div>
      <div className="adm-acoes" style={{ justifyContent: 'flex-start', marginBottom: 14 }}>
        <button className="adm-btn adm-primario" onClick={() => setCriando('curadoria')}>+ Curadoria</button>
        <button className="adm-btn" onClick={() => setCriando('campanha')}>+ Página de campanha</button>
      </div>
      {criando && <NovaLp tipo={criando} im={im} aoFechar={() => setCriando(null)} aoCriar={(lp) => { setCriando(null); setEditando(lp); }} />}
      {erro && <p className="adm-erro">{erro}</p>}
      {!lps ? <p className="adm-sub">Carregando…</p> : !lps.length ? <p className="adm-sub">Nenhuma página ainda. Comece por uma curadoria para um lead.</p> : (
        <ul className="adm-lista">
          {lps.map((l) => {
            const m = metricas(eventos.filter((e) => e.lp_id === l.id));
            return (
              <li key={l.id}>
                <button onClick={() => setEditando(l)}>
                  <span className="adm-info">
                    <b>{l.nome}{l.variante ? ` · ${l.variante}` : ''}</b>
                    <small>{l.tipo === 'curadoria' ? `Curadoria${l.leads?.nome ? ` para ${l.leads.nome}` : ''}` : 'Campanha'} · {dataCurta(l.atualizado_em)}</small>
                    <small>{m.sessoes} {m.sessoes === 1 ? 'visita' : 'visitas'} · {l.tipo === 'curadoria' ? `${m.visitar} "quero visitar"` : `${m.leads} leads · ${m.conv.toFixed(1)}% conversão`}</small>
                  </span>
                  <span className={`adm-status ${l.status === 'publicada' ? 's-disponivel' : 's-rascunho'}`}>{l.status === 'publicada' ? 'No ar' : 'Rascunho'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="adm-nota">Páginas de curadoria não aparecem no Google e só abrem pelo link. Quando o lead abre ou marca “quero visitar”, você recebe um e-mail na hora.</p>
    </section>
  );
}

function SeletorImoveis({ im, valor, aoMudar }) {
  const [busca, setBusca] = useState('');
  const vistos = im.lista.filter((i) => !busca || `${i.codigo} ${i.titulo} ${i.bairro}`.toLowerCase().includes(busca.toLowerCase()));
  const alternar = (c) => aoMudar(valor.includes(c) ? valor.filter((x) => x !== c) : [...valor, c]);
  return (
    <div className="adm-sel-imoveis">
      <input type="search" placeholder="Buscar imóvel" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div>
        {vistos.map((i) => (
          <label key={i.codigo} className={valor.includes(i.codigo) ? 'on' : ''}>
            <input type="checkbox" checked={valor.includes(i.codigo)} onChange={() => alternar(i.codigo)} />
            <span><b>{i.codigo}</b> {i.titulo}<small>{i.bairro} · {i.preco ? Number(i.preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : 'sem preço'}{i.status === 'rascunho' ? ' · fora do site' : ''}</small></span>
          </label>
        ))}
      </div>
    </div>
  );
}

function NovaLp({ tipo, im, aoFechar, aoCriar }) {
  const [leads, setLeads] = useState([]);
  const [f, setF] = useState({ lead_id: '', codigos: [], objetivo: '', publico: '', angulo: '', notas: '' });
  const [ocupado, setOcupado] = useState('');
  const [erro, setErro] = useState('');
  useEffect(() => {
    if (tipo === 'curadoria') sb().from('leads').select('id,nome,whatsapp,termometro,termometro_faixa').not('etapa', 'in', '(venda,perdido)').order('termometro', { ascending: false, nullsFirst: false }).limit(300).then(({ data }) => setLeads(data || []));
  }, [tipo]);

  const criar = async (comIa) => {
    if (tipo === 'curadoria' && !f.lead_id) return setErro('Escolha o lead.');
    setErro(''); setOcupado(comIa ? 'A IA está montando a página…' : 'Criando…');
    try {
      const base = MODELOS[tipo]();
      let nome = tipo === 'curadoria' ? `Curadoria · ${leads.find((l) => l.id === f.lead_id)?.nome || ''}` : (f.objetivo || 'Nova campanha');
      let hero = base.hero, blocos = base.blocos;
      if (comIa) {
        const r = await chamarAdmin({ acao: 'lp', tipo, ...f });
        hero = { ...base.hero, ...r.hero }; blocos = r.blocos?.length ? r.blocos : blocos; nome = r.nome || nome;
      } else if (f.codigos.length) {
        blocos = blocos.map((b) => (b.tipo === 'imoveis' ? { ...b, dados: { ...b.dados, itens: f.codigos.map((c) => ({ codigo: c, porque: '', atencao: '' })) } } : b));
      }
      const slug = tipo === 'curadoria' ? slugAleatorio() : `${slugify(nome).slice(0, 40) || 'pagina'}-${slugAleatorio(4)}`;
      const { data, error } = await sb().from('lps').insert({
        slug, tipo, nome: nome.slice(0, 90), lead_id: f.lead_id || null, hero, blocos, opcoes: base.opcoes, status: 'rascunho',
        expira_em: tipo === 'curadoria' ? new Date(Date.now() + 60 * 864e5).toISOString() : null,
      }).select('*, leads(id,nome,whatsapp)').single();
      if (error) throw error;
      aoCriar(data);
    } catch (e) { setErro(e.message); setOcupado(''); }
  };

  return (
    <div className="adm-modal" role="dialog" onClick={(e) => e.target === e.currentTarget && !ocupado && aoFechar()}>
      <div className="adm-modal-caixa">
        <h2>{tipo === 'curadoria' ? 'Nova curadoria' : 'Nova página de campanha'}</h2>
        {tipo === 'curadoria' ? (
          <label className="adm-campo"><span>Para qual lead</span>
            <select value={f.lead_id} onChange={(e) => setF({ ...f, lead_id: e.target.value })}>
              <option value="">Escolha…</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.nome || 'Sem nome'}{l.termometro != null ? ` · ${l.termometro}` : ''}{l.whatsapp ? ` · ${fone(l.whatsapp)}` : ''}</option>)}
            </select>
          </label>
        ) : (
          <>
            <label className="adm-campo"><span>Objetivo da página</span><input placeholder="Ex.: gerar leads para casas até 900 mil na Vila Nova" value={f.objetivo} onChange={(e) => setF({ ...f, objetivo: e.target.value })} /></label>
            <label className="adm-campo"><span>Público</span><input placeholder="Ex.: famílias com filhos pequenos que moram de aluguel" value={f.publico} onChange={(e) => setF({ ...f, publico: e.target.value })} /></label>
            <label className="adm-campo"><span>Ângulo do anúncio</span><input placeholder="Ex.: custo total sem surpresa, com ITBI e escritura" value={f.angulo} onChange={(e) => setF({ ...f, angulo: e.target.value })} /></label>
          </>
        )}
        <div className="adm-campo"><span>Imóveis {tipo === 'curadoria' ? '(até 3 é o ideal)' : ''}</span><SeletorImoveis im={im} valor={f.codigos} aoMudar={(c) => setF({ ...f, codigos: c })} /></div>
        <label className="adm-campo"><span>Notas para a IA (opcional)</span><textarea rows={3} placeholder="O que o lead contou, o que destacar, o que evitar" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></label>
        {erro && <p className="adm-erro">{erro}</p>}
        {ocupado ? <p className="adm-msg">{ocupado}</p> : (
          <div className="adm-acoes">
            <button className="adm-link" onClick={aoFechar}>Cancelar</button>
            <button className="adm-btn" onClick={() => criar(false)}>Começar do modelo</button>
            <button className="adm-btn adm-primario" onClick={() => criar(true)}>✦ Montar com IA</button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditorLp({ lp, im, eventos, aoFechar, aoAbrir }) {
  const [f, setF] = useState(() => ({ ...lp, hero: { ...(lp.hero || {}) }, blocos: lp.blocos || [], opcoes: lp.opcoes || {} }));
  const [aberto, setAberto] = useState(null);
  const [vista, setVista] = useState('editar');
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mudou, setMudou] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const arrastando = useRef(null);
  const m = metricas(eventos);

  const setHero = (k) => (e) => setF((x) => ({ ...x, hero: { ...x.hero, [k]: e.target.value } }));
  const setBloco = (id, dados) => setF((x) => ({ ...x, blocos: x.blocos.map((b) => (b.id === id ? { ...b, dados: { ...b.dados, ...dados } } : b)) }));
  const mover = (de, para) => setF((x) => {
    if (para < 0 || para >= x.blocos.length) return x;
    const bs = [...x.blocos]; const [b] = bs.splice(de, 1); bs.splice(para, 0, b); return { ...x, blocos: bs };
  });
  const remover = (id) => setF((x) => ({ ...x, blocos: x.blocos.filter((b) => b.id !== id) }));
  const duplicar = (i) => setF((x) => { const bs = [...x.blocos]; bs.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(bs[i])), id: novoId() }); return { ...x, blocos: bs }; });
  const adicionar = (tipo) => { const b = novoBloco(tipo); setF((x) => ({ ...x, blocos: [...x.blocos, b] })); setAberto(b.id); setAdicionando(false); };

  const salvar = async (status) => {
    setSalvando(true); setMsg('');
    const dados = {
      nome: f.nome, slug: f.slug, status: status || f.status, hero: f.hero, blocos: f.blocos, opcoes: f.opcoes,
      expira_em: f.expira_em || null, atualizado_em: new Date().toISOString(),
      ...(status === 'publicada' && f.status !== 'publicada' ? { publicada_em: new Date().toISOString() } : {}),
    };
    const { error } = await sb().from('lps').update(dados).eq('id', lp.id);
    setSalvando(false);
    if (error) { setMsg('Não salvou: ' + (error.message.includes('duplicate') ? 'esse endereço já existe' : error.message)); return false; }
    setF((x) => ({ ...x, status: dados.status })); setMudou(true);
    setMsg(status === 'publicada' ? 'Página no ar.' : status === 'rascunho' ? 'Página tirada do ar.' : 'Salvo.');
    return true;
  };
  const variante = async () => {
    if (!(await salvar())) return;
    if (!f.variante) await sb().from('lps').update({ variante: 'A' }).eq('id', lp.id);
    const { data, error } = await sb().from('lps').insert({
      slug: `${f.slug.replace(/-[a-z0-9]{1,4}$/, '')}-b${slugAleatorio(3)}`.slice(0, 60), tipo: f.tipo, nome: f.nome, hero: f.hero, blocos: f.blocos, opcoes: f.opcoes,
      variante_de: lp.id, variante: 'B', status: 'rascunho',
    }).select('*, leads(id,nome,whatsapp)').single();
    if (error) { setMsg(error.message); return; }
    aoAbrir(data);
  };
  const arquivar = async () => {
    if (!confirm('Arquivar esta página? O link deixa de funcionar.')) return;
    await sb().from('lps').update({ status: 'arquivada' }).eq('id', lp.id); aoFechar(true);
  };
  const copiar = async () => { try { await navigator.clipboard.writeText(linkDe(f.slug)); setMsg('Link copiado.'); } catch (e) { setMsg(linkDe(f.slug)); } };
  const lead = lp.leads;
  const zapLead = lead?.whatsapp ? `https://wa.me/${lead.whatsapp}?text=${encodeURIComponent(`Oi, ${String(lead.nome || '').split(' ')[0]}! Separei os imóveis que combinam com o que vocês me contaram. Para cada um eu explico por que escolhi e o que merece atenção: ${linkDe(f.slug)}`)}` : null;

  const lpPrevia = { ...f, primeiro_nome: lead?.nome ? String(lead.nome).split(' ')[0] : null };

  return (
    <section className="adm-pagina adm-larga adm-lp">
      <button className="adm-link" onClick={() => aoFechar(mudou)}>← Voltar às páginas</button>
      <div className="adm-cabeca">
        <div>
          <h1>{f.nome || 'Página'}{f.variante ? ` · variante ${f.variante}` : ''}</h1>
          <p className="adm-sub">{f.status === 'publicada' ? 'No ar' : 'Rascunho'} · {m.sessoes} visitas · {f.tipo === 'curadoria' ? `${m.visitar} "quero visitar"` : `${m.leads} leads · ${m.cliques} cliques no WhatsApp · ${m.conv.toFixed(1)}% conversão`}</p>
        </div>
        <div className="adm-seg adm-so-celular">
          <button className={vista === 'editar' ? 'on' : ''} onClick={() => setVista('editar')}>Editar</button>
          <button className={vista === 'previa' ? 'on' : ''} onClick={() => setVista('previa')}>Prévia</button>
        </div>
      </div>

      <div className={`adm-lp-grade v-${vista}`}>
        <div className="adm-lp-editor">
          <div className="adm-bloco">
            <h2>Página</h2>
            <label className="adm-campo"><span>Nome (só para você)</span><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
            <label className="adm-campo"><span>Endereço</span>
              <div className="adm-slug"><span>/lp/</span><input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /></div>
            </label>
            <div className="adm-checks">
              {f.tipo === 'campanha' && <label className="adm-check"><input type="checkbox" checked={!!f.opcoes.chat} onChange={(e) => setF({ ...f, opcoes: { ...f.opcoes, chat: e.target.checked } })} /> Mostrar o chat da assistente</label>}
              {f.tipo === 'curadoria' && <label className="adm-campo" style={{ flex: 1 }}><span>Link vale até</span><input type="date" value={(f.expira_em || '').slice(0, 10)} onChange={(e) => setF({ ...f, expira_em: e.target.value ? `${e.target.value}T23:59:00-03:00` : null })} /></label>}
            </div>
          </div>

          <div className="adm-bloco">
            <h2>Topo da página</h2>
            <p className="adm-sub" style={{ margin: 0 }}>Use {'{nome}'} para colocar o primeiro nome do lead.</p>
            <label className="adm-campo"><span>Linha de cima</span><input value={f.hero.eyebrow || ''} onChange={setHero('eyebrow')} /></label>
            <label className="adm-campo"><span>Título</span><input value={f.hero.titulo || ''} onChange={setHero('titulo')} /></label>
            <label className="adm-campo"><span>Subtítulo</span><textarea rows={2} value={f.hero.subtitulo || ''} onChange={setHero('subtitulo')} /></label>
            <div className="adm-grade2">
              <label className="adm-campo"><span>Texto do botão</span><input value={f.hero.cta_texto || ''} onChange={setHero('cta_texto')} /></label>
              <label className="adm-campo"><span>O botão leva para</span>
                <select value={f.hero.cta_acao || 'rolar'} onChange={setHero('cta_acao')}><option value="rolar">Conteúdo da página</option><option value="formulario">Formulário</option><option value="whatsapp">WhatsApp</option></select>
              </label>
            </div>
            <FotoUnica valor={f.hero.imagem} pasta={`lps/${lp.id}`} aoMudar={(u) => setF((x) => ({ ...x, hero: { ...x.hero, imagem: u } }))} rotulo="Imagem de fundo (vazio = foto do primeiro imóvel)" />
          </div>

          <h2 className="adm-secao">Blocos <small className="adm-sub">arraste para reordenar</small></h2>
          <div className="adm-blocos">
            {f.blocos.map((b, i) => (
              <div key={b.id} className={`adm-blk ${aberto === b.id ? 'aberto' : ''}`} draggable
                onDragStart={() => { arrastando.current = i; }} onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (arrastando.current != null) mover(arrastando.current, i); arrastando.current = null; }}>
                <div className="adm-blk-topo">
                  <span className="adm-alca" title="Arraste">⋮⋮</span>
                  <button className="adm-blk-nome" onClick={() => setAberto(aberto === b.id ? null : b.id)}>{BLOCOS[b.tipo]?.nome || b.tipo}<small>{resumoBloco(b)}</small></button>
                  <button aria-label="Subir" onClick={() => mover(i, i - 1)}>↑</button>
                  <button aria-label="Descer" onClick={() => mover(i, i + 1)}>↓</button>
                  <button aria-label="Duplicar" title="Duplicar" onClick={() => duplicar(i)}>⧉</button>
                  <button aria-label="Remover" title="Remover" onClick={() => remover(b.id)}>×</button>
                </div>
                {aberto === b.id && <div className="adm-blk-corpo"><EditorBloco b={b} tipoLp={f.tipo} im={im} pasta={`lps/${lp.id}`} aoMudar={(d) => setBloco(b.id, d)} /></div>}
              </div>
            ))}
          </div>
          {adicionando ? (
            <div className="adm-novo-bloco">
              {Object.entries(BLOCOS).map(([k, v]) => <button key={k} onClick={() => adicionar(k)}><b>{v.nome}</b><small>{v.desc}</small></button>)}
              <button className="adm-link" onClick={() => setAdicionando(false)}>Cancelar</button>
            </div>
          ) : <button className="adm-btn" onClick={() => setAdicionando(true)}>+ Adicionar bloco</button>}

          {f.status === 'publicada' && (
            <div className="adm-bloco" style={{ marginTop: 14 }}>
              <h2>Compartilhar</h2>
              <p className="adm-sub" style={{ margin: 0, wordBreak: 'break-all' }}>{linkDe(f.slug)}</p>
              <div className="adm-acoes" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                <button className="adm-btn" onClick={copiar}>Copiar link</button>
                <a className="adm-btn" href={linkDe(f.slug)} target="_blank" rel="noopener">Abrir</a>
                {zapLead && <a className="adm-btn adm-whats" href={zapLead} target="_blank" rel="noopener">Enviar para {String(lead.nome || '').split(' ')[0]}</a>}
              </div>
              {f.tipo === 'campanha' && <p className="adm-sub" style={{ margin: 0 }}>No anúncio, use o link com UTM: {linkDe(f.slug)}?utm_source=meta&utm_campaign=NOME</p>}
            </div>
          )}
        </div>

        <div className="adm-lp-previa">
          <div className="adm-lp-moldura"><Render lp={lpPrevia} imoveis={im.mapa} previa /></div>
        </div>
      </div>

      <div className="adm-barra">
        <div className="adm-acoes">
          {msg && <span className="adm-msg">{msg}</span>}
          <button className="adm-link" onClick={arquivar}>Arquivar</button>
          {f.tipo === 'campanha' && <button className="adm-link" onClick={variante}>Criar variante B</button>}
          {f.status === 'publicada'
            ? <><button className="adm-link" onClick={() => salvar('rascunho')}>Tirar do ar</button><button className="adm-btn adm-primario" disabled={salvando} onClick={() => salvar()}>{salvando ? 'Salvando…' : 'Salvar'}</button></>
            : <><button className="adm-btn" disabled={salvando} onClick={() => salvar()}>Salvar rascunho</button><button className="adm-btn adm-primario" disabled={salvando} onClick={() => salvar('publicada')}>Publicar</button></>}
        </div>
      </div>
    </section>
  );
}

function resumoBloco(b) {
  const d = b.dados || {};
  if (b.tipo === 'imoveis') return `${(d.itens || []).length} imóve${(d.itens || []).length === 1 ? 'l' : 'is'}`;
  if (d.codigo) return d.codigo;
  return d.titulo || '';
}

function EditorBloco({ b, tipoLp, im, pasta, aoMudar }) {
  const d = b.dados || {};
  const campo = (k, rot, area) => (
    <label className="adm-campo"><span>{rot}</span>{area ? <textarea rows={area} value={d[k] || ''} onChange={(e) => aoMudar({ [k]: e.target.value })} /> : <input value={d[k] || ''} onChange={(e) => aoMudar({ [k]: e.target.value })} />}</label>
  );
  const seletorUm = (
    <label className="adm-campo"><span>Imóvel</span>
      <select value={d.codigo || ''} onChange={(e) => aoMudar({ codigo: e.target.value })}>
        <option value="">Escolha…</option>{im.lista.map((i) => <option key={i.codigo} value={i.codigo}>{i.codigo} · {i.titulo}</option>)}
      </select>
    </label>
  );
  switch (b.tipo) {
    case 'imoveis': {
      const itens = d.itens || [];
      const setItem = (k, v) => aoMudar({ itens: itens.map((x, n) => (n === k ? { ...x, ...v } : x)) });
      const moverItem = (k, p) => { if (p < 0 || p >= itens.length) return; const a = [...itens]; const [x] = a.splice(k, 1); a.splice(p, 0, x); aoMudar({ itens: a }); };
      return (
        <>
          {campo('titulo', 'Título')}
          {campo('intro', 'Introdução', 2)}
          {tipoLp === 'curadoria' && <label className="adm-check"><input type="checkbox" checked={d.reacoes !== false} onChange={(e) => aoMudar({ reacoes: e.target.checked })} /> Botões “quero visitar” e “não é pra mim”</label>}
          {itens.map((it, k) => (
            <div key={k} className="adm-item">
              <div className="adm-item-topo">
                <b>{k + 1}.</b>
                {it.avulso ? <span>Imóvel de parceiro</span> : (
                  <select value={it.codigo || ''} onChange={(e) => setItem(k, { codigo: e.target.value })}>
                    <option value="">Escolha…</option>{im.lista.map((i) => <option key={i.codigo} value={i.codigo}>{i.codigo} · {i.titulo}</option>)}
                  </select>
                )}
                <button onClick={() => moverItem(k, k - 1)}>↑</button><button onClick={() => moverItem(k, k + 1)}>↓</button>
                <button onClick={() => aoMudar({ itens: itens.filter((_, n) => n !== k) })}>×</button>
              </div>
              {it.avulso && <Avulso a={it.avulso} pasta={pasta} aoMudar={(a) => setItem(k, { avulso: { ...it.avulso, ...a } })} />}
              <label className="adm-campo"><span>Por que escolhi</span><textarea rows={2} value={it.porque || ''} onChange={(e) => setItem(k, { porque: e.target.value })} /></label>
              <label className="adm-campo"><span>Ponto de atenção (vazio = o do cadastro)</span><input value={it.atencao || ''} onChange={(e) => setItem(k, { atencao: e.target.value })} /></label>
            </div>
          ))}
          <div className="adm-acoes" style={{ justifyContent: 'flex-start' }}>
            <button className="adm-btn" onClick={() => aoMudar({ itens: [...itens, { codigo: '', porque: '', atencao: '' }] })}>+ Imóvel do catálogo</button>
            <button className="adm-btn" onClick={() => aoMudar({ itens: [...itens, { avulso: { titulo: '', bairro: '', cidade: 'Jaraguá do Sul', fotos: [] }, porque: '', atencao: '' }] })}>+ Imóvel de parceiro</button>
          </div>
          {itens.some((x) => x.avulso) && <p className="adm-sub">Imóvel de parceiro: só divulgue com autorização do corretor ou do proprietário.</p>}
        </>
      );
    }
    case 'imovel_destaque': case 'analise': return seletorUm;
    case 'texto': return <>{campo('titulo', 'Título')}{campo('texto', 'Texto (linha em branco separa parágrafos)', 6)}</>;
    case 'lista': return <>{campo('titulo', 'Título')}<label className="adm-campo"><span>Um ponto por linha</span><textarea rows={5} value={(d.itens || []).join('\n')} onChange={(e) => aoMudar({ itens: e.target.value.split('\n') })} /></label></>;
    case 'video': return <>{campo('titulo', 'Título')}{campo('url', 'Link do YouTube')}</>;
    case 'metodo': return campo('titulo', 'Título');
    case 'sobre': return <>{campo('titulo', 'Título')}{campo('texto', 'Texto', 5)}</>;
    case 'faq': {
      const itens = d.itens || [];
      return (
        <>
          {campo('titulo', 'Título')}
          {itens.map((x, k) => (
            <div key={k} className="adm-item">
              <label className="adm-campo"><span>Pergunta</span><input value={x.p} onChange={(e) => aoMudar({ itens: itens.map((y, n) => (n === k ? { ...y, p: e.target.value } : y)) })} /></label>
              <label className="adm-campo"><span>Resposta</span><textarea rows={2} value={x.r} onChange={(e) => aoMudar({ itens: itens.map((y, n) => (n === k ? { ...y, r: e.target.value } : y)) })} /></label>
              <button className="adm-link" onClick={() => aoMudar({ itens: itens.filter((_, n) => n !== k) })}>Remover pergunta</button>
            </div>
          ))}
          <button className="adm-btn" onClick={() => aoMudar({ itens: [...itens, { p: '', r: '' }] })}>+ Pergunta</button>
        </>
      );
    }
    case 'galeria': return <>{campo('titulo', 'Título')}<Fotos valor={d.fotos || []} pasta={pasta} aoMudar={(fotos) => aoMudar({ fotos })} /></>;
    case 'formulario': return <>{campo('titulo', 'Título')}{campo('texto', 'Texto', 2)}{campo('botao', 'Texto do botão')}</>;
    case 'cta': return <>{campo('titulo', 'Título')}{campo('texto', 'Texto', 2)}{campo('botao', 'Texto do botão')}{campo('mensagem', 'Mensagem que abre no WhatsApp')}</>;
    default: return null;
  }
}

function Avulso({ a, pasta, aoMudar }) {
  const c = (k, rot, tipo = 'text') => <label className="adm-campo"><span>{rot}</span><input type={tipo} value={a[k] || ''} onChange={(e) => aoMudar({ [k]: e.target.value })} /></label>;
  return (
    <>
      {c('titulo', 'Título')}
      <div className="adm-grade">{c('bairro', 'Bairro')}{c('cidade', 'Cidade')}{c('preco', 'Preço (R$)', 'number')}{c('area', 'Área (m²)', 'number')}{c('quartos', 'Quartos', 'number')}{c('suites', 'Suítes', 'number')}{c('vagas', 'Vagas', 'number')}</div>
      <Fotos valor={a.fotos || []} pasta={pasta} aoMudar={(fotos) => aoMudar({ fotos })} />
    </>
  );
}

async function subir(arquivo, pasta) {
  const p = await processarFoto(arquivo, 'nenhuma');
  const base = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const tipo = p.ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const a = await sb().storage.from(BUCKET).upload(`${base}.${p.ext}`, p.grande, { contentType: tipo, cacheControl: '31536000' });
  if (a.error) throw a.error;
  const b = await sb().storage.from(BUCKET).upload(`${base}-p.${p.ext}`, p.pequena, { contentType: tipo, cacheControl: '31536000' });
  if (b.error) throw b.error;
  return urlPublica(`${base}.${p.ext}`);
}

function Fotos({ valor, pasta, aoMudar }) {
  const [prog, setProg] = useState('');
  const enviar = async (lista) => {
    let atuais = [...valor];
    for (let n = 0; n < lista.length; n++) {
      setProg(`Enviando foto ${n + 1} de ${lista.length}…`);
      try { atuais = [...atuais, await subir(lista[n], pasta)]; aoMudar(atuais); } catch (e) { setProg(`Erro: ${e.message}`); }
    }
    setProg('');
  };
  return (
    <div className="adm-campo">
      <span>Fotos</span>
      <div className="adm-fotos">
        {valor.map((u, k) => (
          <figure key={u}><img src={u} alt="" />{k === 0 && <span className="adm-capa">Capa</span>}
            <figcaption><button onClick={() => { const a = [...valor]; const [x] = a.splice(k, 1); a.unshift(x); aoMudar(a); }} title="Usar como capa">★</button><button onClick={() => aoMudar(valor.filter((x) => x !== u))} title="Remover">×</button></figcaption>
          </figure>
        ))}
      </div>
      <input type="file" accept="image/*" multiple onChange={(e) => enviar([...e.target.files])} />
      {prog && <small>{prog}</small>}
    </div>
  );
}

function FotoUnica({ valor, pasta, aoMudar, rotulo }) {
  const [prog, setProg] = useState('');
  return (
    <div className="adm-campo">
      <span>{rotulo}</span>
      {valor && <div className="adm-foto-unica" style={{ backgroundImage: `url(${valor})` }}><button onClick={() => aoMudar('')}>Remover</button></div>}
      <input type="file" accept="image/*" onChange={async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        setProg('Enviando…');
        try { aoMudar(await subir(f, pasta)); setProg(''); } catch (err) { setProg(`Erro: ${err.message}`); }
      }} />
      {prog && <small>{prog}</small>}
    </div>
  );
}
