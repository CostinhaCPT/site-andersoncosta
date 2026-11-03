'use client';
import { useEffect, useState } from 'react';
import { sb } from '@/lib/admin/cliente';
import Imoveis from './Imoveis';
import Pipeline from './Pipeline';
import Agenda from './Agenda';
import Configuracoes from './Configuracoes';
import Lps from './Lps';
import Whatsapp from './Whatsapp';
import Contatos from './Contatos';
import TarefasPainel from './TarefasPainel';
import Estudio from './Estudio';

export default function Admin() {
  const [sessao, setSessao] = useState(undefined);
  const [permitido, setPermitido] = useState(null);
  const [aba, setAba] = useState('imoveis');
  const [recuperando, setRecuperando] = useState(false);
  const [abrirLead, setAbrirLead] = useState(null);
  const [pendentes, setPendentes] = useState(0);
  const [abrirContato, setAbrirContato] = useState(null);
  const [atrasadas, setAtrasadas] = useState(0);
  const [nonce, setNonce] = useState(0);
  const ir = (a) => { setAba(a); setNonce((n) => n + 1); };

  // App instalável: service worker e aba pedida pela notificação (?aba=tarefas)
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw-admin.js', { scope: '/admin/' }).catch(() => {});
    const q = new URLSearchParams(window.location.search).get('aba');
    if (q && ['imoveis', 'pipeline', 'contatos', 'tarefas', 'agenda', 'lps', 'estudio', 'whats', 'config'].includes(q)) setAba(q);
  }, []);
  useEffect(() => {
    const c = sb();
    c.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data: sub } = c.auth.onAuthStateChange((ev, s) => { setSessao(s); if (ev === 'PASSWORD_RECOVERY') setRecuperando(true); });
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!sessao) { setPermitido(null); return; }
    sb().rpc('eh_admin').then(({ data }) => setPermitido(data === true));
  }, [sessao]);
  useEffect(() => {
    if (!permitido) return;
    sb().from('visitas').select('id', { count: 'exact', head: true }).eq('status', 'solicitada')
      .gte('inicio', new Date(Date.now() - 864e5).toISOString()).then(({ count }) => setPendentes(count || 0));
    sb().from('tarefas').select('id', { count: 'exact', head: true }).is('concluida_em', null).lt('vence_em', new Date().toISOString())
      .then(({ count }) => setAtrasadas(count || 0));
  }, [permitido, aba]);

  if (sessao === undefined) return <div className="adm adm-centro">Carregando…</div>;
  if (!sessao) return <Login />;
  if (recuperando) return <NovaSenha aoConcluir={() => setRecuperando(false)} />;
  if (permitido === null) return <div className="adm adm-centro">Verificando acesso…</div>;
  if (!permitido) return (
    <div className="adm adm-centro"><p>Este e-mail não tem acesso ao admin.</p><button className="adm-btn" onClick={() => sb().auth.signOut()}>Sair</button></div>
  );
  return (
    <div className="adm">
      <header className="adm-topo">
        <img src="/marca/anderson-costa-horizontal-preto.svg" alt="Anderson Costa" height="22" />
        <nav>
          <button className={aba === 'imoveis' ? 'on' : ''} onClick={() => ir('imoveis')}>Imóveis</button>
          <button className={aba === 'pipeline' ? 'on' : ''} onClick={() => ir('pipeline')}>Pipeline</button>
          <button className={aba === 'contatos' ? 'on' : ''} onClick={() => ir('contatos')}>Contatos</button>
          <button className={aba === 'tarefas' ? 'on' : ''} onClick={() => ir('tarefas')}>Tarefas{atrasadas > 0 && <span className="adm-badge">{atrasadas}</span>}</button>
          <button className={aba === 'agenda' ? 'on' : ''} onClick={() => ir('agenda')}>Agenda{pendentes > 0 && <span className="adm-badge">{pendentes}</span>}</button>
          <button className={aba === 'lps' ? 'on' : ''} onClick={() => ir('lps')}>Páginas</button>
          <button className={aba === 'estudio' ? 'on' : ''} onClick={() => ir('estudio')}>Estúdio</button>
          <button className={aba === 'whats' ? 'on' : ''} onClick={() => ir('whats')}>WhatsApp</button>
          <button className={aba === 'config' ? 'on' : ''} onClick={() => ir('config')}>Ajustes</button>
        </nav>
        <button className="adm-link" onClick={() => sb().auth.signOut()}>Sair</button>
      </header>
      {aba === 'imoveis' && <Imoveis key={nonce} />}
      {aba === 'pipeline' && <Pipeline key={nonce} abrirId={abrirLead} aoAbrir={setAbrirLead} aoAbrirContato={(id) => { setAbrirContato(id); setAba('contatos'); }} />}
      {aba === 'contatos' && <Contatos key={nonce} abrirId={abrirContato} aoAbrirNegocio={(id) => { setAbrirLead(id); setAbrirContato(null); setAba('pipeline'); }} />}
      {aba === 'tarefas' && <TarefasPainel key={nonce} aoAbrirContato={(id) => { setAbrirContato(id); setAba('contatos'); }} aoAbrirNegocio={(id) => { setAbrirLead(id); setAba('pipeline'); }} />}
      {aba === 'agenda' && <Agenda key={nonce} aoAbrirLead={(id) => { setAbrirLead(id); setAba('pipeline'); }} />}
      {aba === 'lps' && <Lps key={nonce} />}
      {aba === 'estudio' && <Estudio key={nonce} />}
      {aba === 'whats' && <Whatsapp key={nonce} />}
      {aba === 'config' && <Configuracoes key={nonce} />}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const entrar = async (e) => {
    e.preventDefault(); setOcupado(true); setMsg('');
    const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) setMsg('E-mail ou senha incorretos.');
    setOcupado(false);
  };
  const esqueci = async () => {
    if (!email.trim()) { setMsg('Digite seu e-mail e toque em "Esqueci a senha" de novo.'); return; }
    await sb().auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/admin/' });
    setMsg('Se o e-mail tiver acesso, chega um link para criar uma nova senha.');
  };
  return (
    <div className="adm adm-centro">
      <form className="adm-login" onSubmit={entrar}>
        <img src="/marca/anderson-costa-horizontal-preto.svg" alt="Anderson Costa" height="26" />
        <h1>Admin do site</h1>
        <label>E-mail<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Senha<input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></label>
        <button className="adm-btn adm-primario" disabled={ocupado}>{ocupado ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" className="adm-link" onClick={esqueci}>Esqueci a senha</button>
        {msg && <p className="adm-msg">{msg}</p>}
      </form>
    </div>
  );
}

function NovaSenha({ aoConcluir }) {
  const [s, setS] = useState('');
  const [msg, setMsg] = useState('');
  const salvar = async (e) => {
    e.preventDefault();
    const { error } = await sb().auth.updateUser({ password: s });
    if (error) setMsg('Não deu certo: ' + error.message); else aoConcluir();
  };
  return (
    <div className="adm adm-centro">
      <form className="adm-login" onSubmit={salvar}>
        <h1>Nova senha</h1>
        <label>Senha nova (mínimo 8 caracteres)<input type="password" autoComplete="new-password" minLength={8} value={s} onChange={(e) => setS(e.target.value)} required /></label>
        <button className="adm-btn adm-primario">Salvar senha</button>
        {msg && <p className="adm-msg">{msg}</p>}
      </form>
    </div>
  );
}
