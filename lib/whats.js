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
export function abrirWhats(texto, dados = {}, extra = {}) {
  const ref = codigoRef();
  evento('whatsapp_click', { ref, ...dados }, extra);
  const msg = `${texto}\nCódigo: ${ref}`;
  window.open(`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}
