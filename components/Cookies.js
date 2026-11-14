'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { capturarOrigem, evento } from '@/lib/whats';
const K = 'ac_consent';
function aplicar(v) {
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  const s = v === 'sim' ? 'granted' : 'denied';
  gtag('consent', 'update', { ad_storage: s, analytics_storage: s, ad_user_data: s, ad_personalization: s });
  window.dataLayer.push({ event: 'consentimento_atualizado', consentimento: v });
}
export default function Cookies() {
  const [ver, setVer] = useState(false);
  useEffect(() => {
    capturarOrigem();
    let v = null;
    try { v = localStorage.getItem(K); } catch (e) {}
    if (v) aplicar(v); else setVer(true);
  }, []);
  const escolher = (v) => {
    try { localStorage.setItem(K, v); } catch (e) {}
    aplicar(v); setVer(false);
    // Quem aceita já dentro da página de um imóvel: registra a visualização agora que há consentimento
    const im = window.__acImovel;
    if (v === 'sim' && im?.codigo) evento('imovel_view', { imovel: im.codigo, content_type: 'home_listing', valor: im.valor || null, currency: 'BRL' });
  };
  if (!ver) return null;
  return (
    <div className="cookie" role="dialog" aria-label="Preferências de cookies">
      <span>Uso cookies para medir o site e os anúncios. <Link href="/politica-de-privacidade/" style={{ color: '#fff' }}>Saiba mais</Link>.</span>
      <div className="acoes"><button className="btn btn-claro" onClick={() => escolher('sim')}>Aceitar</button><button className="btn btn-borda" style={{ color: '#ddd' }} onClick={() => escolher('nao')}>Recusar</button></div>
    </div>
  );
}
