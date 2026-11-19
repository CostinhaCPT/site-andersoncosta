// Páginas de pergunta e resposta: cada uma responde uma busca real (autocompletar do Google, nov/2026)
// com o número do catálogo do dia e uma fonte. Os números são calculados no build.
import { imoveis } from '@/lib/imoveis';
import { BAIRROS_M2, FONTE_M2 } from '@/lib/bairros-m2';
import { BANCOS, ATUALIZADO, TETO_SFH, COMPROMETIMENTO } from '@/lib/financiamento';
import { brl, num } from '@/lib/format';
import { SITE } from '@/lib/site';

const sorted = (a) => [...a].sort((x, y) => x - y);
const quantil = (a, p) => { const s = sorted(a); return s.length ? s[Math.round((s.length - 1) * p)] : null; };
export const mesAno = () => new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });

// Estatística do catálogo por tipo de imóvel, só com preço visível
function grupo(tipos, cidade = 'jaragua-do-sul') {
  const l = imoveis.filter((i) => tipos.includes(i.tipoSlug) && (!cidade || i.cidadeSlug === cidade) && i.precoVisivel && i.preco);
  const p = l.map((i) => i.preco);
  const m2 = l.filter((i) => i.area > 0).map((i) => i.preco / i.area);
  return { n: l.length, min: sorted(p)[0], max: sorted(p)[p.length - 1], q1: quantil(p, 0.25), med: quantil(p, 0.5), q3: quantil(p, 0.75), m2: quantil(m2, 0.5), l };
}
const faixa = (g, ligacao = 'a') => (g.n >= 8 ? `${brl(g.q1)} ${ligacao} ${brl(g.q3)}` : `${brl(g.min)} ${ligacao} ${brl(g.max)}`);
const FONTE_CAT = { t: 'Catálogo de imóveis à venda de Anderson Costa (preços de anúncio, não de venda)', u: `${SITE.dominio}/imoveis/` };
const NOTA_ANUNCIO = 'Todos os valores desta página são preços de anúncio do meu catálogo, e não preços de venda. O valor final depende da negociação, da documentação e do estado do imóvel.';

// Simulação de exemplo (SAC), a mesma conta da análise de compra do site
function exemploSac(preco, entPct, anos, banco) {
  const fin = preco * (1 - entPct / 100);
  const n = anos * 12, j = Math.pow(1 + banco.taxa / 100, 1 / 12) - 1;
  const a = fin / n;
  return { fin, entrada: preco * entPct / 100, p1: a + fin * j, pN: a + a * j, renda: (a + fin * j) / COMPROMETIMENTO };
}

export function perguntas() {
  const casas = grupo(['casa']);
  const sobrados = grupo(['sobrado']);
  const gemin = grupo(['casa-geminada']);
  const aptos = grupo(['apartamento']);
  const terrenos = grupo(['terreno']);
  const todasCasas = grupo(['casa', 'sobrado', 'casa-geminada']);
  const caixa = BANCOS[0];
  const ex = exemploSac(700000, 30, 30, caixa);
  const hoje = mesAno();
  const bairrosJ = (() => {
    const m = new Map();
    for (const i of imoveis) {
      if (i.cidadeSlug !== 'jaragua-do-sul' || !i.precoVisivel || !i.preco) continue;
      if (!m.has(i.bairroSlug)) m.set(i.bairroSlug, { nome: i.bairro, slug: i.bairroSlug, p: [] });
      m.get(i.bairroSlug).p.push(i.preco);
    }
    return [...m.values()].map((b) => ({ ...b, n: b.p.length, med: quantil(b.p, 0.5) })).sort((a, b) => b.n - a.n).slice(0, 12);
  })();

  return [
    {
      slug: 'quanto-custa-uma-casa-em-jaragua-do-sul', regiao: 'jaragua',
      pergunta: 'Quanto custa uma casa em Jaraguá do Sul?',
      titulo: 'Quanto custa uma casa em Jaraguá do Sul em ' + hoje,
      resumo: `Casas à venda em Jaraguá do Sul, hoje: a maior parte custa entre ${faixa(todasCasas, 'e')}, com valor do meio de ${brl(todasCasas.med)}. Preço por tipo, por m² e o que muda o valor.`,
      resposta: `Hoje, no meu catálogo, as ${todasCasas.n} casas, sobrados e casas geminadas à venda em Jaraguá do Sul custam de ${brl(todasCasas.min)} a ${brl(todasCasas.max)}. A maior parte fica entre ${faixa(todasCasas, 'e')}, e o valor do meio é ${brl(todasCasas.med)}.`,
      secoes: [
        { t: 'Preço por tipo de casa', tabela: { cab: ['Tipo', 'No catálogo', 'Faixa da maior parte', 'Valor do meio'], linhas: [
          ['Casa térrea', casas.n, faixa(casas), brl(casas.med)],
          ['Sobrado', sobrados.n, faixa(sobrados), brl(sobrados.med)],
          ['Casa geminada', gemin.n, faixa(gemin), brl(gemin.med)],
        ] }, p: ['"Faixa da maior parte" deixa de fora os 25% mais baratos e os 25% mais caros, para um imóvel muito fora da curva não distorcer a conta.'] },
        { t: 'Quanto custa o m² construído', p: [`Dividindo o preço pela área construída, o valor do meio das casas do catálogo é ${brl(Math.round(casas.m2))} por m² nas casas térreas e ${brl(Math.round(gemin.m2))} por m² nas geminadas. É a conta que eu faço primeiro para saber se uma casa está cara ou barata para o bairro dela.`] },
        { t: 'O que faz o preço subir ou descer', lista: ['O bairro: a mesma casa vale bem diferente de um bairro para outro.', 'O terreno: casa de 150 m² em terreno de 450 m² não custa o mesmo que em terreno de 250 m².', 'O padrão de acabamento, a idade da construção e o estado de conservação.', 'Piscina, área de festas, móveis planejados e número de vagas.', 'A documentação: casa com matrícula e averbação em dia é mais fácil de financiar e de vender.'] },
        { t: 'Como saber se o preço de uma casa está justo', p: ['Compare com imóveis parecidos do mesmo bairro, e não com a média da cidade. É isso que faço na análise de compra de cada ficha do site: o m² do imóvel contra a mediana do bairro, mostrando quais imóveis entraram na conta.'] },
      ],
      faq: [
        ['Casa geminada é mais barata que casa térrea?', `No meu catálogo, sim: o valor do meio das geminadas é ${brl(gemin.med)}, contra ${brl(casas.med)} das casas térreas. A diferença vem do tamanho do terreno e do padrão do imóvel.`],
        ['Dá para financiar uma casa em Jaraguá do Sul?', 'Dá, na maioria dos casos. Os bancos financiam até 80% do valor de avaliação no SBPE, e a casa precisa ter matrícula e documentação regulares. Veja a página de financiamento para uma simulação.'],
        ['Os preços do site são os preços de venda?', 'Não. São preços de anúncio. O valor final depende da negociação e da avaliação do banco, quando há financiamento.'],
      ],
      nota: NOTA_ANUNCIO, fontes: [FONTE_CAT], rel: ['quanto-custa-um-apartamento-em-jaragua-do-sul', 'como-financiar-um-imovel-em-jaragua-do-sul', 'qual-o-melhor-bairro-para-morar-em-jaragua-do-sul'],
      cta: { texto: 'Receba a curadoria de casas para o seu orçamento', href: '/curadoria/' },
    },
    {
      slug: 'quanto-custa-um-apartamento-em-jaragua-do-sul', regiao: 'jaragua',
      pergunta: 'Quanto custa um apartamento em Jaraguá do Sul?',
      titulo: 'Quanto custa um apartamento em Jaraguá do Sul em ' + hoje,
      resumo: `Apartamentos à venda em Jaraguá do Sul: a maior parte custa entre ${faixa(aptos, 'e')}. Veja também o preço do m² por bairro.`,
      resposta: `Hoje, no meu catálogo, os ${aptos.n} apartamentos à venda em Jaraguá do Sul custam de ${brl(aptos.min)} a ${brl(aptos.max)}. A maior parte fica entre ${faixa(aptos, 'e')}, e o valor do meio é ${brl(aptos.med)}. O m² mediano dos anúncios varia de ${brl(BAIRROS_M2[BAIRROS_M2.length - 1][2])} a ${brl(BAIRROS_M2[0][2])}, conforme o bairro.`,
      secoes: [
        { t: 'Preço do m² por bairro', tabela: { cab: ['Bairro', 'Mediana do m²'], linhas: BAIRROS_M2.map(([n, , v]) => [n, `R$ ${num(v)}`]) }, p: [FONTE_M2] },
        { t: 'Como usar o preço do m²', p: ['Multiplique a área privativa pelo m² do bairro para ter uma referência do que o mercado pede. Se o apartamento está bem acima, procure o motivo: andar alto, vista, lazer completo, acabamento ou construção recente. Se está bem abaixo, também vale investigar o motivo antes de se animar.'] },
        { t: 'O que entra além do preço', lista: ['Condomínio mensal e o que ele inclui.', 'IPTU.', 'Vaga de garagem: coberta, descoberta, escriturada ou não.', 'Se o apartamento está na planta, em construção ou pronto.', 'Custos de escritura e registro, que eu passo por escrito antes da proposta.'] },
      ],
      faq: [
        ['Apartamento na planta é mais barato que pronto?', 'Costuma ter preço de entrada menor e parcelamento durante a obra, mas o saldo é corrigido pelo INCC e você só usufrui na entrega. Eu explico isso em detalhe na página sobre imóvel na planta.'],
        ['Qual bairro de Jaraguá do Sul tem o apartamento mais caro por m²?', `Na pesquisa que uso, o ${BAIRROS_M2[0][0]} (${brl(BAIRROS_M2[0][2])} por m²), seguido pelo ${BAIRROS_M2[1][0]} (${brl(BAIRROS_M2[1][2])} por m²).`],
      ],
      nota: NOTA_ANUNCIO, fontes: [FONTE_CAT], rel: ['quanto-custa-uma-casa-em-jaragua-do-sul', 'como-financiar-um-imovel-em-jaragua-do-sul', 'vale-a-pena-comprar-imovel-na-planta'],
      cta: { texto: 'Receba a curadoria de apartamentos', href: '/curadoria/' },
    },
    {
      slug: 'quanto-custa-um-terreno-em-jaragua-do-sul', regiao: 'jaragua',
      pergunta: 'Quanto custa um terreno em Jaraguá do Sul?',
      titulo: 'Quanto custa um terreno em Jaraguá do Sul em ' + hoje,
      resumo: 'Preço de terrenos em Jaraguá do Sul e o que conferir antes de comprar: matrícula, zoneamento, topografia e infraestrutura.',
      resposta: terrenos.n ? `Hoje, no meu catálogo, os ${terrenos.n} terrenos à venda em Jaraguá do Sul custam de ${brl(terrenos.min)} a ${brl(terrenos.max)}, e o valor do meio é ${brl(terrenos.med)}. É uma amostra pequena, então use como referência e não como média da cidade. O preço varia muito com o bairro, o tamanho e a topografia.` : 'Hoje não tenho terrenos à venda em Jaraguá do Sul no catálogo. Se você procura um, me conta a região e o tamanho que eu busco nas parcerias.',
      secoes: [
        { t: 'O que mais pesa no preço de um terreno', lista: ['Bairro e acesso: rua asfaltada, transporte, comércio e escola por perto.', 'Metragem e formato: terreno regular é mais fácil de construir.', 'Topografia: aclive ou declive pode encarecer a obra.', 'Infraestrutura: água, esgoto, energia e internet na frente do lote.', 'Zoneamento: define o que se pode construir e quanto do lote pode ser ocupado.'] },
        { t: 'O que conferir antes de comprar', lista: ['Matrícula atualizada no cartório de imóveis, com o nome do vendedor como proprietário e sem ônus que impeçam a venda.', 'Zoneamento e índices de construção na prefeitura (Plano Diretor).', 'Se o lote tem área de preservação, curso d\'água ou faixa de proteção que limite a construção.', 'Histórico de alagamento da região, perguntando a vizinhos e conferindo com a Defesa Civil.', 'Se o valor por m² está compatível com lotes parecidos da mesma rua.'] },
        { t: 'Terreno ou casa pronta?', p: ['Comprar o terreno e construir dá mais liberdade, mas soma custo de projeto, obra, prazo e imprevistos. Costumo colocar as duas contas lado a lado com a família antes de decidir.'] },
      ],
      faq: [
        ['Dá para financiar a compra de um terreno?', 'Existem linhas específicas para terreno e para construção, com condições diferentes do financiamento de imóvel pronto. Vale simular no banco antes de fechar.'],
        ['Preciso de um corretor para comprar terreno?', 'Não é obrigatório, mas a conferência da matrícula e do zoneamento evita surpresas caras. Para quem compra, o meu atendimento não tem custo: a comissão é paga pelo vendedor.'],
      ],
      nota: NOTA_ANUNCIO, fontes: [FONTE_CAT], rel: ['quanto-custa-uma-casa-em-jaragua-do-sul', 'qual-o-melhor-bairro-para-morar-em-jaragua-do-sul'],
      cta: { texto: 'Me conta o que você procura', href: '/curadoria/' },
    },
    {
      slug: 'qual-o-melhor-bairro-para-morar-em-jaragua-do-sul', regiao: 'jaragua',
      pergunta: 'Qual o melhor bairro para morar em Jaraguá do Sul?',
      titulo: 'Qual o melhor bairro para morar em Jaraguá do Sul?',
      resumo: 'Não existe um melhor bairro para todos. Veja como escolher pela rotina da família e o preço dos bairros com mais imóveis à venda.',
      resposta: 'Não existe um melhor bairro para todo mundo, e quem aponta um sem perguntar da sua rotina está chutando. O melhor bairro é o que reduz o trajeto do trabalho e da escola, cabe no orçamento e tem o tipo de imóvel que a sua família precisa. Abaixo, os bairros com mais imóveis à venda hoje no meu catálogo, com o valor do meio dos anúncios.',
      secoes: [
        { t: 'Bairros com mais imóveis à venda', tabela: { cab: ['Bairro', 'Imóveis no catálogo', 'Valor do meio'], linhas: bairrosJ.map((b) => [{ href: `/imoveis/jaragua-do-sul/${b.slug}/`, t: b.nome }, b.n, brl(b.med)]) }, p: ['O valor do meio mistura casas, geminadas e apartamentos, então serve para comparar o tamanho do investimento entre bairros, e não o preço de um imóvel específico.'] },
        { t: 'Como escolher em quatro passos', lista: ['Teste o trajeto no horário real de entrada e saída do trabalho e da escola, e não pelo mapa.', 'Visite o bairro à noite e no fim de semana, para ver barulho, movimento e iluminação.', 'Compare o m² do imóvel com a mediana do bairro antes de se apaixonar pela casa.', 'Pergunte a vizinhos sobre alagamento, vizinhança e serviços do dia a dia.'] },
        { t: 'E se eu ainda não sei?', p: ['Na curadoria, eu entendo a rotina da família antes de mostrar qualquer imóvel e explico os bairros pelo que importa para vocês: trabalho, escola e trânsito. A conversa é gratuita.'] },
      ],
      faq: [
        ['Qual bairro de Jaraguá do Sul é mais valorizado?', `Pelo preço do m² dos apartamentos anunciados, o ${BAIRROS_M2[0][0]} e o ${BAIRROS_M2[1][0]} lideram na pesquisa que uso. Preço alto não significa que seja o melhor para a sua rotina.`],
        ['Qual bairro é mais barato para comprar?', 'Depende do tipo de imóvel. Pela tabela acima, você compara o valor do meio dos anúncios por bairro e vê onde o seu orçamento rende mais.'],
      ],
      nota: NOTA_ANUNCIO, fontes: [FONTE_CAT, { t: 'A Corrida dos Bairros, preço do m² por bairro (setembro de 2026)' }], rel: ['quanto-custa-uma-casa-em-jaragua-do-sul', 'quanto-custa-um-apartamento-em-jaragua-do-sul', 'vale-a-pena-morar-em-jaragua-do-sul'],
      cta: { texto: 'Receba a curadoria pela rotina da sua família', href: '/curadoria/' },
    },
    {
      slug: 'como-financiar-um-imovel-em-jaragua-do-sul', regiao: 'jaragua',
      pergunta: 'Como financiar um imóvel em Jaraguá do Sul?',
      titulo: 'Como financiar um imóvel em Jaraguá do Sul em ' + hoje,
      resumo: `Financiamento imobiliário em Jaraguá do Sul: taxas dos bancos (${ATUALIZADO}), entrada mínima de 20%, prazo, FGTS e uma simulação de exemplo.`,
      resposta: `Os bancos financiam até 80% do valor de avaliação do imóvel no SBPE, então a entrada mínima é de 20%, em prazos de até 35 anos. Em ${ATUALIZADO}, a menor taxa de balcão que encontrei é a da Caixa, a partir de ${caixa.taxa.toLocaleString('pt-BR')}% ao ano mais TR. A parcela costuma ficar limitada a cerca de ${COMPROMETIMENTO * 100}% da renda bruta familiar.`,
      secoes: [
        { t: 'Taxas de balcão dos bancos', tabela: { cab: ['Banco', 'Taxa a partir de', 'Financia até', 'Prazo máximo'], linhas: BANCOS.map((b) => [b.nome, `${b.taxa.toLocaleString('pt-BR')}% a.a. + TR`, `${b.cota}%`, `${b.prazoMax} anos`]) }, p: [`Taxas "a partir de" divulgadas pelos bancos, pesquisa de ${ATUALIZADO}. A taxa final depende da análise de crédito, do seu relacionamento com o banco e da avaliação do imóvel.`] },
        { t: 'Exemplo: imóvel de R$ 700.000', p: [`Com entrada de 30% (${brl(ex.entrada)}), valor financiado de ${brl(ex.fin)}, 30 anos pela tabela SAC e a taxa da Caixa, a primeira parcela fica em torno de ${brl(ex.p1)} e a última em torno de ${brl(ex.pN)}. A renda bruta familiar sugerida para esse financiamento é de cerca de ${brl(ex.renda)}. A parcela não inclui seguros obrigatórios (MIP e DFI), taxa de administração nem TR.`] },
        { t: 'FGTS e o teto do SFH', p: [`Imóvel avaliado até ${brl(TETO_SFH)} está dentro do teto do Sistema Financeiro da Habitação (Resolução CMN 5.255), e nesse caso dá para usar o FGTS na entrada, se você tiver direito. Acima disso, o financiamento é pelo SFI, sem FGTS, e as condições mudam.`] },
        { t: 'O que o banco pede', lista: ['Comprovação de renda e análise de crédito.', 'Documentos pessoais e do imóvel: matrícula atualizada, certidões e, para casas, averbação da construção.', 'Avaliação do imóvel pelo banco: o financiamento é sobre o menor valor entre a avaliação e o preço de venda.', 'Idade mais prazo não passando de 80 anos e 6 meses na maioria dos bancos.'] },
      ],
      faq: [
        ['Qual a entrada mínima para financiar um imóvel?', 'No SBPE, 20% do valor de avaliação, já que os bancos financiam até 80%. Para imóveis em programas habitacionais específicos, as regras são outras.'],
        ['Posso usar o FGTS na entrada?', 'Pode, se o imóvel estiver dentro do teto do SFH, se for residencial e se você cumprir as regras do FGTS, como não ter outro imóvel financiado na região.'],
        ['Qual banco tem a menor taxa?', `Na pesquisa de ${ATUALIZADO}, a Caixa, a partir de ${caixa.taxa.toLocaleString('pt-BR')}% ao ano. Mas a taxa final varia por cliente, então vale simular em mais de um banco.`],
      ],
      nota: 'Simulação de exemplo, sem valor de proposta. Eu faço a simulação oficial com você antes de qualquer proposta e passo por escrito os custos de cartório e impostos.',
      fontes: [{ t: 'Caixa Econômica Federal, habitação', u: 'https://www.caixa.gov.br/voce/habitacao/Paginas/default.aspx' }, { t: 'Análise de compra, com simulador, em cada imóvel do catálogo', u: SITE.dominio + '/imoveis/' }],
      rel: ['quanto-custa-uma-casa-em-jaragua-do-sul', 'quanto-custa-um-apartamento-em-jaragua-do-sul'],
      cta: { texto: 'Simule com o imóvel que você escolheu', href: '/imoveis/' },
    },
    {
      slug: 'vale-a-pena-morar-em-jaragua-do-sul', regiao: 'jaragua',
      pergunta: 'Vale a pena morar em Jaraguá do Sul?',
      titulo: 'Vale a pena morar em Jaraguá do Sul?',
      resumo: 'Jaraguá do Sul tem 182.660 habitantes (Censo 2022). O que pesar antes de se mudar: trabalho, bairro, custo do imóvel e o litoral a cerca de 1h30.',
      resposta: 'Para quem busca emprego na indústria, uma cidade de porte médio e imóvel mais acessível que o litoral, costuma valer. Segundo o Censo 2022 do IBGE, Jaraguá do Sul tem 182.660 habitantes em 530,9 km², e o litoral de Santa Catarina fica a cerca de uma hora e meia daqui. Mas "vale a pena" depende da sua rotina, e esta página é a visão de um corretor que atende famílias que se mudam para cá, e não um ranking oficial.',
      secoes: [
        { t: 'O que eu pergunto a quem vem de outra cidade', lista: ['Onde você vai trabalhar ou estudar, e qual o trajeto aceitável no dia a dia?', 'Quanto pode comprometer da renda com a parcela ou o aluguel?', 'Casa com quintal, geminada ou apartamento?', 'Precisa de escola ou de atendimento específico por perto?'] },
        { t: 'Os números que posso confirmar', tabela: { cab: ['Dado', 'Valor', 'Fonte'], linhas: [['População (Censo 2022)', '182.660 habitantes', 'IBGE'], ['Área do município', '530,894 km²', 'IBGE'], ['Casas e sobrados no meu catálogo', `${casas.n + sobrados.n}, valor do meio de ${brl(quantil([...casas.l, ...sobrados.l].map((i) => i.preco), 0.5))}`, 'Catálogo de hoje'], ['Apartamentos no meu catálogo', `${aptos.n}, valor do meio de ${brl(aptos.med)}`, 'Catálogo de hoje']] } },
        { t: 'Como conhecer antes de decidir', p: ['Passe um dia útil e um fim de semana na cidade antes de comprar. Eu monto o roteiro: primeira conversa por vídeo, seleção por escrito dos imóveis que fazem sentido e visitas concentradas em poucos dias, para você não precisar vir várias vezes.'] },
      ],
      faq: [
        ['Quantos habitantes tem Jaraguá do Sul?', '182.660 habitantes, segundo o Censo 2022 do IBGE.'],
        ['Jaraguá do Sul fica perto do litoral?', 'O litoral de Santa Catarina fica a cerca de uma hora e meia de Jaraguá do Sul, de carro.'],
      ],
      nota: 'Dados de população e área: IBGE, Censo 2022. As demais informações vêm do meu catálogo e da minha experiência atendendo famílias na região.',
      fontes: [{ t: 'IBGE, Jaraguá do Sul (Censo 2022)', u: 'https://www.ibge.gov.br/cidades-e-estados/sc/jaragua-do-sul.html' }, FONTE_CAT], rel: ['qual-o-melhor-bairro-para-morar-em-jaragua-do-sul', 'quanto-custa-uma-casa-em-jaragua-do-sul'],
      cta: { texto: 'Conversar sobre a mudança para Jaraguá', href: '/curadoria/' },
    },
    {
      slug: 'quanto-custa-um-apartamento-em-itapema', regiao: 'litoral',
      pergunta: 'Quanto custa um apartamento em Itapema?',
      titulo: 'Quanto custa um apartamento em Itapema em ' + hoje,
      resumo: 'Itapema tem o m² residencial mais caro do índice FipeZAP divulgado em junho de 2026: R$ 15.226. Veja o que isso significa na conta.',
      resposta: 'No Índice FipeZAP divulgado em 2 de junho de 2026, o m² médio de venda residencial em Itapema foi de R$ 15.226, ligeiramente acima do de Balneário Camboriú (R$ 15.215). Na prática, um apartamento de 70 m² nessa média custaria cerca de R$ 1.065.820, e um de 100 m² cerca de R$ 1.522.600. É uma média de anúncios: frente mar, andar alto e lançamento ficam acima, e imóvel mais afastado do mar fica abaixo.',
      secoes: [
        { t: 'O que muda o preço em Itapema', lista: ['A distância do mar: frente mar e quadra mar custam bem mais.', 'O bairro: Meia Praia e Centro têm perfis e preços diferentes.', 'Planta, em obra ou pronto: o lançamento costuma ter preço de entrada menor e saldo corrigido pelo INCC.', 'Metragem e posição solar, andar, vista e quantidade de vagas.', 'Lazer e padrão do condomínio, que também pesam no valor do condomínio mensal.'] },
        { t: 'Antes de comprar a esse preço', p: ['Quando o metro quadrado já é um dos mais altos do país, o ganho do investidor depende de comprar certo: a obra certa, da construtora certa, pelo preço certo. Eu comparo o valor do m² com lançamentos e usados parecidos na mesma faixa de praia, confiro a documentação da incorporação e visito a obra.'] },
        { t: 'Custos fora do preço', lista: ['Condomínio, IPTU e mobília.', 'Escritura e registro.', 'Se for alugar por temporada: administração, limpeza, taxas das plataformas e meses de vacância.'] },
      ],
      faq: [
        ['Itapema é mais cara que Balneário Camboriú?', 'No Índice FipeZAP divulgado em 2 de junho de 2026, sim, por uma diferença pequena (R$ 15.226 contra R$ 15.215 por m²). As posições podem se alternar a cada divulgação.'],
        ['Posso comprar um apartamento em Itapema morando em outra cidade?', 'Sim. Faço a conversa por vídeo, envio fotos e vídeos do imóvel e da obra e organizo a assinatura à distância quando a construtora e o cartório aceitam.'],
      ],
      nota: 'O Índice FipeZAP é uma média de preços de anúncio e não é um preço de venda. Não é recomendação de investimento.',
      fontes: [{ t: 'Portas, Itapema supera BC e se torna o m² mais caro do país (Índice FipeZAP)', u: 'https://portas.com.br/dados-inteligencia/preco-por-regiao/itapema-supera-bc-e-se-torna-o-m²-mais-caro-do-pais/' }, { t: 'Índice FipeZAP', u: 'https://www.fipe.org.br/pt-br/indices/fipezap/' }],
      rel: ['vale-a-pena-investir-em-imoveis-no-litoral-de-santa-catarina', 'vale-a-pena-comprar-imovel-na-planta', 'estrangeiro-pode-comprar-imovel-no-brasil'],
      cta: { texto: 'Conversar sobre Itapema e Porto Belo', href: '/investir-em-imoveis-no-litoral-sc/' },
    },
    {
      slug: 'vale-a-pena-comprar-imovel-na-planta', regiao: 'litoral',
      pergunta: 'Vale a pena comprar imóvel na planta?',
      titulo: 'Vale a pena comprar imóvel na planta? Riscos e o que conferir',
      resumo: 'Imóvel na planta: parcelamento, correção pelo INCC, atraso de obra, distrato e o que conferir antes de assinar.',
      resposta: 'Pode valer, se você aceitar esperar pela entrega e comprar de uma construtora confiável, com a incorporação registrada. A vantagem é pagar parcelado durante a obra, normalmente com preço de entrada menor. O risco é o atraso, o saldo que sobe com a correção do INCC e a construtora que não entrega. Por isso a compra na planta pede conferência de documentos e da obra antes da assinatura.',
      secoes: [
        { t: 'Como funciona o pagamento', p: ['Em geral há uma entrada, parcelas mensais durante a obra, reforços semestrais ou anuais e o saldo na entrega das chaves, quitado à vista ou financiado. Durante a obra, as parcelas e o saldo costumam ser corrigidos pelo INCC, o índice de custo da construção, então o valor final é maior que o preço de tabela do dia da compra.'] },
        { t: 'O que a lei garante', lista: ['A venda de imóvel na planta exige incorporação registrada no cartório de imóveis (Lei 4.591/1964).', 'O patrimônio de afetação separa o dinheiro da obra do restante do patrimônio da construtora, o que protege o comprador se a empresa tiver problemas (Lei 10.931/2004).', 'Se o contrato prever tolerância de atraso, ela é de até 180 dias. Passado esse prazo, o comprador pode desfazer o contrato e receber o que pagou ou seguir com o contrato e receber indenização por mês de atraso (Lei 13.786/2018).', 'Se o comprador desistir, o contrato pode prever retenção de parte do que foi pago, com limites definidos na mesma lei.'] },
        { t: 'O que eu confiro antes de você assinar', lista: ['Certidão de registro da incorporação e se ela bate com o memorial.', 'Histórico da construtora: obras entregues, atrasos e processos.', 'Andamento real da obra, com fotos e vídeo, comparado ao cronograma.', 'Cláusulas de correção, atraso, distrato e se há patrimônio de afetação.', 'O preço do m² contra lançamentos e usados parecidos.'] },
      ],
      faq: [
        ['Imóvel na planta valoriza mais?', 'Não há garantia. A valorização depende do local, da qualidade da entrega e do mercado no momento da venda, e ninguém pode prometer retorno.'],
        ['Posso desistir da compra de um imóvel na planta?', 'Pode, mas o contrato costuma prever retenção de parte do valor pago. As regras estão na Lei 13.786/2018, e vale ler a cláusula de distrato antes de assinar.'],
      ],
      nota: 'Informação geral, não é aconselhamento jurídico. Leia o contrato com um advogado antes de assinar.',
      fontes: [{ t: 'Lei 4.591/1964 (incorporações)', u: 'https://www.planalto.gov.br/ccivil_03/leis/l4591.htm' }, { t: 'Lei 10.931/2004 (patrimônio de afetação)', u: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l10.931.htm' }, { t: 'Lei 13.786/2018 (distrato e atraso de entrega)', u: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13786.htm' }],
      rel: ['quanto-custa-um-apartamento-em-itapema', 'vale-a-pena-investir-em-imoveis-no-litoral-de-santa-catarina'],
      cta: { texto: 'Conferir uma obra comigo antes de assinar', href: '/investir-em-imoveis-no-litoral-sc/' },
    },
    {
      slug: 'estrangeiro-pode-comprar-imovel-no-brasil', regiao: 'litoral',
      pergunta: 'Estrangeiro pode comprar imóvel no Brasil?',
      titulo: 'Estrangeiro pode comprar imóvel no Brasil? O que é preciso',
      resumo: 'Estrangeiro pode comprar imóvel urbano no Brasil, com CPF. Imóvel rural tem restrições. Veja os passos para comprar do exterior.',
      resposta: 'Pode, no caso de imóvel urbano, como apartamentos e casas em cidades. É preciso ter CPF, que pode ser pedido inclusive em consulados do Brasil no exterior. Imóvel rural tem restrições para estrangeiros, previstas na Lei 5.709/1971.',
      secoes: [
        { t: 'Passo a passo para comprar do exterior', lista: ['Tirar o CPF, se ainda não tiver.', 'Definir o imóvel e conferir a documentação do vendedor e do imóvel.', 'Para pagar com dinheiro vindo de fora, falar com o seu banco sobre o registro da remessa.', 'Assinar a escritura ou o contrato. Se você não puder vir ao Brasil, pode nomear um procurador por procuração assinada no exterior, apostilada ou reconhecida pelo consulado do Brasil.', 'Registrar a escritura no cartório de imóveis, que é o que transfere a propriedade.'] },
        { t: 'Como eu ajudo quem mora fora', p: ['Faço as conversas por vídeo, envio fotos e vídeos do imóvel e da obra, confiro a documentação e organizo a assinatura à distância quando a construtora e o cartório aceitam. A parte jurídica e tributária do seu país de residência deve ser tratada com um advogado ou contador.'] },
      ],
      faq: [
        ['Preciso de CPF para comprar imóvel no Brasil?', 'Sim. O CPF é exigido para a escritura e o registro. Pode ser emitido pela Receita Federal ou em consulados do Brasil.'],
        ['Posso comprar um terreno rural sendo estrangeiro?', 'Há restrições, como limites de tamanho e autorizações previstas na Lei 5.709/1971. Procure um advogado antes de negociar um imóvel rural.'],
        ['Posso financiar o imóvel sendo estrangeiro?', 'Depende do banco e da sua condição de residência. Muitos compradores do exterior pagam à vista ou parcelam direto com a construtora.'],
      ],
      nota: 'Informação geral, não é aconselhamento jurídico nem tributário. Confirme a regra atual com um advogado e o cartório.',
      fontes: [{ t: 'Lei 5.709/1971 (aquisição de imóvel rural por estrangeiro)', u: 'https://www.planalto.gov.br/ccivil_03/leis/l5709.htm' }, { t: 'Receita Federal, CPF para residentes no exterior', u: 'https://www.gov.br/receitafederal/pt-br' }],
      rel: ['vale-a-pena-investir-em-imoveis-no-litoral-de-santa-catarina', 'quanto-custa-um-apartamento-em-itapema'],
      cta: { texto: 'Conversar sobre comprar do exterior', href: '/investir-em-imoveis-no-litoral-sc/' },
    },
    {
      slug: 'vale-a-pena-investir-em-imoveis-no-litoral-de-santa-catarina', regiao: 'litoral',
      pergunta: 'Vale a pena investir em imóveis no litoral de Santa Catarina?',
      titulo: 'Vale a pena investir em imóveis no litoral de Santa Catarina?',
      resumo: 'Investir em imóveis em Itapema e Porto Belo: o que pesa na conta, os riscos e o que eu confiro antes de você comprar. Sem promessa de retorno.',
      resposta: 'Pode valer, mas ninguém pode garantir retorno, e o litoral catarinense está entre os metros quadrados mais caros do país: em Itapema, R$ 15.226 por m² no Índice FipeZAP divulgado em junho de 2026. Quando o preço de entrada já é alto, o resultado depende de comprar a obra certa, da construtora certa, pelo preço certo, e de colocar na conta todos os custos de manter o imóvel.',
      secoes: [
        { t: 'O que entra na conta de quem investe', lista: ['Preço de compra e a correção pelo INCC, se for na planta.', 'Condomínio, IPTU, mobília e manutenção.', 'Renda de aluguel por temporada: depende de sazonalidade, administração, limpeza, taxas das plataformas e meses vazios.', 'Custos de escritura, registro e de venda no futuro.', 'Prazo: quanto tempo você consegue manter o imóvel sem precisar vender.'] },
        { t: 'Os riscos que eu mostro antes', lista: ['Pagar caro na entrada num mercado já valorizado.', 'Atraso ou problemas da construtora na obra.', 'Rentabilidade de aluguel menor que a prometida no material de lançamento.', 'Documentação da incorporação irregular.'] },
        { t: 'O que eu faço por quem investe', p: ['Confiro a incorporação no cartório, o histórico da construtora, o andamento real da obra e o preço do m² contra imóveis parecidos. Atendo compradores de todo o Brasil e do exterior, por vídeo, com fotos e vídeos da obra. Se a conta não fecha, eu digo.'] },
      ],
      faq: [
        ['Imóvel é um bom investimento?', 'Depende do preço de compra, dos custos de manter e do prazo. É um ativo de baixa liquidez, ou seja, pode demorar para vender, e o retorno não é garantido.'],
        ['Qual a diferença entre comprar na planta e pronto, para investir?', 'Na planta, o preço de entrada costuma ser menor e há parcelamento, mas você espera a entrega e corre o risco da obra. Pronto, você começa a usar ou alugar na hora, com preço normalmente maior.'],
      ],
      nota: 'Conteúdo informativo, sem recomendação de investimento e sem promessa de rentabilidade ou valorização. Cada caso depende do seu objetivo e do seu perfil.',
      fontes: [{ t: 'Portas, Itapema supera BC no m² mais caro (Índice FipeZAP)', u: 'https://portas.com.br/dados-inteligencia/preco-por-regiao/itapema-supera-bc-e-se-torna-o-m²-mais-caro-do-pais/' }, { t: 'Índice FipeZAP', u: 'https://www.fipe.org.br/pt-br/indices/fipezap/' }],
      rel: ['vale-a-pena-comprar-imovel-na-planta', 'quanto-custa-um-apartamento-em-itapema', 'estrangeiro-pode-comprar-imovel-no-brasil'],
      cta: { texto: 'Conversar sobre o seu investimento', href: '/investir-em-imoveis-no-litoral-sc/' },
    },
  ];
}
export const porSlugP = (s) => perguntas().find((p) => p.slug === s);
