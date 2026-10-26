import Link from 'next/link';
import { SITE } from '@/lib/site';
export const metadata = { title: 'Sobre Anderson Costa', description: 'Corretor de imóveis em Jaraguá do Sul com quase 20 anos de experiência em marketing e vendas. ' + SITE.creci + '.' };
export default function P() {
  return (<>
    <section className="sec escuro"><div className="wrap duas-col">
      <div>
        <span className="eyebrow">Sobre · {SITE.creci}</span>
        <h1>Anderson Costa</h1>
        <p>Sou corretor de imóveis em Jaraguá do Sul e trabalho com uma ideia simples: o verdadeiro investimento é feito em confiança.</p>
        <p className="muted">Antes do mercado imobiliário, foram quase 20 anos em design, marketing e vendas, liderando times comerciais e de marketing. Dessa trajetória trouxe o que mais faz falta na compra de um imóvel: entender a fundo o que o cliente precisa, analisar com números e falar a verdade sobre cada opção.</p>
      </div>
      <img src="/img/anderson-sofa-2.webp" alt="Anderson Costa" className="foto-anderson" loading="lazy" />
    </div></section>
    <section className="sec"><div className="wrap">
      <div className="passos" style={{ marginTop: 0 }}>
        <div className="passo"><span className="n">MISSÃO</span><p style={{ marginTop: 12 }}>Guiar investidores e compradores com inteligência e transparência, oferecendo um olhar consultivo que une estratégia, propósito e relacionamento humano.</p></div>
        <div className="passo"><span className="n">VISÃO</span><p style={{ marginTop: 12 }}>Ser reconhecido como o corretor que vai além da venda: um parceiro de confiança, referência em performance, análise e experiência personalizada.</p></div>
        <div className="passo"><span className="n">VALORES</span><p style={{ marginTop: 12 }}>Transparência, relacionamento, confiança e resultado com integridade.</p></div>
      </div>
      <p style={{ marginTop: 36 }}><Link href="/curadoria/" className="btn btn-escuro">Receba sua curadoria gratuita</Link></p>
    </div></section>
  </>);
}
