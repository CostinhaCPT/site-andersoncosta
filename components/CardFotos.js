'use client';
import { useRef, useState } from 'react';
import { miniatura } from '@/lib/format';
// Fotos do card: arrasta para o lado no celular (scroll-snap nativo), setas no computador.
// unica: mostra só a 1ª foto (usado dentro de outro carrossel, para os dois deslizes não brigarem no celular)
export default function CardFotos({ fotos, titulo, selo, max = 8, prioridade = false, unica = false }) {
  const lista = (fotos || []).slice(0, unica ? 1 : max);
  const ref = useRef(null);
  const [n, setN] = useState(0);
  const ir = (e, d) => {
    e.preventDefault(); e.stopPropagation();
    const el = ref.current; if (!el) return;
    const alvo = Math.max(0, Math.min(lista.length - 1, n + d));
    el.scrollTo({ left: alvo * el.clientWidth, behavior: 'smooth' });
  };
  const rolou = () => { const el = ref.current; if (el) setN(Math.round(el.scrollLeft / el.clientWidth)); };
  return (
    <div className="foto">
      <div className="fotos-trilho" ref={ref} onScroll={rolou}>
        {lista.map((f, k) => (k <= n + 1
          ? <img key={f} src={miniatura(f)} srcSet={miniatura(f) === f ? undefined : `${miniatura(f)} 540w, ${f} 1200w`} sizes="(max-width: 600px) 92vw, (max-width: 960px) 46vw, 420px" alt={k === 0 ? titulo : `${titulo}, foto ${k + 1}`} width="1200" height="1600" loading={k === 0 && prioridade ? 'eager' : 'lazy'} fetchPriority={k === 0 && prioridade ? 'high' : undefined} decoding="async" draggable="false" />
          : <span key={f} className="foto-depois" aria-hidden="true" />))}
      </div>
      {selo && <span className="selo">{selo}</span>}
      {lista.length > 1 && <>
        {n > 0 && <button type="button" className="fotos-nav ant" aria-label="Foto anterior" onClick={(e) => ir(e, -1)}>‹</button>}
        {n < lista.length - 1 && <button type="button" className="fotos-nav prox" aria-label="Próxima foto" onClick={(e) => ir(e, 1)}>›</button>}
        <span className="fotos-pontos" aria-hidden="true">{lista.map((_, k) => <i key={k} className={k === n ? 'on' : ''} />)}</span>
      </>}
    </div>
  );
}
