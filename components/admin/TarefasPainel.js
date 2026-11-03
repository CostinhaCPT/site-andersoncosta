'use client';
import { useCallback, useEffect, useState } from 'react';
import { sb } from '@/lib/admin/cliente';
import { chamarApp, dataHora, deLocal, fone } from '@/lib/admin/ia';
import { TIPOS_TAREFA } from '@/lib/admin/crm';

const fimDoDia = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };

export default function TarefasPainel({ aoAbrirContato, aoAbrirNegocio }) {
  const [lista, setLista] = useState(null);
  const [feitas, setFeitas] = useState([]);
  const [contatos, setContatos] = useState([]);
  const [novo, setNovo] = useState({ titulo: '', tipo: 'tarefa', quando: '', prioridade: 'normal', contato_id: '' });
  const [buscaC, setBuscaC] = useState('');
  const carregar = useCallback(async () => {
    const c = sb();
    const [{ data }, { data: f }] = await Promise.all([
      c.from('tarefas').select('*,contatos(id,nome,whatsapp),leads(id,titulo,nome)').is('concluida_em', null).order('vence_em', { nullsFirst: false }).limit(300),
      c.from('tarefas').select('id,titulo,concluida_em,contatos(nome)').not('concluida_em', 'is', null).order('concluida_em', { ascending: false }).limit(15),
    ]);
    setLista(data || []); setFeitas(f || []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (buscaC.length < 2) { setContatos([]); return; }
    const t = setTimeout(() => sb().from('contatos').select('id,nome,whatsapp').or(`nome.ilike.%${buscaC.replace(/[%,()]/g, '')}%,whatsapp.ilike.%${buscaC.replace(/\D/g, '') || 'x'}%`).limit(8)
      .then(({ data }) => setContatos(data || [])), 250);
    return () => clearTimeout(t);
  }, [buscaC]);
  const criar = async (e) => {
    e.preventDefault(); if (!novo.titulo.trim()) return;
    await sb().from('tarefas').insert({ titulo: novo.titulo.trim(), tipo: novo.tipo, prioridade: novo.prioridade, vence_em: deLocal(novo.quando), contato_id: novo.contato_id || null });
    setNovo({ titulo: '', tipo: 'tarefa', quando: '', prioridade: 'normal', contato_id: '' }); setBuscaC(''); carregar();
  };
  const concluir = async (t) => { await sb().from('tarefas').update({ concluida_em: new Date().toISOString() }).eq('id', t.id); carregar(); };
  const adiar = async (t, dias) => {
    const base = Math.max(Date.now(), t.vence_em ? Date.parse(t.vence_em) : 0);
    await sb().from('tarefas').update({ vence_em: new Date(base + dias * 864e5).toISOString() }).eq('id', t.id); carregar();
  };
  const agora = Date.now(), hoje = fimDoDia();
  const grupos = [
    ['Atrasadas', (lista || []).filter((t) => t.vence_em && Date.parse(t.vence_em) < agora)],
    ['Hoje', (lista || []).filter((t) => t.vence_em && Date.parse(t.vence_em) >= agora && Date.parse(t.vence_em) <= hoje)],
    ['Próximas', (lista || []).filter((t) => t.vence_em && Date.parse(t.vence_em) > hoje)],
    ['Sem data', (lista || []).filter((t) => !t.vence_em)],
  ];
  const escolhido = contatos.find((c) => c.id === novo.contato_id);
  return (
    <section className="adm-pagina">
      <div className="adm-cabeca"><div><h1>Tarefas</h1><p className="adm-sub">{lista ? `${grupos[0][1].length} atrasadas · ${grupos[1][1].length} para hoje` : 'Carregando…'}</p></div></div>
      <Registrar aoRegistrar={carregar} />
      <Revisao aoResolver={carregar} />
      <div className="adm-bloco">
        <form className="adm-tarefa-nova" onSubmit={criar}>
          <input placeholder="Nova tarefa" value={novo.titulo} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} />
          <select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}>{TIPOS_TAREFA.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
          <input type="datetime-local" value={novo.quando} onChange={(e) => setNovo({ ...novo, quando: e.target.value })} />
          <select value={novo.prioridade} onChange={(e) => setNovo({ ...novo, prioridade: e.target.value })}><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option></select>
          <input placeholder="Ligar a um contato (opcional)" value={escolhido ? escolhido.nome || fone(escolhido.whatsapp) : buscaC} onChange={(e) => { setNovo({ ...novo, contato_id: '' }); setBuscaC(e.target.value); }} />
          <button className="adm-btn adm-primario">Criar</button>
        </form>
        {!novo.contato_id && contatos.length > 0 && <div className="adm-sugestoes">{contatos.map((c) => <button key={c.id} type="button" onClick={() => { setNovo({ ...novo, contato_id: c.id }); }}>{c.nome || fone(c.whatsapp)}</button>)}</div>}
      </div>
      {grupos.map(([nome, itens]) => itens.length > 0 && (
        <div key={nome} className="adm-bloco">
          <h2>{nome} ({itens.length})</h2>
          <ul className="adm-tarefas">{itens.map((t) => (
            <li key={t.id} className={nome === 'Atrasadas' ? 'atrasada' : ''}>
              <label className="adm-check"><input type="checkbox" onChange={() => concluir(t)} /> {t.titulo}{t.prioridade === 'alta' && <span className="adm-tag t-bloq">alta</span>}</label>
              <small>
                {(TIPOS_TAREFA.find((x) => x[0] === t.tipo) || ['', ''])[1]}{t.vence_em ? ` · ${dataHora(t.vence_em)}` : ''}
                {t.contatos && <> · <button className="adm-link" onClick={() => aoAbrirContato?.(t.contatos.id)}>{t.contatos.nome || fone(t.contatos.whatsapp)}</button></>}
                {t.leads && <> · <button className="adm-link" onClick={() => aoAbrirNegocio?.(t.leads.id)}>{t.leads.titulo || 'negócio'}</button></>}
                {' · '}<button className="adm-link" onClick={() => adiar(t, 1)}>+1 dia</button> <button className="adm-link" onClick={() => adiar(t, 7)}>+1 semana</button>
                {t.contatos?.whatsapp && t.tipo === 'whatsapp' && <> · <a className="adm-link" href={`https://wa.me/${t.contatos.whatsapp}`} target="_blank" rel="noopener">abrir WhatsApp</a></>}
              </small>
            </li>
          ))}</ul>
        </div>
      ))}
      {lista && !lista.length && <p className="adm-sub">Nenhuma tarefa aberta.</p>}
      {feitas.length > 0 && <div className="adm-bloco"><h2>Concluídas recentemente</h2><ul className="adm-hist">{feitas.map((t) => <li key={t.id}><b>{t.titulo}</b> <small>{dataHora(t.concluida_em)}{t.contatos?.nome ? ` · ${t.contatos.nome}` : ''}</small></li>)}</ul></div>}
    </section>
  );
}

/** Free text (or dictation from the keyboard mic) turned into CRM updates by the AI. Same brain as the Siri shortcut. */
function Registrar({ aoRegistrar }) {
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [resp, setResp] = useState('');
  const enviar = async (e) => {
    e.preventDefault(); if (texto.trim().length < 8) return;
    setOcupado(true); setResp('');
    try { const r = await chamarApp({ acao: 'registrar', texto }); setResp(r.resposta); setTexto(''); aoRegistrar?.(); }
    catch (x) { setResp('Não deu certo: ' + x.message); }
    setOcupado(false);
  };
  return (
    <div className="adm-bloco">
      <h2>Registrar atendimento</h2>
      <form className="adm-atividade-nova" onSubmit={enviar}>
        <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: Liguei para a Mariana Souza, ela quer ver a AC-0019 de novo no sábado de manhã com o marido. Crédito aprovado de 900 mil." />
        <button className="adm-btn adm-primario" disabled={ocupado}>{ocupado ? 'Registrando…' : 'Registrar com IA'}</button>
      </form>
      <p className="adm-sub">Dica: no iPhone, toque no microfone do teclado e fale. Também dá para colar a transcrição de uma conversa gravada.</p>
      {resp && <p className="adm-msg">{resp}</p>}
    </div>
  );
}

function Revisao({ aoResolver }) {
  const [lista, setLista] = useState([]);
  const [msg, setMsg] = useState('');
  const carregar = () => sb().from('registros_voz').select('*').eq('status', 'revisar').order('criado_em', { ascending: false }).limit(20).then(({ data }) => setLista(data || []));
  useEffect(() => { carregar(); }, []);
  const resolver = async (r, extra) => {
    setMsg('');
    try { const x = await chamarApp({ acao: 'revisao', id: r.id, ...extra }); if (x.resposta) setMsg(x.resposta); carregar(); aoResolver?.(); }
    catch (e) { setMsg(e.message); }
  };
  if (!lista.length) return msg ? <p className="adm-msg">{msg}</p> : null;
  return (
    <div className="adm-bloco adm-revisao">
      <h2>Para confirmar ({lista.length})</h2>
      {msg && <p className="adm-msg">{msg}</p>}
      {lista.map((r) => (
        <div key={r.id} className="adm-fila" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div><b>{r.interpretacao?.pessoa_nome || 'Pessoa não identificada'}</b> <small>{dataHora(r.criado_em)} · {r.origem}</small><p>{r.interpretacao?.resumo || r.texto.slice(0, 300)}</p></div>
          <div className="adm-sugestoes">
            {(r.candidatos || []).map((c) => <button key={c.id} onClick={() => resolver(r, { contato_id: c.id })}>É {c.nome || fone(c.whatsapp)}</button>)}
            <button onClick={() => resolver(r, { criar: true })}>Criar contato novo{r.interpretacao?.pessoa_nome ? `: ${r.interpretacao.pessoa_nome}` : ''}</button>
            <button onClick={() => resolver(r, { descartar: true })}>Descartar</button>
          </div>
        </div>
      ))}
    </div>
  );
}
