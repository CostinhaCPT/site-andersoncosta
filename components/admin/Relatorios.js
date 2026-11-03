'use client';
// Relatório do proprietário: o sistema junta os números (site, Instagram, anúncios, interessados, visitas, mercado),
// a IA escreve a análise na voz do Anderson, ele revisa e só então libera o link e envia pelo WhatsApp.
import { useEffect, useState } from 'react';
import { sb } from '@/lib/admin/cliente';
import { chamarApp, dataHora } from '@/lib/admin/ia';
import { SITE } from '@/lib/site';
import RelatorioVista from '@/components/RelatorioVista';

const hojeBr = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const diasAtras = (d) => new Date(Date.now() - 3 * 3600e3 - d * 864e5).toISOString().slice(0, 10);

export default function Relatorios() {
  const [lista, setLista] = useState(null);
  const [aberto, setAberto] = useState(null);
  const [imoveis, setImoveis] = useState([]);
  const [novo, setNovo] = useState({ cod: '', inicio: diasAtras(30), fim: hojeBr() });
  const [msg, setMsg] = useState('');
  const carregar = () => sb().from('relatorios').select('id,imovel_codigo,inicio,fim,status,criado_em,liberado_em').order('criado_em', { ascending: false }).limit(60).then(({ data }) => setLista(data || []));
  useEffect(() => {
    carregar();
    sb().from('imoveis').select('codigo,titulo,proprietario_id,parceiro_id,relatorio_mensal').in('status', ['disponivel', 'reservado']).order('codigo', { ascending: false }).then(({ data }) => setImoveis(data || []));
  }, []);
  const criar = async (e) => {
    e.preventDefault(); setMsg('');
    if (!novo.cod) { setMsg('Escolha o imóvel.'); return; }
    const { data: dados, error } = await sb().rpc('montar_relatorio', { p_codigo: novo.cod, p_inicio: novo.inicio, p_fim: novo.fim });
    if (error) { setMsg('Não deu: ' + error.message); return; }
    const { data, error: e2 } = await sb().from('relatorios').insert({ imovel_codigo: novo.cod, inicio: novo.inicio, fim: novo.fim, dados }).select('id').single();
    if (e2) { setMsg('Não deu: ' + e2.message); return; }
    carregar(); setAberto(data.id);
  };
  if (aberto) return <section className="adm-pagina"><Relatorio id={aberto} aoFechar={() => { setAberto(null); carregar(); }} /></section>;
  const semDono = imoveis.filter((i) => i.relatorio_mensal !== false && !i.proprietario_id && !i.parceiro_id).length;
  return (
    <section className="adm-pagina">
      <div className="adm-cabeca"><div><h1>Relatórios do proprietário</h1><p className="adm-sub">Todo dia 1 sai um rascunho do mês para cada imóvel com proprietário ou parceiro ligado. Você revisa, libera e envia.</p></div></div>
      {semDono > 0 && <p className="adm-msg">{semDono} imóvel(is) à venda sem proprietário nem parceiro ligado não entram no automático. No cadastro do imóvel, ligue um dos dois, ou desmarque "Gerar relatório mensal". Você ainda pode gerar o relatório na mão e enviar o link para quem quiser.</p>}
      <form className="adm-bloco adm-grade2" onSubmit={criar}>
        <label className="adm-campo"><span>Imóvel</span><select value={novo.cod} onChange={(e) => setNovo({ ...novo, cod: e.target.value })}><option value="">Escolha</option>{imoveis.map((i) => <option key={i.codigo} value={i.codigo}>{i.codigo} · {i.titulo}</option>)}</select></label>
        <span className="adm-linha">
          <label className="adm-campo"><span>De</span><input type="date" value={novo.inicio} onChange={(e) => setNovo({ ...novo, inicio: e.target.value })} /></label>
          <label className="adm-campo"><span>Até</span><input type="date" value={novo.fim} onChange={(e) => setNovo({ ...novo, fim: e.target.value })} /></label>
        </span>
        <button className="adm-btn adm-primario">Gerar relatório agora</button>
      </form>
      {msg && <p className="adm-erro">{msg}</p>}
      {!lista ? <p className="adm-sub">Carregando…</p> : !lista.length ? <p className="adm-sub">Nenhum relatório ainda.</p> : (
        <ul className="adm-lista">{lista.map((r) => (
          <li key={r.id} className="adm-fila">
            <div><b>{r.imovel_codigo}</b> <span className={`adm-tag ${r.status === 'liberado' ? 't-voce' : 't-alerta'}`}>{r.status === 'liberado' ? 'Liberado' : 'Para revisar'}</span>
              <small>{new Date(r.inicio + 'T12:00').toLocaleDateString('pt-BR')} a {new Date(r.fim + 'T12:00').toLocaleDateString('pt-BR')}{r.liberado_em ? ` · liberado ${dataHora(r.liberado_em)}` : ''}</small></div>
            <button className="adm-btn" onClick={() => setAberto(r.id)}>Abrir</button>
          </li>
        ))}</ul>
      )}
    </section>
  );
}

function Relatorio({ id, aoFechar }) {
  const [r, setR] = useState(null);
  const [dono, setDono] = useState(null);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [msg, setMsg] = useState('');
  const carregar = async () => {
    const { data } = await sb().from('relatorios').select('*').eq('id', id).single();
    setR(data); setTexto(data?.texto || '');
    const { data: im } = await sb().from('imoveis').select('proprietario_id,parceiro_id').eq('codigo', data.imovel_codigo).maybeSingle();
    const alvo = im?.proprietario_id || im?.parceiro_id;
    if (alvo) sb().from('contatos').select('id,nome,whatsapp').eq('id', alvo).maybeSingle().then(({ data: c }) => setDono(c && { ...c, parceiro: !im.proprietario_id }));
  };
  useEffect(() => { carregar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <p className="adm-sub">Carregando…</p>;
  const link = `${SITE.dominio}/relatorio/?t=${r.token}`;
  const salvar = async (extra = {}) => {
    const { error } = await sb().from('relatorios').update({ texto, atualizado_em: new Date().toISOString(), ...extra }).eq('id', id);
    if (error) throw error;
    await carregar();
  };
  const escrever = async () => {
    setOcupado('ia'); setMsg('');
    try { await salvar(); const x = await chamarApp({ acao: 'relatorio_texto', id }); setTexto(x.texto); setR({ ...r, texto: x.texto }); }
    catch (e) { setMsg(e.message); }
    setOcupado('');
  };
  const atualizarNumeros = async () => {
    setOcupado('num'); setMsg('');
    const { data, error } = await sb().rpc('montar_relatorio', { p_codigo: r.imovel_codigo, p_inicio: r.inicio, p_fim: r.fim });
    if (error) setMsg(error.message); else await salvar({ dados: data });
    setOcupado('');
  };
  const liberar = async () => {
    if (!texto.trim() && !confirm('Liberar sem a sua análise escrita?')) return;
    await salvar({ status: 'liberado', liberado_em: new Date().toISOString() }); setMsg('Liberado. Agora é só enviar o link.');
  };
  const recolher = async () => { await salvar({ status: 'rascunho' }); setMsg('Link desativado.'); };
  const investimento = !!r.opcoes?.mostrar_investimento;
  const nome1 = dono?.nome ? `, ${dono.nome.split(' ')[0]}` : '';
  const msgWhats = dono?.parceiro
    ? `Olá${nome1}! Segue o relatório do imóvel ${r.imovel_codigo} com o trabalho de divulgação do período: alcance, interessados, visitas e a minha leitura do mercado. Fique à vontade para repassar ao proprietário.\n${link}`
    : `Olá${nome1}! Segue o relatório do seu imóvel (${r.imovel_codigo}) com tudo o que aconteceu no período: divulgação, interessados, visitas e a minha leitura do mercado.\n${link}`;
  const copiar = async (t) => { try { await navigator.clipboard.writeText(t); setMsg('Copiado.'); } catch { setMsg(t); } };
  return (
    <div>
      <button className="adm-link" onClick={aoFechar}>← Voltar</button>
      <div className="adm-bloco">
        <div className="adm-bloco-topo"><h2>Sua análise (vai no relatório)</h2><button className="adm-btn" disabled={!!ocupado} onClick={escrever}>{ocupado === 'ia' ? 'Escrevendo…' : '✦ Escrever com IA'}</button></div>
        <textarea rows={12} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="O que fiz neste período / O que o mercado está dizendo / Minha leitura / Próximos passos" />
        {r.dados?.interno?.feedbacks?.length > 0 && (
          <details className="adm-sub"><summary>Anotações de visitas usadas pela IA (não aparecem para o proprietário)</summary><ul>{r.dados.interno.feedbacks.map((f, k) => <li key={k}>{f}</li>)}</ul></details>
        )}
        <div className="adm-checks">
          <label className="adm-check"><input type="checkbox" checked={investimento} onChange={async (e) => { await salvar({ opcoes: { ...r.opcoes, mostrar_investimento: e.target.checked } }); }} /> Mostrar quanto investi em anúncios</label>
        </div>
        <div className="adm-wa-acoes">
          <button className="adm-btn" onClick={() => salvar().then(() => setMsg('Salvo.'))}>Salvar texto</button>
          <button className="adm-btn" disabled={!!ocupado} onClick={atualizarNumeros}>{ocupado === 'num' ? 'Atualizando…' : 'Atualizar números'}</button>
          <button className="adm-btn" onClick={() => window.print()}>Imprimir / PDF</button>
          {r.status !== 'liberado' ? <button className="adm-btn adm-primario" onClick={liberar}>Liberar link</button> : <button className="adm-link" onClick={recolher}>Desativar link</button>}
        </div>
        {r.status === 'liberado' && (
          <div className="adm-wa-acoes">
            {dono?.whatsapp ? <a className="adm-btn adm-whats" href={`https://wa.me/${dono.whatsapp}?text=${encodeURIComponent(msgWhats)}`} target="_blank" rel="noopener">Enviar para {dono.nome?.split(' ')[0] || (dono.parceiro ? 'o parceiro' : 'o proprietário')}{dono.parceiro ? ' (parceiro)' : ''} no WhatsApp</a>
              : <button className="adm-btn" onClick={() => copiar(msgWhats)}>Copiar mensagem com o link</button>}
            <button className="adm-link" onClick={() => copiar(link)}>Copiar só o link</button>
          </div>
        )}
        {msg && <p className="adm-msg">{msg}</p>}
      </div>
      <RelatorioVista dados={investimento ? r.dados : { ...r.dados, anuncios: { ...r.dados?.anuncios, investimento: null } }} texto={texto} inicio={r.inicio} fim={r.fim} />
    </div>
  );
}
