// Custos de compra além da entrada (ITBI e cartório), usados na Análise de compra do site.
// Atualize uma vez por ano, quando o TJSC publicar a nova tabela de emolumentos.
//
// Fontes:
// - Emolumentos 2026 de SC: TJSC, Circular CGJ n. 643/2025, Tabela I (Notas, item 2: escritura com valor)
//   e Tabela III (Registro de Imóveis, item 2.2: registro com valor), vigentes desde 01/01/2026.
//   https://www.tjsc.jus.br/documents/d/corregedoria-geral-da-justica/circularcgj643-2025-pdf
// - Teto acima da última faixa: 1º Tabelionato de Balneário Camboriú, tabela 2026 (valor fixo acima de R$ 3.726.100,06).
// - ITBI de Jaraguá do Sul: 2% do valor do imóvel (Câmara de Vereadores, 26/05/2021).
// - Redução de 50% nos emolumentos da primeira aquisição residencial financiada pelo SFH: Lei 6.015/73, art. 290.
export const CUSTOS_ATUALIZADO = 'tabela TJSC 2026';
export const ITBI_PADRAO = 0.02;
export const ITBI_CIDADES = { 'jaragua do sul': 0.02 };
export const SELO_ESCRITURA = 19.3;

// [limite superior da faixa, emolumentos, FRJ]
const NOTAS = [
  [13786.58, 170.95, 38.85], [20679.87, 197.13, 44.8], [28951.83, 279.86, 63.61], [35845.12, 365.33, 83.03],
  [44117.08, 456.32, 103.72], [53767.69, 550.08, 125.03], [62039.64, 647.96, 147.28], [71690.25, 748.59, 170.15],
  [79962.21, 853.38, 193.97], [90991.48, 962.3, 218.73], [100642.09, 1076.74, 244.74], [111671.36, 1193.9, 271.37],
  [122700.64, 1316.61, 299.26], [133729.9, 1443.44, 328.09], [146137.83, 1574.42, 357.86], [158545.76, 1672.3, 380.11],
  [170953.69, 1770.19, 402.36], [184740.27, 1865.32, 423.98], [198526.88, 1959.07, 445.29], [212313.47, 2051.42, 466.28],
  [226100.05, 2142.42, 486.97],
];
const REGISTRO = [
  [13786.59, 162.65, 36.97], [20679.87, 184.73, 41.98], [28951.83, 263.31, 59.85], [35845.12, 343.27, 78.02],
  [44117.08, 428.76, 97.45], [53767.69, 516.98, 117.5], [62039.64, 607.98, 138.19], [71690.25, 703.11, 159.81],
  [79962.21, 802.37, 182.37], [90991.48, 904.39, 205.56], [100642.09, 1010.55, 229.69], [111671.36, 1122.22, 255.08],
  [122700.64, 1222.85, 277.95], [133729.9, 1324.88, 301.14], [146137.83, 1429.66, 324.96], [158545.76, 1535.82, 349.09],
  [170953.69, 1643.35, 373.53], [184740.27, 1752.26, 398.28], [198526.88, 1863.93, 423.67], [212313.47, 1976.99, 449.36],
  [226100.05, 2091.41, 475.37],
];
// Acima da última faixa: + R$ 50 a cada R$ 50.000, com teto. O FRJ segue a mesma proporção da última faixa.
const PASSO = 50000, ACRESCIMO = 50, TETO_EMOL = 5664.71;

function ato(tabela, valor, desconto = 0) {
  const ult = tabela[tabela.length - 1];
  let emol, frj;
  const f = tabela.find((t) => valor <= t[0]);
  if (f) { emol = f[1]; frj = f[2]; } else {
    emol = Math.min(TETO_EMOL, ult[1] + Math.ceil((valor - ult[0]) / PASSO) * ACRESCIMO);
    frj = emol * (ult[2] / ult[1]);
  }
  return emol * (1 - desconto) + frj;
}

const semAcento = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function aliquotaItbi(cidade) {
  const a = ITBI_CIDADES[semAcento(cidade)];
  return { taxa: a ?? ITBI_PADRAO, confirmada: a !== undefined };
}

// financiado: valor financiado (0 = compra à vista). primeiroSfh: aplica o art. 290 da Lei 6.015/73.
export function custosCompra({ preco, cidade, financiado = 0, primeiroSfh = false }) {
  const { taxa, confirmada } = aliquotaItbi(cidade);
  const desc = financiado > 0 && primeiroSfh ? 0.5 : 0;
  const itens = [{ id: 'itbi', nome: `ITBI (${(taxa * 100).toLocaleString('pt-BR')}% do valor do imóvel)`, valor: preco * taxa }];
  if (financiado > 0) {
    itens.push({ id: 'reg', nome: 'Registro da compra no Registro de Imóveis', valor: ato(REGISTRO, preco, desc) });
    itens.push({ id: 'af', nome: 'Registro da alienação fiduciária (garantia do banco)', valor: ato(REGISTRO, financiado, desc) });
  } else {
    itens.push({ id: 'esc', nome: 'Escritura pública no Tabelionato de Notas', valor: ato(NOTAS, preco) + SELO_ESCRITURA });
    itens.push({ id: 'reg', nome: 'Registro da escritura no Registro de Imóveis', valor: ato(REGISTRO, preco) });
  }
  const total = itens.reduce((s, x) => s + x.valor, 0);
  return { itens, total, itbiConfirmado: confirmada, desconto: desc > 0 };
}
