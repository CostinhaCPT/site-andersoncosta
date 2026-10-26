'use client';
import { useEffect, useState } from 'react';
export default function Galeria({ fotos, titulo }) {
  const [i, setI] = useState(null);
  useEffect(() => {
    if (i === null) return;
    const k = (e) => { if (e.key === 'Escape') setI(null); if (e.key === 'ArrowRight') setI((i + 1) % fotos.length); if (e.key === 'ArrowLeft') setI((i - 1 + fotos.length) % fotos.length); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [i, fotos.length]);
  return (
    <>
      <div className="galeria">
        {fotos.slice(0, 3).map((f, n) => (
          <button key={f} style={{ backgroundImage: `url(${n === 0 ? f : f.replace('.webp', '-p.webp')})` }} onClick={() => setI(n)} aria-label={`Abrir foto ${n + 1} de ${titulo}`}>
            {n === (fotos.length > 2 ? 2 : 0) && <span className="mais">Ver as {fotos.length} fotos</span>}
          </button>
        ))}
      </div>
      {i !== null && (
        <div className="lightbox" onClick={() => setI(null)}>
          <img src={fotos[i]} alt={`${titulo}, foto ${i + 1}`} onClick={(e) => e.stopPropagation()} />
          <button className="x" aria-label="Fechar">×</button>
          <button className="nav ant" aria-label="Anterior" onClick={(e) => { e.stopPropagation(); setI((i - 1 + fotos.length) % fotos.length); }}>‹</button>
          <button className="nav prox" aria-label="Próxima" onClick={(e) => { e.stopPropagation(); setI((i + 1) % fotos.length); }}>›</button>
          <span className="cont">{i + 1} / {fotos.length}</span>
        </div>
      )}
    </>
  );
}
