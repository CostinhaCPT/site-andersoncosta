// llms.txt: resumo do site para buscadores com IA (ChatGPT, Perplexity, Gemini, Claude).
// Gerado no build, com os números do catálogo do dia.
import { imoveis, bairros } from '@/lib/imoveis';
import { BAIRROS_M2, FONTE_M2 } from '@/lib/bairros-m2';
import { brl, num } from '@/lib/format';
import { SITE } from '@/lib/site';
export const dynamic = 'force-static';
export function GET() {
  const d = SITE.dominio;
  const precos = imoveis.filter((i) => i.precoVisivel && i.preco).map((i) => i.preco).sort((a, b) => a - b);
  const tipos = imoveis.reduce((m, i) => m.set(i.tipo, (m.get(i.tipo) || 0) + 1), new Map());
  const linhas = [
    `# ${SITE.marca}`,
    '',
    `> Anderson Costa é corretor de imóveis em Jaraguá do Sul, Santa Catarina (${SITE.creci}). Atende quem quer comprar ou vender casa, geminado ou apartamento em Jaraguá do Sul, Guaramirim, Schroeder, Corupá e Massaranduba, pelo Método Compra Segura: curadoria dos 3 imóveis que fazem sentido para a família, análise do preço do m² contra o bairro, os pontos de atenção de cada imóvel por escrito e a visita sempre acompanhada por ele.`,
    '',
    '## Catálogo hoje',
    `- ${imoveis.length} imóveis à venda (${[...tipos].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t.toLowerCase()}`).join(', ')}).`,
    precos.length ? `- Preços de ${brl(precos[0])} a ${brl(precos[precos.length - 1])}; metade custa até ${brl(precos[Math.floor(precos.length / 2)])}.` : '',
    '- Cada ficha traz: preço, área, quartos, suítes, vagas, o que o imóvel tem de bom, o que merece atenção, o preço do m² comparado à mediana do bairro e uma simulação de financiamento.',
    '- O endereço exato não é publicado; a visita é sempre com o Anderson.',
    '',
    '## Páginas principais',
    `- [Imóveis à venda em Jaraguá do Sul](${d}/imoveis/): catálogo completo com filtros por tipo, valor, quartos e bairro.`,
    `- [Curadoria gratuita](${d}/curadoria/): a família conta o que precisa e recebe os 3 imóveis certos.`,
    `- [Método Compra Segura](${d}/metodo-compra-segura/): como funciona a curadoria, a análise de compra e a visita acompanhada.`,
    `- [Quanto vale meu imóvel](${d}/anuncie-seu-imovel/): para proprietários que querem vender.`,
    `- [Sobre Anderson Costa](${d}/sobre/)`,
    `- [Contato](${d}/contato/): WhatsApp +${SITE.whatsapp}, e-mail ${SITE.email}.`,
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
