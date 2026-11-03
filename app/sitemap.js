import { imoveis, bairros } from '@/lib/imoveis';
import { SITE } from '@/lib/site';

export const dynamic = 'force-static';

export default function sitemap() {
  const u = (p) => SITE.dominio + p;
  const agora = new Date();
  const fixas = ['/', '/imoveis/', '/metodo-compra-segura/', '/curadoria/', '/anuncie-seu-imovel/', '/sobre/', '/contato/'].map((p) => ({
    url: u(p), lastModified: agora, changeFrequency: p === '/' || p === '/imoveis/' ? 'daily' : 'monthly', priority: p === '/' ? 1 : 0.7,
  }));
  const regiao = bairros().map((b) => ({ url: u(`/imoveis/${b.cidadeSlug}/${b.bairroSlug}/`), lastModified: agora, changeFrequency: 'weekly', priority: 0.6 }));
  const lista = imoveis.map((i) => ({ url: u(`/imovel/${i.slug}/`), lastModified: agora, changeFrequency: 'weekly', priority: 0.8 }));
  return [...fixas, ...regiao, ...lista];
}
