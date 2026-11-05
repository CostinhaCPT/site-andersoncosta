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
  indexar: true,
  gtmId: 'GTM-N45VQ3KJ',
  email: 'contato@andersoncostaimoveis.com.br',
  // Pede nome e WhatsApp antes da conversa (false = conversa livre)
  chatPedirContato: true,
  chatApi: 'https://ngvnlaxtstjqmsoillne.supabase.co/functions/v1/atendimento',
  // Chave pública (só lê o que o RLS libera). Escrita exige login do admin.
  supabaseUrl: 'https://ngvnlaxtstjqmsoillne.supabase.co',
  supabaseKey: 'sb_publishable_Qy7wHs1xWDTsxJig2YztuQ_K3-drJXm',
};
