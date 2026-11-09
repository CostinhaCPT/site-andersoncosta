'use client';
// Painel de anúncios: visão global da conta e mergulho campanha > conjunto > anúncio.
// Gasto e entrega vêm da Meta (tabela ads_diario, atualizada pela função "meta"); leads, temperatura e visitas
// vêm do CRM (view ads_leads, pelo anúncio de origem do Click to WhatsApp). Assim o custo por lead é o real.
import { useEffect, useMemo, useState } from 'react';
import { sb } from '@/lib/admin/cliente';
import { meta } from '@/lib/admin/estudio';

const brl = (v) => (v == null || !isFinite(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: v < 100 ? 2 : 0 }));
const num = (v) => (v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('pt-BR'));
const pct = (v) => (v == null || !isFinite(v) ? '—' : (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%');
const div = (a, b) => (b ? a / b : null);
const diaBr = (d) => new Date(Date.now() - 3 * 3600e3 - d * 864e5).toISOString().slice(0, 10);
const QUENTE = ['quente', 'morno'];
const STATUS = { ACTIVE: ['Ativo', 't-voce'], PAUSED: ['Pausado', ''], CAMPAIGN_PAUSED: ['Campanha pausada', ''], ADSET_PAUSED: ['Conjunto pausado', ''], IN_PROCESS: ['Em análise', 't-alerta'], PENDING_REVIEW: ['Em análise', 't-alerta'], DISAPPROVED: ['Reprovado', 't-bloq'], WITH_ISSUES: ['Com problema', 't-bloq'], ARCHIVED: ['Arquivado', ''], DELETED: ['Excluído', ''] };

function vazio() { return { gasto: 0, impressoes: 0, alcance: 0, cliques: 0, cliques_link: 0, conversas: 0, leads: 0, quentes: 0, visitas: 0 }; }
function somar(a, r) { for (const k of ['gasto', 'impressoes', 'alcance', 'cliques', 'cliques_link', 'conversas']) a[k] += Number(r[k] || 0); return a; }

export default function Anuncios() {
  const [dias, setDias] = useState(7);
  const [diario, setDiario] = useState([]);
  const [ents, setEnts] = useState([]);
  const [leads, setLeads] = useState([]);
  const [nivel, setNivel] = useState('campanha');
  const [filtro, setFiltro] = useState({ campanha: null, conjunto: null });
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = async () => {
    const desde = diaBr(dias - 1);
    const c = sb();
    const [d, e, l] = await Promise.all([
      c.from('ads_diario').select('*').gte('dia', desde).limit(5000),
      c.from('ads_entidades').select('*').limit(2000),
      c.from('ads_leads').select('*').gte('dia', desde).limit(2000),
    ]);
    setDiario(d.data || []); setEnts(e.data || []); setLeads(l.data || []);
    if (d.error || e.error || l.error) setMsg((d.error || e.error || l.error).message);
  };
  useEffect(() => { carregar(); }, [dias]); // eslint-disable-line react-hooks/exhaustive-deps

  const atualizar = async () => {
    setOcupado(true); setMsg('');
    try { const r = await meta({ acao: 'sincronizar_ads', dias: 30 }); setMsg(`Atualizado da Meta: ${r.dias} linhas de dia por anúncio.`); await carregar(); }
    catch (e) { setMsg(e.message); }
    setOcupado(false);
  };

  const mapa = useMemo(() => Object.fromEntries(ents.map((x) => [x.id, x])), [ents]);
  const ultima = useMemo(() => diario.reduce((m, r) => (r.atualizado_em > m ? r.atualizado_em : m), ''), [diario]);

  // Hierarquia de cada anúncio (pelo diário, que sempre traz os ids; entidades completam status e miniatura)
  const pais = useMemo(() => {
    const p = {};
    for (const r of diario) p[r.anuncio_id] = { conjunto: r.conjunto_id, campanha: r.campanha_id };
    for (const x of ents) if (x.nivel === 'anuncio' && !p[x.id]) p[x.id] = { conjunto: x.pai_id, campanha: mapa[x.pai_id]?.pai_id };
    return p;
  }, [diario, ents, mapa]);

  const total = useMemo(() => {
    const t = diario.reduce(somar, vazio());
    t.leads = leads.length;
    t.quentes = leads.filter((x) => QUENTE.includes(x.termometro_faixa)).length;
    t.visitas = leads.filter((x) => x.teve_visita).length;
    return t;
  }, [diario, leads]);

  const porDia = useMemo(() => {
    const m = {};
    for (let i = dias - 1; i >= 0; i--) m[diaBr(i)] = { gasto: 0, conversas: 0, leads: 0 };
    for (const r of diario) if (m[r.dia]) { m[r.dia].gasto += Number(r.gasto); m[r.dia].conversas += Number(r.conversas); }
    for (const l of leads) if (m[l.dia]) m[l.dia].leads++;
    return Object.entries(m);
  }, [diario, leads, dias]);

  const linhas = useMemo(() => {
    const chave = (adId) => (nivel === 'anuncio' ? adId : pais[adId]?.[nivel]);
    const passa = (adId) => (!filtro.campanha || pais[adId]?.campanha === filtro.campanha) && (!filtro.conjunto || pais[adId]?.conjunto === filtro.conjunto);
    const g = {};
    const pegar = (id) => (g[id] ||= { id, ...vazio() });
    for (const r of diario) if (passa(r.anuncio_id)) somar(pegar(chave(r.anuncio_id)), r);
    for (const l of leads) {
      if (!l.anuncio_id || !passa(l.anuncio_id)) continue;
      const k = chave(l.anuncio_id); if (!k) continue;
      const a = pegar(k); a.leads++; if (QUENTE.includes(l.termometro_faixa)) a.quentes++; if (l.teve_visita) a.visitas++;
    }
    // Entidades ativas sem entrega no período também aparecem (para ver o que está ligado e não gasta)
    for (const x of ents) if (x.nivel === nivel && x.status_efetivo === 'ACTIVE') {
      const ok = nivel === 'anuncio' ? passa(x.id) : nivel === 'conjunto' ? (!filtro.campanha || x.pai_id === filtro.campanha) : true;
      if (ok) pegar(x.id);
    }
    return Object.values(g).filter((x) => x.id).sort((a, b) => b.gasto - a.gasto);
  }, [diario, leads, ents, nivel, filtro, pais]);

  const alertas = useMemo(() => {
    const out = [];
    const porAd = {};
    for (const r of diario) somar(porAd[r.anuncio_id] ||= { ...vazio(), id: r.anuncio_id }, r);
    for (const l of leads) if (porAd[l.anuncio_id]) porAd[l.anuncio_id].leads++;
    const cpl = div(total.gasto, total.leads);
    for (const a of Object.values(porAd)) {
      const nome = mapa[a.id]?.nome || a.id;
      if (a.gasto >= 30 && !a.conversas && !a.leads) out.push(`${nome}: ${brl(a.gasto)} gastos e nenhuma conversa no período.`);
      else if (cpl && a.leads && a.gasto / a.leads > cpl * 2) out.push(`${nome}: custo por lead ${brl(a.gasto / a.leads)}, mais que o dobro da média da conta (${brl(cpl)}).`);
      if (a.impressoes > 2000 && div(a.cliques_link, a.impressoes) < 0.004) out.push(`${nome}: CTR de link ${pct(div(a.cliques_link, a.impressoes))}, abaixo de 0,4%. Vale testar outro criativo.`);
    }
    for (const x of ents) if (['DISAPPROVED', 'WITH_ISSUES'].includes(x.status_efetivo)) out.push(`${x.nome}: ${STATUS[x.status_efetivo][0].toLowerCase()} na Meta.`);
    if (total.leads >= 5 && total.quentes === 0) out.push(`Nenhum dos ${total.leads} leads de anúncio do período ficou morno ou quente. O problema pode estar no público ou na promessa do anúncio, não só no custo.`);
    return out;
  }, [diario, leads, ents, mapa, total]);

  const entrar = (id) => {
    if (nivel === 'campanha') { setFiltro({ campanha: id, conjunto: null }); setNivel('conjunto'); }
    else if (nivel === 'conjunto') { setFiltro({ ...filtro, conjunto: id }); setNivel('anuncio'); }
  };
  const max = Math.max(1, ...porDia.map(([, v]) => v.gasto));

  const kpis = [
    ['Investimento', brl(total.gasto)],
    ['Conversas (Meta)', num(total.conversas)],
    ['Custo por conversa', brl(div(total.gasto, total.conversas))],
    ['Leads no CRM', num(total.leads)],
    ['Custo por lead real', brl(div(total.gasto, total.leads))],
    ['Mornos ou quentes', `${num(total.quentes)}${total.leads ? ` (${pct(div(total.quentes, total.leads))})` : ''}`],
    ['Visitas', num(total.visitas)],
    ['CTR de link', pct(div(total.cliques_link, total.impressoes))],
    ['CPM', brl(div(total.gasto, total.impressoes) * 1000)],
    ['Impressões', num(total.impressoes)],
  ];

  return (
    <section className="adm-pagina adm-ads">
      <div className="adm-cabeca"><div>
        <h1>Anúncios</h1>
        <p className="adm-sub">Gasto e entrega vêm da Meta. Leads, temperatura e visitas vêm do CRM, pelo anúncio de onde a conversa no WhatsApp começou.{ultima && ` Última atualização: ${new Date(ultima).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`}</p>
      </div></div>

      <div className="adm-ads-barra">
        <div className="adm-seg">{[7, 14, 30].map((d) => <button key={d} className={dias === d ? 'on' : ''} onClick={() => setDias(d)}>{d} dias</button>)}</div>
        <button className="adm-btn" disabled={ocupado} onClick={atualizar}>{ocupado ? 'Atualizando…' : 'Atualizar da Meta'}</button>
      </div>
      {msg && <p className="adm-msg">{msg}</p>}

      <div className="adm-ads-kpis">{kpis.map(([r, v]) => <div key={r} className="adm-ads-kpi"><span>{r}</span><b>{v}</b></div>)}</div>

      <div className="adm-bloco">
        <h2>Dia a dia</h2>
        <div className="adm-ads-grafico" role="img" aria-label="Investimento por dia, com conversas e leads">
          {porDia.map(([d, v]) => (
            <div key={d} className="adm-ads-barra-dia" title={`${d.split('-').reverse().slice(0, 2).join('/')}: ${brl(v.gasto)}, ${v.conversas} conversas, ${v.leads} leads`}>
              <small>{v.leads || ''}</small>
              <i style={{ height: `${Math.max(2, (v.gasto / max) * 100)}%` }} />
              <em>{d.slice(8)}</em>
            </div>
          ))}
        </div>
        <p className="adm-nota" style={{ marginTop: 6 }}>Barra: investimento do dia. Número em cima: leads que chegaram pelo anúncio. Passe o dedo ou o mouse para ver os valores.</p>
      </div>

      {alertas.length > 0 && <div className="adm-bloco adm-ads-alertas"><h2>Pontos de atenção</h2><ul>{alertas.slice(0, 8).map((a) => <li key={a}>{a}</li>)}</ul></div>}

      <h2 className="adm-secao">Por {nivel === 'campanha' ? 'campanha' : nivel === 'conjunto' ? 'conjunto' : 'anúncio'}</h2>
      <div className="adm-ads-barra">
        <div className="adm-seg">{[['campanha', 'Campanhas'], ['conjunto', 'Conjuntos'], ['anuncio', 'Anúncios']].map(([k, n]) => <button key={k} className={nivel === k ? 'on' : ''} onClick={() => setNivel(k)}>{n}</button>)}</div>
        {(filtro.campanha || filtro.conjunto) && <button className="adm-link" onClick={() => { setFiltro({ campanha: null, conjunto: null }); }}>Ver tudo{filtro.campanha ? ` (filtro: ${mapa[filtro.conjunto || filtro.campanha]?.nome || 'selecionado'})` : ''}</button>}
      </div>
      <div className="adm-tabela-rolagem">
        <table className="adm-tabela">
          <thead><tr><th>Nome</th><th>Status</th><th>Gasto</th><th>Impr.</th><th>CTR link</th><th>CPM</th><th>Conversas</th><th>Custo/conv.</th><th>Leads</th><th>Custo/lead</th><th>Mornos/quentes</th><th>Visitas</th></tr></thead>
          <tbody>
            {linhas.map((l) => {
              const e = mapa[l.id] || {};
              const nome = e.nome || diario.find((r) => r.anuncio_id === l.id || r.conjunto_id === l.id || r.campanha_id === l.id)?.[`${nivel === 'anuncio' ? 'anuncio' : nivel}_nome`] || l.id;
              const st = STATUS[e.status_efetivo] || [e.status_efetivo || '—', ''];
              return (
                <tr key={l.id} onClick={() => entrar(l.id)} style={{ cursor: nivel === 'anuncio' ? 'default' : 'pointer' }}>
                  <td className="adm-ads-nome">{nivel === 'anuncio' && e.thumb && <img src={e.thumb} alt="" width={36} height={36} />}<span>{nome}{nivel !== 'anuncio' && <small> ›</small>}</span></td>
                  <td><span className={`adm-tag ${st[1]}`}>{st[0]}</span></td>
                  <td>{brl(l.gasto)}</td><td>{num(l.impressoes)}</td><td>{pct(div(l.cliques_link, l.impressoes))}</td><td>{brl(div(l.gasto, l.impressoes) * 1000)}</td>
                  <td>{num(l.conversas)}</td><td>{brl(div(l.gasto, l.conversas))}</td>
                  <td>{num(l.leads)}</td><td>{brl(div(l.gasto, l.leads))}</td><td>{num(l.quentes)}</td><td>{num(l.visitas)}</td>
                </tr>
              );
            })}
            {!linhas.length && <tr><td colSpan={12} className="adm-sub">Sem dados no período. Toque em "Atualizar da Meta".</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="adm-nota">Conversas é o que a Meta conta como conversa iniciada. Leads é quem de fato entrou no seu CRM vindo daquele anúncio. A diferença entre os dois mostra quem chamou e não seguiu a conversa. A Meta atualiza sozinha a cada 6 horas; o botão força agora.</p>
    </section>
  );
}
