'use client';
import { useEffect, useState } from 'react';
import { sb } from '@/lib/admin/cliente';
import { ETAPAS } from '@/lib/admin/opcoes';

const data = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fone = (w) => String(w || '').replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');

export default function Atendimentos() {
  const [leads, setLeads] = useState(null);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(null);

  useEffect(() => {
    sb().from('leads').select('id,nome,whatsapp,email,objetivo,regioes,faixa_investimento,prazo,pagamento,pontuacao,etapa,origem,imoveis_interesse,criado_em')
      .order('criado_em', { ascending: false }).limit(150)
      .then(({ data, error }) => (error ? setErro(error.message) : setLeads(data)));
  }, []);

  const mudarEtapa = async (id, etapa) => {
    setLeads((l) => l.map((x) => (x.id === id ? { ...x, etapa } : x)));
    const { error } = await sb().from('leads').update({ etapa, atualizado_em: new Date().toISOString() }).eq('id', id);
    if (error) setErro(error.message);
  };

  return (
    <section className="adm-pagina">
      <div className="adm-cabeca"><div><h1>Atendimentos</h1><p className="adm-sub">Quem deixou contato no chat do site. Os mais recentes primeiro.</p></div></div>
      {erro && <p className="adm-erro">{erro}</p>}
      {!leads ? <p className="adm-sub">Carregando…</p> : !leads.length ? <p className="adm-sub">Nenhum atendimento ainda.</p> : (
        <ul className="adm-lista adm-leads">
          {leads.map((l) => (
            <li key={l.id}>
              <div className="adm-lead">
                <button className="adm-info" onClick={() => setAberto(aberto === l.id ? null : l.id)}>
                  <b>{l.nome || 'Sem nome'} {l.pontuacao && <span className={`adm-nota-lead n-${l.pontuacao}`}>{l.pontuacao}</span>}</b>
                  <small>{data(l.criado_em)} · {fone(l.whatsapp) || 'sem WhatsApp'}{l.origem?.utm_source ? ` · ${l.origem.utm_source}` : ''}</small>
                  <small>{[l.objetivo, (l.regioes || []).join(', '), l.faixa_investimento, l.prazo].filter(Boolean).join(' · ')}</small>
                </button>
                <div className="adm-lead-acoes">
                  <select value={l.etapa || 'novo'} onChange={(e) => mudarEtapa(l.id, e.target.value)}>{ETAPAS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
                  {l.whatsapp && <a className="adm-btn adm-whats" href={`https://wa.me/${l.whatsapp}`} target="_blank" rel="noopener">WhatsApp</a>}
                </div>
              </div>
              {aberto === l.id && <Conversa leadId={l.id} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Conversa({ leadId }) {
  const [itens, setItens] = useState(null);
  useEffect(() => {
    (async () => {
      const { data: convs } = await sb().from('conversas').select('id,resumo,contexto,criado_em').eq('lead_id', leadId).order('criado_em');
      const ids = (convs || []).map((c) => c.id);
      const { data: msgs } = ids.length
        ? await sb().from('mensagens').select('conversa_id,papel,conteudo,criado_em').in('conversa_id', ids).in('papel', ['usuario', 'assistente']).order('criado_em')
        : { data: [] };
      setItens({ convs: convs || [], msgs: msgs || [] });
    })();
  }, [leadId]);
  if (!itens) return <p className="adm-sub" style={{ padding: '8px 16px' }}>Carregando conversa…</p>;
  return (
    <div className="adm-conversa">
      {itens.convs.map((c) => (
        <div key={c.id}>
          <p className="adm-sub">Conversa de {data(c.criado_em)} · código {String(c.id).slice(0, 6).toUpperCase()}{c.contexto?.pagina ? ` · começou em ${c.contexto.pagina}` : ''}</p>
          {c.resumo && <p className="adm-resumo">{c.resumo}</p>}
          {itens.msgs.filter((m) => m.conversa_id === c.id).map((m, k) => (
            <p key={k} className={m.papel === 'usuario' ? 'eu' : 'bot'}>{m.conteudo}</p>
          ))}
        </div>
      ))}
      {!itens.convs.length && <p className="adm-sub">Sem conversa registrada.</p>}
    </div>
  );
}
