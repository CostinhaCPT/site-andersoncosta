'use client';
import { useEffect, useState } from 'react';
import { SITE } from '@/lib/site';
import RelatorioVista from './RelatorioVista';

export default function RelatorioPublico() {
  const [r, setR] = useState(undefined);
  useEffect(() => {
    const t = (new URLSearchParams(location.search).get('t') || '').replace(/[^a-f0-9]/g, '');
    if (!t) { setR(null); return; }
    fetch(`${SITE.supabaseUrl}/rest/v1/rpc/relatorio_publico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SITE.supabaseKey, Authorization: `Bearer ${SITE.supabaseKey}` },
      body: JSON.stringify({ p_token: t }),
    }).then((x) => x.json()).then((d) => setR(d && d.dados ? d : null)).catch(() => setR(null));
  }, []);
  if (r === undefined) return <p style={{ padding: 40, textAlign: 'center' }}>Carregando o relatório…</p>;
  if (!r) return <p style={{ padding: 40, textAlign: 'center' }}>Relatório não encontrado. Peça um novo link ao Anderson.</p>;
  return (
    <div style={{ background: '#f6f6f5', minHeight: '100vh', padding: '20px 0' }}>
      <RelatorioVista dados={r.dados} texto={r.texto} inicio={r.inicio} fim={r.fim} />
      <p style={{ textAlign: 'center', margin: '18px 0 0' }}><button className="btn btn-escuro" onClick={() => window.print()}>Salvar em PDF</button></p>
    </div>
  );
}
