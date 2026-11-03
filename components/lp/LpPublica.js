'use client';
import { useEffect, useRef, useState } from 'react';
import { SITE } from '@/lib/site';
import { origem } from '@/lib/whats';
import { mapearImovel } from '@/lib/mapear.mjs';
import Render from './Render';

function sessao() {
  try {
    let s = sessionStorage.getItem('ac_lp_sessao');
    if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('ac_lp_sessao', s); }
    return s;
  } catch (e) { return null; }
}

export default function LpPublica() {
  const [lp, setLp] = useState(undefined);
  const [imoveis, setImoveis] = useState({});
  const slug = useRef('');

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    slug.current = (p.get('c') || location.pathname.split('/')[2] || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!slug.current) { setLp(null); return; }
    fetch(`${SITE.supabaseUrl}/rest/v1/rpc/lp_publica`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SITE.supabaseKey, Authorization: `Bearer ${SITE.supabaseKey}` },
      body: JSON.stringify({ p_slug: slug.current }),
    }).then((r) => r.json()).then((d) => {
      if (!d || !d.id) { setLp(null); return; }
      const mapa = {};
      for (const m of d.imoveis || []) mapa[m.codigo] = { ...mapearImovel(m), rascunho: m.status === 'rascunho' };
      setImoveis(mapa);
      setLp(d);
      document.title = d.tipo === 'curadoria' ? 'Sua curadoria · Anderson Costa Imóveis' : 'Anderson Costa Imóveis';
      window.dispatchEvent(new CustomEvent('lp-chat', { detail: !!d.opcoes?.chat }));
      registrar('abriu', { variante: d.variante || null, ref: document.referrer || null });
    }).catch(() => setLp(null));
  }, []);

  function registrar(tipo, dados = {}) {
    // Anderson checking his own page (logged in to the admin on this browser) doesn't count
    let admin = false;
    try { admin = !!localStorage.getItem('ac_admin'); } catch (e) {}
    if (admin && tipo !== 'lead') return Promise.resolve(true);
    return fetch(SITE.chatApi, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ acao: 'lp_evento', slug: slug.current, tipo, dados, sessao: sessao(), utm: origem() }),
    }).then((r) => r.ok).catch(() => false);
  }

  if (lp === undefined) return <div className="lp-carregando"><img src="/marca/anderson-costa-horizontal-preto.svg" alt="Anderson Costa" height="26" /></div>;
  if (lp === null) {
    return (
      <div className="lp-carregando">
        <img src="/marca/anderson-costa-horizontal-preto.svg" alt="Anderson Costa" height="26" />
        <p>Esta página não está mais disponível.</p>
        <a className="btn btn-escuro" href="/">Ver os imóveis</a>
      </div>
    );
  }
  return <Render lp={lp} imoveis={imoveis} aoEvento={registrar} />;
}
