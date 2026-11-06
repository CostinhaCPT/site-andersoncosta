'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import 'leaflet/dist/leaflet.css';
const mil = (v) => (v >= 1e6 ? `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi` : `R$ ${Math.round(v / 1e3)} mil`);
const faixa = (b) => (b.min == null ? 'Valores sob consulta' : b.min === b.max ? mil(b.min) : `${mil(b.min)} a ${mil(b.max)}`);
// Mapa de bairros: um ponto por bairro (sem endereço exato dos imóveis), tamanho pelo número de opções.
export default function MapaBairros({ bairros }) {
  const caixa = useRef(null);
  const mapa = useRef(null);
  const pinos = useRef({});
  const [ativo, setAtivo] = useState(null);
  const [todos, setTodos] = useState(false);
  useEffect(() => {
    let vivo = true;
    import('leaflet').then(({ default: L }) => {
      if (!vivo || !caixa.current || mapa.current) return;
      const toque = window.matchMedia('(hover: none)').matches;
      const m = L.map(caixa.current, { scrollWheelZoom: false, dragging: !toque, zoomControl: true, attributionControl: true });
      mapa.current = m;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(m);
      if (toque) m.once('click', () => m.dragging.enable());
      const maxT = Math.max(...bairros.map((b) => b.total));
      const camadaBairros = L.layerGroup(), camadaCidades = L.layerGroup();
      bairros.forEach((b) => {
        const t = Math.round(26 + 18 * Math.sqrt(b.total / maxT));
        const icon = L.divIcon({ className: 'pino-bairro', html: `<span style="width:${t}px;height:${t}px">${b.total}</span><em>${b.bairro}</em>`, iconSize: [t, t], iconAnchor: [t / 2, t / 2] });
        const mk = L.marker([b.lat, b.lng], { icon, title: `${b.bairro}: ${b.total} imóveis`, riseOnHover: true }).addTo(camadaBairros);
        const fotos = b.fotos.map((f) => `<img src="${f}" alt="" loading="lazy">`).join('');
        mk.bindPopup(`<div class="pop-bairro"><div class="pop-fotos">${fotos}</div><b>${b.bairro}</b><span>${b.cidade} · ${b.total} imóve${b.total === 1 ? 'l' : 'is'}</span><span>${faixa(b)}</span><a href="${b.url}">Ver os imóveis do bairro →</a></div>`, { maxWidth: 260, minWidth: 220, autoPanPadding: [20, 20] });
        mk.on('click', () => setAtivo(b.url));
        pinos.current[b.url] = mk;
      });
      // visão afastada: um ponto por cidade; ao aproximar, abre nos bairros
      const cidades = new Map();
      bairros.forEach((b) => { const c = cidades.get(b.cidade) || { nome: b.cidade, total: 0, lat: 0, lng: 0, n: 0, pts: [] }; c.total += b.total; c.lat += b.lat; c.lng += b.lng; c.n++; c.pts.push([b.lat, b.lng]); cidades.set(b.cidade, c); });
      cidades.forEach((c) => {
        const icon = L.divIcon({ className: 'pino-bairro pino-cidade', html: `<span style="width:52px;height:52px">${c.total}</span><em>${c.nome}</em>`, iconSize: [52, 52], iconAnchor: [26, 26] });
        L.marker([c.lat / c.n, c.lng / c.n], { icon, title: `${c.nome}: ${c.total} imóveis` }).on('click', () => m.flyToBounds(L.latLngBounds(c.pts), { padding: [40, 40], maxZoom: 14, duration: 0.6 })).addTo(camadaCidades);
      });
      const trocar = () => {
        const z = m.getZoom();
        if (z >= 12) { if (m.hasLayer(camadaCidades)) m.removeLayer(camadaCidades); if (!m.hasLayer(camadaBairros)) m.addLayer(camadaBairros); }
        else { if (m.hasLayer(camadaBairros)) m.removeLayer(camadaBairros); if (!m.hasLayer(camadaCidades)) m.addLayer(camadaCidades); }
        caixa.current && caixa.current.classList.toggle('mostra-nomes', z >= 14);
      };
      m.on('zoomend', trocar);
      // começa no miolo de Jaraguá do Sul (bairros com mais opções); afastando, aparecem as cidades vizinhas
      const miolo = bairros.filter((b) => b.cidade === 'Jaraguá do Sul' && b.total >= 5);
      m.fitBounds(L.latLngBounds((miolo.length ? miolo : bairros).map((b) => [b.lat, b.lng])), { padding: [24, 24] });
      trocar();
    });
    return () => { vivo = false; if (mapa.current) { mapa.current.remove(); mapa.current = null; } };
  }, [bairros]);
  const focar = (b) => { const m = mapa.current, mk = pinos.current[b.url]; if (!m || !mk) return; setAtivo(b.url); m.flyTo([b.lat, b.lng], 14, { duration: 0.6 }); m.once('moveend', () => mk.openPopup()); caixa.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  const lista = todos ? bairros : bairros.slice(0, 8);
  return (
    <div className="mapa-bairros">
      <div className="mapa-caixa" ref={caixa} aria-label="Mapa dos bairros com imóveis" />
      <div className="mapa-lista">
        <p className="muted mapa-dica">Toque em um bairro no mapa ou na lista para ver a faixa de preço e as fotos.</p>
        <ul>
          {lista.map((b) => (
            <li key={b.url} className={ativo === b.url ? 'on' : ''}>
              <button type="button" onClick={() => focar(b)}><b>{b.bairro}</b><span>{b.cidade !== 'Jaraguá do Sul' ? b.cidade + ' · ' : ''}{faixa(b)}</span></button>
              <Link href={b.url} aria-label={`Ver os ${b.total} imóveis em ${b.bairro}`}>{b.total}</Link>
            </li>
          ))}
        </ul>
        {bairros.length > 8 && <button type="button" className="btn btn-borda mapa-mais" onClick={() => setTodos(!todos)}>{todos ? 'Mostrar menos' : `Ver todos os ${bairros.length} bairros`}</button>}
      </div>
    </div>
  );
}
