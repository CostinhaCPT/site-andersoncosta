'use client';
import { useEffect, useRef, useState } from 'react';
import { miniatura } from '@/lib/format';
export default function Galeria({ fotos, titulo, video }) {
  const [i, setI] = useState(null);
  const [n, setN] = useState(0);
  const trilho = useRef(null);
  const toque = useRef(null);
  const total = fotos.length;
  const prox = () => setI((x) => (x + 1) % total);
  const ant = () => setI((x) => (x - 1 + total) % total);
  useEffect(() => {
    if (i === null) return;
    const k = (e) => { if (e.key === 'Escape') setI(null); if (e.key === 'ArrowRight') prox(); if (e.key === 'ArrowLeft') ant(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [i, total]);
  const ini = (e) => { toque.current = e.touches[0].clientX; };
  const fim = (e) => { if (toque.current == null) return; const d = e.changedTouches[0].clientX - toque.current; toque.current = null; if (Math.abs(d) > 40) (d < 0 ? prox : ant)(); };
  return (
    <>
      <div className={'galeria g' + Math.min(5, total)}>
        {fotos.slice(0, 5).map((f, k) => (
          <button key={f} type="button" onClick={() => setI(k)} aria-label={`Abrir foto ${k + 1} de ${titulo}`}>
            <img src={k === 0 ? f : miniatura(f)} alt={k === 0 ? titulo : ''} loading={k === 0 ? 'eager' : 'lazy'} fetchPriority={k === 0 ? 'high' : undefined} decoding="async" />
          </button>
        ))}
        <span className="galeria-acoes">
          {video && <a href="#video" className="galeria-chip">▶ Vídeo</a>}
          <button type="button" className="galeria-chip" onClick={() => setI(0)}>Ver as {total} fotos</button>
        </span>
      </div>
      {/* celular: arrasta para o lado direto na página */}
      <div className="galeria-movel">
        <div className="fotos-trilho" ref={trilho} onScroll={() => { const el = trilho.current; if (el) setN(Math.round(el.scrollLeft / el.clientWidth)); }}>
          {fotos.map((f, k) => <img key={f} src={k < 2 ? f : miniatura(f)} alt={`${titulo}, foto ${k + 1}`} loading={k === 0 ? 'eager' : 'lazy'} decoding="async" onClick={() => setI(k)} />)}
        </div>
        <span className="cont-movel">{n + 1} / {total}</span>
        {video && <a href="#video" className="galeria-chip galeria-chip-movel">▶ Vídeo</a>}
      </div>
      {i !== null && (
        <div className="lightbox" onClick={() => setI(null)} onTouchStart={ini} onTouchEnd={fim}>
          <img src={fotos[i]} alt={`${titulo}, foto ${i + 1}`} onClick={(e) => e.stopPropagation()} />
          <button className="x" aria-label="Fechar">×</button>
          <button className="nav ant" aria-label="Anterior" onClick={(e) => { e.stopPropagation(); ant(); }}>‹</button>
          <button className="nav prox" aria-label="Próxima" onClick={(e) => { e.stopPropagation(); prox(); }}>›</button>
          <span className="cont">{i + 1} / {total}</span>
        </div>
      )}
    </>
  );
}
