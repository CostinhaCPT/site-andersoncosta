'use client';
import { useEffect } from 'react';
import { contarImovel, evento } from '@/lib/whats';
export default function ContarVisita({ codigo, titulo, valor, perfil }) {
  useEffect(() => {
    contarImovel(codigo, 'view');
    // ViewContent (Pixel via GTM e API de Conversões com o mesmo event_id). valor só quando o preço é público
    evento('imovel_view', { imovel: codigo, content_type: 'home_listing', valor: valor || null, currency: 'BRL' });
    // O botão flutuante de WhatsApp usa isso para já abrir a conversa falando deste imóvel
    window.__acImovel = { codigo, titulo, valor };
    // Histórico local (só neste navegador) para a vitrine "Para você" da home: últimos 12 imóveis abertos
    try {
      const v = JSON.parse(localStorage.getItem('ac_vistos') || '[]').filter((x) => x.codigo !== codigo);
      v.unshift({ codigo, ...(perfil || {}) });
      localStorage.setItem('ac_vistos', JSON.stringify(v.slice(0, 12)));
    } catch {}
    return () => { if (window.__acImovel?.codigo === codigo) window.__acImovel = null; };
  }, [codigo, titulo, valor]);
  return null;
}
