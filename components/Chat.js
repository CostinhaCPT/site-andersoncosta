'use client';
// Chat do site: conversa com o cérebro do atendimento (Supabase Edge Function)
// e convida o visitante a conversar no momento certo, conforme a página.
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { SITE } from '@/lib/site';
import { origem, evento } from '@/lib/whats';
import { IconeWhats } from './Whats';

const K_CONVERSA = 'ac_chat';
const K_CONVITE_VISTO = 'ac_chat_convite';
const K_CONVITE_FECHADO = 'ac_chat_convite_fechado';
const SAUDACAO = 'Oi! Sou a assistente virtual do Anderson Costa. Me conta o que você está procurando que eu te ajudo a encontrar.';

function lerLS(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function gravarLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function lerSS(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function gravarSS(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

function codigoDaPagina(p) {
  if (!(p || '').startsWith('/imovel/') || typeof document === 'undefined') return null;
  return document.querySelector('[data-codigo]')?.dataset.codigo || null;
}

function convitePara(p) {
  if (codigoDaPagina(p)) return 'Quer saber como este imóvel fica em relação ao bairro, ou o que ele tem que as fotos não mostram? Posso te ajudar.';
  if (p.startsWith('/imoveis')) return 'Não achou exatamente o que procura? Me conta o que sua família precisa que eu filtro para você.';
  if (p.startsWith('/curadoria')) return 'Se preferir, me conta aqui mesmo o que vocês procuram e eu já adianto sua curadoria.';
  if (p.startsWith('/anuncie')) return 'Pensando em vender? Posso te explicar como o Anderson avalia e divulga o imóvel.';
  if (p.startsWith('/metodo')) return 'Quer entender como funciona a curadoria ou a simulação de financiamento? Pode me perguntar.';
  return 'Oi! Está procurando imóvel em Jaraguá do Sul e região? Posso te ajudar a encontrar.';
}

// Transforma links em <a>, mantendo o resto como texto
function Texto({ t }) {
  const partes = t.split(/(https?:\/\/[^\s)]+)/g);
  return partes.map((p, i) => {
    if (!/^https?:\/\//.test(p)) return <span key={i}>{p}</span>;
    const interno = p.startsWith(SITE.dominio);
    const rotulo = interno ? 'Ver o imóvel' : p.replace(/^https?:\/\//, '');
    return <a key={i} href={interno ? p.replace(SITE.dominio, '') : p} target={interno ? undefined : '_blank'} rel="noopener">{rotulo}</a>;
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_GRAVACAO = 60;

function lerBase64(blob) {
  return new Promise((ok, erro) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = erro; f.readAsDataURL(blob); });
}

// Reduz a foto no próprio celular antes de enviar
async function comprimirFoto(arquivo, lado = 1280, qualidade = 0.8) {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = url; });
    const desenhar = (max, q) => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', q);
    };
    return { grande: desenhar(lado, qualidade), mini: desenhar(240, 0.7) };
  } finally { URL.revokeObjectURL(url); }
}

function tipoGravacao() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return '';
}

function mascaraFone(v) {
  const d = v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function Cartao({ c, aoAbrir }) {
  return (
    <Link href={c.link} className="chat-cartao" onClick={aoAbrir}>
      {c.foto && <img src={c.foto} alt="" loading="lazy" />}
      <span className="chat-cartao-txt">
        <small>{c.bairro} · {c.cidade}</small>
        <b>{c.titulo}</b>
        <span>{c.detalhes}</span>
        <strong>{c.preco}</strong>
      </span>
    </Link>
  );
}

// Visit options chosen by the assistant: tap one to book, or say none fits
function Agenda({ m, conversaId, aoConcluir, aoRecusar, ativo }) {
  const [escolha, setEscolha] = useState(null);
  const [obs, setObs] = useState('');
  const [contato, setContato] = useState(null); // asked only when no lead exists yet
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  if (m.feito) return <p className="chat-agenda-feito">{m.feito}</p>;
  const opcoes = m.agenda?.opcoes || [];

  async function confirmar() {
    if (!escolha) return setErro('Escolha um dos horários.');
    setErro(''); setEnviando(true);
    try {
      const c = contato ? { nome: contato.nome, whatsapp: contato.whatsapp.replace(/\D/g, '') } : {};
      const r = await fetch(SITE.chatApi, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'agendar', conversa_id: conversaId, inicio: escolha.inicio, imovel: m.agenda?.imovel, observacao: obs, ...c }),
      });
      const j = await r.json();
      if (j.erro === 'precisa_contato') { setContato({ nome: '', whatsapp: '' }); setErro('Para o Anderson confirmar, me passa seu nome e WhatsApp.'); return; }
      if (!r.ok || j.erro) throw new Error(j.erro || 'falha');
      evento('visita_agendada', { status: j.status, imovel: m.agenda?.imovel || '', fora_horario: escolha.tipo === 'pedido' }, { conversa_id: conversaId, imovel: m.agenda?.imovel });
      aoConcluir(j);
    } catch (e) {
      setErro(e.message && e.message !== 'falha' ? e.message : 'Não consegui registrar agora. Tenta de novo?');
    } finally { setEnviando(false); }
  }

  if (!opcoes.length) return <p className="chat-agenda-feito">Sem horários para mostrar agora.</p>;
  return (
    <div className="chat-agenda">
      <b className="chat-agenda-tit">Visita{m.agenda?.imovel ? ` · ${m.agenda.imovel}` : ''}</b>
      <div className="chat-agenda-opcoes">
        {opcoes.map((o) => (
          <button key={o.inicio} type="button" disabled={!ativo} className={(escolha?.inicio === o.inicio ? 'on ' : '') + (o.tipo === 'pedido' ? 'pedido' : '')} onClick={() => setEscolha(o)}>
            <span>{o.rotulo}</span>
            {o.tipo === 'pedido' && <small>fora do horário: o Anderson confirma</small>}
          </button>
        ))}
      </div>
      {ativo && <>
        {m.agenda?.exige_validacao && <small>Este imóvel precisa de combinação com o proprietário, então o Anderson confirma o horário com você.</small>}
        {contato && (
          <div className="chat-agenda-outro">
            <input type="text" placeholder="Seu nome" value={contato.nome} onChange={(e) => setContato({ ...contato, nome: e.target.value })} />
            <input type="tel" placeholder="WhatsApp com DDD" value={contato.whatsapp} onChange={(e) => setContato({ ...contato, whatsapp: mascaraFone(e.target.value) })} />
          </div>
        )}
        {escolha && <input className="chat-agenda-obs" type="text" maxLength={300} placeholder="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />}
        {erro && <p className="chat-erro">{erro}</p>}
        <div className="chat-agenda-acoes">
          <button type="button" className="chat-agenda-link" onClick={aoRecusar}>Nenhum desses serve</button>
          <button type="button" className="btn btn-escuro" disabled={enviando || !escolha} onClick={confirmar}>{enviando ? 'Um instante…' : escolha?.tipo === 'pedido' ? 'Pedir este horário' : 'Confirmar visita'}</button>
        </div>
      </>}
    </div>
  );
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const IconeEnviar = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" /></svg>;
const IconeMic = ({ s = 20 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const IconeFoto = () => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
const IconeSom = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" /><path d="M4 9h4l5-4v14l-5-4H4z" /></svg>;
const IconePausa = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>;

export default function Chat() {
  const pathname = usePathname() || '/';
  const [aberto, setAberto] = useState(false);
  const [convite, setConvite] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [conversaId, setConversaId] = useState(null);
  const [whats, setWhats] = useState(null);
  const [digitando, setDigitando] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [podeGravar, setPodeGravar] = useState(false);
  const [vozEstado, setVozEstado] = useState({}); // índice -> 'carregando' | 'tocando'
  const [contato, setContato] = useState(null);
  const [form, setForm] = useState({ nome: '', whatsapp: '', email: '' });
  const [formErro, setFormErro] = useState('');
  const conviteAbertoRef = useRef(null);
  const gravadorRef = useRef(null);
  const pedacosRef = useRef([]);
  const cancelarRef = useRef(false);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const fotoRef = useRef(null);
  const fimRef = useRef(null);
  const campoRef = useRef(null);
  const saudacaoRef = useRef(SAUDACAO);
  const [cfg, setCfg] = useState({ ativo: true, pedir_contato: SITE.chatPedirContato, saudacao: '' });

  // Settings from the admin (chat on/off, contact form, greeting)
  useEffect(() => {
    fetch(SITE.chatApi, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'config_publica' }) })
      .then((r) => r.json()).then((d) => { if (typeof d.ativo === 'boolean') setCfg({ ativo: d.ativo, pedir_contato: d.pedir_contato !== false, saudacao: d.saudacao || '' }); })
      .catch(() => {});
  }, []);
  const saudacaoPadrao = cfg.saudacao || SAUDACAO;
  // On landing pages the chat only shows when the page allows it
  const [chatLp, setChatLp] = useState(false);
  useEffect(() => {
    const f = (e) => setChatLp(!!e.detail);
    window.addEventListener('lp-chat', f);
    return () => window.removeEventListener('lp-chat', f);
  }, []);

  // Recupera conversa salva (até 7 dias)
  useEffect(() => {
    const s = lerLS(K_CONVERSA);
    if (s && Date.now() - s.ts < 7 * 864e5) {
      setConversaId(s.id || null); setMsgs(s.msgs || []); setWhats(s.whats || null); setContato(s.contato || null);
      if (s.saudacao) saudacaoRef.current = s.saudacao;
    }
  }, []);

  useEffect(() => {
    if (msgs.length) gravarLS(K_CONVERSA, { id: conversaId, msgs: msgs.slice(-60), whats, contato, saudacao: saudacaoRef.current, ts: Date.now() });
  }, [msgs, conversaId, whats, contato]);

  const precisaContato = cfg.pedir_contato && !contato && !conversaId;

  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }); }, [msgs, digitando, aberto]);
  useEffect(() => { setPodeGravar(tipoGravacao() !== null && !!navigator.mediaDevices?.getUserMedia); }, []);

  // Convite proativo: uma vez por sessão, nunca nos 3 dias após a pessoa fechar
  useEffect(() => {
    if (aberto || msgs.length) return;
    const fechado = lerLS(K_CONVITE_FECHADO);
    if (fechado && Date.now() - fechado < 3 * 864e5) return;
    if (lerSS(K_CONVITE_VISTO)) return;
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    let feito = false;
    const mostrar = (gatilho) => {
      if (feito) return;
      if (document.querySelector('.cookie')) { setTimeout(() => mostrar(gatilho), 4000); return; }
      feito = true;
      gravarSS(K_CONVITE_VISTO, '1');
      setConvite(convitePara(pathname));
      evento('chat_convite', { gatilho, pagina: pathname });
    };
    const t = setTimeout(() => mostrar('tempo'), mobile ? 15000 : 9000);
    const saida = (e) => { if (e.clientY <= 0) mostrar('saida'); };
    const rolagem = () => {
      const h = document.documentElement;
      if ((h.scrollTop + window.innerHeight) / h.scrollHeight > 0.55) mostrar('rolagem');
    };
    document.addEventListener('mouseout', saida);
    window.addEventListener('scroll', rolagem, { passive: true });
    return () => { clearTimeout(t); document.removeEventListener('mouseout', saida); window.removeEventListener('scroll', rolagem); };
  }, [pathname, aberto, msgs.length]);

  const abrir = (vindoDoConvite) => {
    if (!msgs.length) {
      conviteAbertoRef.current = vindoDoConvite && convite ? convite : null;
      if (precisaContato) {
        setMsgs([{ de: 'bot', t: 'Oi! Sou a assistente virtual do Anderson Costa.\n\nAntes de começar, como posso te chamar e qual o seu WhatsApp? Assim, se a conversa cair, o Anderson consegue continuar com você.' }]);
      } else {
        const s = conviteAbertoRef.current || saudacaoPadrao;
        saudacaoRef.current = s;
        setMsgs([{ de: 'bot', t: s }]);
      }
    }
    setConvite(null);
    setAberto(true);
    evento('chat_aberto', { pagina: pathname, via: vindoDoConvite ? 'convite' : 'botao' });
    setTimeout(() => campoRef.current?.focus(), 150);
  };

  async function enviarContato(e) {
    e.preventDefault();
    const nome = form.nome.trim();
    const fone = form.whatsapp.replace(/\D/g, '');
    if (nome.length < 2) return setFormErro('Me diz seu nome, por favor.');
    if (fone.length < 10 || fone.length > 11) return setFormErro('Confere o WhatsApp com DDD, por favor.');
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setFormErro('Esse e-mail parece incompleto.');
    setFormErro(''); setEnviando(true);
    try {
      const r = await fetch(SITE.chatApi, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'contato', nome, whatsapp: fone, email: form.email.trim(),
          contexto: { pagina: pathname, imovel: codigoDaPagina(pathname), utm: origem() },
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.conversa_id) throw new Error(d.erro || 'falha');
      const primeiro = nome.split(' ')[0];
      const fala = `Prazer, ${primeiro}! ${conviteAbertoRef.current || 'Me conta o que você está procurando que eu te ajudo a encontrar.'}`;
      saudacaoRef.current = fala;
      setConversaId(d.conversa_id);
      setContato({ nome: primeiro });
      setMsgs((m) => [...m, { de: 'eu', t: `${nome} · ${mascaraFone(fone)}` }, { de: 'bot', t: fala }]);
      evento('chat_contato', { pagina: pathname, com_email: !!form.email.trim() }, { conversa_id: d.conversa_id });
      setTimeout(() => campoRef.current?.focus(), 150);
    } catch (err) {
      setFormErro('Não consegui salvar agora. Tenta de novo em instantes?');
    } finally { setEnviando(false); }
  }

  const fecharConvite = (e) => {
    e.stopPropagation();
    setConvite(null);
    gravarLS(K_CONVITE_FECHADO, Date.now());
  };

  async function enviar(e, extra = {}) {
    e?.preventDefault?.();
    const t = (extra.texto ?? texto).trim();
    if ((!t && !extra.audio && !extra.imagem) || enviando) return;
    if (!extra.texto) setTexto('');
    setEnviando(true);
    const idxEu = msgs.length;
    setMsgs((m) => [...m, { de: 'eu', t: extra.audio ? 'Áudio enviado' : t, audio: !!extra.audio, img: extra.mini || null }]);
    evento('chat_mensagem', { pagina: pathname, tipo: extra.audio ? 'audio' : extra.imagem ? 'foto' : 'texto' });
    setDigitando(true);
    try {
      const r = await fetch(SITE.chatApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagem: t,
          conversa_id: conversaId,
          audio: extra.audio || undefined,
          imagem: extra.imagem || undefined,
          contexto: { pagina: pathname, imovel: codigoDaPagina(pathname), utm: origem(), saudacao: saudacaoRef.current },
        }),
      });
      const d = await r.json();
      if (d.conversa_id) setConversaId(d.conversa_id);
      if (extra.audio && typeof d.transcricao === 'string' && d.transcricao) {
        setMsgs((m) => m.map((x, i) => (i === idxEu ? { ...x, t: d.transcricao } : x)));
      }
      const respostas = d.respostas?.length ? d.respostas : ['Tive um problema técnico agora. Pode tentar de novo?'];
      for (let i = 0; i < respostas.length; i++) {
        if (i > 0) { setDigitando(true); await espera(Math.min(1800, 500 + respostas[i].length * 12)); }
        setDigitando(false);
        const ultima = i === respostas.length - 1;
        setMsgs((m) => [...m, { de: 'bot', t: respostas[i], voz: ultima && !!d.voz, cartoes: d.cartoes?.[i]?.length ? d.cartoes[i] : null }]);
      }
      if (d.agenda) setMsgs((m) => [...m, { de: 'bot', agenda: d.agenda }]);
      if (d.handoff?.whatsapp_url) {
        setWhats(d.handoff.whatsapp_url);
        evento('chat_handoff', { pagina: pathname }, { conversa_id: conversaId });
      }
    } catch (err) {
      setMsgs((m) => [...m, { de: 'bot', t: 'Não consegui me conectar agora. Se preferir, fale direto com o Anderson no WhatsApp.' }]);
      setWhats(`https://wa.me/${SITE.whatsapp}`);
    } finally {
      setDigitando(false);
      setEnviando(false);
    }
  }

  async function iniciarGravacao() {
    if (gravando || enviando) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const tipo = tipoGravacao();
      const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo, audioBitsPerSecond: 32000 } : undefined);
      pedacosRef.current = []; cancelarRef.current = false;
      rec.ondataavailable = (ev) => ev.data.size && pedacosRef.current.push(ev.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        clearInterval(timerRef.current);
        setGravando(false);
        if (cancelarRef.current || !pedacosRef.current.length) return;
        const blob = new Blob(pedacosRef.current, { type: rec.mimeType || tipo || 'audio/webm' });
        if (blob.size < 1500) return; // toque acidental
        const base64 = await lerBase64(blob);
        enviar(null, { texto: '', audio: { base64, mime: blob.type } });
      };
      gravadorRef.current = rec;
      rec.start(250);
      setSegundos(0); setGravando(true);
      evento('chat_audio_inicio', { pagina: pathname });
      timerRef.current = setInterval(() => setSegundos((x) => {
        if (x + 1 >= MAX_GRAVACAO) gravadorRef.current?.state === 'recording' && gravadorRef.current.stop();
        return x + 1;
      }), 1000);
    } catch (err) {
      setMsgs((m) => [...m, { de: 'bot', t: 'Não consegui acessar o microfone. Confira a permissão do navegador ou, se preferir, escreva sua mensagem.' }]);
    }
  }
  const pararGravacao = (cancelar = false) => {
    cancelarRef.current = cancelar;
    if (gravadorRef.current?.state === 'recording') gravadorRef.current.stop();
  };

  async function escolherFoto(ev) {
    const arq = ev.target.files?.[0];
    ev.target.value = '';
    if (!arq || enviando) return;
    try {
      const { grande, mini } = await comprimirFoto(arq);
      enviar(null, { texto: texto.trim(), imagem: { base64: grande, mime: 'image/jpeg' }, mini });
      setTexto('');
    } catch (err) {
      setMsgs((m) => [...m, { de: 'bot', t: 'Não consegui abrir essa foto. Pode tentar outra?' }]);
    }
  }

  async function ouvir(i) {
    if (vozEstado[i] === 'tocando') { audioRef.current?.pause(); setVozEstado({}); return; }
    audioRef.current?.pause();
    setVozEstado({ [i]: 'carregando' });
    try {
      const r = await fetch(SITE.chatApi, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'falar', conversa_id: conversaId }),
      });
      if (!r.ok) throw new Error('voz');
      const url = URL.createObjectURL(await r.blob());
      const a = new Audio(url);
      audioRef.current = a;
      a.onended = () => { setVozEstado({}); URL.revokeObjectURL(url); };
      await a.play();
      setVozEstado({ [i]: 'tocando' });
      evento('chat_ouvir', { pagina: pathname });
    } catch (err) { setVozEstado({}); }
  }

  const ultimaBot = msgs.map((m) => m.de).lastIndexOf('bot');
  const ultimaAgenda = msgs.map((m) => !!m.agenda && !m.feito).lastIndexOf(true);

  const visitaFeita = (i, j) => {
    setMsgs((m) => [
      ...m.map((x, k) => (k === i ? { ...x, feito: j.status === 'confirmada' ? `Visita confirmada: ${j.quando}` : `Pedido enviado: ${j.quando}` } : x)),
      { de: 'bot', t: j.texto },
    ]);
    if (j.whatsapp_url) setWhats(j.whatsapp_url);
  };

  if (!cfg.ativo) return null;
  if (pathname.startsWith('/lp') && !chatLp) return null;

  const irWhats = () => {
    evento('whatsapp_click', { local: 'chat', pagina: pathname }, { conversa_id: conversaId });
    window.open(whats || `https://wa.me/${SITE.whatsapp}`, '_blank', 'noopener');
  };

  return (
    <>
      {!aberto && convite && (
        <div className="chat-convite" role="button" tabIndex={0} onClick={() => abrir(true)} onKeyDown={(e) => e.key === 'Enter' && abrir(true)}>
          <button className="chat-convite-x" aria-label="Fechar convite" onClick={fecharConvite}>×</button>
          <span className="chat-convite-quem">Assistente do Anderson</span>
          {convite}
        </div>
      )}

      {!aberto && (
        <button className="chat-lancador" aria-label="Abrir conversa" onClick={() => abrir(false)}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z" strokeLinejoin="round" /><circle cx="8.5" cy="12" r=".6" fill="currentColor" /><circle cx="12.5" cy="12" r=".6" fill="currentColor" /><circle cx="16.5" cy="12" r=".6" fill="currentColor" /></svg>
          {convite && <span className="chat-ponto" />}
        </button>
      )}

      {aberto && (
        <section className="chat-janela" role="dialog" aria-label="Conversa com a assistente do Anderson Costa">
          <header className="chat-topo">
            <img src="/marca/simbolo-branco.svg" alt="" width="28" height="28" />
            <div className="chat-quem"><b>Assistente do Anderson</b><span>Responde na hora · {SITE.creci}</span></div>
            <button className="chat-icone" aria-label="Falar no WhatsApp" title="Falar no WhatsApp" onClick={irWhats}><IconeWhats s={20} /></button>
            <button className="chat-icone" aria-label="Fechar conversa" onClick={() => setAberto(false)}>×</button>
          </header>

          <div className="chat-corpo" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={'chat-msg ' + (m.de === 'eu' ? 'eu' : 'bot')}>
                {m.img && <img className="chat-foto" src={m.img} alt="Foto enviada" />}
                {m.audio && <span className="chat-rotulo"><IconeMic s={13} /> Áudio</span>}
                {m.agenda && <Agenda m={m} conversaId={conversaId} ativo={i === ultimaAgenda} aoConcluir={(j) => visitaFeita(i, j)} aoRecusar={() => enviar(null, { texto: 'Nenhum desses horários serve para mim.' })} />}
                {m.t && <Texto t={m.cartoes ? m.t.replace(/https?:\/\/\S*\/imovel\/\S+/g, '').trim() : m.t} />}
                {m.cartoes?.map((c) => <Cartao key={c.codigo} c={c} aoAbrir={() => window.innerWidth <= 520 && setAberto(false)} />)}
                {m.voz && i === ultimaBot && (
                  <button className="chat-ouvir" onClick={() => ouvir(i)}>
                    {vozEstado[i] === 'carregando' ? 'Carregando…' : vozEstado[i] === 'tocando' ? <><IconePausa /> Pausar</> : <><IconeSom /> Ouvir resposta</>}
                  </button>
                )}
              </div>
            ))}
            {digitando && <div className="chat-msg bot chat-digitando"><i /><i /><i /></div>}
            {whats && (
              <button className="btn btn-whats chat-whats" onClick={irWhats}><IconeWhats s={18} />Continuar com o Anderson no WhatsApp</button>
            )}
            <div ref={fimRef} />
          </div>

          {precisaContato ? (
            <form className="chat-contato" onSubmit={enviarContato} noValidate>
              <input type="text" placeholder="Seu nome" autoComplete="name" value={form.nome} maxLength={80}
                onChange={(e) => setForm({ ...form, nome: e.target.value })} ref={campoRef} />
              <input type="tel" inputMode="tel" placeholder="WhatsApp com DDD" autoComplete="tel-national" value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: mascaraFone(e.target.value) })} />
              <input type="email" inputMode="email" placeholder="E-mail (opcional)" autoComplete="email" value={form.email} maxLength={120}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
              {formErro && <p className="chat-erro">{formErro}</p>}
              <button type="submit" className="btn btn-escuro" disabled={enviando}>{enviando ? 'Um instante…' : 'Começar conversa'}</button>
            </form>
          ) : gravando ? (
            <div className="chat-envio chat-gravando">
              <button type="button" className="chat-btn-sec" aria-label="Cancelar áudio" onClick={() => pararGravacao(true)}>×</button>
              <span className="chat-rec"><i /> Gravando {mmss(segundos)} <small>de {mmss(MAX_GRAVACAO)}</small></span>
              <button type="button" aria-label="Enviar áudio" onClick={() => pararGravacao(false)}><IconeEnviar /></button>
            </div>
          ) : (
            <form className="chat-envio" onSubmit={enviar}>
              <button type="button" className="chat-btn-sec" aria-label="Enviar foto" title="Enviar foto" disabled={enviando} onClick={() => fotoRef.current?.click()}><IconeFoto /></button>
              <input ref={fotoRef} type="file" accept="image/*" hidden onChange={escolherFoto} />
              <textarea
                ref={campoRef} rows={1} value={texto} maxLength={1000} placeholder="Escreva ou mande um áudio"
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) enviar(e); }}
              />
              {texto.trim() || !podeGravar ? (
                <button type="submit" aria-label="Enviar" disabled={!texto.trim() || enviando}><IconeEnviar /></button>
              ) : (
                <button type="button" aria-label="Gravar áudio" title="Gravar áudio" disabled={enviando} onClick={iniciarGravacao}><IconeMic /></button>
              )}
            </form>
          )}
          <p className="chat-legal">Assistente virtual. A conversa fica registrada para o atendimento. <a href="/politica-de-privacidade/">Privacidade</a></p>
        </section>
      )}
    </>
  );
}
