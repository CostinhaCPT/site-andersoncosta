'use client';
import { useEffect } from 'react';
import { contarImovel } from '@/lib/whats';
export default function ContarVisita({ codigo, titulo }) {
  useEffect(() => {
    contarImovel(codigo, 'view');
    // O botão flutuante de WhatsApp usa isso para já abrir a conversa falando deste imóvel
    window.__acImovel = { codigo, titulo };
    return () => { if (window.__acImovel?.codigo === codigo) window.__acImovel = null; };
  }, [codigo, titulo]);
  return null;
}
