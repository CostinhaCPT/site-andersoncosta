import Catalogo from '@/components/Catalogo';
import { imoveis, paraCard } from '@/lib/imoveis';
export const metadata = { title: 'Imóveis à venda em Jaraguá do Sul', description: 'Casas, geminados e apartamentos à venda em Jaraguá do Sul com análise de preço por m², pontos de atenção de cada imóvel e simulação de financiamento.', alternates: { canonical: '/imoveis/' } };
export default function Pagina() {
  return (
    <section className="cat"><div className="wrap">
      <div className="cat-topo">
        <span className="eyebrow">Jaraguá do Sul e região</span>
        <h1>Imóveis à venda</h1>
        <p className="muted">Cada ficha traz o preço do m² comparado ao bairro, o que o imóvel tem de bom e o que merece atenção.</p>
      </div>
      <Catalogo lista={imoveis.map((i) => paraCard(i, 6))} />
    </div></section>
  );
}
