export const SITE = {
  nome: 'Anderson Costa',
  marca: 'Anderson Costa Negócios Imobiliários',
  creci: 'CRECI SC 68594',
  whatsapp: '5547996109545',
  telefoneVisivel: '(47) 99610-9545',
  // Atendimento do site: false = botão de WhatsApp (tudo cai no 9545 e no admin); true = webchat antigo
  webchat: false,
  dominio: 'https://andersoncostaimoveis.com.br',
  frase: 'Mais do que vender imóveis, construo conexões. Porque o verdadeiro investimento é feito em confiança.',
  // Liberado para o Google em 28/10/2026
  // Prévias (NEXT_PUBLIC_PREVIA=1) nunca vão para o Google nem para o GTM
  indexar: !process.env.NEXT_PUBLIC_PREVIA,
  gtmId: process.env.NEXT_PUBLIC_PREVIA ? '' : 'GTM-N45VQ3KJ',
  email: 'contato@andersoncostaimoveis.com.br',
  redes: ['https://www.instagram.com/o.anderson.costa/'],
  // Página inicial: as 3 casas de "Selecionados por mim" (códigos). Imóvel vendido ou oculto some sozinho e entra um destaque no lugar.
  vitrine: ['AC-0030', 'AC-0018', 'AC-0029'],
  // Foto do topo da página inicial (código do imóvel; usa a 1ª foto dele)
  capa: 'AC-0020',
  // Pede nome e WhatsApp antes da conversa (false = conversa livre)
  chatPedirContato: true,
  chatApi: 'https://ngvnlaxtstjqmsoillne.supabase.co/functions/v1/atendimento',
  // Chave pública (só lê o que o RLS libera). Escrita exige login do admin.
  supabaseUrl: 'https://ngvnlaxtstjqmsoillne.supabase.co',
  supabaseKey: 'sb_publishable_Qy7wHs1xWDTsxJig2YztuQ_K3-drJXm',
};
