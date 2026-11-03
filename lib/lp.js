// Landing page blocks. Header, hero and footer are fixed; everything in between is
// a list of blocks the admin can add, remove, reorder and edit.

export const BLOCOS = {
  imoveis: {
    nome: 'Imóveis selecionados', desc: 'Cards com foto, preço e o motivo de cada escolha. Na curadoria, o lead reage a cada um.',
    novo: () => ({ titulo: 'Os imóveis que separei', intro: '', itens: [], reacoes: true }),
  },
  imovel_destaque: {
    nome: 'Imóvel em destaque', desc: 'Galeria, ficha completa e descrição de um imóvel.',
    novo: () => ({ codigo: '' }),
  },
  analise: {
    nome: 'Análise de compra', desc: 'Preço por m² comparado ao bairro, custo total com ITBI e simulação de financiamento.',
    novo: () => ({ codigo: '' }),
  },
  texto: {
    nome: 'Texto', desc: 'Título e parágrafos livres.',
    novo: () => ({ titulo: '', texto: '' }),
  },
  lista: {
    nome: 'Lista de pontos', desc: 'Destaques curtos em tópicos.',
    novo: () => ({ titulo: '', itens: [''] }),
  },
  video: {
    nome: 'Vídeo', desc: 'Vídeo do YouTube (tour ou vídeo honesto).',
    novo: () => ({ titulo: '', url: '' }),
  },
  metodo: {
    nome: 'Método Compra Segura', desc: 'Os 3 passos do método: curadoria, análise e vídeo honesto.',
    novo: () => ({ titulo: 'Como eu trabalho' }),
  },
  sobre: {
    nome: 'Sobre o Anderson', desc: 'Apresentação curta com foto.',
    novo: () => ({ titulo: 'Quem vai te atender', texto: 'Sou o Anderson Costa, corretor em Jaraguá do Sul (CRECI SC 68594). Antes de ser corretor, passei quase 20 anos em marketing e vendas. Trabalho com poucos clientes por vez para conseguir entender cada família, comparar com números e ser honesto sobre cada imóvel.' }),
  },
  faq: {
    nome: 'Perguntas frequentes', desc: 'Perguntas e respostas.',
    novo: () => ({ titulo: 'Perguntas frequentes', itens: [{ p: '', r: '' }] }),
  },
  galeria: {
    nome: 'Galeria de fotos', desc: 'Fotos soltas (ex.: do bairro ou de um imóvel de parceiro).',
    novo: () => ({ titulo: '', fotos: [] }),
  },
  formulario: {
    nome: 'Formulário de contato', desc: 'Nome e WhatsApp. O lead entra direto no pipeline.',
    novo: () => ({ titulo: 'Quer receber sua curadoria?', texto: 'Deixe seu nome e WhatsApp que eu te chamo pessoalmente.', botao: 'Quero falar com o Anderson' }),
  },
  cta: {
    nome: 'Chamada para ação', desc: 'Faixa escura com um botão de WhatsApp.',
    novo: () => ({ titulo: 'Vamos conversar?', texto: '', botao: 'Falar no WhatsApp', mensagem: 'Oi, Anderson! Vi a página e quero conversar.' }),
  },
};

export const ORDEM_BLOCOS = Object.keys(BLOCOS);
export const novoId = () => Math.random().toString(36).slice(2, 10);
export const novoBloco = (tipo) => ({ id: novoId(), tipo, dados: BLOCOS[tipo].novo() });

export const MODELOS = {
  curadoria: () => ({
    hero: { eyebrow: 'Curadoria Compra Segura', titulo: '{nome}, separei estes imóveis para vocês', subtitulo: 'Escolhi pensando no que vocês me contaram. Para cada um, digo por que entrou na lista e o que merece atenção.', cta_texto: 'Ver os imóveis', cta_acao: 'rolar' },
    blocos: [novoBloco('imoveis'), novoBloco('metodo'), novoBloco('cta')],
    opcoes: { chat: false },
  }),
  campanha: () => ({
    hero: { eyebrow: 'Anderson Costa Imóveis', titulo: '', subtitulo: '', cta_texto: 'Quero ver as opções', cta_acao: 'formulario' },
    blocos: [novoBloco('imoveis'), novoBloco('metodo'), novoBloco('formulario'), novoBloco('faq')],
    opcoes: { chat: true },
  }),
};

// Codes referenced by a page's blocks
export function codigosDe(blocos = []) {
  const s = new Set();
  for (const b of blocos) {
    if (b.dados?.codigo) s.add(String(b.dados.codigo).toUpperCase());
    for (const it of b.dados?.itens || []) if (it?.codigo) s.add(String(it.codigo).toUpperCase());
  }
  return [...s];
}

export const slugAleatorio = (n = 10) => {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = ''; const r = crypto.getRandomValues(new Uint8Array(n));
  for (const x of r) s += a[x % a.length];
  return s;
};
