import FormLead from '@/components/FormLead';
export const metadata = { title: 'Receba sua curadoria gratuita', description: 'Conte o que sua família procura e receba os 3 imóveis que fazem sentido, com análise de preço e o que cada um tem de bom e de ruim.' , alternates: { canonical: '/curadoria/' } };
export default function P() {
  return (
    <>
    <section className="sec escuro" style={{ minHeight: '70vh' }}><div className="wrap duas-col" style={{ alignItems: 'start' }}>
      <div>
        <span className="eyebrow">Curadoria gratuita</span>
        <h1>Receba os 3 imóveis que fazem sentido para você</h1>
        <p className="muted">Responda 7 perguntas rápidas. Você cai direto no meu WhatsApp e, em até 48 horas, eu volto com a seleção e a análise de compra de cada imóvel.</p>
        <ul className="lista-check" style={{ marginTop: 24 }}><li>Os 3 imóveis certos para a sua rotina</li><li>Preço por m² comparado ao bairro</li><li>Simulação de financiamento com os bancos</li><li>O que cada imóvel tem de bom e o que merece atenção</li></ul>
        <p className="muted" style={{ marginTop: 20 }}>O que não é: uma lista de 30 links, nem pressão para fechar.</p>
      </div>
      <FormLead titulo="" escuro />
    </div></section>
    <section className="sec"><div className="wrap">
      <span className="eyebrow">Antes de pedir</span>
      <h2>Perguntas que eu sempre recebo</h2>
      <div className="passos passos-4">
        <div className="passo"><h3>É gratuito mesmo?</h3><p>Sim. Quem me paga é o vendedor, na venda, como é padrão no mercado. Você não paga nada pela curadoria.</p></div>
        <div className="passo"><h3>E se eu não gostar de nenhum?</h3><p>A gente ajusta o que não serviu e eu volto com outras opções. Não existe compromisso de compra.</p></div>
        <div className="passo"><h3>Atende quem vai financiar ou usar FGTS?</h3><p>Sim. Faço a simulação com os bancos e te mostro quanto você precisa ter de entrada e quanto fica a parcela.</p></div>
        <div className="passo"><h3>Quais cidades?</h3><p>Jaraguá do Sul, Guaramirim, Schroeder, Corupá e Massaranduba.</p></div>
      </div>
    </div></section>
    </>
  );
}
