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
export function evento(nome, dados = {}) {
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: nome, ...dados, ...origem() });
  } catch (e) {}
}
export function abrirWhats(texto, dados = {}) {
  const ref = codigoRef();
  evento('whatsapp_click', { ref, ...dados });
  const msg = `${texto}\nCódigo: ${ref}`;
  window.open(`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}
