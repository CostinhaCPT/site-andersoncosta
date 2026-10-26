import { BotaoWhats } from '@/components/Whats';
export const metadata = { title: 'Quero vender meu imóvel', description: 'Venda seu imóvel em Jaraguá do Sul com análise de preço, fotos e vídeo profissional e anúncios direcionados.' };
export default function P() {
  return (
    <section className="sec escuro"><div className="wrap" style={{ maxWidth: 760 }}>
      <span className="eyebrow">Para proprietários</span>
      <h1>Quer vender seu imóvel?</h1>
      <p className="muted">Faço a análise de preço com base no mercado do bairro, produzo fotos e vídeo com drone e coloco o imóvel em anúncios direcionados para quem tem perfil e orçamento para comprar. Você acompanha cada contato.</p>
      <ul className="lista-check" style={{ margin: '24px 0' }}><li>Avaliação de preço por m² no seu bairro</li><li>Fotos, vídeo e drone</li><li>Anúncios no Instagram e Facebook para o público certo</li><li>Relatório de visitas e propostas</li></ul>
      <BotaoWhats texto="Olá, Anderson! Quero conversar sobre vender meu imóvel." dados={{ local: 'captacao' }}>Quero avaliar meu imóvel</BotaoWhats>
    </div></section>
  );
}
