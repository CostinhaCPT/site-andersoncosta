'use client';
import { abrirWhats } from '@/lib/whats';
export const IconeWhats = ({ s = 26 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.5.2-.7.2-1.3.2-1.5-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z"/></svg>
);
export function BotaoWhats({ texto, dados, className = 'btn btn-whats', children }) {
  return <button className={className} onClick={() => abrirWhats(texto, dados)}><IconeWhats s={18} />{children}</button>;
}
export function WhatsFixo() {
  return <button className="whats-fixo" aria-label="Conversar no WhatsApp" onClick={() => abrirWhats('Olá, Anderson! Vim pelo site e quero conversar sobre imóveis.', { local: 'flutuante' })}><IconeWhats /></button>;
}
