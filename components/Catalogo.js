'use client';
import { useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Card from './Card';
const FAIXAS = [['ate-850', 'Até R$ 850 mil'], ['850-1000', 'R$ 850 mil a 1 milhão'], ['acima-1000', 'Acima de R$ 1 milhão']];
const CHAVES = ['bairro', 'tipo', 'faixa', 'quartos', 'ordem'];
const selecionado = (i) => (i.destaque || /^AC-/.test(i.codigo) ? 1 : 0);
export default function Catalogo({ lista, inicial = {}, curadoria = true }) {
  const [f, setF] = useState({ bairro: '', tipo: '', faixa: '', quartos: '', ordem: 'selecionados', ...inicial });
  // Mostra de 24 em 24: com os 349 de uma vez o celular (Safari, Chrome e Brave) travava ou recarregava a página
  const PASSO = 24;
  const [qtd, setQtd] = useState(PASSO);
  const fim = useRef(null);
  useEffect(() => { setQtd(PASSO); }, [f]);
  // Carrega o próximo bloco sozinho quando o botão chega perto da tela
  useEffect(() => {
    const el = fim.current; if (!el || !('IntersectionObserver' in window)) return;
    const o = new IntersectionObserver((e) => { if (e[0].isIntersecting) setQtd((q) => q + PASSO); }, { rootMargin: '600px 0px' });
    o.observe(el); return () => o.disconnect();
  }, [qtd, f]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const n = {}; CHAVES.forEach((k) => p.get(k) && (n[k] = p.get(k)));
    if (Object.keys(n).length) setF((x) => ({ ...x, ...n }));
  }, []);
  const mudar = (k, valor) => {
    const v = { ...f, [k]: valor }; setF(v);
    const p = new URLSearchParams(); CHAVES.forEach((x) => v[x] && !(x === 'ordem' && v[x] === 'selecionados') && !(inicial[x] && inicial[x] === v[x]) && p.set(x, v[x]));
    window.history.replaceState(null, '', p.toString() ? '?' + p : window.location.pathname);
  };
  const alternar = (k, valor) => mudar(k, f[k] === valor ? '' : valor);
  const bairros = [...new Map(lista.map((i) => [i.bairroSlug, i.bairro])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const contaTipo = lista.reduce((m, i) => m.set(i.tipoSlug, (m.get(i.tipoSlug) || 0) + 1), new Map());
  const tipos = [...new Map(lista.map((i) => [i.tipoSlug, i.tipo])).entries()].sort((a, b) => (contaTipo.get(b[0]) || 0) - (contaTipo.get(a[0]) || 0));
  const res = useMemo(() => lista
    .filter((i) => !f.bairro || i.bairroSlug === f.bairro)
    .filter((i) => !f.tipo || i.tipoSlug === f.tipo)
    .filter((i) => !f.faixa || i.faixa === f.faixa)
    .filter((i) => !f.quartos || i.quartos >= +f.quartos)
    .sort((a, b) => {
      if (f.ordem === 'menor') return (a.preco || 9e12) - (b.preco || 9e12);
      if (f.ordem === 'novos') return String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')) || (b.preco || 0) - (a.preco || 0);
      if (f.ordem === 'selecionados') return selecionado(b) - selecionado(a) || (b.preco || 0) - (a.preco || 0);
      return (b.preco || 0) - (a.preco || 0);
    }), [f, lista]);
  const chip = (k, valor, rotulo) => <button key={k + valor} type="button" className={'chip' + (f[k] === valor ? ' on' : '')} aria-pressed={f[k] === valor} onClick={() => alternar(k, valor)}>{rotulo}</button>;
  const limpo = !f.bairro && !f.tipo && !f.faixa && !f.quartos;
  const nome = f.tipo ? (tipos.find(([s]) => s === f.tipo)?.[1] || 'imóve') : null;
  const itens = res.slice(0, qtd);
  return (
    <>
      <div className="filtros2">
        <div className="chips" role="group" aria-label="Filtros">
          {!inicial.tipo && tipos.slice(0, 4).map(([s, n]) => chip('tipo', s, n))}
          {!inicial.tipo && <span className="chips-sep" aria-hidden="true" />}
          {FAIXAS.map(([s, n]) => chip('faixa', s, n))}
          <span className="chips-sep" aria-hidden="true" />
          {chip('quartos', '3', '3+ quartos')}
          {!inicial.bairro && (
            <label className={'chip chip-select' + (f.bairro ? ' on' : '')}>
              <span className="sr">Bairro</span>
              <select value={f.bairro} onChange={(e) => mudar('bairro', e.target.value)}><option value="">Todos os bairros</option>{bairros.map(([s, n]) => <option key={s} value={s}>{n}</option>)}</select>
            </label>
          )}
          {!limpo && <button type="button" className="chip-limpar" onClick={() => { setF({ ...f, bairro: inicial.bairro || '', tipo: inicial.tipo || '', faixa: '', quartos: '' }); window.history.replaceState(null, '', window.location.pathname); }}>Limpar</button>}
        </div>
        <div className="filtros2-base">
          <span className="num">{res.length} {res.length === 1 ? 'imóvel' : 'imóveis'}{nome && !inicial.tipo ? ` · ${nome}` : ''}</span>
          <label className="ordem">Ordenar por
            <select value={f.ordem} onChange={(e) => mudar('ordem', e.target.value)}>
              <option value="selecionados">Selecionados por mim</option>
              <option value="maior">Maior preço</option>
              <option value="menor">Menor preço</option>
              <option value="novos">Mais novos</option>
            </select>
          </label>
        </div>
      </div>
      {res.length ? <>
        <h2 className="sr">Resultados</h2>
        <div className="grade3">
          {itens.slice(0, 6).map((i, k) => <Card key={i.codigo} i={i} prioridade={k < 2} />)}
          {curadoria && itens.length > 6 && (
            <div className="faixa-curadoria">
              <div><b>{res.length} imóveis é muita coisa. Quer que eu escolha os 3 que fazem sentido para você?</b><span>Me conta sua rotina e o que não pode faltar. A curadoria é gratuita.</span></div>
              <Link href="/curadoria/" className="btn btn-claro">Quero minha curadoria</Link>
            </div>
          )}
          {itens.slice(6).map((i) => <Card key={i.codigo} i={i} />)}
        </div>
        {qtd < res.length && <p ref={fim} style={{ marginTop: 48, textAlign: 'center' }}><button type="button" className="btn btn-borda" onClick={() => setQtd((q) => q + PASSO)}>Mostrar mais ({res.length - qtd})</button></p>}
      </> : <p className="muted" style={{ padding: '40px 0' }}>Nenhum imóvel com esses filtros. <Link href="/curadoria/">Peça uma curadoria</Link> e eu procuro para você, inclusive fora do site.</p>}
    </>
  );
}
