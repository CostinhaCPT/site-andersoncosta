'use client';
import { useEffect, useState } from 'react';
import { sb } from '@/lib/admin/cliente';
import { chamarApp, dataHora, URL_APP } from '@/lib/admin/ia';

const paraUint8 = (b64) => { const p = '='.repeat((4 - (b64.length % 4)) % 4); const s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
const nomeAparelho = () => { const u = navigator.userAgent; return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Macintosh/.test(u) ? 'Mac' : /Android/.test(u) ? 'Android' : 'Navegador'; };

export default function AppAjustes() {
  const [instalado, setInstalado] = useState(false);
  const [estado, setEstado] = useState('');
  const [msg, setMsg] = useState('');
  const [aparelhos, setAparelhos] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [novoToken, setNovoToken] = useState('');
  const [copiado, setCopiado] = useState('');
  const carregar = () => {
    sb().from('push_inscricoes').select('id,dispositivo,criado_em,ultimo_ok').order('criado_em').then(({ data }) => setAparelhos(data || []));
    sb().from('tokens_pessoais').select('id,nome,criado_em,ultimo_uso,revogado').order('criado_em').then(({ data }) => setTokens(data || []));
  };
  useEffect(() => {
    setInstalado(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
    setEstado(typeof Notification === 'undefined' ? 'sem_suporte' : Notification.permission);
    carregar();
  }, []);

  const ativar = async () => {
    setMsg('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setMsg('Este navegador não aceita notificações. No iPhone, instale o app na Tela de Início primeiro.'); return; }
      const perm = await Notification.requestPermission(); setEstado(perm);
      if (perm !== 'granted') { setMsg('Permissão negada. Libere em Ajustes do aparelho, Notificações.'); return; }
      const reg = await navigator.serviceWorker.register('/sw-admin.js', { scope: '/admin/' });
      await navigator.serviceWorker.ready;
      const { chave } = await chamarApp({ acao: 'vapid' });
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: paraUint8(chave) });
      await chamarApp({ acao: 'inscrever', inscricao: sub.toJSON(), dispositivo: nomeAparelho() });
      await chamarApp({ acao: 'testar' });
      setMsg('Pronto. Uma notificação de teste deve chegar em instantes.'); carregar();
    } catch (e) { setMsg('Não deu certo: ' + e.message); }
  };
  const remover = async (id) => { await sb().from('push_inscricoes').delete().eq('id', id); carregar(); };
  const gerar = async () => {
    try { const { token } = await chamarApp({ acao: 'token_novo', nome: `Atalho ${new Date().toLocaleDateString('pt-BR')}` }); setNovoToken(token); carregar(); }
    catch (e) { setMsg(e.message); }
  };
  const revogar = async (id) => {
    if (!confirm('Revogar este token? O atalho que usa ele para de funcionar.')) return;
    await sb().from('tokens_pessoais').update({ revogado: true }).eq('id', id); carregar();
  };
  const copiar = async (t, k) => { try { await navigator.clipboard.writeText(t); setCopiado(k); setTimeout(() => setCopiado(''), 2000); } catch { /* sem área de transferência */ } };

  return (
    <>
      <div className="adm-bloco">
        <h2>App no iPhone e no Mac</h2>
        {instalado ? <p className="adm-msg">Você está usando o app instalado.</p> : (
          <ul className="adm-travas-lista">
            <li><b>iPhone:</b> abra andersoncostaimoveis.com.br/admin no Safari, toque em Compartilhar e em "Adicionar à Tela de Início".</li>
            <li><b>Mac:</b> abra o admin no Safari, menu Arquivo, "Adicionar ao Dock".</li>
          </ul>
        )}
        <p className="adm-sub">O app se atualiza sozinho sempre que o site é publicado.</p>
      </div>

      <div className="adm-bloco">
        <h2>Notificações</h2>
        <p className="adm-sub">Lead quente, lead passado pelo robô, mensagem no WhatsApp com você, pedido de visita, tarefa vencendo e visitas de amanhã (às 19h).</p>
        {estado === 'sem_suporte' ? <p className="adm-sub">Neste navegador não dá. No iPhone, abra pelo app instalado na Tela de Início.</p>
          : <div><button className="adm-btn adm-primario" onClick={ativar}>{estado === 'granted' ? 'Ativar neste aparelho de novo' : 'Ativar notificações neste aparelho'}</button></div>}
        {aparelhos.length > 0 && <ul className="adm-hist">{aparelhos.map((a) => <li key={a.id}><b>{a.dispositivo || 'Aparelho'}</b> <small>desde {dataHora(a.criado_em)}{a.ultimo_ok ? ` · última entrega ${dataHora(a.ultimo_ok)}` : ''}</small> <button className="adm-link" onClick={() => remover(a.id)}>remover</button></li>)}</ul>}
        {msg && <p className="adm-msg">{msg}</p>}
      </div>

      <div className="adm-bloco">
        <h2>Registrar atendimento pela Siri e pelo Apple Watch</h2>
        <p className="adm-sub">Você fala com quem conversou e o que ficou combinado. A IA acha o contato, registra na linha do tempo, atualiza o negócio e cria as tarefas. Se tiver dúvida de quem é, fica em Tarefas para você confirmar.</p>
        <div><button className="adm-btn" onClick={gerar}>Gerar token do atalho</button></div>
        {novoToken && (
          <div className="adm-aviso">
            <p><b>Seu token (aparece só agora):</b></p>
            <code className="adm-codigo">{novoToken}</code>
            <p><button className="adm-btn" onClick={() => copiar(novoToken, 't')}>{copiado === 't' ? 'Copiado' : 'Copiar token'}</button></p>
            <p className="adm-sub">Cole no atalho, no campo Authorization, assim: Bearer {'{token}'}. Não mande para ninguém. Se vazar, revogue aqui embaixo e gere outro.</p>
          </div>
        )}
        {tokens.length > 0 && <ul className="adm-hist">{tokens.map((t) => <li key={t.id}><b>{t.nome}</b> <small>{t.revogado ? 'revogado' : t.ultimo_uso ? `usado ${dataHora(t.ultimo_uso)}` : 'ainda não usado'}</small> {!t.revogado && <button className="adm-link" onClick={() => revogar(t.id)}>revogar</button>}</li>)}</ul>}
        <details>
          <summary>Como montar o atalho "Registrar atendimento" (uma vez só, no iPhone)</summary>
          <ol className="adm-travas-lista">
            <li>Abra o app <b>Atalhos</b>, toque em <b>+</b> e dê o nome <b>Registrar atendimento</b>. Esse nome vira o comando da Siri.</li>
            <li>Adicione a ação <b>Ditar Texto</b>. Idioma: Português (Brasil). Parar de ouvir: Após Pausa.</li>
            <li>Adicione <b>Obter Conteúdo do URL</b>. URL: <code className="adm-codigo">{URL_APP}</code> <button className="adm-link" onClick={() => copiar(URL_APP, 'u')}>{copiado === 'u' ? 'copiado' : 'copiar'}</button></li>
            <li>Toque em <b>Mostrar Mais</b>. Método: <b>POST</b>. Cabeçalhos: chave <b>Authorization</b>, valor <b>Bearer</b> + espaço + seu token. Corpo: <b>JSON</b>, campo <b>texto</b> (Texto) com a variável <b>Texto Ditado</b>, e campo <b>origem</b> com <b>siri</b>.</li>
            <li>Adicione <b>Obter Valor do Dicionário</b> com a chave <b>resposta</b>.</li>
            <li>Adicione <b>Falar Texto</b> (ou Mostrar Resultado) com o <b>Valor do Dicionário</b>.</li>
            <li>Nos detalhes do atalho (ícone i), ligue <b>Mostrar no Apple Watch</b>.</li>
            <li>Pronto: "E aí Siri, registrar atendimento", no iPhone, no relógio ou no Mac.</li>
          </ol>
          <p className="adm-sub"><b>Para conversas gravadas:</b> duplique o atalho, troque o nome para <b>Registrar transcrição</b>, apague o Ditar Texto, ligue <b>Mostrar na Folha de Compartilhamento</b> (tipo Texto) e use a variável <b>Entrada do Atalho</b> no campo texto. Depois, no app Notas, grave a conversa, copie ou compartilhe a transcrição com esse atalho.</p>
        </details>
      </div>
    </>
  );
}
