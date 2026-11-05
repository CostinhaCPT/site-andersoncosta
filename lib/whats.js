'use client';
import { SITE } from './site';
const K = 'ac_origem';
export function capturarOrigem() {
  try {
    const p = new URLSearchParams(window.location.search);
    const campos = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid'];
    const novo = {};
    campos.forEach((c) => p.get(c) && (novo[c] = p.get(c)));
    if (Object.keys(novo).length) {
      novo.landing = window.location.pathname;
      novo.em = new Date().toISOString();
      localStorage.setItem(K, JSON.stringify(novo));
    }
  } catch (e) {}
}
export function origem() {
  try { return JSON.parse(localStorage.getItem(K) || '{}'); } catch (e) { return {}; }
}
export function codigoRef() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
// Eventos que também vão para a API de Conversões da Meta (servidor)
const CAPI = { whatsapp_click: 'Contact', curadoria_request: 'Lead', form_imovel: 'Lead', form_lp: 'Lead', chat_contato: 'Lead', chat_handoff: 'LeadQualificado' };
function idEvento() {
  try { return crypto.randomUUID(); } catch (e) { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
}
function cookie(n) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}
function enviarCapi(nome, eid, dados, extra) {
  try {
    if (!CAPI[nome] || localStorage.getItem('ac_consent') !== 'sim' || !SITE.chatApi) return;
    const o = origem();
    let fbc = cookie('_fbc');
    if (!fbc && o.fbclid) fbc = `fb.1.${Date.parse(o.em) || Date.now()}.${o.fbclid}`;
    let conversa = extra.conversa_id;
    if (!conversa) { try { conversa = JSON.parse(localStorage.getItem('ac_chat') || '{}').id; } catch (e) {} }
    const corpo = {
      acao: 'capi', evento: CAPI[nome], eid, url: location.href, fbp: cookie('_fbp'), fbc,
      imovel: dados.imovel || dados.ref_imovel || null, conversa_id: conversa || null,
      nome: extra.nome || null, telefone: extra.telefone || null,
    };
    const blob = new Blob([JSON.stringify(corpo)], { type: 'text/plain' });
    if (!(navigator.sendBeacon && navigator.sendBeacon(SITE.chatApi, blob))) {
      fetch(SITE.chatApi, { method: 'POST', body: blob, keepalive: true, mode: 'no-cors' }).catch(() => {});
    }
  } catch (e) {}
}
// extra: dados de contato só para o servidor, nunca vão para o dataLayer
export function evento(nome, dados = {}, extra = {}) {
  const eid = idEvento();
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: nome, eid, ...dados, ...origem() });
  } catch (e) {}
  enviarCapi(nome, eid, dados, extra);
}
// Contagem agregada por imóvel e por dia (sem cookie e sem dado pessoal), usada no relatório do proprietário
export function contarImovel(codigo, tipo = 'view') {
  try {
    if (!codigo || !SITE.supabaseUrl) return;
    if (tipo === 'view') { const k = `ac_vis_${codigo}`; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); }
    fetch(`${SITE.supabaseUrl}/rest/v1/rpc/contar_imovel`, {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: SITE.supabaseKey, Authorization: `Bearer ${SITE.supabaseKey}` },
      body: JSON.stringify({ p_codigo: codigo, p_tipo: tipo }),
    }).catch(() => {});
  } catch (e) {}
}
export function abrirWhats(texto, dados = {}, extra = {}) {
  const ref = codigoRef();
  if (dados.imovel) contarImovel(dados.imovel, 'whats');
  evento('whatsapp_click', { ref, ...dados }, extra);
  // Liga a conversa do WhatsApp à página e à campanha de onde a pessoa veio (sem dado pessoal)
  try {
    const corpo = JSON.stringify({ acao: 'wa_clique', codigo: ref, pagina: location.pathname, imovel: dados.imovel || null, local: dados.local || null, origem: origem() });
    const blob = new Blob([corpo], { type: 'text/plain' });
    if (!(navigator.sendBeacon && navigator.sendBeacon(SITE.chatApi, blob))) fetch(SITE.chatApi, { method: 'POST', body: blob, keepalive: true, mode: 'no-cors' }).catch(() => {});
  } catch (e) {}
  const msg = `${texto}\nCódigo: ${ref}`;
  window.open(`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}
