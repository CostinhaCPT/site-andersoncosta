'use client';
import { useState } from 'react';
import { abrirWhats, evento } from '@/lib/whats';
// Curadoria em dois campos: abre a conversa no WhatsApp já com o pedido escrito.
export default function CuradoriaCurta() {
  const [whats, setWhats] = useState('');
  const [pedido, setPedido] = useState('');
  const enviar = (e) => {
    e.preventDefault();
    const contato = { telefone: whats };
    evento('curadoria_request', { content_category: 'curadoria', origem_form: 'home' }, contato);
    abrirWhats(['Olá, Anderson! Quero receber a curadoria gratuita.', `O que procuro: ${pedido}`, `Meu WhatsApp: ${whats}`].join('\n'), { origem_form: 'curadoria_home' }, contato);
  };
  return (
    <form className="curadoria-curta" onSubmit={enviar}>
      <label htmlFor="cc-w">Seu WhatsApp</label>
      <input id="cc-w" required inputMode="tel" autoComplete="tel" placeholder="(47) 9 0000-0000" value={whats} onChange={(e) => setWhats(e.target.value)} />
      <label htmlFor="cc-p">O que você procura</label>
      <textarea id="cc-p" required rows={3} placeholder="Ex.: casa com 3 quartos e quintal, perto de escola, até R$ 900 mil" value={pedido} onChange={(e) => setPedido(e.target.value)} />
      <button type="submit" className="btn btn-claro btn-full">Quero minha curadoria</button>
      <p className="lgpd">Ao enviar, você abre uma conversa comigo no WhatsApp. Uso seus dados só para este atendimento.</p>
    </form>
  );
}
