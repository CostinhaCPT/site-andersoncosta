'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { abrirWhats } from '@/lib/whats';
import { IconeWhats } from './Whats';
const MENU = [
  ['/imoveis/', 'Imóveis'],
  ['/curadoria/', 'Curadoria'],
  ['/metodo-compra-segura/', 'Como eu trabalho'],
  ['/anuncie-seu-imovel/', 'Vender meu imóvel'],
  ['/sobre/', 'Sobre'],
];
export default function Topo() {
  const [a, setA] = useState(false);
  const [r, setR] = useState(false);
  const p = usePathname() || '';
  useEffect(() => { const f = () => setR(window.scrollY > 40); f(); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, []);
  useEffect(() => { setA(false); }, [p]);
  const conversar = () => abrirWhats('Olá, Anderson! Vim pelo site e quero conversar sobre imóveis.', { local: 'topo' });
  return (
    <header className={'topo' + (r ? ' rolou' : '') + (a ? ' aberto' : '')}>
      <div className="wrap">
        <Link href="/" className="logo"><img src="/marca/anderson-costa-wordmark-preto.svg" alt="Anderson Costa Negócios Imobiliários" width="1554" height="112" /></Link>
        <nav className={'menu' + (a ? ' aberto' : '')} aria-label="Principal">
          {MENU.map(([h, t]) => <Link key={h} href={h} aria-current={p.startsWith(h) ? 'page' : undefined}>{t}</Link>)}
          <button type="button" className="menu-conversar" onClick={conversar}>
            <IconeWhats s={18} />
            Conversar comigo
          </button>
        </nav>
        <button className="burger" aria-label={a ? 'Fechar menu' : 'Abrir menu'} aria-expanded={a} onClick={() => setA(!a)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{a ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 8h16M4 16h16" />}</svg>
        </button>
      </div>
    </header>
  );
}
