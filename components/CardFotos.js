'use client';
import { useRef, useState } from 'react';
import { miniatura } from '@/lib/format';
// Fotos do card: arrasta para o lado no celular (scroll-snap nativo), setas no computador.
export default function CardFotos({ fotos, titulo, selo, max = 8, prioridade = false }) {
  const lista = (fotos || []).slice(0, max);
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
        {lista.map((f, k) => (
          <img key={f} src={miniatura(f)} alt={k === 0 ? titulo : `${titulo}, foto ${k + 1}`} loading={k === 0 && prioridade ? 'eager' : 'lazy'} decoding="async" draggable="false" />
        ))}
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
