'use client';
import { evento, codigoRef } from '@/lib/whats';
// Link simples para o WhatsApp que também registra o clique (Pixel, GA4 e API de Conversões).
export default function LinkWhats({ href, local, className, children }) {
  return (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noopener"
      onClick={() => { try { evento('whatsapp_click', { ref: codigoRef(), local, pagina: location.pathname }); } catch (e) {} }}
    >
      {children}
    </a>
  );
}
