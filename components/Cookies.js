'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { capturarOrigem } from '@/lib/whats';
const K = 'ac_consent';
function aplicar(v) {
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  const s = v === 'sim' ? 'granted' : 'denied';
  gtag('consent', 'update', { ad_storage: s, analytics_storage: s, ad_user_data: s, ad_personalization: s });
}
export default function Cookies() {
  const [ver, setVer] = useState(false);
  useEffect(() => {
    capturarOrigem();
    let v = null;
    try { v = localStorage.getItem(K); } catch (e) {}
    if (v) aplicar(v); else setVer(true);
  }, []);
  const escolher = (v) => { try { localStorage.setItem(K, v); } catch (e) {} aplicar(v); setVer(false); };
  if (!ver) return null;
  return (
    <div className="cookie" role="dialog" aria-label="Preferências de cookies">
      Uso cookies para medir o desempenho do site e dos anúncios. Você escolhe. Detalhes na <Link href="/politica-de-privacidade/" style={{ color: '#fff' }}>política de privacidade</Link>.
      <div className="acoes"><button className="btn btn-claro" onClick={() => escolher('sim')}>Aceitar</button><button className="btn btn-borda" style={{ color: '#ddd' }} onClick={() => escolher('nao')}>Recusar</button></div>
    </div>
  );
}
