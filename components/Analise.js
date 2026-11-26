'use client';
import { useState } from 'react';
import { brl } from '@/lib/format';
import { BANCOS, ATUALIZADO, TETO_SFH, IDADE_MAX_FIM, COMPROMETIMENTO } from '@/lib/financiamento';
import { custosCompra, CUSTOS_ATUALIZADO } from '@/lib/custos';
// Impostos e cartório: estimativa no site (decisão de 26/11/2026, substitui a de 13/11/2026). O valor oficial segue por escrito na conversa.
const pct = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
export default function Analise({ i, comp }) {
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
  const temRef = !!comp;
  const avisoEnt = (+entTxt || 0) < entMin;
  const avisoPrazo = (+anosTxt || 0) > prazoTeto;
  const [forma, setForma] = useState(i.aceitaFinanciamento === false ? 'vista' : 'fin');
  const [primeiro, setPrimeiro] = useState('nao');
  const podeSfh = i.preco <= TETO_SFH;
  const custos = custosCompra({ preco: i.preco, cidade: i.cidade, financiado: forma === 'fin' ? fin : 0, primeiroSfh: podeSfh && primeiro === 'sim' });
  const entradaDia = forma === 'fin' ? i.preco * ent / 100 : i.preco;
  return (
    <section className="analise" id="analise">
      <span className="eyebrow">Método Compra Segura</span>
      <h2>Análise de compra</h2>
      <p className="muted">Uma leitura rápida para comparar com calma. A análise completa, com documentação, eu entrego na conversa.</p>
      {temRef && <>
      <h3 style={{ marginTop: 24 }}>O m² deste imóvel contra {comp.parecidos}</h3>
      <div className="barras-m2 num">
        <div><span>Este imóvel</span><i style={{ width: (100 * comp.m2 / Math.max(comp.m2, comp.ref)) + '%' }} /><b>{brl(comp.m2)}</b></div>
        <div className="ref"><span>Mediana de {comp.n} {comp.parecidos} {comp.onde === 'bairro' ? `no ${i.bairro}` : `em ${i.cidade}`}</span><i style={{ width: (100 * comp.ref / Math.max(comp.m2, comp.ref)) + '%' }} /><b>{brl(comp.ref)}</b></div>
      </div>
      <p className="comp-veredito">{Math.abs(comp.dif) < 8 ? `No preço de ${comp.parecidos}.` : `${Math.abs(comp.dif)}% ${comp.dif > 0 ? 'acima' : 'abaixo'} de ${comp.parecidos}.`}</p>
      {comp.incerto && <p className="nota aviso">Diferença grande demais para ser só preço. Normalmente é metragem informada de outro jeito no anúncio (área total no lugar da construída, por exemplo) ou um padrão de imóvel bem diferente. Eu confiro com o anunciante antes de você tirar conclusão.</p>}
      {comp.dif >= 8 && !comp.incerto && comp.motivos.length > 0 && <div className="comp-motivos"><b>O que ajuda a explicar a diferença</b><ul>{comp.motivos.map((m) => <li key={m}>{m.charAt(0).toUpperCase() + m.slice(1)}.</li>)}</ul></div>}
      {comp.dif <= -8 && !comp.incerto && <p className="nota">Preço abaixo de imóveis parecidos pode ser oportunidade ou sinal de algo a conferir (estado, documentação, localização na rua). Eu confiro isso antes da visita.</p>}
      <details className="comp-lista">
        <summary>Quais imóveis entraram na conta</summary>
        <p className="nota">Critério: {comp.filtro}, {comp.onde === 'bairro' ? `no ${i.bairro}` : `em ${i.cidade}`}.{comp.ignorou.length ? ` Não havia amostra suficiente considerando ${comp.ignorou.join(' e ')}, então a comparação inclui imóveis sem esse item.` : ''}</p>
        <ul>{comp.exemplos.map((e) => <li key={e.codigo}><a href={`/imovel/${e.slug}/`}>{e.titulo}</a> <span className="num">· {Math.round(e.area)} m² · {brl(e.m2)}/m²</span></li>)}</ul>
      </details>
      <p className="nota">Preços de anúncio dos imóveis que acompanho, calculados sobre a área {i.tipoSlug === 'apartamento' ? 'privativa' : 'construída'}. Acabamento, estado de conservação e o que fica no imóvel mudam o valor justo, e é isso que eu reviso com você na conversa.</p>
      </>}
      <h3 style={{ marginTop: temRef ? 28 : 24 }}>Simulação de financiamento</h3>
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
        <div className="linha"><span>Valor financiado</span><b>{brl(fin)}</b></div>
        <div className="linha"><span>1ª parcela estimada (SAC, {anos * 12} meses)</span><b>{brl(p1)}</b></div>
        <div className="linha"><span>Última parcela estimada</span><b>{brl(pN)}</b></div>
        <div className="linha" style={{ borderBottom: 0 }}><span>Renda familiar bruta sugerida</span><b>{brl(renda)}</b></div>
      </div>
      <p className="nota">Taxas de balcão "a partir de" divulgadas pelos bancos ({ATUALIZADO}), para financiamento SBPE na tabela SAC. A taxa final depende da análise de crédito, do relacionamento com o banco e da avaliação do imóvel. A parcela não inclui seguros obrigatórios (MIP e DFI), tarifa de administração nem TR, e os bancos costumam limitar a parcela a cerca de {COMPROMETIMENTO * 100}% da renda bruta. {i.preco > TETO_SFH ? 'Este imóvel está acima do teto do SFH (R$ 2,25 milhões): o financiamento é pelo SFI, sem uso de FGTS, e as condições podem ser diferentes. ' : 'Imóvel dentro do teto do SFH: dá para usar FGTS na entrada, se você tiver direito. '}Faço a simulação oficial com você antes de qualquer proposta.</p>
      <h3 style={{ marginTop: 28 }}>Custos da compra além do preço</h3>
      <p className="muted">ITBI e cartório, que quase ninguém coloca na conta e que normalmente não entram no financiamento.</p>
      <div className="sim">
        <label>Forma de compra<select value={forma} onChange={(e) => setForma(e.target.value)}><option value="fin">Financiada</option><option value="vista">À vista</option></select></label>
        {forma === 'fin' && podeSfh && <label>Primeiro imóvel residencial?<select value={primeiro} onChange={(e) => setPrimeiro(e.target.value)}><option value="nao">Não</option><option value="sim">Sim, pelo SFH</option></select></label>}
      </div>
      <div className="linhas">
        {custos.itens.map((c) => <div className="linha" key={c.id}><span>{c.nome}</span><b>{brl(c.valor)}</b></div>)}
        <div className="linha"><span><b>Total de impostos e cartório</b></span><b>{brl(custos.total)}</b></div>
        <div className="linha" style={{ borderBottom: 0 }}><span>{forma === 'fin' ? 'Entrada + custos (o que sai do seu bolso)' : 'Preço + custos'}</span><b>{brl(entradaDia + custos.total)}</b></div>
      </div>
      <p className="nota">Estimativa pela {CUSTOS_ATUALIZADO} de emolumentos de Santa Catarina, com o fundo do Judiciário (FRJ) incluído. {custos.itbiConfirmado ? 'ITBI de Jaraguá do Sul: 2% sobre o valor da compra, que a prefeitura pode revisar se considerar abaixo do mercado. ' : `ITBI estimado em 2%: a alíquota de ${i.cidade || 'cada cidade'} eu confirmo com a prefeitura. `}{forma === 'fin' ? 'No financiamento, o contrato do banco já vale como escritura, então não há escritura em cartório, mas são dois registros: o da compra e o da garantia do banco. ' : ''}{custos.desconto ? 'Na primeira compra residencial financiada pelo SFH, a lei reduz pela metade os emolumentos de registro (Lei 6.015/73, art. 290). ' : ''}Não entram aqui certidões, ISS municipal sobre o cartório{forma === 'fin' ? ', a tarifa de avaliação do imóvel cobrada pelo banco' : ''} e eventuais custos de mudança. Passo o valor exato por escrito antes de você assinar qualquer coisa.</p>
    </section>
  );
}
