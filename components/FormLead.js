'use client';
import { useState } from 'react';
import { abrirWhats, evento } from '@/lib/whats';
export default function FormLead({ imovel, titulo = 'Receba sua curadoria gratuita', botao = 'Quero minha curadoria', escuro = false }) {
  const [f, setF] = useState({ nome: '', whats: '', local: imovel ? imovel.bairro : '', orcamento: '', tipo: '', objetivo: 'Morar', prazo: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const enviar = (e) => {
    e.preventDefault();
    evento(imovel ? 'form_imovel' : 'curadoria_request', { imovel: imovel?.codigo, orcamento: f.orcamento, prazo: f.prazo });
    const linhas = [
      imovel ? `Olá, Anderson! Tenho interesse no imóvel ${imovel.codigo} (${imovel.titulo}).` : 'Olá, Anderson! Quero receber a curadoria gratuita.',
      `Nome: ${f.nome}`, `WhatsApp: ${f.whats}`, `Cidade/bairro: ${f.local}`, `Orçamento: ${f.orcamento}`, `Tipo: ${f.tipo}`, `Objetivo: ${f.objetivo}`, `Prazo: ${f.prazo}`,
    ];
    abrirWhats(linhas.join('\n'), { origem_form: imovel ? 'imovel' : 'curadoria' });
  };
  return (
    <form onSubmit={enviar} className={escuro ? '' : 'box'}>
      {titulo && <h3 style={{ marginBottom: 16 }}>{titulo}</h3>}
      <div className="duas">
        <div className="campo"><label htmlFor="n">Nome</label><input id="n" required placeholder="Ex.: Mariana Souza" value={f.nome} onChange={set('nome')} autoComplete="name" /></div>
        <div className="campo"><label htmlFor="w">WhatsApp</label><input id="w" required inputMode="tel" placeholder="(47) 9...." value={f.whats} onChange={set('whats')} autoComplete="tel" /></div>
      </div>
      <div className="duas">
        <div className="campo"><label htmlFor="l">Cidade ou bairro</label><input id="l" value={f.local} onChange={set('local')} placeholder="Ex.: Amizade, Centro" /></div>
        <div className="campo"><label htmlFor="o">Orçamento</label><select id="o" required value={f.orcamento} onChange={set('orcamento')}><option value="">Selecione</option><option>Até R$ 600 mil</option><option>R$ 600 a 850 mil</option><option>R$ 850 mil a 1 milhão</option><option>Acima de R$ 1 milhão</option></select></div>
      </div>
      <div className="duas">
        <div className="campo"><label htmlFor="t">Tipo de imóvel</label><select id="t" value={f.tipo} onChange={set('tipo')}><option value="">Tanto faz</option><option>Casa</option><option>Geminado</option><option>Apartamento</option><option>Terreno</option></select></div>
        <div className="campo"><label htmlFor="ob">Objetivo</label><select id="ob" value={f.objetivo} onChange={set('objetivo')}><option>Morar</option><option>Investir</option></select></div>
      </div>
      <div className="campo"><label htmlFor="p">Quando pretende comprar?</label><select id="p" required value={f.prazo} onChange={set('prazo')}><option value="">Selecione</option><option>Até 3 meses</option><option>De 3 a 6 meses</option><option>De 6 a 12 meses</option><option>Só pesquisando</option></select></div>
      <button className="btn btn-escuro btn-full" style={escuro ? { background: '#fff', color: '#070707' } : {}}>{botao}</button>
      <p className="lgpd">Ao enviar, você abre uma conversa comigo no WhatsApp. Uso seus dados só para este atendimento, conforme a política de privacidade.</p>
    </form>
  );
}
