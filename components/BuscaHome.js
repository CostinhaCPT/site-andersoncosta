'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { evento } from '@/lib/whats';
// Busca da primeira tela: três escolhas e um botão, que abrem o catálogo já filtrado.
export default function BuscaHome({ tipos, bairros }) {
  const router = useRouter();
  const [f, setF] = useState({ tipo: '', bairro: '', faixa: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ir = (e) => {
    e.preventDefault();
    const p = new URLSearchParams(); Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
    evento('busca_home', { ...f });
    router.push('/imoveis/' + (p.toString() ? '?' + p : ''));
  };
  return (
    <form className="busca" onSubmit={ir} role="search">
      <label className="busca-campo"><span>Tipo</span>
        <select value={f.tipo} onChange={set('tipo')}><option value="">Todos</option>{tipos.map(([s, n]) => <option key={s} value={s}>{n}</option>)}</select>
      </label>
      <label className="busca-campo"><span>Bairro</span>
        <select value={f.bairro} onChange={set('bairro')}><option value="">Todos os bairros</option>{bairros.map(([s, n]) => <option key={s} value={s}>{n}</option>)}</select>
      </label>
      <label className="busca-campo"><span>Valor</span>
        <select value={f.faixa} onChange={set('faixa')}><option value="">Qualquer valor</option><option value="ate-850">Até R$ 850 mil</option><option value="850-1000">R$ 850 mil a 1 milhão</option><option value="acima-1000">Acima de R$ 1 milhão</option></select>
      </label>
      <button className="busca-ir" type="submit">Ver imóveis</button>
    </form>
  );
}
