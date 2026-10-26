'use client';
import { useState } from 'react';
import { brl } from '@/lib/format';
// ITBI Jaraguá do Sul: 2% (Câmara de Vereadores, set/2025). Escritura e registro: estimativa.
const ITBI = 0.02, CARTORIO = 0.012;
export default function Analise({ i }) {
  const [ent, setEnt] = useState(30);
  const [taxa, setTaxa] = useState(11.5);
  const [anos, setAnos] = useState(30);
  const fin = i.preco * (1 - ent / 100);
  const n = anos * 12, j = Math.pow(1 + taxa / 100, 1 / 12) - 1;
  const p1 = fin / n + fin * j; // primeira parcela SAC
  const dif = ((i.precoM2 - i.refM2) / i.refM2) * 100;
  const pos = Math.max(4, Math.min(96, 50 + dif));
  return (
    <section className="analise" id="analise">
      <span className="eyebrow">Método Compra Segura</span>
      <h2>Análise de compra</h2>
      <p className="muted">Uma leitura rápida para comparar com calma. A análise completa, com documentação, eu entrego na curadoria.</p>
      <h3 style={{ marginTop: 24 }}>Preço por m²</h3>
      <div className="linhas">
        <div className="linha"><span>Este imóvel</span><b>{brl(i.precoM2)}/m²</b></div>
        <div className="linha"><span>Referência para {i.tipoSlug === 'apartamento' ? 'apartamentos' : 'casas e geminados'} {i.refAmostra ? `no ${i.bairro}` : 'em Jaraguá do Sul'}</span><b>{brl(i.refM2)}/m²</b></div>
      </div>
      <div className="barra"><i style={{ left: '50%', background: '#999' }} /><i style={{ left: pos + '%' }} /></div>
      <p className="nota">{Math.abs(dif) < 5 ? 'Em linha com a referência.' : dif < 0 ? `${Math.abs(dif).toFixed(0)}% abaixo da referência.` : `${dif.toFixed(0)}% acima da referência.`} Referência: mediana do preço por m² dos imóveis anunciados que acompanho {i.refAmostra ? `no bairro (${i.refAmostra} imóveis)` : 'na cidade, pois a amostra do bairro ainda é pequena'}, out/2026. Calculado sobre a área construída: terreno grande, acabamento e idade mudam o valor justo.{i.terreno && i.terreno > 2 * i.area ? ' Este imóvel tem terreno amplo, o que eleva o preço por m² construído.' : ''}</p>
      <h3 style={{ marginTop: 28 }}>Custo total de aquisição</h3>
      <div className="linhas">
        <div className="linha"><span>Valor do imóvel</span><b>{brl(i.preco)}</b></div>
        <div className="linha"><span>ITBI (2%)</span><b>{brl(i.preco * ITBI)}</b></div>
        <div className="linha"><span>Escritura e registro (estimativa)</span><b>{brl(i.preco * CARTORIO)}</b></div>
        <div className="linha" style={{ borderBottom: 0 }}><span><b>Total estimado</b></span><b>{brl(i.preco * (1 + ITBI + CARTORIO))}</b></div>
      </div>
      <p className="nota">ITBI de Jaraguá do Sul: 2% sobre o valor do imóvel. Cartório varia conforme a tabela vigente e o tipo de contrato; confirmo o valor exato na curadoria.</p>
      <h3 style={{ marginTop: 28 }}>Simulação de financiamento</h3>
      <div className="sim">
        <label>Entrada (%)<input type="number" min="20" max="90" value={ent} onChange={(e) => setEnt(+e.target.value || 0)} /></label>
        <label>Juros ao ano (%)<input type="number" step="0.1" value={taxa} onChange={(e) => setTaxa(+e.target.value || 0)} /></label>
        <label>Prazo (anos)<input type="number" min="5" max="35" value={anos} onChange={(e) => setAnos(+e.target.value || 1)} /></label>
      </div>
      <div className="linhas">
        <div className="linha"><span>Entrada</span><b>{brl(i.preco * ent / 100)}</b></div>
        <div className="linha"><span>Valor financiado</span><b>{brl(fin)}</b></div>
        <div className="linha" style={{ borderBottom: 0 }}><span>1ª parcela estimada (SAC)</span><b>{brl(p1)}</b></div>
      </div>
      <p className="nota">Simulação ilustrativa, sem seguros e taxas do banco. A taxa real depende do banco e do seu perfil; faço a simulação oficial com você.</p>
    </section>
  );
}
