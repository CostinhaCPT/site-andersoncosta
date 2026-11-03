// Maps a Supabase imoveis row to the shape the site components use.
export const TIPOS = { casa: 'Casa', 'casa-geminada': 'Geminado', apartamento: 'Apartamento', cobertura: 'Cobertura', sobrado: 'Sobrado', terreno: 'Terreno', chacara: 'Chácara' };
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

export function mapearImovel(m) {
  const preco = num(m.preco), area = num(m.area);
  return {
    codigo: m.codigo, slug: m.slug, titulo: m.titulo, resumo: m.resumo || '', descricao: m.descricao || '',
    destaques: m.destaques || [], atencao: m.atencao || [],
    tipo: TIPOS[m.tipo] || m.tipo, tipoSlug: m.tipo,
    bairro: m.bairro, bairroSlug: slug(m.bairro), cidade: m.cidade, cidadeSlug: slug(m.cidade),
    preco, precoVisivel: m.preco_visivel !== false,
    area, terreno: num(m.terreno), quartos: m.quartos ?? 0, suites: m.suites ?? 0, banheiros: m.banheiros ?? 0, vagas: m.vagas ?? 0,
    condominio: num(m.condominio), iptu: num(m.iptu), aceitaPermuta: m.aceita_permuta, aceitaFinanciamento: m.aceita_financiamento,
    fotos: Array.isArray(m.fotos) ? m.fotos : [], video: m.video || null,
    precoM2: preco && area ? Math.round(preco / area) : null, refM2: num(m.ref_m2), refAmostra: m.ref_amostra || null,
    faixa: !preco ? null : preco <= 850000 ? 'ate-850' : preco <= 1000000 ? '850-1000' : 'acima-1000',
    destaque: !!m.destaque, reservado: m.status === 'reservado', ordem: m.ordem ?? null,
  };
}
