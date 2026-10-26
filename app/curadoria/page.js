import FormLead from '@/components/FormLead';
export const metadata = { title: 'Receba sua curadoria gratuita', description: 'Conte o que sua família procura e receba os 3 imóveis que fazem sentido, com análise de preço e custo total.' };
export default function P() {
  return (
    <section className="sec escuro" style={{ minHeight: '70vh' }}><div className="wrap duas-col" style={{ alignItems: 'start' }}>
      <div>
        <span className="eyebrow">Curadoria gratuita</span>
        <h1>Receba os 3 imóveis que fazem sentido para você</h1>
        <p className="muted">Responda 7 perguntas rápidas. Você cai direto no meu WhatsApp e eu volto em até um dia útil com a seleção e a análise de compra de cada imóvel.</p>
        <ul className="lista-check" style={{ marginTop: 24 }}><li>Sem lista de 30 links</li><li>Preço por m² comparado ao bairro</li><li>Custo total com ITBI, escritura e registro</li><li>Vídeo honesto com pontos de atenção</li></ul>
      </div>
      <FormLead titulo="" escuro />
    </div></section>
  );
}
