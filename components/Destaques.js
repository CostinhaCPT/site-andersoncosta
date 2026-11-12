'use client';
import { useEffect, useMemo, useState } from 'react';
import Card from './Card';

// Vitrine da home que muda a cada visita.
// "Para você" usa os imóveis que a pessoa já abriu neste aparelho (bairro, tipo e faixa de preço; fica só no navegador dela).
// Sem histórico, mistura os imóveis próprios (AC) e os destaques com uma seleção nova a cada visita.
const ABAS = [
  ['voce', 'Para você'],
  ['selecao', 'Seleção do dia'],
  ['novos', 'Novidades'],
  ['ate850', 'Até R$ 850 mil'],
  ['alto', 'Acima de R$ 1 milhão'],
];
const N = 6;
const embaralhar = (a) => { const b = [...a]; for (let k = b.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [b[k], b[j]] = [b[j], b[k]]; } return b; };
const proprio = (i) => /^AC-/i.test(i.codigo);

function lerVistos() {
  try { return JSON.parse(localStorage.getItem('ac_vistos') || '[]'); } catch { return []; }
}

function escolher(aba, lista, vistos) {
  const jaVi = new Set(vistos.map((v) => v.codigo));
  const livres = lista.filter((i) => !i.reservado);
  if (aba === 'voce' && vistos.length) {
    const conta = (k) => vistos.reduce((m, v) => (v[k] ? m.set(v[k], (m.get(v[k]) || 0) + 1) : m), new Map());
    const bairros = conta('bairro'), tipos = conta('tipo');
    const precos = vistos.map((v) => v.preco).filter(Boolean);
    const medio = precos.length ? precos.reduce((s, p) => s + p, 0) / precos.length : null;
    return livres
      .filter((i) => !jaVi.has(i.codigo))
      .map((i) => {
        let p = (bairros.get(i.bairroSlug) || 0) * 3 + (tipos.get(i.tipoSlug) || 0) * 2;
        if (medio && i.preco) { const d = Math.abs(i.preco - medio) / medio; p += d <= 0.15 ? 4 : d <= 0.3 ? 2 : d > 0.6 ? -3 : 0; }
        if (proprio(i)) p += 1;
        return [i, p + Math.random() * 1.5];
      })
      .sort((a, b) => b[1] - a[1]).slice(0, N).map((x) => x[0]);
  }
  if (aba === 'novos') {
    return [...livres].sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')) || (b.preco || 0) - (a.preco || 0)).slice(0, N);
  }
  if (aba === 'ate850') return embaralhar(livres.filter((i) => i.preco && i.preco >= 450000 && i.preco <= 850000)).slice(0, N);
  if (aba === 'alto') return embaralhar(livres.filter((i) => i.preco && i.preco > 1000000)).slice(0, N);
  // Seleção do dia: 2 imóveis próprios ou em destaque + 4 escolhidos ao acaso a partir de R$ 500 mil
  const fortes = embaralhar(livres.filter((i) => proprio(i) || i.destaque)).slice(0, 2);
  const usados = new Set(fortes.map((i) => i.codigo));
  const resto = embaralhar(livres.filter((i) => !usados.has(i.codigo) && (i.preco || 0) >= 500000)).slice(0, N - fortes.length);
  return [...fortes, ...resto];
}

export default function Destaques({ lista, inicial }) {
  const [vistos, setVistos] = useState([]);
  const [aba, setAba] = useState(null);
  const [rodada, setRodada] = useState(0);
  useEffect(() => { const v = lerVistos(); setVistos(v); setAba(v.length ? 'voce' : 'selecao'); }, []);
  const porCodigo = useMemo(() => new Map(lista.map((i) => [i.codigo, i])), [lista]);
  // Antes de montar no navegador, mostra a seleção fixa gerada no build (evita a página "pular")
  const mostrar = useMemo(() => (aba ? escolher(aba, lista, vistos) : inicial.map((c) => porCodigo.get(c)).filter(Boolean)), [aba, lista, vistos, rodada, inicial, porCodigo]);
  const abas = ABAS.filter(([k]) => k !== 'voce' || vistos.length);
  return (
    <>
      <div className="vitrine-abas" role="tablist" aria-label="Escolha a vitrine">
        {abas.map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? 'on' : ''} onClick={() => setAba(k)}>{t}</button>)}
        {aba && aba !== 'novos' && <button type="button" className="vitrine-outros" onClick={() => setRodada((r) => r + 1)}>Mostrar outros ↻</button>}
      </div>
      {aba === 'voce' && <p className="muted vitrine-nota">Escolhidos a partir dos imóveis que você já viu aqui no site.</p>}
      <div className="grade" style={{ marginTop: 20 }}>{mostrar.map((i) => <Card key={i.codigo} i={i} />)}</div>
    </>
  );
}
