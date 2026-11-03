'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sb } from '@/lib/admin/cliente';
import { chamarAdmin, dataHora, deLocal, diaLongo, fone, hora, paraLocal, STATUS_VISITA } from '@/lib/admin/ia';

const COLS = 'id,lead_id,conversa_id,imovel_codigo,inicio,fim,status,fora_horario,motivo_validacao,origem,observacoes,criado_em,leads(id,nome,whatsapp,email)';

export default function Agenda({ aoAbrirLead }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [nova, setNova] = useState(false);
  const [semIcal, setSemIcal] = useState(false);

  const carregar = useCallback(async () => {
    const desde = new Date(Date.now() - 7 * 864e5).toISOString();
    const { data, error } = await sb().from('visitas').select(COLS).gte('inicio', desde).order('inicio');
    if (error) setErro(error.message); else setLista(data);
  }, []);
  useEffect(() => {
    carregar();
    sb().from('config').select('valor').eq('chave', 'agenda').maybeSingle().then(({ data }) => setSemIcal(!data?.valor?.ical_url));
  }, [carregar]);

  const agora = Date.now();
  const pendentes = (lista || []).filter((v) => v.status === 'solicitada' && Date.parse(v.inicio) > agora - 864e5);
  const proximas = (lista || []).filter((v) => v.status === 'confirmada' && Date.parse(v.fim) > agora);
  const passadas = (lista || []).filter((v) => v.status === 'confirmada' && Date.parse(v.fim) <= agora);
  const diaBR = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);
  const amanha = proximas.filter((v) => diaBR(Date.parse(v.inicio)) === diaBR(agora + 864e5));
  const porDia = useMemo(() => {
    const m = new Map();
    for (const v of proximas) { const k = diaLongo(v.inicio); if (!m.has(k)) m.set(k, []); m.get(k).push(v); }
    return [...m.entries()];
  }, [lista]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="adm-pagina">
      <div className="adm-cabeca">
        <div><h1>Agenda de visitas</h1><p className="adm-sub">{pendentes.length} para você validar · {proximas.length} confirmadas</p></div>
        <button className="adm-btn adm-primario" onClick={() => setNova(true)}>+ Nova visita</button>
      </div>
      {semIcal && <p className="adm-aviso">Sua Google Agenda ainda não está ligada. Sem ela, o chat só enxerga as visitas daqui. Conecte na aba <b>Chat</b>.</p>}
      {erro && <p className="adm-erro">{erro}</p>}
      {nova && <NovaVisita aoFechar={(mudou) => { setNova(false); if (mudou) carregar(); }} />}
      {!lista ? <p className="adm-sub">Carregando…</p> : (
        <>
          {pendentes.length > 0 && (
            <>
              <h2 className="adm-secao">Para você validar</h2>
              <ul className="adm-lista adm-visitas">{pendentes.map((v) => <Visita key={v.id} v={v} aoMudar={carregar} aoAbrirLead={aoAbrirLead} />)}</ul>
            </>
          )}
          {amanha.length > 0 && (
            <div className="adm-aviso adm-lembretes">
              <b>Amanhã: confirme com um toque</b>
              {amanha.map((v) => {
                const l = v.leads || {};
                const txt = `Oi, ${String(l.nome || '').split(' ')[0]}! Aqui é o Anderson Costa. Passando para confirmar nossa visita amanhã às ${hora(v.inicio)}${v.imovel_codigo ? `, imóvel ${v.imovel_codigo}` : ''}. Segue de pé?`;
                return l.whatsapp ? (
                  <a key={v.id} className="adm-btn adm-whats" href={`https://wa.me/${l.whatsapp}?text=${encodeURIComponent(txt)}`} target="_blank" rel="noopener">{hora(v.inicio)} · {l.nome}</a>
                ) : <span key={v.id}>{hora(v.inicio)} · {l.nome} (sem WhatsApp)</span>;
              })}
            </div>
          )}
          <h2 className="adm-secao">Próximas visitas</h2>
          {!porDia.length && <p className="adm-sub">Nenhuma visita confirmada pela frente.</p>}
          {porDia.map(([dia, vs]) => (
            <div key={dia} className="adm-dia">
              <p className="adm-dia-tit">{dia}</p>
              <ul className="adm-lista adm-visitas">{vs.map((v) => <Visita key={v.id} v={v} aoMudar={carregar} aoAbrirLead={aoAbrirLead} />)}</ul>
            </div>
          ))}
          {passadas.length > 0 && (
            <>
              <h2 className="adm-secao">Aconteceram? Marque como realizadas</h2>
              <ul className="adm-lista adm-visitas">{passadas.map((v) => <Visita key={v.id} v={v} aoMudar={carregar} aoAbrirLead={aoAbrirLead} />)}</ul>
            </>
          )}
        </>
      )}
      <p className="adm-nota">Visitas pedidas no chat dentro do horário comercial, em horário livre e sem necessidade de avisar o proprietário, entram confirmadas sozinhas. As outras aparecem aqui para você validar.</p>
    </section>
  );
}

function Visita({ v, aoMudar, aoAbrirLead }) {
  const [ocupado, setOcupado] = useState(false);
  const [zap, setZap] = useState(null);
  const [remarcar, setRemarcar] = useState(false);
  const [novo, setNovo] = useState(paraLocal(v.inicio));
  const [erro, setErro] = useState('');
  const lead = v.leads || {};
  const [rot, cls] = STATUS_VISITA[v.status] || [v.status, ''];

  const agir = async (op, extra = {}) => {
    setOcupado(true); setErro('');
    try {
      const j = await chamarAdmin({ acao: 'visita', id: v.id, op, ...extra });
      setZap(j.whatsapp_url ? { url: j.whatsapp_url, op } : null);
      setRemarcar(false);
      if (!j.whatsapp_url) aoMudar();
    } catch (e) { setErro(e.message); } finally { setOcupado(false); }
  };
  const rotZap = { confirmar: 'Avisar o lead no WhatsApp', recusar: 'Sugerir outro horário no WhatsApp', cancelar: 'Avisar cancelamento no WhatsApp', realizada: 'Pedir retorno da visita no WhatsApp', avisar: 'Mandar lembrete no WhatsApp' };

  return (
    <li className="adm-visita">
      <div className="adm-visita-linha">
        <span className="adm-visita-hora">{hora(v.inicio)}<small>{dataHora(v.inicio).split(',')[0]} {new Date(v.inicio).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })}</small></span>
        <button className="adm-info" onClick={() => lead.id && aoAbrirLead?.(lead.id)}>
          <b>{lead.nome || 'Sem nome'}</b>
          <small>{v.imovel_codigo || 'imóvel a definir'} · {fone(lead.whatsapp) || 'sem WhatsApp'}{v.origem === 'chat' ? ' · pelo chat' : ''}</small>
          {v.motivo_validacao && v.status === 'solicitada' && <small className="adm-motivo">{v.motivo_validacao}</small>}
          {v.observacoes && <small>“{v.observacoes}”</small>}
        </button>
        <span className={`adm-status ${cls}`}>{rot}</span>
      </div>
      {zap ? (
        <div className="adm-visita-acoes">
          <a className="adm-btn adm-whats" href={zap.url} target="_blank" rel="noopener" onClick={() => setTimeout(() => { setZap(null); aoMudar(); }, 400)}>{rotZap[zap.op]}</a>
          <button className="adm-link" onClick={() => { setZap(null); aoMudar(); }}>Agora não</button>
        </div>
      ) : (
        <div className="adm-visita-acoes">
          {v.status === 'solicitada' && <>
            <button className="adm-btn adm-primario" disabled={ocupado} onClick={() => agir('confirmar')}>Confirmar</button>
            <button className="adm-btn" disabled={ocupado} onClick={() => setRemarcar(!remarcar)}>Outro horário</button>
            <button className="adm-link" disabled={ocupado} onClick={() => agir('recusar')}>Recusar</button>
          </>}
          {v.status === 'confirmada' && Date.parse(v.fim) > Date.now() && <>
            <button className="adm-btn" disabled={ocupado} onClick={() => agir('avisar')}>Lembrete</button>
            <button className="adm-btn" disabled={ocupado} onClick={() => setRemarcar(!remarcar)}>Remarcar</button>
            <button className="adm-link" disabled={ocupado} onClick={() => confirm('Cancelar esta visita?') && agir('cancelar')}>Cancelar</button>
          </>}
          {v.status === 'confirmada' && Date.parse(v.fim) <= Date.now() && <>
            <button className="adm-btn adm-primario" disabled={ocupado} onClick={() => agir('realizada')}>Foi realizada</button>
            <button className="adm-link" disabled={ocupado} onClick={() => agir('cancelar')}>Não aconteceu</button>
          </>}
        </div>
      )}
      {remarcar && (
        <div className="adm-visita-acoes">
          <input type="datetime-local" value={novo} step={1800} onChange={(e) => setNovo(e.target.value)} />
          <button className="adm-btn adm-primario" disabled={ocupado || !novo} onClick={() => agir('confirmar', { novo_inicio: deLocal(novo) })}>Confirmar neste horário</button>
        </div>
      )}
      {erro && <p className="adm-erro">{erro}</p>}
    </li>
  );
}

export function NovaVisita({ leadInicial, aoFechar }) {
  const [leads, setLeads] = useState([]);
  const [imoveis, setImoveis] = useState([]);
  const [f, setF] = useState({ lead_id: leadInicial?.id || '', imovel_codigo: '', inicio: '', observacoes: '', duracao: 60 });
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [zap, setZap] = useState(null);

  useEffect(() => {
    if (!leadInicial) sb().from('leads').select('id,nome,whatsapp').neq('etapa', 'perdido').order('atualizado_em', { ascending: false }).limit(300).then(({ data }) => setLeads(data || []));
    sb().from('imoveis').select('codigo,titulo,status').in('status', ['disponivel', 'reservado', 'rascunho']).order('codigo').then(({ data }) => setImoveis(data || []));
    sb().from('config').select('valor').eq('chave', 'agenda').maybeSingle().then(({ data }) => data?.valor?.duracao_min && setF((x) => ({ ...x, duracao: data.valor.duracao_min })));
  }, [leadInicial]);

  const salvar = async (e) => {
    e.preventDefault();
    if (!f.lead_id) return setErro('Escolha o lead.');
    if (!f.inicio) return setErro('Escolha o dia e o horário.');
    setOcupado(true); setErro('');
    const ini = deLocal(f.inicio);
    const { data, error } = await sb().from('visitas').insert({
      lead_id: f.lead_id, imovel_codigo: f.imovel_codigo || null, inicio: ini,
      fim: new Date(Date.parse(ini) + f.duracao * 60e3).toISOString(), status: 'confirmada', origem: 'admin',
      observacoes: f.observacoes || null, confirmada_em: new Date().toISOString(),
    }).select('id').single();
    if (error) { setErro(error.message); setOcupado(false); return; }
    try {
      const j = await chamarAdmin({ acao: 'visita', id: data.id, op: 'confirmar' });
      if (j.whatsapp_url) { setZap(j.whatsapp_url); setOcupado(false); return; }
    } catch (err) { /* the visit is saved even if the e-mail fails */ }
    aoFechar(true);
  };

  return (
    <div className="adm-modal" role="dialog" aria-label="Nova visita" onClick={(e) => e.target === e.currentTarget && aoFechar(false)}>
      <form className="adm-modal-caixa" onSubmit={salvar}>
        <h2>Nova visita</h2>
        {zap ? (
          <>
            <p className="adm-msg">Visita salva e convite enviado para o seu e-mail.</p>
            <a className="adm-btn adm-whats" href={zap} target="_blank" rel="noopener" onClick={() => setTimeout(() => aoFechar(true), 400)}>Confirmar com o lead no WhatsApp</a>
            <button type="button" className="adm-link" onClick={() => aoFechar(true)}>Fechar</button>
          </>
        ) : (
          <>
            {leadInicial ? <p className="adm-sub">Com {leadInicial.nome}</p> : (
              <label className="adm-campo"><span>Lead</span>
                <select value={f.lead_id} onChange={(e) => setF({ ...f, lead_id: e.target.value })}>
                  <option value="">Escolha…</option>
                  {leads.map((l) => <option key={l.id} value={l.id}>{l.nome || 'Sem nome'} {l.whatsapp ? `· ${fone(l.whatsapp)}` : ''}</option>)}
                </select>
              </label>
            )}
            <label className="adm-campo"><span>Imóvel</span>
              <select value={f.imovel_codigo} onChange={(e) => setF({ ...f, imovel_codigo: e.target.value })}>
                <option value="">A definir / imóvel de parceiro</option>
                {imoveis.map((i) => <option key={i.codigo} value={i.codigo}>{i.codigo} · {i.titulo}</option>)}
              </select>
            </label>
            <div className="adm-grade2">
              <label className="adm-campo"><span>Dia e horário</span><input type="datetime-local" step={1800} value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></label>
              <label className="adm-campo"><span>Duração (min)</span><input type="number" min={15} step={15} value={f.duracao} onChange={(e) => setF({ ...f, duracao: Number(e.target.value) || 60 })} /></label>
            </div>
            <label className="adm-campo"><span>Observação</span><input type="text" value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></label>
            {erro && <p className="adm-erro">{erro}</p>}
            <div className="adm-acoes">
              <button type="button" className="adm-link" onClick={() => aoFechar(false)}>Cancelar</button>
              <button className="adm-btn adm-primario" disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar visita'}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
