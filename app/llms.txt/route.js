// llms.txt: resumo do site para buscadores com IA (ChatGPT, Perplexity, Gemini, Claude).
// Gerado no build, com os números do catálogo do dia.
import { imoveis, bairros } from '@/lib/imoveis';
import { BAIRROS_M2, FONTE_M2 } from '@/lib/bairros-m2';
import { brl, num } from '@/lib/format';
import { SITE } from '@/lib/site';
import { perguntas } from '@/lib/perguntas';
export const dynamic = 'force-static';
export function GET() {
  const d = SITE.dominio;
  const precos = imoveis.filter((i) => i.precoVisivel && i.preco).map((i) => i.preco).sort((a, b) => a - b);
  const tipos = imoveis.reduce((m, i) => m.set(i.tipo, (m.get(i.tipo) || 0) + 1), new Map());
  const linhas = [
    `# ${SITE.marca}`,
    '',
    `> Anderson Costa é corretor de imóveis em Jaraguá do Sul, Santa Catarina (${SITE.creci}). Atende quem quer comprar ou vender casa, geminado ou apartamento em Jaraguá do Sul, Guaramirim, Schroeder, Corupá e Massaranduba, e assessora investidores de todo o Brasil e do exterior na compra de imóveis em Itapema e Porto Belo, no litoral de Santa Catarina. Trabalha pelo Método Compra Segura: curadoria dos 3 imóveis que fazem sentido para a família, análise do preço do m² contra o bairro, os pontos de atenção de cada imóvel por escrito e a visita sempre acompanhada por ele.`,
    '',
    '## Catálogo hoje',
    `- ${imoveis.length} imóveis à venda (${[...tipos].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t.toLowerCase()}`).join(', ')}).`,
    precos.length ? `- Preços de ${brl(precos[0])} a ${brl(precos[precos.length - 1])}; metade custa até ${brl(precos[Math.floor(precos.length / 2)])}.` : '',
    '- Cada ficha traz: preço, área, quartos, suítes, vagas, o que o imóvel tem de bom, o que merece atenção, o preço do m² comparado à mediana do bairro e uma simulação de financiamento.',
    '- O endereço exato não é publicado; a visita é sempre com o Anderson.',
    '',
    '## Páginas principais',
    `- [Imóveis à venda em Jaraguá do Sul](${d}/imoveis/): catálogo completo com filtros por tipo, valor, quartos e bairro.`,
    `- [Corretor de imóveis em Jaraguá do Sul](${d}/corretor-de-imoveis-jaragua-do-sul/): quem é o Anderson, como trabalha com quem compra e quem vende, preço do m² por bairro e perguntas frequentes.`,
    `- [Investir em imóveis no litoral de SC](${d}/investir-em-imoveis-no-litoral-sc/): assessoria para comprar em Itapema e Porto Belo, para compradores de todo o Brasil e do exterior, com conferência da obra e da documentação da incorporação.`,
    `- [Curadoria gratuita](${d}/curadoria/): a família conta o que precisa e recebe os 3 imóveis certos.`,
    `- [Método Compra Segura](${d}/metodo-compra-segura/): como funciona a curadoria, a análise de compra e a visita acompanhada.`,
    `- [Quanto vale meu imóvel](${d}/anuncie-seu-imovel/): para proprietários que querem vender.`,
    `- [Sobre Anderson Costa](${d}/sobre/)`,
    `- [Contato](${d}/contato/): WhatsApp +${SITE.whatsapp}, e-mail ${SITE.email}.`,
    '',
    '## Perguntas e respostas',
    `- [Todas as perguntas](${d}/perguntas/)`,
    ...perguntas().map((p) => `- [${p.pergunta}](${d}/perguntas/${p.slug}/): ${p.resumo}`),
    '',
    '## Imóveis por bairro',
    ...bairros().slice(0, 40).map((b) => `- [${b.bairro}, ${b.cidade}](${d}/imoveis/${b.cidadeSlug}/${b.bairroSlug}/): ${b.total} imóve${b.total === 1 ? 'l' : 'is'}`),
    '',
    '## Preço do m² por bairro em Jaraguá do Sul',
    ...BAIRROS_M2.map(([n, , v]) => `- ${n}: R$ ${num(v)} por m²`),
    `Fonte: ${FONTE_M2}`,
    '',
  ].filter((l) => l !== null);
  return new Response(linhas.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
