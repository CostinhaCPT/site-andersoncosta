import { BotaoWhats } from '@/components/Whats';
export const metadata = { title: 'Quanto vale seu imóvel em Jaraguá do Sul', description: 'Análise de preço com dados do seu bairro, plano de divulgação escrito, fotos e vídeo profissionais e anúncios para quem tem perfil para comprar.' , alternates: { canonical: '/anuncie-seu-imovel/' } };
export default function P() {
  return (
    <section className="sec escuro"><div className="wrap" style={{ maxWidth: 760 }}>
      <span className="eyebrow">Para proprietários</span>
      <h1>Quanto vale seu imóvel em Jaraguá do Sul hoje?</h1>
      <p className="muted">Te mostro com dados do seu bairro: o preço por m² dos imóveis parecidos que estão à venda e o que isso significa para o seu. A partir daí, monto um plano de divulgação por escrito, produzo fotos e vídeo e coloco o imóvel em anúncios para quem tem perfil e orçamento para comprar. Você acompanha cada contato.</p>
      <ul className="lista-check" style={{ margin: '24px 0' }}><li>Análise de preço com imóveis comparáveis do seu bairro</li><li>Plano de divulgação por escrito</li><li>Fotos e vídeo profissionais</li><li>Anúncios no Instagram e no Facebook para o público certo</li><li>Relatório de visitas e propostas</li></ul>
      <p style={{ marginBottom: 24 }}>Não prometo valor nem prazo de venda. Prometo um preço justificado com dados e um plano que você acompanha do começo ao fim.</p>
      <BotaoWhats texto="Olá, Anderson! Quero conversar sobre vender meu imóvel." dados={{ local: 'captacao' }}>Quero saber quanto vale meu imóvel</BotaoWhats>
    </div></section>
  );
}
