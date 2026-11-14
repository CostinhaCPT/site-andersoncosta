'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { abrirWhats, evento } from '@/lib/whats';
export const IconeWhats = ({ s = 26 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.5.2-.7.2-1.3.2-1.5-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z"/></svg>
);
export function BotaoWhats({ texto, dados, className = 'btn btn-whats', children }) {
  return <button className={className} onClick={() => abrirWhats(texto, dados)}><IconeWhats s={18} />{children}</button>;
}
// Chamada que aparece ao lado do botão depois de alguns segundos, conforme a página.
// Uma vez por sessão para cada tipo de página; quem fecha não vê de novo por 3 dias.
const K_FECHOU = 'ac_whats_convite_fechado';
function chamadaPara(p, im) {
  if (im?.codigo) return { k: 'imovel', t: 'Gostou deste imóvel? Tenho mais informações sobre ele, inclusive o que as fotos não mostram.', ms: 2500 };
  if (p.startsWith('/imoveis')) return { k: 'catalogo', t: 'Não achou exatamente o que procura? Me conta o que sua família precisa que eu procuro para você.', ms: 3000 };
  if (p.startsWith('/curadoria')) return { k: 'curadoria', t: 'Prefere pelo WhatsApp? Me manda uma mensagem e eu já começo a sua curadoria.', ms: 3000 };
  if (p.startsWith('/anuncie')) return { k: 'vender', t: 'Pensando em vender? Te explico como avalio e divulgo o seu imóvel.', ms: 3000 };
  if (p.startsWith('/metodo')) return { k: 'metodo', t: 'Quer ver como o método funciona no seu caso? Me chama que eu te explico.', ms: 3000 };
  if (p.startsWith('/lp')) return { k: 'lp', t: 'Quer mais detalhes, fotos ou vídeo? Estou aqui para te ajudar.', ms: 3000 };
  return { k: 'geral', t: 'Está procurando um imóvel? Estou aqui para te ajudar.', ms: 3000 };
}
function mensagemWhats(im, k) {
  if (im?.codigo) return `Olá! Vi no site o imóvel "${im.titulo}" (ref. ${im.codigo}) e quero saber mais.`;
  if (k === 'vender') return 'Olá, Anderson! Vim pelo site e estou pensando em vender meu imóvel.';
  return 'Olá, Anderson! Vim pelo site e quero conversar sobre imóveis.';
}
export function WhatsFixo() {
  const pathname = usePathname() || '';
  const [chamada, setChamada] = useState(null);
  useEffect(() => {
    setChamada(null);
    let fechou = null;
    try { fechou = Number(localStorage.getItem(K_FECHOU)) || null; } catch (e) {}
    if (fechou && Date.now() - fechou < 3 * 864e5) return;
    // espera a ficha do imóvel registrar qual é o imóvel antes de decidir a frase
    const t = setTimeout(() => {
      const c = chamadaPara(pathname, window.__acImovel);
      let visto = null;
      try { visto = sessionStorage.getItem('ac_whats_convite_' + c.k); } catch (e) {}
      if (visto) return;
      try { sessionStorage.setItem('ac_whats_convite_' + c.k, '1'); } catch (e) {}
      setChamada(c);
      evento('whats_convite', { tipo: c.k, pagina: pathname });
      // sai sozinha depois de um tempo para não ficar em cima do conteúdo; o botão continua lá
      t2 = setTimeout(() => setChamada(null), 12000);
    }, pathname.startsWith('/imovel/') ? 2500 : 3000);
    let t2;
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [pathname]);
  const abrir = (origemClique) => {
    const im = typeof window !== 'undefined' ? window.__acImovel : null;
    const k = chamada?.k || chamadaPara(pathname, im).k;
    setChamada(null);
    abrirWhats(mensagemWhats(im, k), { local: origemClique, ...(im?.codigo ? { imovel: im.codigo } : {}) });
  };
  const fechar = (e) => {
    e.stopPropagation();
    setChamada(null);
    try { localStorage.setItem(K_FECHOU, String(Date.now())); } catch (e2) {}
  };
  return (
    <>
      {chamada && (
        <div className="whats-convite" role="button" tabIndex={0} onClick={() => abrir('convite')} onKeyDown={(e) => e.key === 'Enter' && abrir('convite')}>
          <button className="whats-convite-x" aria-label="Fechar" onClick={fechar}>×</button>
          <span className="whats-convite-quem"><i aria-hidden="true" />Anderson Costa</span>
          <span className="whats-convite-texto">{chamada.t}</span>
          <span className="whats-convite-cta">Conversar agora</span>
        </div>
      )}
      <button className="whats-fixo" aria-label="Conversar no WhatsApp" onClick={() => abrir('flutuante')}><IconeWhats /></button>
    </>
  );
}
