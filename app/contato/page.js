import FormLead from '@/components/FormLead';
import { BotaoWhats } from '@/components/Whats';
import { SITE } from '@/lib/site';
export const metadata = { title: 'Contato', description: 'Fale com Anderson Costa, corretor de imóveis em Jaraguá do Sul.' , alternates: { canonical: '/contato/' } };
export default function P() {
  return (
    <section className="sec cinza-bg"><div className="wrap duas-col" style={{ alignItems: 'start' }}>
      <div>
        <span className="eyebrow">Contato</span><h1>Vamos conversar</h1>
        <p>Atendo pessoalmente, de segunda a sábado, das 8h às 19h. Fora desse horário, a minha assistente virtual, no chat do site, anota o que você precisa e eu continuo de onde ela parou.</p>
        <p><b>WhatsApp:</b> {SITE.telefoneVisivel}<br /><b>E-mail:</b> <a href={`mailto:${SITE.email}`}>{SITE.email}</a><br /><b>Região:</b> Jaraguá do Sul, Guaramirim, Schroeder, Corupá e Massaranduba<br /><b>{SITE.creci}</b></p>
        <BotaoWhats texto="Olá, Anderson! Vim pela página de contato do site." dados={{ local: 'contato' }}>Chamar no WhatsApp</BotaoWhats>
        <p style={{ marginTop: 16 }}><a href={`tel:+${SITE.whatsapp}`}>Ou ligue: {SITE.telefoneVisivel}</a></p>
      </div>
      <FormLead titulo="Prefere adiantar o que procura?" botao="Mandar no WhatsApp" />
    </div></section>
  );
}
