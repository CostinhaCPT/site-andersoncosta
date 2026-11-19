import { imoveis, bairros } from '@/lib/imoveis';
import { SITE } from '@/lib/site';
import { perguntas } from '@/lib/perguntas';

export const dynamic = 'force-static';

export default function sitemap() {
  const u = (p) => SITE.dominio + p;
  const fixas = ['/', '/imoveis/', '/metodo-compra-segura/', '/curadoria/', '/corretor-de-imoveis-jaragua-do-sul/', '/investir-em-imoveis-no-litoral-sc/', '/perguntas/', '/anuncie-seu-imovel/', '/sobre/', '/contato/'].map((p) => ({
    url: u(p), changeFrequency: p === '/' || p === '/imoveis/' ? 'daily' : 'monthly', priority: p === '/' ? 1 : 0.7,
  }));
  const regiao = bairros().map((b) => ({ url: u(`/imoveis/${b.cidadeSlug}/${b.bairroSlug}/`), changeFrequency: 'weekly', priority: 0.6 }));
  const lista = imoveis.map((i) => ({ url: u(`/imovel/${i.slug}/`), ...(i.criadoEm ? { lastModified: new Date(i.criadoEm) } : {}), changeFrequency: 'weekly', priority: 0.8 }));
  const faq = perguntas().map((p) => ({ url: u(`/perguntas/${p.slug}/`), changeFrequency: 'weekly', priority: 0.7 }));
  return [...fixas, ...faq, ...regiao, ...lista];
}
