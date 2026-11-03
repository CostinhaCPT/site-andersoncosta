'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sb } from '@/lib/admin/cliente';
import { ETAPAS } from '@/lib/admin/opcoes';
import { CANAIS, CREDITOS, dataCurta, dataHora, deLocal, FAIXAS, fone, paraLocal, PRAZOS, soNumeros, STATUS_VISITA } from '@/lib/admin/ia';
import { NovaVisita } from './Agenda';
import { CamposExtras, LinhaDoTempo, Tarefas } from './Contatos';
import { brl, comissao, etapasDo, FUNIS, numero, PROBABILIDADE, rotuloEtapa } from '@/lib/admin/crm';

const COLS = 'id,nome,whatsapp,email,objetivo,regioes,perfil,prazo,motivacao,faixa_investimento,pagamento,tem_imovel_para_vender,decisores,outro_corretor,imoveis_interesse,pontuacao,etapa,motivo_perda,proxima_acao,proxima_acao_em,origem,notas,canal,criado_em,atualizado_em,prazo_compra,credito,faixa_max,depende_venda,decisores_alinhados,motivacao_forte,ultima_atividade,termometro,termometro_faixa,termometro_detalhe,nao_contatar,nao_contatar_motivo,automacao_pausada_ate,contato_id,funil,titulo,valor,comissao_pct,imovel_codigo,fechado_em,campos,contatos(nome,papeis)';

export function Termo({ l, curto }) {
  if (l.termometro == null) return null;
  const [n, cls] = FAIXAS[l.termometro_faixa] || ['', ''];
  return <span className={`adm-termo ${cls}`}>{curto ? l.termometro : `${n} ${l.termometro}`}</span>;
}
const rotEtapa = rotuloEtapa;
const canalDe = (l) => l.canal || l.origem?.canal || (l.origem?.utm_source ? `anúncio (${l.origem.utm_source})` : 'site');

export default function Pipeline({ abrirId, aoAbrir, aoAbrirContato }) {
  const [funil, setFunil] = useState('compra');
  const [leads, setLeads] = useState(null);
  const [erro, setErro] = useState('');
  const [vista, setVista] = useState('quadro');
  const [busca, setBusca] = useState('');
  const [mostrarFechados, setMostrarFechados] = useState(false);
  const [aberto, setAberto] = useState(null);

  const carregar = useCallback(async () => {
    const { data, error } = await sb().from('leads').select(COLS).order('atualizado_em', { ascending: false, nullsFirst: false }).limit(500);
    if (error) setErro(error.message); else setLeads(data);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (abrirId && leads) {
      const l = leads.find((x) => x.id === abrirId);
      if (l) { setFunil(l.funil || 'compra'); setAberto(l); aoAbrir?.(null); }
      else carregar(); // negócio recém-criado
    }
  }, [abrirId, leads, aoAbrir]);

  const doFunil = useMemo(() => (leads || []).filter((l) => (l.funil || 'compra') === funil), [leads, funil]);
  const vistos = useMemo(() => doFunil.slice().sort((a, b) => (b.termometro ?? -1) - (a.termometro ?? -1)).filter((l) => !busca || `${l.nome} ${l.whatsapp} ${l.email} ${(l.imoveis_interesse || []).join(' ')} ${l.imovel_codigo || ''} ${l.titulo || ''}`.toLowerCase().includes(busca.toLowerCase())), [doFunil, busca]);
  const todas = etapasDo(funil);
  const colunas = mostrarFechados ? todas : todas.filter(([v]) => !['venda', 'perdido'].includes(v));
  const abertos = doFunil.filter((l) => !['venda', 'perdido'].includes(l.etapa));
  const previsao = abertos.reduce((s, l) => s + comissao(l) * (PROBABILIDADE[l.etapa] ?? 0), 0);
  const emJogo = abertos.reduce((s, l) => s + comissao(l), 0);
  const hoje = Date.now();
  const atrasadas = (leads || []).filter((l) => l.proxima_acao_em && Date.parse(l.proxima_acao_em) < hoje && !['venda', 'perdido'].includes(l.etapa));

  const mover = async (l, etapa) => {
    setLeads((x) => x.map((y) => (y.id === l.id ? { ...y, etapa } : y)));
    const { error } = await sb().from('leads').update({ etapa, atualizado_em: new Date().toISOString() }).eq('id', l.id);
    if (error) setErro(error.message);
  };

  if (aberto) return <Lead lead={aberto} aoFechar={(mudou) => { setAberto(null); if (mudou) carregar(); }} aoAbrirContato={aoAbrirContato} />;

  return (
    <section className="adm-pagina adm-larga">
      <div className="adm-cabeca">
        <div>
          <h1>Pipeline</h1>
          {leads && <p className="adm-sub">{abertos.length} em andamento{atrasadas.length ? ` · ${atrasadas.length} com ação atrasada` : ''}{emJogo ? ` · comissão em jogo ${brl(emJogo)} · previsão ${brl(previsao)}` : ''}</p>}
        </div>
        <button className="adm-btn adm-primario" onClick={() => setAberto({ etapa: FUNIS[funil].inicial, funil, canal: 'WhatsApp' })}>+ {funil === 'captacao' ? 'Nova captação' : 'Novo negócio'}</button>
      </div>
      <div className="adm-subabas">
        {Object.entries(FUNIS).map(([k, x]) => <button key={k} className={funil === k ? 'on' : ''} onClick={() => setFunil(k)}>Funil de {x.nome}</button>)}
      </div>
      <div className="adm-filtros">
        <input type="search" placeholder="Buscar por nome, telefone ou código do imóvel" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="adm-seg">
          <button className={vista === 'quadro' ? 'on' : ''} onClick={() => setVista('quadro')}>Quadro</button>
          <button className={vista === 'lista' ? 'on' : ''} onClick={() => setVista('lista')}>Lista</button>
        </div>
      </div>
      {erro && <p className="adm-erro">{erro}</p>}
      {leads && funil === 'compra' && <Hoje leads={doFunil} aoAbrir={setAberto} />}
      {!leads ? <p className="adm-sub">Carregando…</p> : vista === 'quadro' ? (
        <>
          <div className="adm-quadro">
            {colunas.map(([v, n]) => {
              const itens = vistos.filter((l) => (l.etapa || 'novo') === v);
              return (
                <div key={v} className="adm-coluna">
                  <p className="adm-coluna-tit">{n} <span>{itens.length}</span></p>
                  {itens.map((l) => <CartaoLead key={l.id} l={l} etapas={todas} aoAbrir={() => setAberto(l)} aoMover={(e) => mover(l, e)} />)}
                </div>
              );
            })}
          </div>
          <label className="adm-check"><input type="checkbox" checked={mostrarFechados} onChange={(e) => setMostrarFechados(e.target.checked)} /> Mostrar vendas e perdidos</label>
        </>
      ) : (
        <ul className="adm-lista">
          {vistos.map((l) => (
            <li key={l.id}>
              <button onClick={() => setAberto(l)}>
                <span className="adm-info">
                  <b>{l.nome || 'Sem nome'} <Termo l={l} /></b>
                  <small>{rotEtapa(l.etapa || 'novo')} · {canalDe(l)} · {fone(l.whatsapp) || 'sem WhatsApp'}</small>
                  {l.proxima_acao && <small>Próximo: {l.proxima_acao}{l.proxima_acao_em ? ` (${dataCurta(l.proxima_acao_em)})` : ''}</small>}
                </span>
                <small className="adm-sub">{dataCurta(l.atualizado_em || l.criado_em)}</small>
              </button>
            </li>
          ))}
          {!vistos.length && <li className="adm-sub" style={{ padding: 16 }}>Nenhum lead aqui.</li>}
        </ul>
      )}
    </section>
  );
}

// Who to act on today: hot/warm leads without recent contact and overdue actions
function Hoje({ leads, aoAbrir }) {
  const agora = Date.now();
  const abertos = leads.filter((l) => !['venda', 'perdido'].includes(l.etapa));
  const itens = [
    ...abertos.filter((l) => l.proxima_acao_em && Date.parse(l.proxima_acao_em) <= agora + 6 * 3600e3)
      .map((l) => ({ l, motivo: `${l.proxima_acao || 'Ação'} (${Date.parse(l.proxima_acao_em) < agora ? 'atrasada' : 'hoje'})`, peso: 200 + (l.termometro || 0) })),
    ...abertos.filter((l) => ['quente', 'morno'].includes(l.termometro_faixa) && Date.parse(l.ultima_atividade || l.atualizado_em || l.criado_em) < agora - (l.termometro_faixa === 'quente' ? 1 : 3) * 864e5)
      .map((l) => ({ l, motivo: l.termometro_detalhe?.falta?.[0]?.acao?.replace(/:\s*[^:]*vale (até )?\+\d+\s*$/, '') || (FAIXAS[l.termometro_faixa] || [])[2], peso: 100 + (l.termometro || 0) })),
  ];
  const vistos = new Set();
  const lista = itens.sort((a, b) => b.peso - a.peso).filter((x) => !vistos.has(x.l.id) && vistos.add(x.l.id)).slice(0, 6);
  if (!lista.length) return null;
  return (
    <div className="adm-hoje">
      <b>Prioridades de hoje</b>
      {lista.map(({ l, motivo }) => (
        <button key={l.id} onClick={() => aoAbrir(l)}>
          <Termo l={l} curto /> <span><b>{l.nome || 'Sem nome'}</b><small>{motivo}</small></span>
        </button>
      ))}
    </div>
  );
}

function CartaoLead({ l, etapas, aoAbrir, aoMover }) {
  const atrasada = l.proxima_acao_em && Date.parse(l.proxima_acao_em) < Date.now();
  return (
    <div className="adm-cartao">
      <button className="adm-cartao-corpo" onClick={aoAbrir}>
        <b>{(l.funil === 'captacao' && l.titulo) || l.nome || l.titulo || 'Sem nome'} <Termo l={l} curto /></b>
        <small>{canalDe(l)} · {dataCurta(l.criado_em)}</small>
        {l.valor ? <small>{brl(l.valor)}{l.imovel_codigo ? ` · ${l.imovel_codigo}` : ''}</small> : null}
        {(l.faixa_investimento || l.regioes?.length) && <small>{[l.faixa_investimento, (l.regioes || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</small>}
        {l.proxima_acao && <small className={atrasada ? 'adm-atrasada' : ''}>→ {l.proxima_acao}{l.proxima_acao_em ? ` · ${dataCurta(l.proxima_acao_em)}` : ''}</small>}
      </button>
      <div className="adm-cartao-pe">
        <select value={l.etapa || 'novo'} onChange={(e) => aoMover(e.target.value)} aria-label="Mover etapa">
          {etapas.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
        {l.whatsapp && <a className="adm-zap" href={`https://wa.me/${l.whatsapp}`} target="_blank" rel="noopener" aria-label="WhatsApp">WhatsApp</a>}
      </div>
    </div>
  );
}

function Lead({ lead, aoFechar, aoAbrirContato }) {
  const novo = !lead.id;
  const captacao = (lead.funil || 'compra') === 'captacao';
  const [f, setF] = useState({
    ...lead, regioesTxt: (lead.regioes || []).join(', '), interesseTxt: (lead.imoveis_interesse || []).join(', '),
    proximaEm: paraLocal(lead.proxima_acao_em), whatsTxt: fone(lead.whatsapp),
  });
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mudou, setMudou] = useState(false);
  const [visitas, setVisitas] = useState([]);
  const [novaVisita, setNovaVisita] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); };

  const carregarVisitas = useCallback(() => {
    if (!lead.id) return;
    sb().from('visitas').select('id,inicio,status,imovel_codigo,observacoes').eq('lead_id', lead.id).order('inicio', { ascending: false }).then(({ data }) => setVisitas(data || []));
  }, [lead.id]);
  useEffect(() => { carregarVisitas(); }, [carregarVisitas]);

  const salvar = async () => {
    if (!String(f.nome || '').trim() && !soNumeros(f.whatsTxt) && !f.email) { setMsg('Coloque pelo menos o nome, o WhatsApp ou o e-mail.'); return; }
    setSalvando(true); setMsg('');
    const lista = (t) => String(t || '').split(',').map((x) => x.trim()).filter(Boolean);
    const dados = {
      nome: String(f.nome || '').trim() || null, whatsapp: soNumeros(f.whatsTxt) || null, email: f.email || null, etapa: f.etapa || 'novo',
      prazo_compra: f.prazo_compra || null, credito: f.credito || null,
      faixa_max: f.faixa_max === '' || f.faixa_max == null ? null : Number(String(f.faixa_max).replace(/\D/g, '')) || null,
      depende_venda: !!f.depende_venda, decisores_alinhados: !!f.decisores_alinhados, motivacao_forte: !!f.motivacao_forte,
      nao_contatar: !!f.nao_contatar, nao_contatar_motivo: f.nao_contatar ? (f.nao_contatar_motivo || 'marcado no admin') : null,
      automacao_pausada_ate: f.pausar ? new Date(Date.now() + 30 * 864e5).toISOString() : (f.automacao_pausada_ate || null),
      ultima_atividade: new Date().toISOString(), objetivo: f.objetivo || null, regioes: lista(f.regioesTxt), perfil: f.perfil || null,
      prazo: f.prazo || null, faixa_investimento: f.faixa_investimento || null, pagamento: f.pagamento || null,
      imoveis_interesse: lista(f.interesseTxt).map((x) => x.toUpperCase()), proxima_acao: f.proxima_acao || null,
      proxima_acao_em: deLocal(f.proximaEm), notas: f.notas || null, canal: f.canal || null,
      motivo_perda: f.etapa === 'perdido' ? f.motivo_perda || null : null, atualizado_em: new Date().toISOString(),
      funil: lead.funil || 'compra', titulo: f.titulo || null, valor: numero(f.valorTxt ?? f.valor),
      comissao_pct: numero(f.comissao_pct) ?? 5, imovel_codigo: String(f.imovel_codigo || '').trim().toUpperCase() || null, campos: f.campos || {},
      ...(lead.contato_id ? { contato_id: lead.contato_id } : {}),
    };
    const q = novo ? sb().from('leads').insert(dados).select('id').single() : sb().from('leads').update(dados).eq('id', lead.id).select('id').single();
    const { error } = await q;
    setSalvando(false);
    if (error) { setMsg('Não salvou: ' + error.message); return; }
    if (novo) { aoFechar(true); return; }
    setMudou(true); setMsg('Salvo.');
  };
  const excluir = async () => {
    if (!confirm('Excluir este lead e o histórico de visitas dele? Isso não tem volta.')) return;
    await sb().from('visitas').delete().eq('lead_id', lead.id);
    const { error } = await sb().from('leads').delete().eq('id', lead.id);
    if (error) setMsg('Não excluiu: ' + error.message); else aoFechar(true);
  };

  return (
    <section className="adm-pagina adm-editor">
      <button className="adm-link" onClick={() => aoFechar(mudou)}>← Voltar ao pipeline</button>
      <div className="adm-cabeca">
        <div><h1>{novo ? (captacao ? 'Nova captação' : 'Novo negócio') : f.titulo || f.nome || 'Negócio'}</h1>
          <p className="adm-sub">Funil de {FUNIS[lead.funil || 'compra'].nome}{lead.contato_id && <> · <button className="adm-link" onClick={() => aoAbrirContato?.(lead.contato_id)}>Abrir contato {lead.contatos?.nome || ''}</button></>}</p></div>
        {f.whatsapp && <a className="adm-btn adm-whats" href={`https://wa.me/${f.whatsapp}`} target="_blank" rel="noopener">WhatsApp</a>}
      </div>

      {!novo && !captacao && lead.termometro != null && <Termometro l={lead} />}
      <div className="adm-bloco">
        <h2>Negócio</h2>
        <div className="adm-grade2">
          <label className="adm-campo"><span>Nome do negócio</span><input placeholder={captacao ? 'Ex.: Casa do Sr. João no Amizade' : 'Ex.: Compra casa térrea, família Souza'} value={f.titulo || ''} onChange={set('titulo')} /></label>
          <label className="adm-campo"><span>{captacao ? 'Valor pedido (R$)' : 'Valor do negócio (R$)'}</span><input inputMode="numeric" value={f.valorTxt ?? (f.valor ?? '')} onChange={set('valorTxt')} /></label>
          <label className="adm-campo"><span>Sua comissão (%)</span><input inputMode="decimal" value={f.comissao_pct ?? 5} onChange={set('comissao_pct')} /></label>
          <label className="adm-campo"><span>{captacao ? 'Código do imóvel captado' : 'Imóvel principal (código)'}</span><input placeholder="AC-0019" value={f.imovel_codigo || ''} onChange={set('imovel_codigo')} /></label>
        </div>
        {numero(f.valorTxt ?? f.valor) ? <p className="adm-sub">Comissão prevista: {brl(comissao({ valor: numero(f.valorTxt ?? f.valor), comissao_pct: numero(f.comissao_pct) ?? 5 }))}</p> : null}
        <CamposExtras objeto="negocio" valores={f.campos || {}} onChange={(campos) => setF({ ...f, campos })} />
      </div>
      <div className="adm-bloco">
        <div className="adm-grade2">
          <label className="adm-campo"><span>Etapa</span><select value={f.etapa || FUNIS[lead.funil || 'compra'].inicial} onChange={set('etapa')}>{etapasDo(lead.funil).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
          {!captacao && <><label className="adm-campo"><span>Prazo para comprar</span><select value={f.prazo_compra || ''} onChange={set('prazo_compra')}><option value="">Não sei ainda</option>{PRAZOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
          <label className="adm-campo"><span>Dinheiro</span><select value={f.credito || ''} onChange={set('credito')}><option value="">Não sei ainda</option>{CREDITOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
          <label className="adm-campo"><span>Valor máximo (R$)</span><input inputMode="numeric" value={f.faixa_max ?? ''} onChange={set('faixa_max')} /></label></>}
        </div>
        {!captacao && <div className="adm-checks">
          <label className="adm-check"><input type="checkbox" checked={!!f.depende_venda} onChange={set('depende_venda')} /> Depende de vender o imóvel atual</label>
          <label className="adm-check"><input type="checkbox" checked={!!f.decisores_alinhados} onChange={set('decisores_alinhados')} /> Quem decide junto está alinhado</label>
          <label className="adm-check"><input type="checkbox" checked={!!f.motivacao_forte} onChange={set('motivacao_forte')} /> Motivo concreto com data</label>
        </div>}
        <div className="adm-travas">
          <b>Mensagens automáticas</b>
          <label className="adm-check"><input type="checkbox" checked={!!f.nao_contatar} onChange={set('nao_contatar')} /> Não contatar nunca mais (vai para a lista de bloqueio)</label>
          {f.automacao_pausada_ate && new Date(f.automacao_pausada_ate) > new Date()
            ? <p className="adm-sub">Follow-up pausado até {new Date(f.automacao_pausada_ate).toLocaleDateString('pt-BR')}. <button type="button" className="adm-link" onClick={() => setF({ ...f, automacao_pausada_ate: null, pausar: false })}>Retomar</button></p>
            : <label className="adm-check"><input type="checkbox" checked={!!f.pausar} onChange={set('pausar')} /> Pausar follow-up por 30 dias (estou conduzindo pessoalmente)</label>}
          <p className="adm-sub">Visita marcada, proposta, venda ou perdido já param tudo sozinhos.</p>
        </div>
        {f.etapa === 'perdido' && <label className="adm-campo"><span>Motivo da perda</span><input value={f.motivo_perda || ''} onChange={set('motivo_perda')} /></label>}
        <div className="adm-grade2">
          <label className="adm-campo"><span>Próxima ação</span><input placeholder="Ex.: mandar curadoria" value={f.proxima_acao || ''} onChange={set('proxima_acao')} /></label>
          <label className="adm-campo"><span>Quando</span><input type="datetime-local" value={f.proximaEm} onChange={set('proximaEm')} /></label>
        </div>
      </div>

      <div className="adm-bloco">
        <h2>Contato</h2>
        <div className="adm-grade2">
          <label className="adm-campo"><span>Nome</span><input value={f.nome || ''} onChange={set('nome')} /></label>
          <label className="adm-campo"><span>WhatsApp</span><input type="tel" value={f.whatsTxt || ''} onChange={set('whatsTxt')} /></label>
          <label className="adm-campo"><span>E-mail</span><input type="email" value={f.email || ''} onChange={set('email')} /></label>
          <label className="adm-campo"><span>Canal</span>
            <select value={f.canal || ''} onChange={set('canal')}><option value="">{lead.origem?.canal || 'Não informado'}</option>{CANAIS.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
        </div>
        {lead.origem?.utm_source && <p className="adm-sub">Veio de anúncio: {[lead.origem.utm_source, lead.origem.utm_campaign].filter(Boolean).join(' · ')}</p>}
      </div>

      <div className="adm-bloco">
        <h2>{captacao ? 'Sobre o imóvel e o proprietário' : 'O que procura'}</h2>
        {!captacao && <><div className="adm-grade2">
          <label className="adm-campo"><span>Objetivo</span><input placeholder="morar ou investir" value={f.objetivo || ''} onChange={set('objetivo')} /></label>
          <label className="adm-campo"><span>Faixa de investimento</span><input value={f.faixa_investimento || ''} onChange={set('faixa_investimento')} /></label>
          <label className="adm-campo"><span>Regiões (separe por vírgula)</span><input value={f.regioesTxt} onChange={set('regioesTxt')} /></label>
          <label className="adm-campo"><span>Prazo</span><input value={f.prazo || ''} onChange={set('prazo')} /></label>
          <label className="adm-campo"><span>Pagamento</span><input value={f.pagamento || ''} onChange={set('pagamento')} /></label>
          <label className="adm-campo"><span>Imóveis de interesse (códigos)</span><input placeholder="AC-0019, AC-0004" value={f.interesseTxt} onChange={set('interesseTxt')} /></label>
        </div>
        <label className="adm-campo"><span>Perfil da família</span><input value={f.perfil || ''} onChange={set('perfil')} /></label></>}
        <label className="adm-campo"><span>Suas anotações</span><textarea rows={4} value={f.notas || ''} onChange={set('notas')} /></label>
      </div>

      {!novo && (
        <div className="adm-bloco">
          <div className="adm-cabeca"><h2>Visitas</h2><button className="adm-btn" onClick={() => setNovaVisita(true)}>+ Agendar visita</button></div>
          {!visitas.length && <p className="adm-sub">Nenhuma visita ainda.</p>}
          {visitas.map((v) => {
            const [rot, cls] = STATUS_VISITA[v.status] || [v.status, ''];
            return <p key={v.id} className="adm-visita-mini"><span>{dataHora(v.inicio)} · {v.imovel_codigo || 'imóvel a definir'}</span><span className={`adm-status ${cls}`}>{rot}</span></p>;
          })}
          {novaVisita && <NovaVisita leadInicial={lead} aoFechar={(m) => { setNovaVisita(false); if (m) { carregarVisitas(); setMudou(true); } }} />}
        </div>
      )}

      {!novo && <Tarefas negocioId={lead.id} contatoId={lead.contato_id} titulo="Tarefas deste negócio" />}
      {!novo && <LinhaDoTempo contatoId={lead.contato_id} negocioIds={[lead.id]} />}

      <div className="adm-barra">
        <div className="adm-acoes">
          {msg && <span className="adm-msg">{msg}</span>}
          {!novo && <button className="adm-link" onClick={excluir}>Excluir</button>}
          <button className="adm-btn adm-primario" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : novo ? 'Criar lead' : 'Salvar'}</button>
        </div>
      </div>
    </section>
  );
}

const PARTES = [['financeiro', 'Dinheiro', 30], ['prazo', 'Prazo', 25], ['encaixe', 'Encaixe', 15], ['engajamento', 'Engajamento', 20], ['decisao', 'Decisão', 10]];
function Termometro({ l }) {
  const d = l.termometro_detalhe || {};
  const [n, cls, acao] = FAIXAS[l.termometro_faixa] || ['', '', ''];
  return (
    <div className="adm-bloco">
      <div className="adm-cabeca"><h2>Termômetro</h2><span className={`adm-termo grande ${cls}`}>{n} {l.termometro}</span></div>
      <div className="adm-termo-barra"><i style={{ width: `${l.termometro}%` }} className={cls} /></div>
      {acao && <p className="adm-msg"><b>Norte:</b> {acao}</p>}
      <div className="adm-termo-partes">
        {PARTES.map(([k, rot, max]) => <span key={k}>{rot}<b>{d.partes?.[k] ?? 0}/{max}</b></span>)}
        {!!d.partes?.ajustes && <span>Ajustes<b>{d.partes.ajustes > 0 ? '+' : ''}{d.partes.ajustes}</b></span>}
        {!!d.partes?.inatividade && <span>Parado há {d.dias_sem_atividade} dias<b>{d.partes.inatividade}</b></span>}
      </div>
      {d.falta?.length > 0 && (
        <>
          <p className="adm-sub" style={{ margin: 0 }}>O que falta para esquentar</p>
          <ul className="adm-falta">{d.falta.slice(0, 4).map((x) => <li key={x.acao}>{x.acao.replace(/:\s*[^:]*vale (até )?\+\d+\s*$/, '')} <b>+{x.pontos}</b></li>)}</ul>
        </>
      )}
    </div>
  );
}
