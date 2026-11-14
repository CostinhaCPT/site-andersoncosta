import Catalogo from '@/components/Catalogo';
import { imoveis, paraCard } from '@/lib/imoveis';
export const metadata = { title: 'Imóveis à venda em Jaraguá do Sul', description: 'Casas, geminados e apartamentos à venda em Jaraguá do Sul com análise de preço por m² e simulação de financiamento.', alternates: { canonical: '/imoveis/' } };
export default function Pagina() {
  return (
    <section className="sec cinza-bg"><div className="wrap">
      <span className="eyebrow">Catálogo</span><h1>Imóveis à venda</h1>
      <p className="muted">Cada imóvel tem análise de preço por m² e simulação de financiamento. Não achou o que procura? A curadoria encontra para você.</p>
      <Catalogo lista={imoveis.map((i) => paraCard(i, 6))} />
    </div></section>
  );
}
