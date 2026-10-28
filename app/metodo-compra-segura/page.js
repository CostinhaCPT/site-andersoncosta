import Link from 'next/link';
export const metadata = { title: 'Método Compra Segura', description: 'Curadoria, análise de compra e vídeo honesto: como eu ajudo famílias a comprar o imóvel certo em Jaraguá do Sul.' };
export default function P() {
  return (<>
    <section className="hero escuro"><div className="wrap">
      <span className="eyebrow">Método Compra Segura</span><h1>Menos links, mais clareza para decidir</h1>
      <p className="lead">Comprar um imóvel melhor para a família é uma das maiores decisões financeiras da vida. Eu organizo essa decisão em três entregas, para você comparar com números e sem pressa.</p>
      <div className="acoes"><Link href="/curadoria/" className="btn btn-claro">Receba sua curadoria gratuita</Link></div>
    </div></section>
    <section className="sec"><div className="wrap">
      <div className="passos" style={{ marginTop: 0 }}>
        <div className="passo"><span className="n">01 · CURADORIA</span><h3>Os 3 que fazem sentido</h3><p>Antes de mostrar qualquer imóvel, entendo a rotina da família: escola, trabalho, quantos carros, se precisam de quintal, quanto querem investir. Com isso, seleciono os 3 imóveis que realmente atendem, incluindo opções fora do site.</p></div>
        <div className="passo"><span className="n">02 · ANÁLISE DE COMPRA</span><h3>Os números na mesa</h3><p>Para cada imóvel: preço por m² comparado ao bairro, custo total de aquisição (ITBI de 2% em Jaraguá do Sul, escritura e registro), simulação de financiamento e checklist dos documentos que precisam ser conferidos.</p></div>
        <div className="passo"><span className="n">03 · VÍDEO HONESTO</span><h3>O que é bom e o que pesa</h3><p>Posso gravar um tour de cada imóvel mostrando os pontos fortes e também os pontos de atenção. Você chega na visita sabendo o que olhar e sem perder tempo com o que não serve.</p></div>
      </div>
    </div></section>
    <section className="sec cinza-bg"><div className="wrap duas-col">
      <div><h2>Para quem é</h2><p>Famílias que querem trocar para um imóvel melhor, entre R$ 600 mil e R$ 1 milhão, e compradores que buscam patrimônio acima disso, em Jaraguá do Sul, Guaramirim, Schroeder, Corupá e Massaranduba.</p></div>
      <div><h2>Quanto custa</h2><p>A curadoria é gratuita para quem compra. Minha remuneração vem da comissão de venda, paga pelo vendedor, como é padrão no mercado. Financiamento e permuta do seu imóvel atual eu oriento sem custo.</p></div>
    </div></section>
  </>);
}
