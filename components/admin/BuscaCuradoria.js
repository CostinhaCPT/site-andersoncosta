'use client';
// Busca inteligente para curadoria: o Anderson conta o que o cliente pediu, o sistema busca na carteira,
// confere Domus e site do Rafael ao vivo, calcula o tempo de carro até os lugares do cliente, olha as fotos,
// mostra os imóveis do Rafael que ainda não estão no site para aprovar, e monta a página pronta para enviar.
import { useEffect, useMemo, useState } from 'react';
import { sb } from '@/lib/admin/cliente';
import { chamarFuncao } from '@/lib/admin/ia';
import { CIDADES } from '@/lib/admin/opcoes';
import { SITE } from '@/lib/site';

const TIPOS_BUSCA = [
  ['casa', 'Casa'], ['casa-geminada', 'Geminado'], ['sobrado', 'Sobrado'], ['apartamento', 'Apartamento'],
  ['cobertura', 'Cobertura'], ['terreno', 'Terreno'], ['chacara', 'Chácara'],
];
const SITUACOES = [['planta', 'Na planta / em obras'], ['pronto', 'Pronto / novo'], ['usado', 'Usado']];
const PASSOS = ['Entendendo o cliente', 'Buscando e conferindo', 'Novos do Rafael', 'Escolhendo os melhores', 'Página pronta'];
const brl = (n) => (n ? Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : 'sem preço');
const num = (v) => Number(String(v || '').replace(/\D/g, '')) || 0;
const moeda = (v) => { const n = num(v); return n ? n.toLocaleString('pt-BR') : ''; };
const foto = (u) => (u && String(u).startsWith('/') ? SITE.dominio + u : u);
const call = (body) => chamarFuncao('curadoria', body);

export default function BuscaCuradoria({ im, aoAbrir }) {
  const [leads, setLeads] = useState([]);
  const [f, setF] = useState({ lead_id: '', nome: '', tipos: [], situacoes: [], cidade: 'Jaraguá do Sul', bairros: '', valor_de: '', valor_ate: '', notas: '' });
  const [refs, setRefs] = useState([{ nome: '', max_min: 15, busca: '', lat: null, lon: null, opcoes: null }]);
  const [passo, setPasso] = useState(-1);
  const [erro, setErro] = useState('');
  const [perfil, setPerfil] = useState(null);
  const [cands, setCands] = useState(null);
  const [aprovados, setAprovados] = useState([]);
  const [escolha, setEscolha] = useState(null);
  const [criada, setCriada] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    sb().from('leads').select('id,nome,whatsapp,etapa').not('etapa', 'in', '(venda,perdido)').order('ultima_atividade', { ascending: false, nullsFirst: false }).limit(300)
      .then(({ data }) => setLeads(data || []));
  }, []);
  const bairros = useMemo(() => [...new Set((im?.lista || []).map((i) => i.bairro).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [im]);
  const alternar = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const filtros = () => ({
    tipos: f.tipos, situacoes: f.situacoes, cidade: f.cidade || null,
    bairros: f.bairros.split(',').map((b) => b.trim()).filter(Boolean), valor_de: num(f.valor_de) || null, valor_ate: num(f.valor_ate) || null,
  });
  const refsValidas = () => refs.filter((r) => r.nome.trim()).map((r) => ({ nome: r.nome.trim(), max_min: Number(r.max_min) || null, busca: r.busca || '', lat: r.lat, lon: r.lon }));

  async function localizar(k) {
    const r = refs[k];
    const q = r.busca || r.nome;
    if (!q.trim()) return;
    setRefs((l) => l.map((x, i) => (i === k ? { ...x, opcoes: 'buscando' } : x)));
    try {
      const { lugares } = await call({ acao: 'lugar', q: /jaragu|guaramirim|schroeder|corup|massaranduba/i.test(q) ? q : `${q}, ${f.cidade || 'Jaraguá do Sul'}` });
      setRefs((l) => l.map((x, i) => (i === k ? { ...x, opcoes: lugares } : x)));
    } catch (e) { setRefs((l) => l.map((x, i) => (i === k ? { ...x, opcoes: [] } : x))); setErro(String(e.message || e)); }
  }
  async function escolherLugar(k, lugar, lembrar) {
    setRefs((l) => l.map((x, i) => (i === k ? { ...x, lat: lugar.lat, lon: lugar.lon, local: lugar.nome, opcoes: null } : x)));
    if (lembrar && refs[k].nome.trim()) call({ acao: 'salvar_lugar', nome: refs[k].nome.trim(), lat: lugar.lat, lon: lugar.lon }).catch(() => {});
  }

  // ---------- fluxo ----------
  async function iniciar() {
    if (!f.nome.trim()) return setErro('Coloque o nome do cliente (vai no link e no título da página).');
    if (!f.notas.trim() && !f.lead_id) return setErro('Conte o que o cliente pediu ou escolha o lead para eu ler a conversa com a Lu.');
    setErro(''); setPerfil(null); setCands(null); setEscolha(null); setCriada(null); setAprovados([]);
    setOcupado(true);
    try {
      setPasso(0);
      const p = await call({ acao: 'perfil', nome: f.nome, lead_id: f.lead_id || null, notas: f.notas, filtros: filtros(), referencias: refsValidas() });
      // lugares que o Anderson já marcou no mapa valem mais que a busca automática
      for (const r of refsValidas()) {
        const x = p.perfil.pontos_referencia.find((y) => y.nome.toLowerCase() === r.nome.toLowerCase());
        if (x && r.lat) { x.lat = r.lat; x.lon = r.lon; }
      }
      setPerfil(p);
      setPasso(1);
      const c = await call({ acao: 'candidatos', filtros: filtros(), perfil: p.perfil });
      setCands(c);
      if (c.novos?.length) { setPasso(2); setOcupado(false); return; }
      await escolherMelhores(p, c, []);
    } catch (e) { setErro(String(e.message || e)); setOcupado(false); }
  }
  async function escolherMelhores(p = perfil, c = cands, novosAprov = aprovados) {
    setOcupado(true); setErro('');
    try {
      setPasso(3);
      const novos = (c.novos || []).filter((n) => novosAprov.includes(n.imov));
      const r = await call({ acao: 'escolher', nome: f.nome, perfil: p.perfil, candidatos: c.candidatos, novos_aprovados: novos });
      setEscolha(r);
      setPasso(4);
    } catch (e) { setErro(String(e.message || e)); }
    setOcupado(false);
  }
  async function criarPagina(publicar) {
    setOcupado(true); setErro('');
    try {
      const novos = (cands.novos || []).filter((n) => aprovados.includes(n.imov));
      const r = await call({
        acao: 'criar', nome: f.nome, lead_id: f.lead_id || null, filtros: filtros(), perfil: perfil.perfil, publicar,
        titulo: escolha.titulo, subtitulo: escolha.subtitulo, intro: escolha.intro, itens: escolha.itens, novos_aprovados: novos,
      });
      setCriada(r);
    } catch (e) { setErro(String(e.message || e)); }
    setOcupado(false);
  }
  async function abrirEditor() {
    const { data } = await sb().from('lps').select('*, leads(id,nome,whatsapp)').eq('id', criada.id).single();
    if (data) aoAbrir(data);
  }

  const porRef = useMemo(() => {
    const m = {};
    for (const c of cands?.candidatos || []) m[c.codigo] = c;
    for (const n of cands?.novos || []) m[n.imov] = { ...n, codigo: n.imov, novo: true };
    return m;
  }, [cands]);
  const setItem = (k, v) => setEscolha((e) => ({ ...e, itens: e.itens.map((x, i) => (i === k ? { ...x, ...v } : x)) }));
  const mover = (k, d) => setEscolha((e) => { const it = [...e.itens]; const j = k + d; if (j < 0 || j >= it.length) return e; [it[k], it[j]] = [it[j], it[k]]; return { ...e, itens: it }; });
  const remover = (k) => setEscolha((e) => ({ ...e, itens: e.itens.filter((_, i) => i !== k) }));
  const adicionar = (ref) => setEscolha((e) => ({ ...e, itens: [...e.itens, { ref, porque: '', nota_anderson: '' }] }));
  const escolhidos = new Set((escolha?.itens || []).map((i) => i.ref));
  const reserva = [...(cands?.candidatos || []).filter((c) => !c.conferencia?.indisponivel).map((c) => c.codigo), ...aprovados].filter((r) => !escolhidos.has(r));

  return (
    <div className="cur">
      {/* ---------- formulário ---------- */}
      <div className="cur-form">
        <div className="adm-grade2">
          <label className="adm-campo"><span>Lead (opcional, para ler a conversa com a Lu)</span>
            <select value={f.lead_id} onChange={(e) => { const l = leads.find((x) => x.id === e.target.value); setF({ ...f, lead_id: e.target.value, nome: l?.nome && !f.nome ? l.nome : f.nome }); }}>
              <option value="">Sem lead</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.nome || l.whatsapp}</option>)}
            </select>
          </label>
          <label className="adm-campo"><span>Nome do cliente</span>
            <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ricardo Silva" />
            {f.nome.trim() && <small className="cur-dica">Link: {SITE.dominio.replace('https://', '')}/curadoria/{f.nome.trim().split(/\s+/)[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')}-xxxx</small>}
          </label>
        </div>

        <div className="cur-bloco">
          <span className="cur-rot">Tipo</span>
          <div className="cur-chips">{TIPOS_BUSCA.map(([v, n]) => <button type="button" key={v} className={f.tipos.includes(v) ? 'on' : ''} onClick={() => alternar('tipos', v)}>{n}</button>)}</div>
        </div>
        <div className="cur-bloco">
          <span className="cur-rot">Situação</span>
          <div className="cur-chips">{SITUACOES.map(([v, n]) => <button type="button" key={v} className={f.situacoes.includes(v) ? 'on' : ''} onClick={() => alternar('situacoes', v)}>{n}</button>)}</div>
        </div>
        <div className="cur-linha">
          <label className="adm-campo"><span>Cidade</span>
            <select value={f.cidade} onChange={(e) => setF({ ...f, cidade: e.target.value })}>
              <option value="">Qualquer</option>
              {CIDADES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="adm-campo cur-larga"><span>Bairros (separe por vírgula, vazio = todos)</span>
            <input list="cur-bairros" value={f.bairros} onChange={(e) => setF({ ...f, bairros: e.target.value })} placeholder="Amizade, Três Rios do Norte" />
            <datalist id="cur-bairros">{bairros.map((b) => <option key={b} value={f.bairros.includes(',') ? `${f.bairros.slice(0, f.bairros.lastIndexOf(',') + 1)} ${b}` : b} />)}</datalist>
          </label>
        </div>
        <div className="cur-linha">
          <label className="adm-campo"><span>Valor de (R$)</span><input inputMode="numeric" value={moeda(f.valor_de)} onChange={(e) => setF({ ...f, valor_de: e.target.value })} placeholder="700.000" /></label>
          <label className="adm-campo"><span>Até (R$)</span><input inputMode="numeric" value={moeda(f.valor_ate)} onChange={(e) => setF({ ...f, valor_ate: e.target.value })} placeholder="1.100.000" /></label>
        </div>

        <label className="adm-campo"><span>O que o cliente contou na ligação</span>
          <textarea rows={5} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} placeholder="Casal com 2 filhos, trabalha na WEG II, quer no máximo 15 min de carro. 3 quartos com suíte, quintal para o cachorro, 2 vagas. Tem apartamento para dar de entrada." />
        </label>

        <div className="cur-bloco">
          <span className="cur-rot">Pontos de referência (tempo de carro, sem trânsito)</span>
          {refs.map((r, k) => (
            <div key={k} className="cur-ref">
              <div className="cur-ref-linha">
                <input placeholder="Ex.: WEG II, escola das crianças" value={r.nome} onChange={(e) => setRefs(refs.map((x, i) => (i === k ? { ...x, nome: e.target.value, lat: null, lon: null, local: null } : x)))} />
                <label className="cur-min"><input type="number" min="1" value={r.max_min} onChange={(e) => setRefs(refs.map((x, i) => (i === k ? { ...x, max_min: e.target.value } : x)))} /> min</label>
                <button type="button" className="adm-btn" onClick={() => localizar(k)} disabled={!r.nome.trim()}>Localizar</button>
                {refs.length > 1 && <button type="button" className="cur-x" aria-label="Remover" onClick={() => setRefs(refs.filter((_, i) => i !== k))}>×</button>}
              </div>
              {r.local && <small className="cur-ok">No mapa: {r.local}</small>}
              {!r.local && r.nome && !r.opcoes && <small className="cur-dica">Sem marcar no mapa, eu procuro sozinho. Clique em Localizar para garantir o lugar certo.</small>}
              {r.opcoes === 'buscando' && <small className="cur-dica">Procurando no mapa…</small>}
              {Array.isArray(r.opcoes) && (
                <div className="cur-opcoes">
                  {!r.opcoes.length && <small>Não achei. Tente o endereço (rua e número) no lugar do nome.</small>}
                  {r.opcoes.map((o, i) => <button type="button" key={i} onClick={() => escolherLugar(k, o, true)}>{o.nome}</button>)}
                  <input placeholder="Ou digite o endereço e clique em Localizar" value={r.busca} onChange={(e) => setRefs(refs.map((x, j) => (j === k ? { ...x, busca: e.target.value } : x)))} />
                </div>
              )}
            </div>
          ))}
          {refs.length < 3 && <button type="button" className="cur-link" onClick={() => setRefs([...refs, { nome: '', max_min: 15, busca: '', lat: null, lon: null, opcoes: null }])}>+ outro lugar</button>}
        </div>

        {erro && <p className="adm-erro">{erro}</p>}
        <button className="adm-btn adm-primario cur-criar" onClick={iniciar} disabled={ocupado}>{ocupado ? 'Trabalhando…' : passo >= 0 ? 'Buscar de novo' : 'Criar curadoria'}</button>
        <p className="adm-nota">Busca na sua carteira, confere preço e disponibilidade na Domus e no site do Rafael na hora, e mostra o que o Rafael tem e ainda não está no seu site. Leva cerca de 1 minuto.</p>
      </div>

      {/* ---------- resultado ---------- */}
      {passo >= 0 && (
        <div className="cur-res">
          <ol className="cur-passos">
            {PASSOS.map((n, i) => <li key={n} className={i < passo || (i === passo && !ocupado) || criada ? 'feito' : i === passo ? 'agora' : ''}>{n}</li>)}
          </ol>

          {perfil && (
            <div className="cur-perfil">
              <p>{perfil.perfil.resumo}</p>
              <div className="cur-tags">
                {perfil.perfil.quartos_min > 0 && <span>{perfil.perfil.quartos_min}+ quartos</span>}
                {perfil.perfil.suites_min > 0 && <span>{perfil.perfil.suites_min}+ suíte</span>}
                {perfil.perfil.vagas_min > 0 && <span>{perfil.perfil.vagas_min}+ vagas</span>}
                {(perfil.perfil.obrigatorios || []).filter((o) => !/\d|quarto|su[ií]te|vaga/i.test(o)).map((o) => <span key={o} className="forte">{o}</span>)}
                {(perfil.perfil.desejaveis || []).map((o) => <span key={o}>{o}</span>)}
                {(perfil.perfil.evitar || []).map((o) => <span key={o} className="evitar">sem {o}</span>)}
                {(perfil.perfil.pontos_referencia || []).map((o) => <span key={o.nome}>{o.nome}{o.max_min ? ` até ${o.max_min} min` : ''}</span>)}
                {perfil.perfil.permuta && <span>quer dar imóvel na troca</span>}
              </div>
              {perfil.tem_conversa && <small className="cur-dica">Li também a conversa dele com a Lu.</small>}
              {!!(perfil.perfil.perguntas || []).length && (
                <details><summary>Perguntas para confirmar com o cliente</summary><ul>{perfil.perfil.perguntas.map((p) => <li key={p}>{p}</li>)}</ul></details>
              )}
            </div>
          )}

          {cands && (
            <div className="cur-resumo">
              <b>{cands.total_filtrado}</b> imóveis no filtro · conferi os {cands.candidatos.length} melhores ao vivo · li {cands.sartori_lidos} anúncios do Rafael
              {!!cands.alertas?.length && <div className="adm-aviso"><b>Atenção</b><ul>{cands.alertas.map((a) => <li key={a}>{a}</li>)}</ul></div>}
            </div>
          )}

          {passo === 2 && cands?.novos?.length > 0 && !escolha && (
            <div className="cur-novos">
              <h3>O Rafael tem {cands.novos.length} {cands.novos.length === 1 ? 'imóvel' : 'imóveis'} no perfil que não estão no seu site</h3>
              <p className="adm-sub">Aprove os que podem entrar nesta curadoria. Eles também ficam salvos como rascunho na sua carteira.</p>
              <div className="cur-grade">
                {cands.novos.map((n) => {
                  const on = aprovados.includes(n.imov);
                  return (
                    <div key={n.imov} className={`cur-card ${on ? 'on' : ''}`}>
                      {n.foto && <img src={n.foto} alt="" loading="lazy" />}
                      <div className="cur-card-corpo">
                        <small>{n.imov} · {n.bairro}</small>
                        <b>{n.titulo}</b>
                        <span>{brl(n.preco)} · {n.area ? `${Math.round(n.area)} m²` : ''}{n.quartos ? ` · ${n.quartos} quartos` : ''}</span>
                        <small className={`cur-foto-${n.fotos?.nota}`}>Fotos: {n.fotos?.n} · {n.fotos?.nota}{n.fotos?.obs ? ` (${n.fotos.obs})` : ''}</small>
                        <div className="cur-card-acoes">
                          <button className={`adm-btn ${on ? 'adm-primario' : ''}`} onClick={() => setAprovados(on ? aprovados.filter((x) => x !== n.imov) : [...aprovados, n.imov])}>{on ? 'Aprovado' : 'Aprovar'}</button>
                          <a className="cur-link" href={n.link} target="_blank" rel="noreferrer">Ver anúncio</a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button className="adm-btn adm-primario" onClick={() => escolherMelhores()} disabled={ocupado}>{ocupado ? 'Escolhendo…' : `Continuar${aprovados.length ? ` com ${aprovados.length} aprovado${aprovados.length > 1 ? 's' : ''}` : ' sem eles'}`}</button>
            </div>
          )}

          {escolha && (
            <div className="cur-escolha">
              <label className="adm-campo"><span>Título da página</span><input value={escolha.titulo} onChange={(e) => setEscolha({ ...escolha, titulo: e.target.value })} /></label>
              <label className="adm-campo"><span>Subtítulo</span><textarea rows={2} value={escolha.subtitulo} onChange={(e) => setEscolha({ ...escolha, subtitulo: e.target.value })} /></label>
              {escolha.observacoes && <p className="cur-obs"><b>Sobre a busca:</b> {escolha.observacoes}</p>}
              {escolha.itens.map((it, k) => {
                const c = porRef[it.ref] || {};
                const cf = c.conferencia || {};
                return (
                  <div key={it.ref} className="cur-item">
                    {c.foto && <img src={foto(c.foto)} alt="" loading="lazy" />}
                    <div className="cur-item-corpo">
                      <div className="cur-item-topo">
                        <span><b>{k + 1}. {it.ref}</b> · {c.bairro} · {brl(c.preco)}{c.novo && <span className="adm-tag t-voce">novo do Rafael</span>}</span>
                        <span className="cur-item-btns">
                          <button onClick={() => mover(k, -1)} aria-label="Subir">↑</button>
                          <button onClick={() => mover(k, 1)} aria-label="Descer">↓</button>
                          <button onClick={() => remover(k)} aria-label="Tirar">×</button>
                        </span>
                      </div>
                      <small>{c.titulo}</small>
                      <div className="cur-tags">
                        {(c.desloc || []).filter((d) => d.min != null).map((d) => <span key={d.nome}>{d.min} min de carro até {d.nome}</span>)}
                        <span className={`cur-foto-${c.fotos?.nota}`}>Fotos: {c.fotos?.n} fotos · {c.fotos?.nota}{c.fotos?.obs ? ` (${c.fotos.obs})` : ''}</span>
                        {cf.ok && !cf.preco_fonte && !cf.permuta && !cf.bairro && <span className="ok">conferido em {cf.fonte}</span>}
                      </div>
                      {(cf.preco_fonte || cf.permuta || cf.bairro || cf.nao_achado || cf.erro) && (
                        <ul className="cur-alertas">
                          {cf.preco_fonte && <li>Preço diferente: no seu site {brl(c.preco)}, em {cf.fonte} {brl(cf.preco_fonte)}</li>}
                          {cf.permuta && <li>{cf.permuta}</li>}
                          {cf.bairro && <li>{cf.bairro}</li>}
                          {cf.nao_achado && <li>{cf.nao_achado}</li>}
                          {cf.erro && <li>Não consegui conferir em {cf.fonte} agora ({cf.erro})</li>}
                        </ul>
                      )}
                      <label className="adm-campo"><span>Por que escolhi (vai para o cliente)</span><textarea rows={3} value={it.porque} onChange={(e) => setItem(k, { porque: e.target.value })} /></label>
                      {it.nota_anderson && <small className="cur-nota">Para você: {it.nota_anderson}</small>}
                    </div>
                  </div>
                );
              })}
              {!!reserva.length && (
                <details className="cur-reserva"><summary>Adicionar outro da busca ({reserva.length})</summary>
                  {reserva.map((r) => { const c = porRef[r] || {}; return <button key={r} onClick={() => adicionar(r)}>+ {r} · {c.bairro} · {brl(c.preco)} · {c.titulo}</button>; })}
                </details>
              )}

              {!criada ? (
                <div className="adm-acoes" style={{ justifyContent: 'flex-start' }}>
                  <button className="adm-btn adm-primario" onClick={() => criarPagina(false)} disabled={ocupado || !escolha.itens.length}>{ocupado ? 'Criando…' : 'Criar página e revisar'}</button>
                  <button className="adm-btn" onClick={() => criarPagina(true)} disabled={ocupado || !escolha.itens.length}>Criar e já publicar</button>
                </div>
              ) : (
                <div className="cur-pronta">
                  <b>Página criada{criada.novos_salvos?.length ? ` · ${criada.novos_salvos.join(', ')} salvos como rascunho na carteira` : ''}</b>
                  <div className="cur-copiar"><input readOnly value={criada.link} onFocus={(e) => e.target.select()} /><button className="adm-btn" onClick={() => navigator.clipboard?.writeText(criada.link)}>Copiar</button></div>
                  <div className="adm-acoes" style={{ justifyContent: 'flex-start' }}>
                    <button className="adm-btn adm-primario" onClick={abrirEditor}>Abrir no editor</button>
                  </div>
                  <small className="cur-dica">Se criou como rascunho, publique no editor para o link funcionar.</small>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
