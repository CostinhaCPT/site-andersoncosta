// Regras de mercado usadas na simulação do site. Atualize aqui quando os bancos mudarem.
// Taxas de balcão "a partir de" (SBPE, + TR), pesquisa de 05/11/2026:
// MySide (out/2026), Exame 07/10/2026, Portas 29-30/10/2026 (altas de Santander, Itaú e Bradesco).
export const ATUALIZADO = 'nov/2026';
export const BANCOS = [
  { id: 'caixa', nome: 'Caixa', taxa: 10.26, cota: 80, prazoMax: 35 },
  { id: 'bb', nome: 'Banco do Brasil', taxa: 11.6, cota: 80, prazoMax: 35 },
  { id: 'santander', nome: 'Santander', taxa: 12.49, cota: 80, prazoMax: 35 },
  { id: 'itau', nome: 'Itaú', taxa: 12.95, cota: 80, prazoMax: 35 },
  { id: 'bradesco', nome: 'Bradesco', taxa: 15.0, cota: 80, prazoMax: 35 },
];
export const TETO_SFH = 2250000; // Resolução CMN 5.255, vigente desde 10/10/2025
export const IDADE_MAX_FIM = 80.5; // idade + prazo não passa de 80 anos e 6 meses na maioria dos bancos
export const COMPROMETIMENTO = 0.3; // parcela até 30% da renda bruta familiar
