'use client';
import { useMemo, useState, useEffect } from 'react';
import Card from './Card';
export default function Catalogo({ lista, inicial = {} }) {
  const [f, setF] = useState({ bairro: '', tipo: '', faixa: '', quartos: '', ordem: 'menor', ...inicial });
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const n = {}; ['bairro', 'tipo', 'faixa', 'quartos'].forEach((k) => p.get(k) && (n[k] = p.get(k)));
    if (Object.keys(n).length) setF((x) => ({ ...x, ...n }));
  }, []);
  const set = (k) => (e) => {
    const v = { ...f, [k]: e.target.value }; setF(v);
    const p = new URLSearchParams(); ['bairro', 'tipo', 'faixa', 'quartos'].forEach((x) => v[x] && p.set(x, v[x]));
    window.history.replaceState(null, '', p.toString() ? '?' + p : window.location.pathname);
  };
  const bairros = [...new Map(lista.map((i) => [i.bairroSlug, i.bairro])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const res = useMemo(() => lista
    .filter((i) => !f.bairro || i.bairroSlug === f.bairro)
    .filter((i) => !f.tipo || i.tipoSlug === f.tipo)
    .filter((i) => !f.faixa || i.faixa === f.faixa)
    .filter((i) => !f.quartos || i.quartos >= +f.quartos)
    .sort((a, b) => (f.ordem === 'maior' ? b.preco - a.preco : a.preco - b.preco)), [f, lista]);
  return (
    <>
      <div className="filtros">
        <select value={f.bairro} onChange={set('bairro')} aria-label="Bairro"><option value="">Todos os bairros</option>{bairros.map(([s, n]) => <option key={s} value={s}>{n}</option>)}</select>
        <select value={f.tipo} onChange={set('tipo')} aria-label="Tipo"><option value="">Todos os tipos</option><option value="casa">Casa</option><option value="casa-geminada">Geminado</option><option value="apartamento">Apartamento</option></select>
        <select value={f.faixa} onChange={set('faixa')} aria-label="Faixa de preço"><option value="">Qualquer valor</option><option value="ate-850">Até R$ 850 mil</option><option value="850-1000">R$ 850 mil a 1 milhão</option><option value="acima-1000">Acima de R$ 1 milhão</option></select>
        <select value={f.quartos} onChange={set('quartos')} aria-label="Quartos"><option value="">Quartos</option><option value="2">2 ou mais</option><option value="3">3 ou mais</option><option value="4">4 ou mais</option></select>
        <select value={f.ordem} onChange={set('ordem')} aria-label="Ordenar"><option value="menor">Menor preço</option><option value="maior">Maior preço</option></select>
        <span className="muted" style={{ alignSelf: 'center', fontSize: '.9rem' }}>{res.length} imóve{res.length === 1 ? 'l' : 'is'}</span>
      </div>
      {res.length ? <div className="grade">{res.map((i) => <Card key={i.codigo} i={i} />)}</div> : <p className="muted">Nenhum imóvel com esses filtros. Peça uma curadoria e eu procuro para você, inclusive fora do site.</p>}
    </>
  );
}
