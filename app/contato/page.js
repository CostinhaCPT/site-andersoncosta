import FormLead from '@/components/FormLead';
import { BotaoWhats } from '@/components/Whats';
import { SITE } from '@/lib/site';
export const metadata = { title: 'Contato', description: 'Fale com Anderson Costa, corretor de imóveis em Jaraguá do Sul.' };
export default function P() {
  return (
    <section className="sec cinza-bg"><div className="wrap duas-col" style={{ alignItems: 'start' }}>
      <div>
        <span className="eyebrow">Contato</span><h1>Vamos conversar</h1>
        <p>Atendo pessoalmente, pelo WhatsApp, de segunda a sábado.</p>
        <p><b>WhatsApp:</b> {SITE.telefoneVisivel}<br /><b>Região:</b> Jaraguá do Sul, Guaramirim, Schroeder, Corupá e Massaranduba<br /><b>{SITE.creci}</b></p>
        <BotaoWhats texto="Olá, Anderson! Vim pela página de contato do site." dados={{ local: 'contato' }}>Chamar no WhatsApp</BotaoWhats>
        <p style={{ marginTop: 16 }}><a href={`tel:+${SITE.whatsapp}`}>Ou ligue: {SITE.telefoneVisivel}</a></p>
      </div>
      <FormLead titulo="Prefere que eu chame você?" botao="Enviar" />
    </div></section>
  );
}
