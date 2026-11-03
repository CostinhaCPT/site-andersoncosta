'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sb } from '@/lib/admin/cliente';
import { dataCurta, dataHora, deLocal, fone, paraLocal, soNumeros } from '@/lib/admin/ia';
import {
  baixarCsv, brl, chaveDe, comissao, etapasDo, FUNIS, lerCsv, numero, PAPEIS, rotuloEtapa, TIPOS_ATIVIDADE, TIPOS_EMPRESA, TIPOS_TAREFA,
} from '@/lib/admin/crm';

const COLS_C = 'id,nome,whatsapp,email,telefone2,empresa_id,papeis,cidade,bairro,aniversario,origem,canal,indicado_por,consentimento_marketing,nao_contatar,notas,campos,criado_em,atualizado_em';
const normal = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Contatos({ abrirId, aoAbrirNegocio }) {
  const [sub, setSub] = useState('contatos');
  return (
    <section className="adm-pagina adm-larga">
      <div className="adm-subabas">
        {[['contatos', 'Contatos'], ['empresas', 'Empresas'], ['duplicados', 'Duplicados'], ['campos', 'Campos personalizados']].map(([k, n]) => (
          <button key={k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>{n}</button>
        ))}
      </div>
      {sub === 'contatos' && <ListaContatos abrirId={abrirId} aoAbrirNegocio={aoAbrirNegocio} />}
      {sub === 'empresas' && <Empresas />}
      {sub === 'duplicados' && <Duplicados />}
      {sub === 'campos' && <ConfigCampos />}
    </section>
  );
}

// ----------------------------------------------------------------- lista
function ListaContatos({ abrirId, aoAbrirNegocio }) {
  const [lista, setLista] = useState(null);
  const [negocios, setNegocios] = useState([]);
  const [busca, setBusca] = useState('');
  const [papel, setPapel] = useState('');
  const [aberto, setAberto] = useState(null);
  const [erro, setErro] = useState('');
  const [importando, setImportando] = useState(false);
  const carregar = useCallback(async () => {
    const [{ data, error }, { data: n }] = await Promise.all([
      sb().from('contatos').select(COLS_C + ',empresas(nome)').order('atualizado_em', { ascending: false }).limit(2000),
      sb().from('leads').select('id,contato_id,funil,etapa,valor,comissao_pct,termometro,termometro_faixa').limit(3000),
    ]);
    if (error) setErro(error.message); else setLista(data);
    setNegocios(n || []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (abrirId && lista) { const c = lista.find((x) => x.id === abrirId); if (c) setAberto(c); } }, [abrirId, lista]);

  const porContato = useMemo(() => {
    const m = new Map();
    for (const n of negocios) { if (!m.has(n.contato_id)) m.set(n.contato_id, []); m.get(n.contato_id).push(n); }
    return m;
  }, [negocios]);
  const vistos = useMemo(() => (lista || []).filter((c) => (!papel || (c.papeis || []).includes(papel))
    && (!busca || normal(`${c.nome} ${c.whatsapp} ${c.email} ${c.empresas?.nome} ${c.bairro}`).includes(normal(busca)))), [lista, busca, papel]);

  if (aberto) return <Contato contato={aberto} aoFechar={(mudou) => { setAberto(null); if (mudou) carregar(); }} aoAbrirNegocio={aoAbrirNegocio} />;
  const exportar = () => baixarCsv('contatos.csv', vistos, [
    ['nome', 'Nome'], [(c) => fone(c.whatsapp), 'WhatsApp'], ['email', 'E-mail'], [(c) => c.empresas?.nome, 'Empresa'], ['papeis', 'Papéis'],
    ['cidade', 'Cidade'], ['bairro', 'Bairro'], [(c) => (porContato.get(c.id) || []).length, 'Negócios'], [(c) => (c.nao_contatar ? 'sim' : ''), 'Não contatar'], [(c) => dataCurta(c.criado_em), 'Criado em'],
  ]);
  return (
    <>
      <div className="adm-cabeca">
        <div><h1>Contatos</h1><p className="adm-sub">{lista ? `${vistos.length} de ${lista.length} contatos` : 'Carregando…'}</p></div>
        <div className="adm-wa-acoes">
          <button className="adm-btn" onClick={() => setImportando(true)}>Importar planilha</button>
          <button className="adm-btn" onClick={exportar}>Exportar</button>
          <button className="adm-btn adm-primario" onClick={() => setAberto({ papeis: ['comprador'] })}>+ Contato</button>
        </div>
      </div>
      {importando && <Importar aoFechar={(ok) => { setImportando(false); if (ok) carregar(); }} />}
      <div className="adm-filtros">
        <input type="search" placeholder="Buscar por nome, telefone, e-mail, empresa ou bairro" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={papel} onChange={(e) => setPapel(e.target.value)}><option value="">Todos os papéis</option>{PAPEIS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
      </div>
      {erro && <p className="adm-erro">{erro}</p>}
      <ul className="adm-lista">
        {vistos.slice(0, 300).map((c) => {
          const ns = porContato.get(c.id) || [];
          const abertos = ns.filter((n) => !['venda', 'perdido'].includes(n.etapa));
          return (
            <li key={c.id}><button onClick={() => setAberto(c)}>
              <span className="adm-info">
                <b>{c.nome || fone(c.whatsapp) || c.email}{c.nao_contatar && <span className="adm-tag t-bloq">não contatar</span>}</b>
                <small>{[fone(c.whatsapp), c.email, c.empresas?.nome].filter(Boolean).join(' · ')}</small>
                <small>{(c.papeis || []).map((p) => (PAPEIS.find((x) => x[0] === p) || [p, p])[1]).join(', ')}{abertos.length ? ` · ${abertos.length} negócio${abertos.length > 1 ? 's' : ''} aberto${abertos.length > 1 ? 's' : ''}` : ''}</small>
              </span>
            </button></li>
          );
        })}
      </ul>
      {vistos.length > 300 && <p className="adm-sub">Mostrando 300. Use a busca para achar os outros.</p>}
    </>
  );
}

// ----------------------------------------------------------------- ficha do contato
export function Contato({ contato, aoFechar, aoAbrirNegocio }) {
  const novo = !contato.id;
  const [f, setF] = useState({ ...contato, whatsTxt: fone(contato.whatsapp), papeis: contato.papeis || [] });
  const [empresas, setEmpresas] = useState([]);
  const [negocios, setNegocios] = useState([]);
  const [imoveis, setImoveis] = useState([]);
  const [msg, setMsg] = useState('');
  const [mudou, setMudou] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  useEffect(() => {
    sb().from('empresas').select('id,nome').order('nome').then(({ data }) => setEmpresas(data || []));
    if (!contato.id) return;
    sb().from('leads').select('id,funil,etapa,titulo,valor,comissao_pct,imovel_codigo,imoveis_interesse,termometro,termometro_faixa,criado_em,atualizado_em').eq('contato_id', contato.id).order('criado_em', { ascending: false }).then(({ data }) => setNegocios(data || []));
    sb().from('imoveis').select('codigo,titulo,status,bairro').eq('proprietario_id', contato.id).then(({ data }) => setImoveis(data || []));
  }, [contato.id, recarga]);

  const salvar = async () => {
    const whatsapp = soNumeros(f.whatsTxt) || null;
    if (!String(f.nome || '').trim() && !whatsapp && !f.email) { setMsg('Coloque pelo menos o nome, o WhatsApp ou o e-mail.'); return; }
    const dados = {
      nome: String(f.nome || '').trim() || null, whatsapp, email: f.email || null, telefone2: soNumeros(f.telefone2) || null,
      empresa_id: f.empresa_id || null, papeis: f.papeis, cidade: f.cidade || null, bairro: f.bairro || null, aniversario: f.aniversario || null,
      canal: f.canal || null, consentimento_marketing: !!f.consentimento_marketing, nao_contatar: !!f.nao_contatar, notas: f.notas || null,
      campos: f.campos || {}, atualizado_em: new Date().toISOString(),
    };
    if (whatsapp && novo) {
      const { data: ja } = await sb().from('contatos').select('id,nome').eq('whatsapp', whatsapp).limit(1);
      if (ja?.length && !confirm(`Já existe um contato com esse WhatsApp (${ja[0].nome || 'sem nome'}). Criar outro mesmo assim?`)) return;
    }
    const q = novo ? sb().from('contatos').insert(dados).select(COLS_C).single() : sb().from('contatos').update(dados).eq('id', contato.id).select(COLS_C).single();
    const { data, error } = await q;
    if (error) { setMsg('Não salvou: ' + error.message); return; }
    if (novo) { aoFechar(true); return; }
    setF({ ...f, ...data }); setMudou(true); setMsg('Salvo.');
  };
  const novoNegocio = async (funil) => {
    const { data, error } = await sb().from('leads').insert({
      contato_id: contato.id, funil, etapa: FUNIS[funil].inicial, nome: f.nome || null, whatsapp: contato.whatsapp || null, email: contato.email || null,
      titulo: funil === 'captacao' ? `Captação · ${f.nome || ''}`.trim() : `Compra · ${f.nome || ''}`.trim(), canal: f.canal || null,
    }).select('id').single();
    if (error) { setMsg('Não criou: ' + error.message); return; }
    if (funil === 'captacao' && !f.papeis.includes('proprietario')) {
      const papeis = [...f.papeis, 'proprietario']; setF({ ...f, papeis }); await sb().from('contatos').update({ papeis }).eq('id', contato.id);
    }
    aoAbrirNegocio?.(data.id);
    setRecarga((x) => x + 1);
  };
  const excluir = async () => {
    if (negocios.length) { setMsg('Este contato tem negócios. Exclua ou mescle antes.'); return; }
    if (!confirm('Excluir este contato? Isso não tem volta.')) return;
    const { error } = await sb().from('contatos').delete().eq('id', contato.id);
    if (error) setMsg('Não excluiu: ' + error.message); else aoFechar(true);
  };
  const papel = (p) => setF({ ...f, papeis: f.papeis.includes(p) ? f.papeis.filter((x) => x !== p) : [...f.papeis, p] });

  return (
    <div className="adm-editor adm-contato">
      <button className="adm-link" onClick={() => aoFechar(mudou)}>← Contatos</button>
      <div className="adm-cabeca">
        <div><h1>{novo ? 'Novo contato' : f.nome || fone(f.whatsapp) || f.email}</h1>
          {!novo && <p className="adm-sub">Desde {dataCurta(contato.criado_em)}{contato.origem?.canal ? ` · veio por ${contato.origem.canal}` : ''}</p>}</div>
        {f.whatsapp && <a className="adm-btn adm-whats" href={`https://wa.me/${f.whatsapp}`} target="_blank" rel="noopener">WhatsApp</a>}
      </div>
      <div className="adm-contato-grade">
        <div>
          <div className="adm-bloco">
            <h2>Dados</h2>
            <div className="adm-grade2">
              <label className="adm-campo"><span>Nome</span><input value={f.nome || ''} onChange={set('nome')} /></label>
              <label className="adm-campo"><span>WhatsApp</span><input type="tel" value={f.whatsTxt || ''} onChange={set('whatsTxt')} /></label>
              <label className="adm-campo"><span>E-mail</span><input type="email" value={f.email || ''} onChange={set('email')} /></label>
              <label className="adm-campo"><span>Outro telefone</span><input type="tel" value={f.telefone2 || ''} onChange={set('telefone2')} /></label>
              <label className="adm-campo"><span>Cidade</span><input value={f.cidade || ''} onChange={set('cidade')} /></label>
              <label className="adm-campo"><span>Bairro</span><input value={f.bairro || ''} onChange={set('bairro')} /></label>
              <label className="adm-campo"><span>Aniversário</span><input type="date" value={f.aniversario || ''} onChange={set('aniversario')} /></label>
              <label className="adm-campo"><span>Empresa (opcional)</span>
                <select value={f.empresa_id || ''} onChange={set('empresa_id')}><option value="">Nenhuma, pessoa física</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
              </label>
            </div>
            <div className="adm-checks">{PAPEIS.map(([v, n]) => <label key={v} className="adm-check"><input type="checkbox" checked={f.papeis.includes(v)} onChange={() => papel(v)} /> {n}</label>)}</div>
            <CamposExtras objeto="contato" valores={f.campos || {}} onChange={(campos) => setF({ ...f, campos })} />
            <label className="adm-campo"><span>Notas</span><textarea rows={3} value={f.notas || ''} onChange={set('notas')} /></label>
            <div className="adm-checks">
              <label className="adm-check"><input type="checkbox" checked={!!f.consentimento_marketing} onChange={set('consentimento_marketing')} /> Aceitou receber novidades</label>
              <label className="adm-check"><input type="checkbox" checked={!!f.nao_contatar} onChange={set('nao_contatar')} /> Não contatar (trava todos os negócios dele)</label>
            </div>
            <div className="adm-wa-acoes"><button className="adm-btn adm-primario" onClick={salvar}>Salvar</button>{!novo && <button className="adm-link" onClick={excluir}>Excluir contato</button>}</div>
            {msg && <p className="adm-msg">{msg}</p>}
          </div>
          {!novo && (
            <div className="adm-bloco">
              <div className="adm-bloco-topo"><h2>Negócios</h2><span className="adm-wa-acoes">
                <button className="adm-btn" onClick={() => novoNegocio('compra')}>+ Compra</button>
                <button className="adm-btn" onClick={() => novoNegocio('captacao')}>+ Captação</button></span></div>
              {!negocios.length ? <p className="adm-sub">Nenhum negócio ainda.</p> : (
                <ul className="adm-lista">{negocios.map((n) => (
                  <li key={n.id}><button onClick={() => aoAbrirNegocio?.(n.id)}>
                    <span className="adm-info"><b>{n.titulo || (n.funil === 'captacao' ? 'Captação' : 'Compra')}</b>
                      <small>{FUNIS[n.funil]?.nome} · {rotuloEtapa(n.etapa)}{n.valor ? ` · ${brl(n.valor)} · comissão ${brl(comissao(n))}` : ''}{n.imovel_codigo ? ` · ${n.imovel_codigo}` : ''}</small></span>
                  </button></li>
                ))}</ul>
              )}
              {imoveis.length > 0 && <><h2>Imóveis dele</h2><ul className="adm-hist">{imoveis.map((i) => <li key={i.codigo}><b>{i.codigo}</b> <small>{i.titulo} · {i.status}</small></li>)}</ul></>}
            </div>
          )}
        </div>
        {!novo && (
          <div>
            <Tarefas contatoId={contato.id} />
            <LinhaDoTempo contatoId={contato.id} negocioIds={negocios.map((n) => n.id)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- campos personalizados
let cacheCampos = null;
export function CamposExtras({ objeto, valores, onChange }) {
  const [campos, setCampos] = useState(cacheCampos);
  useEffect(() => {
    if (cacheCampos) return;
    sb().from('campos_personalizados').select('*').order('ordem').then(({ data }) => { cacheCampos = data || []; setCampos(cacheCampos); });
  }, []);
  const meus = (campos || []).filter((c) => c.objeto === objeto);
  if (!meus.length) return null;
  const v = valores || {};
  const set = (k, x) => onChange({ ...v, [k]: x });
  return (
    <div className="adm-grade2">
      {meus.map((c) => (
        <label key={c.id} className={c.tipo === 'sim_nao' ? 'adm-check' : 'adm-campo'}>
          {c.tipo === 'sim_nao' ? <><input type="checkbox" checked={!!v[c.chave]} onChange={(e) => set(c.chave, e.target.checked)} /> {c.rotulo}</> : <>
            <span>{c.rotulo}</span>
            {c.tipo === 'opcao' ? <select value={v[c.chave] || ''} onChange={(e) => set(c.chave, e.target.value)}><option value="" />{c.opcoes.map((o) => <option key={o}>{o}</option>)}</select>
              : <input type={c.tipo === 'data' ? 'date' : 'text'} inputMode={['numero', 'moeda'].includes(c.tipo) ? 'decimal' : undefined} value={v[c.chave] ?? ''}
                onChange={(e) => set(c.chave, ['numero', 'moeda'].includes(c.tipo) ? e.target.value.replace(/[^\d,.]/g, '') : e.target.value)} />}
          </>}
        </label>
      ))}
    </div>
  );
}

function ConfigCampos() {
  const [lista, setLista] = useState([]);
  const [novo, setNovo] = useState({ objeto: 'contato', rotulo: '', tipo: 'texto', opcoesTxt: '' });
  const [msg, setMsg] = useState('');
  const carregar = () => sb().from('campos_personalizados').select('*').order('objeto').order('ordem').then(({ data }) => { setLista(data || []); cacheCampos = data || []; });
  useEffect(() => { carregar(); }, []);
  const criar = async (e) => {
    e.preventDefault(); setMsg('');
    const chave = chaveDe(novo.rotulo); if (!chave) return;
    const { error } = await sb().from('campos_personalizados').insert({
      objeto: novo.objeto, rotulo: novo.rotulo.trim(), chave, tipo: novo.tipo, ordem: lista.length,
      opcoes: novo.tipo === 'opcao' ? novo.opcoesTxt.split(',').map((x) => x.trim()).filter(Boolean) : [],
    });
    if (error) setMsg(error.message.includes('duplicate') ? 'Já existe um campo com esse nome.' : error.message); else { setNovo({ ...novo, rotulo: '', opcoesTxt: '' }); carregar(); }
  };
  const apagar = async (c) => {
    if (!confirm(`Apagar o campo "${c.rotulo}"? Os valores já preenchidos ficam guardados, só somem da tela.`)) return;
    await sb().from('campos_personalizados').delete().eq('id', c.id); carregar();
  };
  const OBJ = { contato: 'Contato', negocio: 'Negócio', empresa: 'Empresa', imovel: 'Imóvel' };
  const TIPO = { texto: 'Texto', numero: 'Número', moeda: 'Valor em R$', data: 'Data', opcao: 'Lista de opções', sim_nao: 'Sim ou não' };
  return (
    <div>
      <div className="adm-bloco">
        <h2>Novo campo</h2>
        <form className="adm-grade2" onSubmit={criar}>
          <label className="adm-campo"><span>Onde aparece</span><select value={novo.objeto} onChange={(e) => setNovo({ ...novo, objeto: e.target.value })}>{Object.entries(OBJ).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          <label className="adm-campo"><span>Nome do campo</span><input value={novo.rotulo} onChange={(e) => setNovo({ ...novo, rotulo: e.target.value })} placeholder="Ex.: Profissão" required /></label>
          <label className="adm-campo"><span>Tipo</span><select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}>{Object.entries(TIPO).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          {novo.tipo === 'opcao' && <label className="adm-campo"><span>Opções (separe por vírgula)</span><input value={novo.opcoesTxt} onChange={(e) => setNovo({ ...novo, opcoesTxt: e.target.value })} /></label>}
          <div><button className="adm-btn adm-primario">Criar campo</button></div>
        </form>
        {msg && <p className="adm-erro">{msg}</p>}
      </div>
      <div className="adm-bloco">
        <h2>Seus campos</h2>
        {!lista.length ? <p className="adm-sub">Nenhum ainda.</p> : (
          <ul className="adm-hist">{lista.map((c) => <li key={c.id}><b>{c.rotulo}</b> <small>{OBJ[c.objeto]} · {TIPO[c.tipo]}{c.opcoes?.length ? ` (${c.opcoes.join(', ')})` : ''}</small> <button className="adm-link" onClick={() => apagar(c)}>apagar</button></li>)}</ul>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- tarefas
export function Tarefas({ contatoId, negocioId, titulo = 'Tarefas' }) {
  const [lista, setLista] = useState([]);
  const [novo, setNovo] = useState({ titulo: '', tipo: 'tarefa', quando: '', prioridade: 'normal' });
  const carregar = useCallback(() => {
    let q = sb().from('tarefas').select('*').order('concluida_em', { nullsFirst: true }).order('vence_em', { nullsFirst: false }).limit(50);
    q = negocioId ? q.eq('negocio_id', negocioId) : q.eq('contato_id', contatoId);
    q.then(({ data }) => setLista(data || []));
  }, [contatoId, negocioId]);
  useEffect(() => { carregar(); }, [carregar]);
  const criar = async (e) => {
    e.preventDefault(); if (!novo.titulo.trim()) return;
    await sb().from('tarefas').insert({ titulo: novo.titulo.trim(), tipo: novo.tipo, prioridade: novo.prioridade, vence_em: deLocal(novo.quando), contato_id: contatoId || null, negocio_id: negocioId || null });
    setNovo({ titulo: '', tipo: 'tarefa', quando: '', prioridade: 'normal' }); carregar();
  };
  const marcar = async (t) => {
    await sb().from('tarefas').update({ concluida_em: t.concluida_em ? null : new Date().toISOString() }).eq('id', t.id); carregar();
  };
  const agora = Date.now();
  return (
    <div className="adm-bloco">
      <h2>{titulo}</h2>
      <form className="adm-tarefa-nova" onSubmit={criar}>
        <input placeholder="O que precisa fazer?" value={novo.titulo} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} />
        <select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}>{TIPOS_TAREFA.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
        <input type="datetime-local" value={novo.quando} onChange={(e) => setNovo({ ...novo, quando: e.target.value })} />
        <button className="adm-btn">Adicionar</button>
      </form>
      <ul className="adm-tarefas">{lista.map((t) => (
        <li key={t.id} className={t.concluida_em ? 'feita' : t.vence_em && Date.parse(t.vence_em) < agora ? 'atrasada' : ''}>
          <label className="adm-check"><input type="checkbox" checked={!!t.concluida_em} onChange={() => marcar(t)} /> {t.titulo}</label>
          <small>{(TIPOS_TAREFA.find((x) => x[0] === t.tipo) || ['', ''])[1]}{t.vence_em ? ` · ${dataHora(t.vence_em)}` : ''}{t.prioridade === 'alta' ? ' · alta' : ''}</small>
        </li>
      ))}</ul>
    </div>
  );
}

// ----------------------------------------------------------------- linha do tempo
export function LinhaDoTempo({ contatoId, negocioIds = [] }) {
  const [itens, setItens] = useState(null);
  const [novo, setNovo] = useState({ tipo: 'nota', corpo: '' });
  const [conversa, setConversa] = useState(null);
  const ids = negocioIds.join(',');
  const carregar = useCallback(async () => {
    const c = sb(); const nids = ids ? ids.split(',') : [];
    const vazio = { data: [] };
    const [at, convs, vis, fu, lpe, tar] = await Promise.all([
      contatoId ? c.from('atividades').select('*').or(`contato_id.eq.${contatoId}${nids.length ? `,negocio_id.in.(${nids.join(',')})` : ''}`).order('quando', { ascending: false }).limit(100)
        : c.from('atividades').select('*').in('negocio_id', nids).order('quando', { ascending: false }).limit(100),
      nids.length ? c.from('conversas').select('id,canal,criado_em,atualizado_em,resumo').in('lead_id', nids) : vazio,
      nids.length ? c.from('visitas').select('id,inicio,status,imovel_codigo').in('lead_id', nids) : vazio,
      nids.length ? c.from('followup_fila').select('id,passo,status,executado_em,texto').in('lead_id', nids).in('status', ['enviado', 'manual']) : vazio,
      nids.length ? c.from('lp_eventos').select('id,tipo,dados,criado_em').in('lead_id', nids).in('tipo', ['abriu', 'reagiu', 'lead']).limit(50) : vazio,
      contatoId ? c.from('tarefas').select('id,titulo,concluida_em').eq('contato_id', contatoId).not('concluida_em', 'is', null) : vazio,
    ]);
    const conts = new Map();
    if (convs.data?.length) {
      const { data: ms } = await c.from('mensagens').select('conversa_id').in('conversa_id', convs.data.map((x) => x.id)).in('papel', ['usuario', 'assistente', 'anderson']).limit(5000);
      for (const m of ms || []) conts.set(m.conversa_id, (conts.get(m.conversa_id) || 0) + 1);
    }
    const lista = [
      ...(at.data || []).map((a) => ({ k: 'a' + a.id, quando: a.quando, tipo: a.tipo, titulo: a.titulo || (TIPOS_ATIVIDADE.find((x) => x[0] === a.tipo) || ['', 'Atividade'])[1], corpo: a.corpo })),
      ...(convs.data || []).map((x) => ({ k: 'c' + x.id, quando: x.atualizado_em, tipo: 'conversa', titulo: `Conversa pelo ${x.canal === 'whatsapp' ? 'WhatsApp' : 'chat do site'} · ${conts.get(x.id) || 0} mensagens`, corpo: x.resumo, conversa: x.id })),
      ...(vis.data || []).map((v) => ({ k: 'v' + v.id, quando: v.inicio, tipo: 'visita', titulo: `Visita ${v.status}${v.imovel_codigo ? ` · ${v.imovel_codigo}` : ''}` })),
      ...(fu.data || []).map((x) => ({ k: 'f' + x.id, quando: x.executado_em, tipo: 'followup', titulo: `Follow-up ${x.passo} ${x.status === 'manual' ? 'enviado à mão' : 'enviado'}`, corpo: x.texto })),
      ...(lpe.data || []).map((x) => ({ k: 'l' + x.id, quando: x.criado_em, tipo: 'pagina', titulo: x.tipo === 'abriu' ? 'Abriu a página de curadoria' : x.tipo === 'lead' ? 'Preencheu o formulário da página' : `Reagiu a um imóvel: ${x.dados?.reacao === 'visitar' ? 'quero visitar' : 'não é pra mim'}${x.dados?.codigo ? ` (${x.dados.codigo})` : ''}` })),
      ...(tar.data || []).map((x) => ({ k: 't' + x.id, quando: x.concluida_em, tipo: 'tarefa', titulo: `Tarefa concluída: ${x.titulo}` })),
    ].filter((x) => x.quando).sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando));
    setItens(lista);
  }, [contatoId, ids]);
  useEffect(() => { carregar(); }, [carregar]);
  const registrar = async (e) => {
    e.preventDefault(); if (!novo.corpo.trim()) return;
    await sb().from('atividades').insert({ contato_id: contatoId || null, negocio_id: !contatoId && ids ? ids.split(',')[0] : null, tipo: novo.tipo, corpo: novo.corpo.trim() });
    setNovo({ tipo: novo.tipo, corpo: '' }); carregar();
  };
  return (
    <div className="adm-bloco">
      <h2>Linha do tempo</h2>
      <form className="adm-atividade-nova" onSubmit={registrar}>
        <div className="adm-subabas">{TIPOS_ATIVIDADE.map(([v, n]) => <button type="button" key={v} className={novo.tipo === v ? 'on' : ''} onClick={() => setNovo({ ...novo, tipo: v })}>{n}</button>)}</div>
        <textarea rows={2} placeholder={novo.tipo === 'ligacao' ? 'Como foi a ligação?' : 'Escreva aqui'} value={novo.corpo} onChange={(e) => setNovo({ ...novo, corpo: e.target.value })} />
        <button className="adm-btn">Registrar</button>
      </form>
      {!itens ? <p className="adm-sub">Carregando…</p> : !itens.length ? <p className="adm-sub">Nada ainda.</p> : (
        <ol className="adm-tempo">{itens.map((x) => (
          <li key={x.k} className={`t-${x.tipo}`}>
            <small>{dataHora(x.quando)}</small>
            <b>{x.titulo}</b>
            {x.corpo && <p>{x.corpo}</p>}
            {x.conversa && <button className="adm-link" onClick={() => setConversa(conversa === x.conversa ? null : x.conversa)}>{conversa === x.conversa ? 'Fechar conversa' : 'Ver conversa'}</button>}
            {conversa === x.conversa && <Mensagens conversaId={x.conversa} />}
          </li>
        ))}</ol>
      )}
    </div>
  );
}

function Mensagens({ conversaId }) {
  const [msgs, setMsgs] = useState([]);
  useEffect(() => {
    sb().from('mensagens').select('id,papel,conteudo,criado_em').eq('conversa_id', conversaId).in('papel', ['usuario', 'assistente', 'anderson']).order('criado_em').limit(300).then(({ data }) => setMsgs(data || []));
  }, [conversaId]);
  return <div className="adm-wa-msgs">{msgs.map((m) => <div key={m.id} className={`adm-wa-msg p-${m.papel}`}><span>{m.conteudo}</span><small>{dataHora(m.criado_em)}</small></div>)}</div>;
}

// ----------------------------------------------------------------- empresas
function Empresas() {
  const [lista, setLista] = useState(null);
  const [ed, setEd] = useState(null);
  const [msg, setMsg] = useState('');
  const carregar = () => sb().from('empresas').select('*').order('nome').then(({ data }) => setLista(data || []));
  useEffect(() => { carregar(); }, []);
  const salvar = async () => {
    if (!String(ed.nome || '').trim()) { setMsg('Coloque o nome.'); return; }
    const dados = { nome: ed.nome.trim(), tipo: ed.tipo || null, documento: ed.documento || null, telefone: ed.telefone || null, email: ed.email || null, site: ed.site || null, notas: ed.notas || null, campos: ed.campos || {}, atualizado_em: new Date().toISOString() };
    const { error } = ed.id ? await sb().from('empresas').update(dados).eq('id', ed.id) : await sb().from('empresas').insert(dados);
    if (error) setMsg(error.message); else { setEd(null); setMsg(''); carregar(); }
  };
  if (ed) {
    const set = (k) => (e) => setEd({ ...ed, [k]: e.target.value });
    return (
      <div className="adm-editor">
        <button className="adm-link" onClick={() => setEd(null)}>← Empresas</button>
        <div className="adm-bloco">
          <h2>{ed.id ? ed.nome : 'Nova empresa'}</h2>
          <div className="adm-grade2">
            <label className="adm-campo"><span>Nome</span><input value={ed.nome || ''} onChange={set('nome')} /></label>
            <label className="adm-campo"><span>Tipo</span><select value={ed.tipo || ''} onChange={set('tipo')}><option value="" />{TIPOS_EMPRESA.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
            <label className="adm-campo"><span>CNPJ</span><input value={ed.documento || ''} onChange={set('documento')} /></label>
            <label className="adm-campo"><span>Telefone</span><input value={ed.telefone || ''} onChange={set('telefone')} /></label>
            <label className="adm-campo"><span>E-mail</span><input value={ed.email || ''} onChange={set('email')} /></label>
            <label className="adm-campo"><span>Site</span><input value={ed.site || ''} onChange={set('site')} /></label>
          </div>
          <CamposExtras objeto="empresa" valores={ed.campos || {}} onChange={(campos) => setEd({ ...ed, campos })} />
          <label className="adm-campo"><span>Notas</span><textarea rows={3} value={ed.notas || ''} onChange={set('notas')} /></label>
          <div><button className="adm-btn adm-primario" onClick={salvar}>Salvar</button></div>
          {msg && <p className="adm-erro">{msg}</p>}
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="adm-cabeca"><div><h1>Empresas</h1><p className="adm-sub">Opcional. Use para holding de cliente, construtoras e parceiros.</p></div>
        <button className="adm-btn adm-primario" onClick={() => setEd({})}>+ Empresa</button></div>
      {!lista ? <p className="adm-sub">Carregando…</p> : !lista.length ? <p className="adm-sub">Nenhuma empresa. Tudo bem: você atende pessoa física.</p> : (
        <ul className="adm-lista">{lista.map((e) => <li key={e.id}><button onClick={() => setEd(e)}><span className="adm-info"><b>{e.nome}</b><small>{(TIPOS_EMPRESA.find((x) => x[0] === e.tipo) || ['', ''])[1]}{e.telefone ? ` · ${e.telefone}` : ''}</small></span></button></li>)}</ul>
      )}
    </>
  );
}

// ----------------------------------------------------------------- duplicados
function Duplicados() {
  const [grupos, setGrupos] = useState(null);
  const [msg, setMsg] = useState('');
  const carregar = async () => {
    const { data } = await sb().from('contatos').select('id,nome,whatsapp,email,criado_em').order('criado_em').limit(5000);
    const m = new Map();
    for (const c of data || []) {
      const chaves = [c.whatsapp && 'w' + c.whatsapp.slice(-8), c.email && 'e' + c.email.toLowerCase(), c.nome && c.nome.trim().split(/\s+/).length > 1 && 'n' + normal(c.nome).replace(/\s+/g, ' ')].filter(Boolean);
      for (const k of chaves) { if (!m.has(k)) m.set(k, []); m.get(k).push(c); }
    }
    const vistos = new Set(); const out = [];
    for (const [k, l] of m) {
      if (l.length < 2) continue;
      const assinatura = l.map((x) => x.id).sort().join();
      if (vistos.has(assinatura)) continue; vistos.add(assinatura);
      out.push({ motivo: k[0] === 'w' ? 'mesmo WhatsApp' : k[0] === 'e' ? 'mesmo e-mail' : 'mesmo nome', contatos: l });
    }
    setGrupos(out);
  };
  useEffect(() => { carregar(); }, []);
  const mesclar = async (manter, apagar) => {
    if (!confirm(`Juntar "${apagar.nome || apagar.whatsapp}" dentro de "${manter.nome || manter.whatsapp}"? Negócios, tarefas e histórico passam para o primeiro.`)) return;
    const { error } = await sb().rpc('mesclar_contatos', { p_manter: manter.id, p_apagar: apagar.id });
    if (error) setMsg(error.message); else carregar();
  };
  return (
    <div>
      <div className="adm-cabeca"><div><h1>Duplicados</h1><p className="adm-sub">Contatos parecidos pelo WhatsApp, e-mail ou nome completo. O mais antigo fica.</p></div></div>
      {msg && <p className="adm-erro">{msg}</p>}
      {!grupos ? <p className="adm-sub">Procurando…</p> : !grupos.length ? <p className="adm-sub">Nenhum duplicado encontrado.</p> : grupos.map((g, i) => (
        <div key={i} className="adm-bloco">
          <small className="adm-sub">{g.motivo}</small>
          {g.contatos.map((c, j) => (
            <div key={c.id} className="adm-fila"><div><b>{c.nome || 'Sem nome'}</b> <small>{fone(c.whatsapp)} {c.email} · desde {dataCurta(c.criado_em)}</small></div>
              {j > 0 && <button className="adm-btn" onClick={() => mesclar(g.contatos[0], c)}>Juntar no primeiro</button>}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------- importar
function Importar({ aoFechar }) {
  const [linhas, setLinhas] = useState(null);
  const [papel, setPapel] = useState('comprador');
  const [criarNegocio, setCriarNegocio] = useState(false);
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const ler = async (e) => {
    const arq = e.target.files?.[0]; if (!arq) return;
    const l = lerCsv(await arq.text());
    const pega = (o, ...ks) => { for (const k of ks) { const x = Object.keys(o).find((c) => c.includes(k)); if (x && o[x]) return o[x]; } return ''; };
    setLinhas(l.map((o) => ({ nome: pega(o, 'nome', 'name'), whatsapp: soNumeros(pega(o, 'whats', 'celular', 'telefone', 'fone', 'phone')), email: pega(o, 'mail'), bairro: pega(o, 'bairro'), cidade: pega(o, 'cidade', 'city'), notas: pega(o, 'nota', 'obs') }))
      .filter((x) => x.nome || x.whatsapp || x.email));
  };
  const importar = async () => {
    setOcupado(true); setMsg('');
    const { data: exist } = await sb().from('contatos').select('whatsapp,email');
    const ws = new Set((exist || []).map((x) => x.whatsapp).filter(Boolean)); const es = new Set((exist || []).map((x) => (x.email || '').toLowerCase()).filter(Boolean));
    const novos = linhas.filter((x) => !(x.whatsapp && ws.has(x.whatsapp)) && !(x.email && es.has(x.email.toLowerCase())));
    let n = 0;
    for (let i = 0; i < novos.length; i += 200) {
      const lote = novos.slice(i, i + 200).map((x) => ({ ...x, whatsapp: x.whatsapp || null, email: x.email || null, nome: x.nome || null, papeis: [papel], origem: { canal: 'importação' }, canal: 'Importação' }));
      const { data, error } = await sb().from('contatos').insert(lote).select('id,nome,whatsapp,email');
      if (error) { setMsg('Parou com erro: ' + error.message); break; }
      n += data.length;
      if (criarNegocio) await sb().from('leads').insert(data.map((c) => ({ contato_id: c.id, nome: c.nome, whatsapp: c.whatsapp, email: c.email, funil: papel === 'proprietario' ? 'captacao' : 'compra', etapa: papel === 'proprietario' ? 'cap_contato' : 'novo', canal: 'Importação' })));
    }
    setOcupado(false);
    setMsg(`${n} contatos importados. ${linhas.length - novos.length} já existiam e foram pulados.`);
    setTimeout(() => aoFechar(true), 2500);
  };
  return (
    <div className="adm-bloco">
      <h2>Importar planilha</h2>
      <p className="adm-sub">CSV com colunas como Nome, WhatsApp (ou Telefone), E-mail, Bairro, Cidade, Notas. No Excel ou Google Planilhas: Arquivo, Baixar, CSV. Quem já existe (mesmo WhatsApp ou e-mail) é pulado.</p>
      <p className="adm-sub">Importar contatos não liga nenhuma mensagem automática: o follow-up só atende quem conversa com o robô.</p>
      <input type="file" accept=".csv,text/csv" onChange={ler} />
      {linhas && <>
        <p><b>{linhas.length}</b> linhas lidas. Primeiras: {linhas.slice(0, 3).map((x) => x.nome || x.whatsapp).join(', ')}</p>
        <label className="adm-campo"><span>Papel dessas pessoas</span><select value={papel} onChange={(e) => setPapel(e.target.value)}>{PAPEIS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
        <label className="adm-check"><input type="checkbox" checked={criarNegocio} onChange={(e) => setCriarNegocio(e.target.checked)} /> Criar um negócio para cada um no funil</label>
        <div className="adm-wa-acoes"><button className="adm-btn adm-primario" disabled={ocupado} onClick={importar}>{ocupado ? 'Importando…' : 'Importar'}</button><button className="adm-link" onClick={() => aoFechar(false)}>Cancelar</button></div>
      </>}
      {!linhas && <button className="adm-link" onClick={() => aoFechar(false)}>Cancelar</button>}
      {msg && <p className="adm-msg">{msg}</p>}
    </div>
  );
}
