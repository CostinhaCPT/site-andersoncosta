import { SITE } from '@/lib/site';

// Perguntas frequentes com a marcação FAQPage, que o Google e os buscadores com IA leem como resposta direta.
export default function Perguntas({ itens, titulo = 'Perguntas frequentes', url }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    ...(url ? { url: SITE.dominio + url } : {}),
    mainEntity: itens.map(([p, r]) => ({ '@type': 'Question', name: p, acceptedAnswer: { '@type': 'Answer', text: r } })),
  };
  return (
    <>
      <h2>{titulo}</h2>
      <div style={{ marginTop: 16 }}>
        {itens.map(([p, r]) => (
          <details key={p} className="lp-faq"><summary>{p}</summary><p>{r}</p></details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </>
  );
}
