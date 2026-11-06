'use client';
import { useState } from 'react';
import { brl } from '@/lib/format';
import { BANCOS, ATUALIZADO, TETO_SFH, IDADE_MAX_FIM, COMPROMETIMENTO } from '@/lib/financiamento';
// ITBI Jaraguá do Sul: 2% (Câmara de Vereadores, set/2025). Escritura e registro: estimativa.
const ITBI = 0.02, CARTORIO = 0.012;
const pct = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
export default function Analise({ i }) {
  const [bancoId, setBancoId] = useState('caixa');
  const banco = BANCOS.find((b) => b.id === bancoId) || BANCOS[0];
  const entMin = 100 - banco.cota;
  const [entTxt, setEntTxt] = useState('30');
  const [anosTxt, setAnosTxt] = useState('30');
  const [idadeTxt, setIdadeTxt] = useState('');
  const idade = +idadeTxt || 0;
  const prazoTeto = Math.max(1, Math.min(banco.prazoMax, idade ? Math.floor(IDADE_MAX_FIM - idade) : banco.prazoMax));
  const ent = Math.min(90, Math.max(entMin, +entTxt || entMin));
  const anos = Math.min(prazoTeto, Math.max(5, +anosTxt || 5));
  const fin = i.preco * (1 - ent / 100);
  const n = anos * 12, j = Math.pow(1 + banco.taxa / 100, 1 / 12) - 1;
  const amort = fin / n;
  const p1 = amort + fin * j; // primeira parcela SAC
  const pN = amort + amort * j; // última parcela SAC
  const renda = p1 / COMPROMETIMENTO;
  const custos = i.preco * (ITBI + CARTORIO);
  const temRef = !!(i.precoM2 && i.refM2);
  const dif = temRef ? ((i.precoM2 - i.refM2) / i.refM2) * 100 : 0;
  const pos = Math.max(4, Math.min(96, 50 + dif));
  const avisoEnt = (+entTxt || 0) < entMin;
  const avisoPrazo = (+anosTxt || 0) > prazoTeto;
  return (
    <section className="analise" id="analise">
      <span className="eyebrow">Método Compra Segura</span>
      <h2>Análise de compra</h2>
      <p className="muted">Uma leitura rápida para comparar com calma. A análise completa, com documentação, eu entrego na curadoria.</p>
      {temRef && <>
      <h3 style={{ marginTop: 24 }}>Preço por m²</h3>
      <div className="linhas">
        <div className="linha"><span>Este imóvel</span><b>{brl(i.precoM2)}/m²</b></div>
        <div className="linha"><span>Referência para {i.tipoSlug === 'apartamento' ? 'apartamentos' : 'casas e geminados'} {i.refAmostra ? `no ${i.bairro}` : 'em Jaraguá do Sul'}</span><b>{brl(i.refM2)}/m²</b></div>
      </div>
      <div className="barra"><i style={{ left: '50%', background: '#999' }} /><i style={{ left: pos + '%' }} /></div>
      <p className="nota">{Math.abs(dif) < 5 ? 'Em linha com a referência.' : dif < 0 ? `${Math.abs(dif).toFixed(0)}% abaixo da referência.` : `${dif.toFixed(0)}% acima da referência.`} Referência: mediana do preço por m² dos imóveis anunciados que acompanho {i.refAmostra ? `no bairro (${i.refAmostra} imóveis)` : 'na cidade, pois a amostra do bairro ainda é pequena'}, out/2026. Calculado sobre a área construída: terreno grande, acabamento e idade mudam o valor justo.{i.terreno && i.terreno > 2 * i.area ? ' Este imóvel tem terreno amplo, o que eleva o preço por m² construído.' : ''}</p>
      </>}
      <h3 style={{ marginTop: temRef ? 28 : 24 }}>Custo total de aquisição</h3>
      <div className="linhas">
        <div className="linha"><span>Valor do imóvel</span><b>{brl(i.preco)}</b></div>
        <div className="linha"><span>ITBI (2%)</span><b>{brl(i.preco * ITBI)}</b></div>
        <div className="linha"><span>Escritura e registro (estimativa)</span><b>{brl(i.preco * CARTORIO)}</b></div>
        <div className="linha" style={{ borderBottom: 0 }}><span><b>Total estimado</b></span><b>{brl(i.preco + custos)}</b></div>
      </div>
      <p className="nota">ITBI de Jaraguá do Sul: 2% sobre o valor do imóvel. Cartório varia conforme a tabela vigente e o tipo de contrato; confirmo o valor exato na curadoria.</p>

      <h3 style={{ marginTop: 28 }}>Simulação de financiamento</h3>
      {i.aceitaFinanciamento === false && <p className="nota aviso">O anúncio deste imóvel informa que ele não aceita financiamento. A simulação abaixo serve só como referência.</p>}
      <div className="sim">
        <label>Banco<select value={bancoId} onChange={(e) => setBancoId(e.target.value)}>{BANCOS.map((b) => <option key={b.id} value={b.id}>{b.nome} · {pct(b.taxa)}% a.a.</option>)}</select></label>
        <label>Entrada (%)<input type="number" inputMode="numeric" min={entMin} max="90" value={entTxt} onChange={(e) => setEntTxt(e.target.value)} onBlur={() => setEntTxt(String(ent))} /></label>
        <label>Prazo (anos)<input type="number" inputMode="numeric" min="5" max={prazoTeto} value={anosTxt} onChange={(e) => setAnosTxt(e.target.value)} onBlur={() => setAnosTxt(String(anos))} /></label>
        <label>Sua idade <span className="opc">(opcional)</span><input type="number" inputMode="numeric" min="18" max="79" placeholder="ex.: 38" value={idadeTxt} onChange={(e) => setIdadeTxt(e.target.value)} /></label>
      </div>
      {avisoEnt && <p className="nota aviso">Os bancos financiam no máximo {banco.cota}% do valor de avaliação no SBPE. A entrada mínima é de {entMin}%, e a simulação já usa esse piso.</p>}
      {avisoPrazo && <p className="nota aviso">Prazo máximo neste caso: {prazoTeto} anos{idade ? ' (idade mais prazo não passa de 80 anos e 6 meses)' : ''}. A simulação já usa esse limite.</p>}
      <div className="linhas">
        <div className="linha"><span>Taxa usada ({banco.nome})</span><b>{pct(banco.taxa)}% a.a. + TR</b></div>
        <div className="linha"><span>Entrada ({ent}%)</span><b>{brl(i.preco * ent / 100)}</b></div>
        <div className="linha"><span>Entrada + ITBI e cartório</span><b>{brl(i.preco * ent / 100 + custos)}</b></div>
        <div className="linha"><span>Valor financiado</span><b>{brl(fin)}</b></div>
        <div className="linha"><span>1ª parcela estimada (SAC, {anos * 12} meses)</span><b>{brl(p1)}</b></div>
        <div className="linha"><span>Última parcela estimada</span><b>{brl(pN)}</b></div>
        <div className="linha" style={{ borderBottom: 0 }}><span>Renda familiar bruta sugerida</span><b>{brl(renda)}</b></div>
      </div>
      <p className="nota">Taxas de balcão "a partir de" divulgadas pelos bancos ({ATUALIZADO}), para financiamento SBPE na tabela SAC. A taxa final depende da análise de crédito, do relacionamento com o banco e da avaliação do imóvel. A parcela não inclui seguros obrigatórios (MIP e DFI), tarifa de administração nem TR, e os bancos costumam limitar a parcela a cerca de {COMPROMETIMENTO * 100}% da renda bruta. {i.preco > TETO_SFH ? 'Este imóvel está acima do teto do SFH (R$ 2,25 milhões): o financiamento é pelo SFI, sem uso de FGTS, e as condições podem ser diferentes. ' : 'Imóvel dentro do teto do SFH: dá para usar FGTS na entrada, se você tiver direito. '}Faço a simulação oficial com você antes de qualquer proposta.</p>
    </section>
  );
}
