'use client';
import { useEffect, useState } from 'react';
import { sb } from '@/lib/admin/cliente';
import { SITE } from '@/lib/site';
import AppAjustes from './AppAjustes';

const DIAS = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [0, 'Dom']];

export default function Configuracoes() {
  const [chat, setChat] = useState(null);
  const [agenda, setAgenda] = useState(null);
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [previa, setPrevia] = useState(null);

  useEffect(() => {
    sb().from('config').select('chave, valor').in('chave', ['chat', 'agenda']).then(({ data, error }) => {
      if (error) { setMsg(error.message); return; }
      const m = Object.fromEntries((data || []).map((r) => [r.chave, r.valor]));
      setChat({ ativo: true, pedir_contato: true, saudacao: '', instrucoes_extras: '', ...(m.chat || {}) });
      setAgenda({ dias: [1, 2, 3, 4, 5, 6], inicio: '08:00', fim: '18:00', inicio_sabado: '08:00', fim_sabado: '12:00', duracao_min: 60, intervalo_min: 30, antecedencia_horas: 12, janela_dias: 14, ical_url: '', email_avisos: '', ...(m.agenda || {}) });
    });
  }, []);

  const verHorarios = async () => {
    setPrevia('carregando');
    try {
      const r = await fetch(SITE.chatApi, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'horarios' }) });
      setPrevia((await r.json()).dias || []);
    } catch (e) { setPrevia([]); }
  };

  const salvar = async () => {
    setSalvando(true); setMsg('');
    const ical = String(agenda.ical_url || '').trim();
    if (ical && !/^(https|webcal):\/\/calendar\.google\.com\/calendar\/ical\/.+\.ics$/i.test(ical) && !/^https:\/\/.+\.ics(\?.*)?$/i.test(ical)) {
      setSalvando(false); setMsg('O endereço da agenda precisa terminar em .ics (use o "Endereço secreto no formato iCal").'); return;
    }
    const { error } = await sb().from('config').upsert([
      { chave: 'chat', valor: { ...chat, saudacao: String(chat.saudacao || '').trim(), instrucoes_extras: String(chat.instrucoes_extras || '').trim() } },
      { chave: 'agenda', valor: { ...agenda, ical_url: ical, duracao_min: Number(agenda.duracao_min) || 60, intervalo_min: Number(agenda.intervalo_min) || 0, antecedencia_horas: Number(agenda.antecedencia_horas) || 0, janela_dias: Number(agenda.janela_dias) || 14 } },
    ]);
    setSalvando(false);
    setMsg(error ? 'Não salvou: ' + error.message : 'Salvo. O chat passa a usar em até 1 minuto.');
  };

  if (!chat || !agenda) return <section className="adm-pagina"><p className="adm-sub">{msg || 'Carregando…'}</p></section>;
  const c = (k) => (e) => setChat({ ...chat, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const a = (k) => (e) => setAgenda({ ...agenda, [k]: e.target.value });
  const dia = (d) => setAgenda({ ...agenda, dias: agenda.dias.includes(d) ? agenda.dias.filter((x) => x !== d) : [...agenda.dias, d] });

  return (
    <section className="adm-pagina adm-editor">
      <h1>Ajustes</h1>
      <AppAjustes />

      <div className="adm-bloco">
        <h2>Assistente do site</h2>
        <div className="adm-checks">
          <label className="adm-check"><input type="checkbox" checked={!!chat.ativo} onChange={c('ativo')} /> Chat ligado no site</label>
          <label className="adm-check"><input type="checkbox" checked={!!chat.pedir_contato} onChange={c('pedir_contato')} /> Pedir nome e WhatsApp antes de começar</label>
        </div>
        <label className="adm-campo"><span>Mensagem de abertura (vazio = padrão)</span>
          <input maxLength={240} placeholder="Oi! Sou a assistente virtual do Anderson Costa. Me conta o que você está procurando que eu te ajudo a encontrar." value={chat.saudacao} onChange={c('saudacao')} />
        </label>
        <label className="adm-campo"><span>Orientações extras para a assistente</span>
          <textarea rows={5} maxLength={3000} placeholder={'Uma por linha. Exemplos:\nNesta semana estou em plantão no sábado à tarde.\nSe perguntarem sobre lançamentos em Guaramirim, diga que tenho novidades e ofereça a curadoria.'} value={chat.instrucoes_extras} onChange={c('instrucoes_extras')} />
        </label>
        <p className="adm-sub">A assistente segue as orientações, mas continua sem inventar dados, sem negociar e sempre dizendo que é virtual.</p>
      </div>

      <div className="adm-bloco">
        <h2>Horário de visitas</h2>
        <div className="adm-dias">
          {DIAS.map(([d, n]) => <button key={d} type="button" className={agenda.dias.includes(d) ? 'on' : ''} onClick={() => dia(d)}>{n}</button>)}
        </div>
        <div className="adm-grade">
          <label className="adm-campo"><span>Seg a sex: início</span><input type="time" value={agenda.inicio} onChange={a('inicio')} /></label>
          <label className="adm-campo"><span>Seg a sex: fim</span><input type="time" value={agenda.fim} onChange={a('fim')} /></label>
          <label className="adm-campo"><span>Sábado: início</span><input type="time" value={agenda.inicio_sabado} onChange={a('inicio_sabado')} /></label>
          <label className="adm-campo"><span>Sábado: fim</span><input type="time" value={agenda.fim_sabado} onChange={a('fim_sabado')} /></label>
          <label className="adm-campo"><span>Duração da visita (min)</span><input type="number" min={15} step={15} value={agenda.duracao_min} onChange={a('duracao_min')} /></label>
          <label className="adm-campo"><span>Folga entre visitas (min)</span><input type="number" min={0} step={15} value={agenda.intervalo_min} onChange={a('intervalo_min')} /></label>
          <label className="adm-campo"><span>Antecedência mínima (horas)</span><input type="number" min={1} value={agenda.antecedencia_horas} onChange={a('antecedencia_horas')} /></label>
          <label className="adm-campo"><span>Mostrar quantos dias à frente</span><input type="number" min={3} max={60} value={agenda.janela_dias} onChange={a('janela_dias')} /></label>
        </div>
        <p className="adm-sub">Feriados nacionais e o aniversário de Jaraguá do Sul (25/07) ficam fora automaticamente.</p>
      </div>

      <div className="adm-bloco">
        <h2>Google Agenda</h2>
        <p className="adm-sub">Com a sua agenda ligada, o chat não oferece horários em que você já tem compromisso.</p>
        <ol className="adm-passos">
          <li>No computador, abra <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noopener">as configurações da Google Agenda</a>.</li>
          <li>Na coluna da esquerda, em “Configurações das minhas agendas”, clique na sua agenda.</li>
          <li>Desça até “Integrar agenda” e copie o <b>Endereço secreto no formato iCal</b>.</li>
          <li>Cole abaixo e salve. Não compartilhe esse endereço com ninguém.</li>
        </ol>
        <label className="adm-campo"><span>Endereço secreto iCal</span>
          <input type="url" placeholder="https://calendar.google.com/calendar/ical/.../private-.../basic.ics" value={agenda.ical_url} onChange={a('ical_url')} />
        </label>
        <label className="adm-campo"><span>E-mail que recebe os avisos e convites de visita</span>
          <input type="email" value={agenda.email_avisos} onChange={a('email_avisos')} />
        </label>
        <p className="adm-sub">Cada visita confirmada chega nesse e-mail com um convite. Abrindo no Gmail, ela entra na sua Google Agenda com um toque.</p>
        <div className="adm-acoes" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="adm-btn" onClick={verHorarios}>Ver os horários que o chat vai oferecer</button>
        </div>
        {previa === 'carregando' && <p className="adm-sub">Carregando…</p>}
        {Array.isArray(previa) && (
          <div className="adm-previa">
            {!previa.length && <p className="adm-sub">Nenhum horário livre na janela configurada.</p>}
            {previa.slice(0, 6).map((d) => <p key={d.data}><b>{d.rotulo}</b> {d.horarios.map((h) => h.hora).join(' · ')}</p>)}
            <p className="adm-sub">Se acabou de salvar, a prévia pode levar até 1 minuto para refletir a mudança.</p>
          </div>
        )}
      </div>

      <div className="adm-barra">
        <div className="adm-acoes">
          {msg && <span className="adm-msg">{msg}</span>}
          <button className="adm-btn adm-primario" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </section>
  );
}
