'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sb } from '@/lib/admin/cliente';
import { chamarAdmin, dataHora, fone } from '@/lib/admin/ia';

const FAIXA = { manha: 'Manhã 10h-11h', tarde: 'Tarde 17h-18h', noite: 'Noite' };
const STATUS_FILA = {
  pendente: 'Agendado', enviado: 'Enviado', ensaio: 'Ensaio (não enviado)', manual: 'Enviado à mão',
  cancelado: 'Cancelado', bloqueado: 'Barrado pela trava', falhou: 'Falhou',
};
const MOTIVO = {
  respondeu: 'a pessoa respondeu', humano_escreveu: 'você escreveu', nao_contatar: 'marcado não contatar', supressao: 'na lista de bloqueio',
  visita_marcada: 'tem visita marcada', humano_ativo: 'você falou com ela nos últimos 7 dias', com_anderson: 'conversa está com você',
  teto_do_lead: 'chegou no limite de toques', intervalo_minimo: 'intervalo mínimo', pausado: 'follow-up pausado', sem_whatsapp: 'sem WhatsApp',
  sem_template: 'falta o modelo aprovado', sem_conversa: 'nunca conversou com o robô',
};
const motivoTxt = (m) => (m ? (MOTIVO[m] || (m.startsWith('etapa:') ? `etapa ${m.slice(6).replace('_', ' ')}` : m)) : '');
const inicioMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString(); };
const inicioDia = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

export default function Whatsapp() {
  const [sub, setSub] = useState('conversas');
  const [api, setApi] = useState(null);
  const [uso, setUso] = useState(null);
  useEffect(() => {
    chamarAdmin({ acao: 'wa_status' }).then((r) => setApi(!!r.configurado)).catch(() => setApi(false));
    sb().from('automacao_log').select('id', { count: 'exact', head: true }).eq('evento', 'wa_saida').gte('criado_em', inicioMes())
      .then(({ count }) => setUso(count ?? 0));
  }, []);
  return (
    <section className="adm-pagina">
      <div className="adm-cabeca">
        <div>
          <h1>WhatsApp</h1>
          <p className="adm-sub">
            {api === null ? 'Verificando conexão…' : api ? 'Número oficial conectado.' : 'Número oficial ainda não conectado. Tudo funciona em ensaio e os envios ficam para você mandar à mão.'}
            {uso != null && ` · ${uso} mensagens enviadas este mês`}
          </p>
        </div>
      </div>
      <div className="adm-subabas">
        {[['conversas', 'Conversas'], ['followup', 'Follow-up'], ['travas', 'Travas']].map(([k, n]) => (
          <button key={k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>{n}</button>
        ))}
      </div>
      {sub === 'conversas' && <Conversas api={api} />}
      {sub === 'followup' && <Followup api={api} />}
      {sub === 'travas' && <Travas />}
    </section>
  );
}

// ---------------------------------------------------------------- conversas
function Conversas({ api }) {
  const [lista, setLista] = useState(null);
  const [aberta, setAberta] = useState(null);
  const carregar = useCallback(() => {
    sb().from('conversas').select('id,status,atualizado_em,lead_id,contexto,leads(nome,whatsapp,nao_contatar,etapa,termometro_faixa)')
      .eq('canal', 'whatsapp').order('atualizado_em', { ascending: false }).limit(100)
      .then(({ data }) => setLista(data || []));
  }, []);
  useEffect(() => { carregar(); const t = setInterval(carregar, 20000); return () => clearInterval(t); }, [carregar]);
  if (aberta) return <Conversa c={aberta} api={api} aoVoltar={() => { setAberta(null); carregar(); }} />;
  if (!lista) return <p className="adm-sub">Carregando…</p>;
  if (!lista.length) return <p className="adm-sub">Nenhuma conversa no WhatsApp ainda. Quando o número oficial estiver ligado, elas aparecem aqui.</p>;
  return (
    <ul className="adm-lista adm-wa-lista">
      {lista.map((c) => (
        <li key={c.id}>
          <button className="adm-info" onClick={() => setAberta(c)}>
            <b>{c.leads?.nome || fone(c.leads?.whatsapp) || 'Sem nome'}
              {c.status === 'anderson' && <span className="adm-tag t-voce">com você</span>}
              {c.leads?.nao_contatar && <span className="adm-tag t-bloq">não contatar</span>}
              {c.leads?.termometro_faixa && <span className={`adm-termo t-${c.leads.termometro_faixa}`}>{c.leads.termometro_faixa}</span>}
            </b>
            <small>{dataHora(c.atualizado_em)} · {fone(c.leads?.whatsapp)}{c.contexto?.referral ? ' · veio de anúncio' : ''}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Conversa({ c, api, aoVoltar }) {
  const [msgs, setMsgs] = useState([]);
  const [status, setStatus] = useState(c.status);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const fim = useRef(null);
  const carregar = useCallback(() => {
    sb().from('mensagens').select('id,papel,conteudo,criado_em,meta').eq('conversa_id', c.id).in('papel', ['usuario', 'assistente', 'anderson'])
      .order('criado_em').limit(300).then(({ data }) => setMsgs(data || []));
  }, [c.id]);
  useEffect(() => { carregar(); const t = setInterval(carregar, 10000); return () => clearInterval(t); }, [carregar]);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  const ultUsuario = [...msgs].reverse().find((m) => m.papel === 'usuario');
  const restaH = ultUsuario ? 24 - (Date.now() - new Date(ultUsuario.criado_em)) / 36e5 : -1;
  const mudar = async (s) => {
    const { error } = await sb().from('conversas').update({ status: s, atualizado_em: new Date().toISOString() }).eq('id', c.id);
    if (error) setErro(error.message); else setStatus(s);
  };
  const enviar = async (e) => {
    e.preventDefault(); if (!texto.trim()) return;
    setEnviando(true); setErro('');
    try { await chamarAdmin({ acao: 'wa_enviar', conversa_id: c.id, texto }); setTexto(''); setStatus('anderson'); carregar(); }
    catch (x) { setErro(x.message); }
    setEnviando(false);
  };
  const nome = c.leads?.nome || fone(c.leads?.whatsapp);
  return (
    <div className="adm-wa">
      <button className="adm-link" onClick={aoVoltar}>← Conversas</button>
      <div className="adm-wa-topo">
        <div><b>{nome}</b><small>{fone(c.leads?.whatsapp)} · {status === 'anderson' ? 'Robô pausado, conversa com você' : 'Robô respondendo'}</small></div>
        <div className="adm-wa-acoes">
          {status === 'anderson'
            ? <button className="adm-btn" onClick={() => mudar('bot')}>Devolver ao robô</button>
            : <button className="adm-btn adm-primario" onClick={() => mudar('anderson')}>Assumir conversa</button>}
          {c.leads?.whatsapp && <a className="adm-btn adm-whats" href={`https://wa.me/${c.leads.whatsapp}`} target="_blank" rel="noopener">Meu WhatsApp</a>}
        </div>
      </div>
      <div className="adm-wa-msgs">
        {msgs.map((m) => (
          <div key={m.id} className={`adm-wa-msg p-${m.papel}`}>
            <span>{m.conteudo}</span>
            <small>{m.papel === 'assistente' ? (m.meta?.followup ? 'Follow-up · ' : 'Robô · ') : m.papel === 'anderson' ? 'Você · ' : ''}{dataHora(m.criado_em)}</small>
          </div>
        ))}
        <div ref={fim} />
      </div>
      {erro && <p className="adm-erro">{erro}</p>}
      {api && restaH > 0 ? (
        <form className="adm-wa-resp" onSubmit={enviar}>
          <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Responder pelo número oficial (o robô pausa ao enviar)" />
          <button className="adm-btn adm-primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar'}</button>
          <small className="adm-sub">Janela aberta por mais {Math.floor(restaH)}h{Math.round((restaH % 1) * 60)}min. Depois só com modelo aprovado.</small>
        </form>
      ) : (
        <p className="adm-sub">{!api ? 'Responder por aqui fica disponível quando o número oficial estiver conectado.' : 'A janela de 24h fechou. Chame pelo seu WhatsApp ou espere a pessoa responder.'}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- follow-up
function Followup({ api }) {
  const [cfg, setCfg] = useState(null);
  const [wa, setWa] = useState(null);
  const [fila, setFila] = useState([]);
  const [hist, setHist] = useState([]);
  const [taxas, setTaxas] = useState([]);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(async () => {
    const c = sb();
    const { data: conf } = await c.from('config').select('chave,valor').in('chave', ['automacao', 'whatsapp']);
    const m = Object.fromEntries((conf || []).map((r) => [r.chave, r.valor]));
    setCfg(m.automacao || {}); setWa(m.whatsapp || {});
    const { data: f } = await c.from('followup_fila').select('*,leads(nome,whatsapp)').or(`status.eq.pendente,and(status.eq.ensaio,executado_em.gte."${inicioDia()}")`).order('agendado_para').limit(100);
    setFila(f || []);
    const { data: h } = await c.from('followup_fila').select('*,leads(nome)').neq('status', 'pendente').order('executado_em', { ascending: false }).limit(40);
    setHist(h || []);
    const { data: t } = await c.from('followup_fila').select('faixa,passo,respondeu_em').in('status', ['enviado', 'manual']).gte('executado_em', new Date(Date.now() - 90 * 864e5).toISOString()).limit(3000);
    setTaxas(['manha', 'tarde', 'noite'].map((fx) => { const l = (t || []).filter((x) => x.faixa === fx); return { fx, n: l.length, r: l.filter((x) => x.respondeu_em).length }; }));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  if (!cfg) return <p className="adm-sub">Carregando…</p>;

  const setC = (k, v) => setCfg({ ...cfg, [k]: v });
  const num = (k) => (e) => setC(k, Math.max(0, Number(e.target.value) || 0));
  const salvar = async () => {
    setMsg('');
    const valor = { ...cfg };
    if (valor.ativo && !valor.ativado_em) valor.ativado_em = new Date().toISOString();
    if (valor.ativo) { delete valor.desligado_por; delete valor.desligado_em; }
    if (valor.modo === 'real' && !api) { setMsg('O modo real só funciona com o número oficial conectado.'); return; }
    valor.numeros_teste = String(valor.numeros_teste_txt ?? (valor.numeros_teste || []).join(', ')).split(/[,\s]+/).map((x) => x.replace(/\D/g, '')).filter(Boolean).map((d) => (d.length <= 11 ? '55' + d : d));
    delete valor.numeros_teste_txt;
    const { error } = await sb().from('config').upsert([{ chave: 'automacao', valor, atualizado_em: new Date().toISOString() }, { chave: 'whatsapp', valor: wa, atualizado_em: new Date().toISOString() }]);
    if (error) setMsg('Não salvou: ' + error.message); else { setCfg(valor); setMsg('Salvo.'); }
  };
  const manual = async (item) => {
    window.open(`https://wa.me/${item.leads?.whatsapp}?text=${encodeURIComponent(item.texto || '')}`, '_blank', 'noopener');
    await sb().from('followup_fila').update({ status: 'manual', executado_em: new Date().toISOString() }).eq('id', item.id);
    carregar();
  };
  const cancelar = async (item) => {
    await sb().from('followup_fila').update({ status: 'cancelado', motivo: 'cancelado por você', executado_em: new Date().toISOString() }).eq('id', item.id);
    carregar();
  };
  const pendentes = fila.filter((x) => x.status === 'pendente');
  const maoHoje = fila.filter((x) => x.status === 'ensaio');

  return (
    <div className="adm-wa-follow">
      {cfg.desligado_por && <p className="adm-erro">O disjuntor desligou os follow-ups em {dataHora(cfg.desligado_em)}: {cfg.desligado_por}. Confira antes de religar.</p>}

      <div className="adm-bloco">
        <h2>Robô no WhatsApp</h2>
        <label className="adm-check"><input type="checkbox" checked={!!wa.ativo} onChange={(e) => setWa({ ...wa, ativo: e.target.checked })} /> Robô responde no número oficial</label>
        <label className="adm-check"><input type="checkbox" checked={wa.modo_teste !== false} onChange={(e) => setWa({ ...wa, modo_teste: e.target.checked })} /> Modo teste: responde só aos números de teste abaixo</label>
      </div>

      <div className="adm-bloco">
        <h2>Follow-up de quem parou de responder</h2>
        <label className="adm-check"><input type="checkbox" checked={!!cfg.ativo} onChange={(e) => setC('ativo', e.target.checked)} /> Ligado</label>
        {cfg.ativado_em
          ? <p className="adm-sub">Só entram pessoas que conversaram com o robô depois de {dataHora(cfg.ativado_em)}. A base antiga nunca recebe.</p>
          : <p className="adm-sub">Ao ligar, só entram pessoas que conversarem com o robô a partir de agora. A base antiga nunca recebe.</p>}
        <label className="adm-campo"><span>Modo</span>
          <select value={cfg.modo || 'ensaio'} onChange={(e) => setC('modo', e.target.value)}>
            <option value="ensaio">Ensaio: mostra o que mandaria, não envia nada</option>
            <option value="teste">Teste: envia só para os números de teste</option>
            <option value="real" disabled={!api}>Real: envia para os leads{!api ? ' (precisa do número oficial)' : ''}</option>
          </select>
        </label>
        <div className="adm-grade2">
          <label className="adm-campo"><span>Máximo de toques por lead</span><input type="number" min="1" max="6" value={cfg.max_toques ?? 4} onChange={num('max_toques')} /></label>
          <label className="adm-campo"><span>Em quantos dias</span><input type="number" min="3" max="30" value={cfg.janela_dias ?? 10} onChange={num('janela_dias')} /></label>
          <label className="adm-campo"><span>Primeiro toque depois de (horas)</span><input type="number" min="2" max="72" value={cfg.primeiro_apos_h ?? 18} onChange={num('primeiro_apos_h')} /></label>
          <label className="adm-campo"><span>Intervalo mínimo entre toques (horas)</span><input type="number" min="24" max="168" value={cfg.intervalo_h ?? 48} onChange={num('intervalo_h')} /></label>
          <label className="adm-campo"><span>Teto de envios por dia (todos os leads)</span><input type="number" min="1" max="200" value={cfg.teto_dia ?? 30} onChange={num('teto_dia')} /></label>
          <label className="adm-campo"><span>Desligar sozinho se mais de X pedirem para parar no dia</span><input type="number" min="1" max="20" value={cfg.max_optout_dia ?? 3} onChange={num('max_optout_dia')} /></label>
        </div>
        <label className="adm-campo"><span>Números de teste (separados por vírgula)</span>
          <input value={cfg.numeros_teste_txt ?? (cfg.numeros_teste || []).map(fone).join(', ')} onChange={(e) => { setC('numeros_teste_txt', e.target.value); setWa({ ...wa, numeros_teste: e.target.value.split(/[,]+/).map((x) => x.replace(/\D/g, '')).filter(Boolean).map((d) => (d.length <= 11 ? '55' + d : d)) }); }} />
        </label>
        <details>
          <summary>Modelos aprovados na Meta (um por toque)</summary>
          <div className="adm-grade2">
            {['1', '2', '3', '4'].map((k) => (
              <label key={k} className="adm-campo"><span>Toque {k}</span><input value={cfg.templates?.[k] || ''} onChange={(e) => setC('templates', { ...(cfg.templates || {}), [k]: e.target.value.trim() })} /></label>
            ))}
          </div>
          <p className="adm-sub">Dentro de 24h da última mensagem da pessoa no WhatsApp vai texto livre (grátis). Fora disso vai o modelo aprovado.</p>
        </details>
        <p className="adm-sub">Horários em rodízio: manhã 10h-11h, tarde 17h-18h e noite (22h-23h só para quem conversou à noite, senão 20h-21h). Nunca domingo ou feriado.</p>
        <button className="adm-btn adm-primario" onClick={salvar}>Salvar</button>
        {msg && <p className="adm-msg">{msg}</p>}
      </div>

      {maoHoje.length > 0 && (
        <div className="adm-bloco">
          <h2>Para mandar à mão hoje ({maoHoje.length})</h2>
          <p className="adm-sub">Em ensaio nada sai sozinho. Se quiser, toque e envie pelo seu WhatsApp com a mensagem pronta.</p>
          <ul className="adm-lista">{maoHoje.map((x) => (
            <li key={x.id} className="adm-fila"><div><b>{x.leads?.nome || fone(x.leads?.whatsapp)}</b> <small>toque {x.passo} · {FAIXA[x.faixa]}</small><p>{x.texto}</p></div>
              <button className="adm-btn adm-whats" onClick={() => manual(x)}>Enviar</button></li>
          ))}</ul>
        </div>
      )}

      <div className="adm-bloco">
        <h2>Próximos toques ({pendentes.length})</h2>
        {!pendentes.length ? <p className="adm-sub">Nada agendado.</p> : (
          <ul className="adm-lista">{pendentes.map((x) => (
            <li key={x.id} className="adm-fila"><div><b>{x.leads?.nome || fone(x.leads?.whatsapp)}</b> <small>{dataHora(x.agendado_para)} · toque {x.passo} · {FAIXA[x.faixa]} · {x.forma === 'texto' ? 'texto livre' : 'modelo'}</small><p>{x.texto}</p></div>
              <button className="adm-btn" onClick={() => cancelar(x)}>Cancelar</button></li>
          ))}</ul>
        )}
      </div>

      <div className="adm-bloco">
        <h2>Resposta por horário (90 dias)</h2>
        <div className="adm-taxas">{taxas.map((t) => (
          <div key={t.fx}><b>{t.n ? Math.round((t.r / t.n) * 100) + '%' : '–'}</b><small>{FAIXA[t.fx]} · {t.r} de {t.n}</small></div>
        ))}</div>
        <p className="adm-sub">Depois de testar as três faixas com um lead, o 4º toque vai na faixa que mais responde (a partir de 10 envios por faixa).</p>
      </div>

      <div className="adm-bloco">
        <h2>Histórico</h2>
        {!hist.length ? <p className="adm-sub">Nada ainda.</p> : (
          <ul className="adm-lista adm-hist">{hist.map((x) => (
            <li key={x.id}><b>{x.leads?.nome || 'Lead'}</b> <small>{x.executado_em ? dataHora(x.executado_em) : ''} · toque {x.passo} · {STATUS_FILA[x.status]}{x.motivo ? ` (${motivoTxt(x.motivo)})` : ''}{x.respondeu_em ? ' · respondeu' : ''}</small></li>
          ))}</ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- travas
function Travas() {
  const [lista, setLista] = useState(null);
  const [novo, setNovo] = useState('');
  const [log, setLog] = useState([]);
  const carregar = useCallback(() => {
    sb().from('supressao').select('*').order('criado_em', { ascending: false }).limit(500).then(({ data }) => setLista(data || []));
    sb().from('automacao_log').select('*').in('evento', ['optout', 'cancelado', 'bloqueado', 'disjuntor', 'falhou', 'wa_falha']).order('criado_em', { ascending: false }).limit(40)
      .then(({ data }) => setLog(data || []));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const adicionar = async (e) => {
    e.preventDefault();
    const d = novo.replace(/\D/g, ''); if (d.length < 10) return;
    await sb().from('supressao').upsert({ fone: d.length <= 11 ? '55' + d : d, motivo: 'bloqueado por você', origem: 'admin' });
    setNovo(''); carregar();
  };
  const remover = async (f) => {
    if (!confirm(`Tirar ${fone(f)} da lista de bloqueio? A automação volta a poder falar com esse número.`)) return;
    await sb().from('supressao').delete().eq('fone', f); carregar();
  };
  return (
    <div>
      <div className="adm-bloco">
        <h2>Como as travas funcionam</h2>
        <ul className="adm-travas-lista">
          <li>Só entra quem conversou com o robô depois que você ligou o follow-up. A base antiga e os contatos do seu WhatsApp pessoal nunca recebem.</li>
          <li>Antes de cada envio o sistema confere de novo: etapa (visita, proposta, venda ou perdido param tudo), não contatar, lista de bloqueio, visita marcada, conversa com você, resposta da pessoa e limites.</li>
          <li>Se a pessoa responder, ou você escrever para ela, tudo que estava agendado é cancelado na hora.</li>
          <li>Pedidos como "parar", "não me mande mais" ou "não tenho mais interesse" bloqueiam o número para sempre.</li>
          <li>Disjuntor: se mais pessoas que o limite pedirem para parar no mesmo dia, ou muitos envios falharem, tudo desliga e você recebe e-mail.</li>
        </ul>
      </div>
      <div className="adm-bloco">
        <h2>Lista de bloqueio ({lista?.length ?? 0})</h2>
        <form className="adm-linha" onSubmit={adicionar}>
          <input type="tel" placeholder="(47) 99999-9999" value={novo} onChange={(e) => setNovo(e.target.value)} />
          <button className="adm-btn">Bloquear número</button>
        </form>
        <ul className="adm-lista adm-hist">{(lista || []).map((s) => (
          <li key={s.fone}><b>{fone(s.fone)}</b> <small>{s.motivo} · {dataHora(s.criado_em)}</small> <button className="adm-link" onClick={() => remover(s.fone)}>tirar</button></li>
        ))}</ul>
      </div>
      <div className="adm-bloco">
        <h2>O que as travas barraram</h2>
        {!log.length ? <p className="adm-sub">Nada ainda.</p> : (
          <ul className="adm-lista adm-hist">{log.map((l) => (
            <li key={l.id}><b>{l.evento === 'optout' ? 'Pediu para parar' : l.evento === 'disjuntor' ? 'Disjuntor' : l.evento === 'cancelado' ? 'Fila cancelada' : l.evento === 'bloqueado' ? 'Envio barrado' : 'Falha'}</b> <small>{dataHora(l.criado_em)}{l.detalhe?.motivo ? ` · ${motivoTxt(l.detalhe.motivo)}` : ''}{l.detalhe?.erro ? ` · ${l.detalhe.erro}` : ''}</small></li>
          ))}</ul>
        )}
      </div>
    </div>
  );
}
