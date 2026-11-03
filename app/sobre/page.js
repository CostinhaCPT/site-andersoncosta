import Link from 'next/link';
import { SITE } from '@/lib/site';
export const metadata = { title: 'Sobre Anderson Costa', description: 'Corretor de imóveis em Jaraguá do Sul com quase 20 anos de experiência em marketing e vendas. ' + SITE.creci + '.' , alternates: { canonical: '/sobre/' } };
export default function P() {
  return (<>
    <section className="sec escuro"><div className="wrap duas-col">
      <div>
        <span className="eyebrow">Sobre · {SITE.creci}</span>
        <h1>Anderson Costa</h1>
        <p>Meu trabalho é que você compre o imóvel certo e durma tranquilo depois.</p>
        <p className="muted">Sou corretor de imóveis em Jaraguá do Sul e trabalho com uma ideia simples: o verdadeiro investimento é feito em confiança.</p>
        <p className="muted">Antes do mercado imobiliário, foram quase 20 anos em design, marketing e vendas, liderando times comerciais e de marketing. Dessa trajetória trouxe o que mais faz falta na compra de um imóvel: entender a fundo o que o cliente precisa, analisar com números e falar a verdade sobre cada opção.</p>
      </div>
      <img src="/img/anderson-sofa-2.webp" alt="Anderson Costa" className="foto-anderson" loading="lazy" />
    </div></section>
    <section className="sec"><div className="wrap">
      <span className="eyebrow">Como eu trabalho</span>
      <h2>Três compromissos com quem compra comigo</h2>
      <div className="passos">
        <div className="passo"><span className="n">01</span><h3>Falo do ponto fraco antes de você descobrir</h3><p>Cada imóvel que eu apresento vem com o que ele tem de bom e o que merece atenção. Se um imóvel não vale o preço pedido, eu te digo.</p></div>
        <div className="passo"><span className="n">02</span><h3>Mostro os números, não só as fotos</h3><p>Preço por m² comparado ao bairro, custo total com ITBI, escritura e registro, e simulação de financiamento antes de você decidir.</p></div>
        <div className="passo"><span className="n">03</span><h3>Não te apresso</h3><p>Comprar um imóvel é uma das maiores decisões da família. A decisão é sua, no seu tempo, com tudo na mesa.</p></div>
      </div>
      <p style={{ marginTop: 36 }}><Link href="/curadoria/" className="btn btn-escuro">Receba sua curadoria gratuita</Link></p>
    </div></section>
  </>);
}
