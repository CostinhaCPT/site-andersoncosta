'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
export default function Topo() {
  const [a, setA] = useState(false);
  const [r, setR] = useState(false);
  useEffect(() => { const f = () => setR(window.scrollY > 40); f(); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, []);
  return (
    <header className={'topo' + (r ? ' rolou' : '')}>
      <div className="wrap">
        <Link href="/" className="logo" aria-label="Anderson Costa, página inicial"><img src="/marca/anderson-costa-horizontal-branco.svg" alt="Anderson Costa Negócios Imobiliários" /></Link>
        <button className="burger" aria-label="Abrir menu" onClick={() => setA(!a)}>{a ? '×' : '≡'}</button>
        <nav className={'menu' + (a ? ' aberto' : '')} onClick={() => setA(false)}>
          <Link href="/imoveis/">Imóveis</Link>
          <Link href="/metodo-compra-segura/">Método Compra Segura</Link>
          <Link href="/sobre/">Sobre</Link>
          <Link href="/contato/">Contato</Link>
          <Link href="/curadoria/" className="btn btn-claro">Receba sua curadoria</Link>
        </nav>
      </div>
    </header>
  );
}
