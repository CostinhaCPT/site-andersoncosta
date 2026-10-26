import { SITE } from '@/lib/site';
export const metadata = { title: 'Política de privacidade' };
export default function P() {
  return (
    <section className="sec"><div className="wrap texto-legal" style={{ maxWidth: 780 }}>
      <h1>Política de privacidade</h1>
      <p className="muted">Última atualização: outubro de 2026.</p>
      <p>Este site é mantido por Anderson Costa, corretor de imóveis, {SITE.creci}, que é o controlador dos dados pessoais tratados aqui, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
      <h2>Quais dados coleto</h2>
      <p>Os dados que você informa nos formulários (nome, WhatsApp, cidade ou bairro, faixa de orçamento, tipo de imóvel, objetivo e prazo) e, se você autorizar no aviso de cookies, dados de navegação como páginas visitadas e a campanha de anúncio que trouxe você ao site.</p>
      <h2>Para que uso</h2>
      <p>Para atender o seu pedido, enviar imóveis compatíveis, agendar visitas e medir quais anúncios funcionam. Não vendo nem compartilho seus dados com terceiros para fins de marketing. Quando um imóvel é de parceiro, compartilho apenas o necessário para a visita ou negociação.</p>
      <h2>Cookies</h2>
      <p>Uso ferramentas do Google e da Meta para medir o desempenho do site e dos anúncios. Elas só são ativadas se você aceitar no aviso de cookies. Você pode mudar a escolha limpando os dados do site no seu navegador.</p>
      <h2>Por quanto tempo guardo</h2>
      <p>Enquanto houver relacionamento comercial e, depois disso, pelo prazo necessário para cumprir obrigações legais.</p>
      <h2>Seus direitos</h2>
      <p>Você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento pelo WhatsApp {SITE.telefoneVisivel}.</p>
    </div></section>
  );
}
