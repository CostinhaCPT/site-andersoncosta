// Busca para curadoria: encontra os melhores imóveis para um cliente e monta a página de curadoria.
// Etapas (o admin chama uma de cada vez e mostra o progresso):
//   perfil     -> lê as anotações da ligação + conversa da Lu e transforma em critérios
//   candidatos -> busca na carteira, confere Domus e site do Rafael ao vivo, calcula deslocamento e olha as fotos
//   escolher   -> a IA escolhe os melhores e escreve o "por que escolhi" (só pontos positivos, só fatos)
//   criar      -> grava a página de curadoria com link /curadoria/<nome>-<codigo>
// Acesso: admin logado (public.eh_admin) ou token do relógio (config.cron) para testes.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SITE = "https://andersoncostaimoveis.com.br";
const SARTORI = "https://sartoricorretor.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const UA_GEO = "AndersonCostaImoveis/1.0 (curadoria; contato@andersoncostaimoveis.com.br)";
const adm = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

function cors(origin: string | null) {
  const ok = origin && (origin === SITE || origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1"));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : SITE,
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (b: unknown, s: number, o: string | null) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors(o) } });

const slugify = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const limpar = (s: string) => String(s ?? "").replace(/\s*[—–]\s*/g, ", ").replace(/!/g, ".").trim();
const comTempo = <T>(p: Promise<T>, ms: number, padrao: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(padrao), ms))]);
async function emLotes<T, R>(itens: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < itens.length; i += n) out.push(...await Promise.all(itens.slice(i, i + n).map(f)));
  return out;
}

// ---------- IA ----------
let MODELO = Deno.env.get("CLAUDE_MODEL") ?? "";
async function modelo() {
  if (MODELO) return MODELO;
  const r = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01" } });
  const ids: string[] = ((await r.json()).data ?? []).map((m: { id: string }) => m.id);
  MODELO = ids.find((i) => i.includes("sonnet")) ?? ids[0];
  return MODELO;
}
async function claude(sistema: string, usuario: string, ferramenta: Record<string, unknown>, max = 3000) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: await modelo(), max_tokens: max, system: `${sistema}\n\nResponda somente chamando a ferramenta ${ferramenta.name}.`,
      tools: [ferramenta], tool_choice: { type: "auto" },
      messages: [{ role: "user", content: usuario }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`IA: ${j?.error?.message ?? r.status}`);
  const uso = (j.content ?? []).find((c: { type: string }) => c.type === "tool_use");
  if (!uso) throw new Error("IA não devolveu o resultado");
  return uso.input as Record<string, any>;
}

// ---------- Situação ----------
const SITUACOES: Record<string, string[]> = {
  planta: ["em construção", "na planta", "lançamento", "lancamento", "em obras"],
  pronto: ["pronto para morar", "novo", "seminovo", "reformado", "pronto para construir"],
  usado: ["usado"],
};
const grupoSituacao = (s: string | null) => {
  const t = String(s ?? "").toLowerCase();
  for (const [g, l] of Object.entries(SITUACOES)) if (l.includes(t)) return g;
  return null;
};

// ---------- Etapa 1: perfil ----------
async function contextoLead(leadId?: string) {
  if (!leadId) return { lead: null, conversa: "" };
  const { data: lead } = await adm.from("leads").select("nome,objetivo,regioes,perfil,prazo,motivacao,faixa_investimento,faixa_max,pagamento,tem_imovel_para_vender,decisores,notas,imoveis_interesse,campos").eq("id", leadId).maybeSingle();
  const { data: convs } = await adm.from("conversas").select("id,resumo").eq("lead_id", leadId).order("criado_em", { ascending: false }).limit(5);
  let conversa = "";
  const ids = (convs ?? []).map((c) => c.id);
  if (ids.length) {
    const { data: msgs } = await adm.from("mensagens").select("papel,conteudo,criado_em").in("conversa_id", ids).order("criado_em", { ascending: false }).limit(80);
    conversa = (msgs ?? []).reverse().filter((m) => m.conteudo && ["usuario", "assistente", "anderson"].includes(String(m.papel)))
      .map((m) => `${m.papel === "usuario" ? "Cliente" : m.papel === "anderson" ? "Anderson" : "Lu"}: ${String(m.conteudo).slice(0, 600)}`).join("\n");
    const resumos = (convs ?? []).map((c) => c.resumo).filter(Boolean).join("\n");
    if (resumos) conversa = `Resumos: ${resumos}\n\n${conversa}`;
  }
  return { lead, conversa: conversa.slice(-14000) };
}

const FERR_PERFIL = {
  name: "perfil_cliente",
  description: "Critérios de busca extraídos do que o cliente contou.",
  input_schema: {
    type: "object",
    properties: {
      resumo: { type: "string", description: "2 a 3 frases: quem é a família, o que procura e o que pesa na decisão." },
      quartos_min: { type: "integer" }, suites_min: { type: "integer" }, vagas_min: { type: "integer" }, area_min: { type: "number" },
      valor_max: { type: "number", description: "Teto citado pelo cliente, em reais. 0 se não citou." },
      obrigatorios: { type: "array", items: { type: "string" }, description: "Itens que o cliente exige, em palavras curtas que aparecem em anúncios (ex.: piscina, quintal, térreo, escritório, pet)." },
      desejaveis: { type: "array", items: { type: "string" } },
      evitar: { type: "array", items: { type: "string" }, description: "O que o cliente não quer (ex.: escada, condomínio, apartamento sem elevador)." },
      bairros_citados: { type: "array", items: { type: "string" } },
      tipos_citados: { type: "array", items: { type: "string", enum: ["casa", "casa-geminada", "sobrado", "apartamento", "cobertura", "terreno", "chacara"] } },
      pontos_referencia: {
        type: "array", description: "Lugares que o cliente frequenta (trabalho, escola, família) e o tempo máximo de carro.",
        items: { type: "object", properties: { nome: { type: "string" }, busca: { type: "string", description: "Endereço ou nome para localizar no mapa, com cidade e SC." }, max_min: { type: "integer" } }, required: ["nome", "busca"] },
      },
      permuta: { type: "boolean", description: "Cliente quer dar imóvel ou carro como parte do pagamento." },
      financiamento: { type: "boolean" },
      perguntas: { type: "array", items: { type: "string" }, description: "Até 3 dúvidas que o Anderson deveria confirmar com o cliente." },
    },
    required: ["resumo", "obrigatorios", "desejaveis", "evitar", "pontos_referencia", "perguntas"],
  },
};

async function perfil(body: Record<string, any>) {
  const { lead, conversa } = await contextoLead(body.lead_id);
  const f = body.filtros ?? {};
  const texto = [
    `Nome do cliente: ${body.nome || lead?.nome || "não informado"}`,
    `Filtros que o Anderson marcou: ${JSON.stringify(f)}`,
    `Anotações da ligação (o Anderson digitou):\n${body.notas || "(nenhuma)"}`,
    lead ? `Ficha do lead no CRM: ${JSON.stringify(lead)}` : "",
    conversa ? `Conversa com a Lu (assistente do WhatsApp):\n${conversa}` : "",
    (body.referencias ?? []).length ? `Pontos de referência digitados: ${JSON.stringify(body.referencias)}` : "",
  ].filter(Boolean).join("\n\n");
  const p = await claude(
    `Você ajuda Anderson Costa, corretor em Jaraguá do Sul (SC), a entender o que um cliente comprador precisa. Extraia critérios só do que foi dito. Não invente. Se algo não foi dito, deixe vazio ou 0. Para pontos de referência em Jaraguá do Sul e região, escreva no campo busca um texto que um mapa (OpenStreetMap) encontre, sempre com a cidade e "SC". Se o Anderson digitou um endereço, use o dele. Português do Brasil, sem travessão.`,
    texto, FERR_PERFIL, 1500,
  );
  // pontos digitados pelo Anderson têm prioridade
  for (const r of body.referencias ?? []) {
    if (!r?.nome) continue;
    const ja = p.pontos_referencia.find((x: any) => slugify(x.nome) === slugify(r.nome));
    if (ja) { ja.busca = r.busca || ja.busca; ja.max_min = Number(r.max_min) || ja.max_min; } else p.pontos_referencia.push({ nome: r.nome, busca: r.busca || `${r.nome}, Jaraguá do Sul, SC`, max_min: Number(r.max_min) || 20 });
  }
  return { perfil: p, tem_conversa: !!conversa, lead_nome: lead?.nome ?? null };
}

// ---------- Mapa (OpenStreetMap, sem trânsito) ----------
type Ponto = { lat: number; lon: number };
let CACHE_GEO: Record<string, Ponto | null> | null = null;
async function geoCache() {
  if (CACHE_GEO) return CACHE_GEO;
  const { data } = await adm.from("config").select("valor").eq("chave", "geo_cache").maybeSingle();
  CACHE_GEO = (data?.valor as Record<string, Ponto | null>) ?? {};
  return CACHE_GEO;
}
let geoMudou = false;
async function geocodificar(q: string): Promise<Ponto | null> {
  const k = slugify(q);
  const c = await geoCache();
  if (c[k]) return c[k];
  const achados = await procurarLugar(q, 1);
  const p = achados[0] ? { lat: achados[0].lat, lon: achados[0].lon } : null;
  if (p) { c[k] = p; geoMudou = true; }
  return p;
}
// Procura um lugar no mapa (Photon, do OpenStreetMap). Os serviços de mapa bloqueiam o endereço das funções,
// então o pedido sai pelo banco (pg_net): geo_pedir dispara e geo_resposta lê o resultado.
async function procurarLugar(q: string, limite = 6) {
  const out: { nome: string; lat: number; lon: number }[] = [];
  const { data: id } = await adm.rpc("geo_pedir", { q });
  if (!id) return out;
  for (let t = 0; t < 45; t++) {
    await new Promise((r) => setTimeout(r, 400));
    const { data: r } = await adm.rpc("geo_resposta", { pid: id });
    if (!r) continue;
    for (const f of r.corpo?.features ?? []) {
      const pr = f.properties ?? {};
      if (pr.state && !/santa catarina/i.test(pr.state)) continue;
      const nome = [pr.name, [pr.street, pr.housenumber].filter(Boolean).join(", "), pr.district ?? pr.locality, pr.city].filter(Boolean).join(" · ");
      out.push({ nome, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] });
    }
    break;
  }
  return out.slice(0, limite);
}
async function salvarGeo() {
  if (!geoMudou || !CACHE_GEO) return;
  await adm.from("config").upsert({ chave: "geo_cache", valor: CACHE_GEO }, { onConflict: "chave" });
  geoMudou = false;
}
// minutos de carro de uma origem para vários destinos
async function minutosDe(origem: Ponto, destinos: Ponto[]): Promise<(number | null)[]> {
  if (!destinos.length) return [];
  const coords = [origem, ...destinos].map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  try {
    const r = await comTempo(fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=duration`, { headers: { "user-agent": UA_GEO } }), 15000, null);
    if (!r) return destinos.map(() => null);
    const j = await r.json();
    return (j.durations?.[0] ?? []).slice(1).map((s: number | null) => (s == null ? null : Math.max(1, Math.round(s / 60))));
  } catch { return destinos.map(() => null); }
}

// ---------- Fotos ----------
function dimensoes(b: Uint8Array): { w: number; h: number } | null {
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return null;
  }
  // WEBP
  if (b[0] === 0x52 && b[8] === 0x57 && b[12] === 0x56) {
    const t = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (t === "VP8X") return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (t === "VP8 ") return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
    if (t === "VP8L") { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
  }
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] };
  return null;
}
async function tamanhoFoto(url: string) {
  try {
    const r = await comTempo(fetch(url, { headers: { Range: "bytes=0-65535", "user-agent": UA } }), 8000, null);
    if (!r) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    return dimensoes(b);
  } catch { return null; }
}
async function avaliarFotos(lista: string[], drive: boolean) {
  const fotos = lista.map((u) => (String(u).startsWith("/") ? SITE + u : String(u)));
  const n = fotos.length;
  const amostra = await Promise.all(fotos.slice(0, 2).map(tamanhoFoto));
  const larguras = amostra.filter(Boolean).map((d) => d!.w);
  const w = larguras.length ? Math.min(...larguras) : null;
  let nota: "boa" | "ok" | "fraca" = "ok";
  const obs: string[] = [];
  if (n < 6) { nota = "fraca"; obs.push(`só ${n} fotos`); }
  if (w && w < 800) { nota = "fraca"; obs.push(`resolução baixa (${w}px)`); }
  if (n >= 12 && (!w || w >= 1200) && nota !== "fraca") nota = "boa";
  if (drive) obs.push("originais no Drive");
  return { n, largura: w, nota, obs: obs.join(", ") };
}

// ---------- Domus (conferência ao vivo) ----------
async function conferirDomus(link: string) {
  try {
    const r = await comTempo(fetch(link, { headers: { "user-agent": "Mozilla/5.0 (sincronizacao parceria)" } }), 12000, null);
    if (!r) return { ok: false, erro: "sem resposta" };
    if (r.status === 404) return { ok: true, disponivel: false, motivo: "página saiu do ar" };
    const h = await r.text();
    const m = h.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    const d = m ? JSON.parse(m[1])?.props?.initialState?.property?.data : null;
    if (!d) return { ok: true, disponivel: false, motivo: "anúncio não encontrado" };
    return {
      ok: true,
      disponivel: d.transaction === "VENDA" && d.status === "Disponível" && d.is_published !== false,
      motivo: d.status, preco: Number(d.price) || null, permuta: !!d.is_exchangeable, financia: !!d.is_financeable,
    };
  } catch (e) { return { ok: false, erro: String(e).slice(0, 80) }; }
}

// ---------- Site do Rafael Sartori ----------
const CIDADES = ["jaragua-do-sul", "guaramirim", "schroeder", "corupa", "massaranduba", "pomerode", "barra-velha", "sao-bento-do-sul", "joinville", "itapema", "porto-belo", "balneario-picarras", "balneario-camboriu", "penha", "blumenau", "araquari", "sao-joao-do-itaperiu", "bombinhas", "navegantes", "itajai"];
const TIPOS_S = ["casa-geminada", "casa-em-condominio", "casa", "sobrado", "apartamento", "cobertura", "terreno", "chacara", "sitio", "sala-comercial", "sala", "loja", "galpao", "kitnet", "flat", "studio"];
const TIPO_NOSSO: Record<string, string> = { "casa-em-condominio": "casa", sitio: "chacara", flat: "apartamento", studio: "apartamento", kitnet: "apartamento" };
type Sart = { codigo: string; url: string; tipo: string; quartos: number | null; bairro_slug: string; cidade_slug: string; area: number | null };
function lerUrlSartori(path: string): Sart | null {
  const m = path.match(/^\/imovel\/venda-(.+?)-sc-(?:(\d+(?:[.,]\d+)?)m2)?\/?(IMOV-\d+)$/) ?? path.match(/^\/imovel\/venda-(.+?)-sc\/?(?:.*?)(IMOV-\d+)$/);
  if (!m) return null;
  let resto = m[1];
  const area = m[3] ? (m[2] ? Number(m[2].replace(",", ".")) : null) : null;
  const codigo = m[3] ?? m[2];
  const tipoS = TIPOS_S.find((t) => resto === t || resto.startsWith(t + "-")) ?? resto.split("-")[0];
  resto = resto.slice(tipoS.length).replace(/^-/, "");
  let quartos: number | null = null;
  const q = resto.match(/^(\d+)-(?:quartos?|dormitorios?|suites?)-/);
  if (q) { quartos = Number(q[1]); resto = resto.slice(q[0].length); }
  const cidade = CIDADES.find((c) => resto === c || resto.endsWith("-" + c)) ?? "";
  const bairro = cidade ? resto.slice(0, resto.length - cidade.length).replace(/-$/, "") : resto;
  return { codigo, url: SARTORI + path, tipo: TIPO_NOSSO[tipoS] ?? tipoS, quartos, bairro_slug: bairro, cidade_slug: cidade, area };
}
async function listarSartori(): Promise<{ itens: Sart[]; completo: boolean }> {
  // cache de 6 horas para não varrer o site a cada busca
  const { data: c } = await adm.from("config").select("valor").eq("chave", "sartori_cache").maybeSingle();
  if (c?.valor?.em && Date.now() - Date.parse(c.valor.em) < 6 * 3600e3 && c.valor.itens?.length) return { itens: c.valor.itens, completo: !!c.valor.completo };
  const mapa = new Map<string, Sart>();
  let completo = false;
  const lerPagina = async (n: number) => {
    try {
      const r = await comTempo(fetch(`${SARTORI}/venda/?page=${n}`, { headers: { "user-agent": UA } }), 20000, null);
      if (!r || !r.ok) return -1;
      const h = await r.text();
      let novos = 0;
      for (const m of h.matchAll(/\/imovel\/[a-z0-9-]+\/IMOV-\d+/g)) {
        if (mapa.has(m[0])) continue;
        const s = lerUrlSartori(m[0]); if (s) { mapa.set(m[0], s); novos++; }
      }
      return novos;
    } catch { return -1; }
  };
  for (let p = 1; p <= 30; p += 5) {
    const res = await Promise.all([p, p + 1, p + 2, p + 3, p + 4].map(lerPagina));
    if (res.some((x) => x === 0)) { completo = !res.some((x) => x < 0); break; }
    if (res.every((x) => x < 0)) break;
  }
  const itens = [...mapa.values()];
  if (itens.length) await adm.from("config").upsert({ chave: "sartori_cache", valor: { em: new Date().toISOString(), completo, itens } }, { onConflict: "chave" });
  return { itens, completo };
}
async function detalheSartori(url: string) {
  try {
    const r = await comTempo(fetch(url, { headers: { "user-agent": UA } }), 15000, null);
    if (!r) return null;
    if (r.status === 404) return { disponivel: false };
    const h = await r.text();
    for (const m of h.matchAll(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
      let j: any; try { j = JSON.parse(m[1]); } catch { continue; }
      if (j?.["@type"] !== "RealEstateListing") continue;
      const e = j.mainEntity ?? {};
      const texto = h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").toLowerCase();
      return {
        disponivel: String(j.offers?.availability ?? "").includes("InStock"),
        titulo: String(j.name ?? "").trim(), descricao: String(j.description ?? "").trim(),
        preco: Number(j.offers?.price) || null, fotos: (Array.isArray(j.image) ? j.image : [j.image]).filter(Boolean),
        area: Number(e.floorSize?.value) || null, quartos: Number(e.numberOfBedrooms) || null, banheiros: Number(e.numberOfBathroomsTotal) || null,
        cidade: e.address?.addressLocality ?? null,
        permuta: /aceita\s+permuta|permuta/.test(texto) ? true : null,
      };
    }
    return null;
  } catch { return null; }
}

// ---------- Etapa 2: candidatos ----------
const COLS = "id,codigo,slug,status,titulo,resumo,descricao,destaques,tipo,cidade,bairro,preco,preco_visivel,area,terreno,quartos,suites,banheiros,vagas,condominio,aceita_permuta,aceita_financiamento,fotos,origem,codigo_parceiro,campos";

function pontuar(i: any, f: any, p: any) {
  let s = 50; const bons: string[] = [], faltas: string[] = [];
  const de = Number(f.valor_de) || 0, ate = Number(f.valor_ate) || Number(p.valor_max) || 0;
  const preco = Number(i.preco) || 0;
  if (ate && preco > ate) { s -= Math.min(20, Math.round(((preco - ate) / ate) * 200)); faltas.push(`${Math.round(((preco - ate) / ate) * 100)}% acima do teto`); }
  else if (preco && (!de || preco >= de)) s += 10;
  const req = (v: number | undefined, tem: number, nome: string) => {
    if (!v) return;
    if ((tem || 0) >= v) { s += 8; bons.push(`${tem} ${nome}`); } else { s -= 14; faltas.push(`${tem || 0} ${nome} (pediu ${v})`); }
  };
  req(p.quartos_min, i.quartos, "quartos"); req(p.suites_min, i.suites, "suítes"); req(p.vagas_min, i.vagas, "vagas");
  if (p.area_min && i.area) { if (i.area >= p.area_min) s += 5; else { s -= 8; faltas.push(`${Math.round(i.area)} m² (pediu ${p.area_min})`); } }
  const texto = slugify([i.titulo, i.resumo, i.descricao, (i.destaques ?? []).join(" "), i.campos?.descricao_domus].join(" "));
  const tem = (t: string) => { const k = slugify(t); return k.length > 2 && (texto.includes(k) || k.split("-").filter((x) => x.length > 3).every((x) => texto.includes(x))); };
  const textual = (o: string) => !/\d|quarto|su[ií]te|vaga|dormit/i.test(o);
  for (const o of (p.obrigatorios ?? []).filter(textual)) { if (tem(o)) { s += 9; bons.push(o); } else { s -= 7; faltas.push(`sem menção a ${o}`); } }
  for (const o of p.desejaveis ?? []) if (tem(o)) { s += 4; bons.push(o); }
  for (const o of p.evitar ?? []) if (tem(o)) { s -= 10; faltas.push(`tem ${o}`); }
  if ((p.bairros_citados ?? []).some((b: string) => slugify(b) === slugify(i.bairro))) { s += 8; bons.push(`bairro ${i.bairro}`); }
  if (p.permuta && i.aceita_permuta) { s += 6; bons.push("aceita permuta"); }
  const nf = (i.fotos ?? []).length;
  s += nf >= 15 ? 6 : nf >= 10 ? 3 : nf < 6 ? -8 : 0;
  if (/^AC-/.test(i.codigo)) s += 5;
  return { nota: s, bons: [...new Set(bons)], faltas: [...new Set(faltas)] };
}

async function candidatos(body: Record<string, any>) {
  const f = body.filtros ?? {}, p = body.perfil ?? {};
  const alertas: string[] = [];
  const tipos: string[] = (f.tipos?.length ? f.tipos : p.tipos_citados ?? []).filter(Boolean);
  const ate = Number(f.valor_ate) || Number(p.valor_max) || 0, de = Number(f.valor_de) || 0;
  let q = adm.from("imoveis").select(COLS).eq("status", "disponivel");
  if (tipos.length) q = q.in("tipo", tipos.includes("casa") ? [...new Set([...tipos, "sobrado"])] : tipos);
  if (f.cidade) q = q.eq("cidade", f.cidade);
  if (de) q = q.gte("preco", de * 0.9);
  if (ate) q = q.lte("preco", ate * 1.08);
  const { data: base, error } = await q.limit(600);
  if (error) throw new Error(error.message);
  const bairros = (f.bairros ?? []).map(slugify).filter(Boolean);
  const situacoes: string[] = f.situacoes ?? [];
  let lista = (base ?? []).filter((i) => !bairros.length || bairros.includes(slugify(i.bairro)))
    .filter((i) => !situacoes.length || !grupoSituacao(i.campos?.situacao) || situacoes.includes(grupoSituacao(i.campos?.situacao)!));
  const total = lista.length;
  // remove duplicados (mesmo imóvel na Domus e na carteira própria)
  lista = lista.filter((i) => !i.campos?.duplicado_de);
  let ranq = lista.map((i) => ({ i, ...pontuar(i, f, p) })).sort((a, b) => b.nota - a.nota).slice(0, 30);

  // deslocamento
  const refs: any[] = [];
  for (const r of (p.pontos_referencia ?? []).slice(0, 3)) {
    const salvo = (await geoCache())[slugify(r.nome)];
    const pt = r.lat && r.lon ? { lat: Number(r.lat), lon: Number(r.lon) } : salvo ?? await geocodificar(r.busca || r.nome);
    if (!pt) { alertas.push(`Não localizei "${r.nome}" no mapa. Em "Pontos de referência", clique em Localizar e escolha o lugar certo.`); continue; }
    refs.push({ ...r, pt });
  }
  if (refs.length) {
    const chaves = [...new Set(ranq.map((x) => `${x.i.bairro}|${x.i.cidade}`))];
    const pts: Record<string, Ponto | null> = {};
    await emLotes(chaves, 8, async (k) => { const [b, c] = k.split("|"); pts[k] = await geocodificar(`${b}, ${c}`); });
    for (const r of refs) {
      const validos = chaves.filter((k) => pts[k]);
      const mins = await minutosDe(r.pt, validos.map((k) => pts[k]!));
      const porChave = Object.fromEntries(validos.map((k, n) => [k, mins[n]]));
      for (const x of ranq) {
        const m = porChave[`${x.i.bairro}|${x.i.cidade}`];
        (x as any).desloc = [...((x as any).desloc ?? []), { nome: r.nome, min: m ?? null }];
        if (m != null && r.max_min) {
          if (m <= r.max_min) { x.nota += 10; x.bons.push(`${m} min até ${r.nome}`); } else { x.nota -= Math.min(20, (m - r.max_min) * 2); x.faltas.push(`${m} min até ${r.nome} (pediu até ${r.max_min})`); }
        }
      }
    }
    ranq.sort((a, b) => b.nota - a.nota);
  }
  await salvarGeo();
  ranq = ranq.slice(0, 15);

  // site do Rafael
  const sart = await comTempo(listarSartori(), 45000, { itens: [] as Sart[], completo: false });
  if (!sart.itens.length) alertas.push("Não consegui ler o site do Rafael agora. A conferência dos imóveis dele ficou de fora.");
  const nossosAC = (await adm.from("imoveis").select("codigo,bairro,area,preco,status,tipo,campos").like("codigo", "AC-%")).data ?? [];
  // vínculo AC- x IMOV-: primeiro o código salvo; depois mesmo bairro, mesmo tipo e mesma área (tolerância de 1 m²)
  const familia = (t: string) => ({ sobrado: "casa", cobertura: "apartamento" } as Record<string, string>)[t] ?? t;
  const casar = (s: Sart) => nossosAC.find((a) => a.campos?.imov === s.codigo) ??
    nossosAC.find((a) => !a.campos?.imov && slugify(a.bairro) === s.bairro_slug && familia(a.tipo) === familia(s.tipo) && s.area && a.area && Math.abs(Number(a.area) - s.area) <= 1);
  const mapaSart = new Map<string, Sart>();
  const usados = new Set<string>();
  for (const s of sart.itens) { const a = casar(s); if (a) { usados.add(s.codigo); if (!mapaSart.has(a.codigo)) mapaSart.set(a.codigo, s); } }
  const { data: bairrosDb } = await adm.from("imoveis").select("bairro").neq("bairro", "").limit(2000);
  const nomeBairro = Object.fromEntries((bairrosDb ?? []).map((b) => [slugify(b.bairro), b.bairro]));

  // conferência ao vivo + fotos dos 15 melhores
  const enriquecidos = await emLotes(ranq, 5, async (x) => {
    const i = x.i; const conf: Record<string, any> = {};
    if (i.origem === "domus" && i.campos?.link_domus) {
      const d = await conferirDomus(i.campos.link_domus);
      conf.fonte = "Domus";
      if (d.ok) {
        if (!d.disponivel) conf.indisponivel = `Na Domus: ${d.motivo ?? "fora do ar"}`;
        if (d.preco && i.preco && Math.abs(d.preco - Number(i.preco)) >= 1000) conf.preco_fonte = d.preco;
        if (i.aceita_permuta && !d.permuta) conf.permuta = "Nosso site diz que aceita permuta, a Domus não marca";
        if (!i.aceita_permuta && d.permuta) conf.permuta = "A Domus marca que aceita permuta, nosso site não";
        conf.ok = true;
      } else conf.erro = d.erro;
    } else if (/^AC-/.test(i.codigo)) {
      const s = mapaSart.get(i.codigo);
      conf.fonte = "Site do Rafael";
      if (s) {
        conf.imov = s.codigo; conf.link = s.url;
        if (s.bairro_slug && s.bairro_slug !== slugify(i.bairro)) conf.bairro = `No site do Rafael o bairro está como ${nomeBairro[s.bairro_slug] ?? s.bairro_slug}`;
        const d = await detalheSartori(s.url);
        if (d) {
          if (d.disponivel === false) conf.indisponivel = "No site do Rafael: indisponível";
          if (d.preco && i.preco && Math.abs(d.preco - Number(i.preco)) >= 1000) conf.preco_fonte = d.preco;
          if (i.aceita_permuta && d.permuta === null) conf.permuta = "Nosso site diz que aceita permuta, o anúncio do Rafael não cita";
          if (!i.aceita_permuta && d.permuta) conf.permuta = "O anúncio do Rafael cita permuta, nosso site não";
          conf.ok = true;
        }
      } else if (sart.completo) conf.nao_achado = "Não está mais no site do Rafael. Confirme se foi vendido.";
    }
    const fotos = await avaliarFotos(i.fotos ?? [], !!i.campos?.fotos_drive);
    if (conf.indisponivel) x.nota -= 100;
    return {
      codigo: i.codigo, titulo: i.titulo, tipo: i.tipo, bairro: i.bairro, cidade: i.cidade, preco: Number(i.preco) || null,
      area: Number(i.area) || null, quartos: i.quartos, suites: i.suites, vagas: i.vagas, aceita_permuta: i.aceita_permuta,
      situacao: i.campos?.situacao ?? null, foto: (i.fotos ?? [])[0] ?? null, slug: i.slug, origem: i.origem,
      nota: x.nota, bons: x.bons, faltas: x.faltas, desloc: (x as any).desloc ?? [], conferencia: conf, fotos,
      resumo: String(i.resumo ?? "").slice(0, 300), destaques: (i.destaques ?? []).slice(0, 8),
      descricao: String(i.descricao || i.campos?.descricao_domus || "").slice(0, 900),
    };
  });
  enriquecidos.sort((a, b) => b.nota - a.nota);

  // novos do Rafael que ainda não estão no nosso site
  const tiposAceitos = new Set(tipos.length ? (tipos.includes("casa") ? [...tipos, "sobrado"] : tipos) : []);
  const pre = sart.itens.filter((s) => {
    if (usados.has(s.codigo)) return false;
    if (tiposAceitos.size && !tiposAceitos.has(s.tipo)) return false;
    if (f.cidade && s.cidade_slug && s.cidade_slug !== slugify(f.cidade)) return false;
    if (bairros.length && !bairros.includes(s.bairro_slug)) return false;
    if (p.quartos_min && s.quartos != null && s.quartos < p.quartos_min) return false;
    return true;
  }).slice(0, 14);
  const novos = (await emLotes(pre, 5, async (s) => {
    const d = await detalheSartori(s.url);
    if (!d || d.disponivel === false) return null;
    if (ate && d.preco && d.preco > ate * 1.08) return null;
    if (de && d.preco && d.preco < de * 0.9) return null;
    const bairro = nomeBairro[s.bairro_slug] ?? s.bairro_slug.split("-").map((w) => (["do", "da", "de", "dos", "das"].includes(w) ? w : w[0].toUpperCase() + w.slice(1))).join(" ");
    const fotos = await avaliarFotos(d.fotos ?? [], false);
    return {
      imov: s.codigo, link: s.url, titulo: d.titulo, tipo: s.tipo, bairro, cidade: d.cidade || "Jaraguá do Sul", preco: d.preco,
      area: d.area ?? s.area, quartos: d.quartos ?? s.quartos, banheiros: d.banheiros, descricao: (d.descricao ?? "").slice(0, 900),
      fotos_lista: (d.fotos ?? []).slice(0, 20), foto: (d.fotos ?? [])[0] ?? null, fotos, permuta: d.permuta,
    };
  }, )).filter(Boolean);

  const indisponiveis = enriquecidos.filter((e) => e.conferencia.indisponivel).map((e) => `${e.codigo}: ${e.conferencia.indisponivel}`);
  if (indisponiveis.length) alertas.push(...indisponiveis);
  return { total_filtrado: total, candidatos: enriquecidos, novos, alertas, referencias: refs.map((r) => ({ nome: r.nome, max_min: r.max_min ?? null })), sartori_lidos: sart.itens.length };
}

// ---------- Etapa 3: a IA escolhe ----------
const FERR_ESCOLHA = {
  name: "curadoria",
  description: "Escolha final da curadoria.",
  input_schema: {
    type: "object",
    properties: {
      titulo: { type: "string", description: "Título da página, até 60 caracteres, com o primeiro nome. Ex.: \"Ricardo, separei estas casas para vocês\"" },
      subtitulo: { type: "string", description: "Até 180 caracteres. Liga a escolha ao que o cliente contou." },
      intro: { type: "string", description: "1 ou 2 frases antes dos cards." },
      itens: {
        type: "array", description: "De 3 a 6 imóveis, do mais aderente para o menos.",
        items: { type: "object", properties: { ref: { type: "string", description: "Código (AC-, DM-) ou IMOV- para novo do Rafael." }, porque: { type: "string", description: "Até 240 caracteres. Só pontos positivos e fatos, ligados ao que o cliente pediu." }, nota_anderson: { type: "string", description: "Só para o Anderson (não vai na página): o que confirmar antes de enviar." } }, required: ["ref", "porque"] },
      },
      observacoes: { type: "string", description: "Para o Anderson: 1 a 3 frases sobre a busca (ex.: faltou opção no bairro X)." },
    },
    required: ["titulo", "subtitulo", "intro", "itens", "observacoes"],
  },
};
async function escolher(body: Record<string, any>) {
  const nome = String(body.nome || "").trim().split(/\s+/)[0] || "Olá";
  const cands = (body.candidatos ?? []).filter((c: any) => !c.conferencia?.indisponivel).slice(0, 15);
  const novos = (body.novos_aprovados ?? []).slice(0, 6);
  const fichas = [...cands.map((c: any) => ({ ref: c.codigo, titulo: c.titulo, tipo: c.tipo, bairro: c.bairro, cidade: c.cidade, preco: c.preco, area: c.area, quartos: c.quartos, suites: c.suites, vagas: c.vagas, situacao: c.situacao, deslocamento: c.desloc, pontos_fortes_para_o_cliente: c.bons, destaques: c.destaques, descricao: c.descricao, fotos: c.fotos?.nota })),
    ...novos.map((n: any) => ({ ref: n.imov, titulo: n.titulo, tipo: n.tipo, bairro: n.bairro, cidade: n.cidade, preco: n.preco, area: n.area, quartos: n.quartos, descricao: n.descricao, novo_do_rafael: true }))];
  const r = await claude(
    `Você é a curadora de Anderson Costa, corretor em Jaraguá do Sul (CRECI SC 68594), Método Compra Segura. Escolha de 3 a 6 imóveis que mais combinam com o cliente e escreva o "por que escolhi" de cada um.
Regras:
- Use somente os fatos das fichas. Nunca invente metragem, distância, sol, vista, material, escola ou vizinhança.
- O texto que vai para o cliente traz só pontos positivos ligados ao que ele pediu. Nada de ponto de atenção ou defeito na página. Se houver algo a confirmar, coloque em nota_anderson.
- Tempo de deslocamento: diga "cerca de X minutos de carro" e só se veio na ficha.
- Prefira imóveis com fotos boas. Não escolha dois imóveis praticamente iguais.
- Inclua os novos do Rafael aprovados se combinarem.
- Sem travessão, sem exclamação, sem emoji, sem clichês (imperdível, oportunidade única, sonho, espetacular). Português do Brasil, frases curtas, tom de quem conhece os imóveis.`,
    `Cliente: ${nome}\nPerfil: ${JSON.stringify(body.perfil ?? {})}\n\nFichas:\n${JSON.stringify(fichas)}`,
    FERR_ESCOLHA, 3000,
  );
  const validos = new Set(fichas.map((f) => f.ref));
  r.itens = (r.itens ?? []).filter((i: any) => validos.has(i.ref)).map((i: any) => ({ ...i, porque: limpar(i.porque), nota_anderson: limpar(i.nota_anderson ?? "") }));
  r.titulo = limpar(r.titulo); r.subtitulo = limpar(r.subtitulo); r.intro = limpar(r.intro); r.observacoes = limpar(r.observacoes);
  return r;
}

// ---------- Etapa 4: criar a página ----------
const novoId = () => Math.random().toString(36).slice(2, 10);
function sufixo(n = 4) {
  const a = "abcdefghjkmnpqrstuvwxyz23456789"; let s = "";
  for (const x of crypto.getRandomValues(new Uint8Array(n))) s += a[x % a.length];
  return s;
}
async function criar(body: Record<string, any>) {
  const primeiro = String(body.nome || "").trim().split(/\s+/)[0] || "cliente";
  const base = slugify(primeiro).slice(0, 20) || "cliente";
  let slug = "";
  for (let t = 0; t < 6; t++) {
    const s = `${base}-${sufixo()}`;
    const { data } = await adm.from("lps").select("id").eq("slug", s).maybeSingle();
    if (!data) { slug = s; break; }
  }
  if (!slug) throw new Error("não consegui gerar o link");
  const novosPorRef: Record<string, any> = Object.fromEntries((body.novos_aprovados ?? []).map((n: any) => [n.imov, n]));
  const itens = (body.itens ?? []).map((it: any) => {
    const n = novosPorRef[it.ref];
    if (n) return { avulso: { titulo: n.titulo, bairro: n.bairro, cidade: n.cidade, preco: n.preco, area: n.area, quartos: n.quartos, suites: 0, vagas: 0, fotos: n.fotos_lista ?? [], fonte: n.link }, porque: it.porque, atencao: "", sem_atencao: true };
    return { codigo: it.ref, porque: it.porque, atencao: "", sem_atencao: true };
  });
  if (!itens.length) throw new Error("nenhum imóvel escolhido");
  const hero = {
    eyebrow: "Curadoria Compra Segura",
    titulo: body.titulo || `${primeiro}, separei estes imóveis para vocês`,
    subtitulo: body.subtitulo || "Escolhi pensando no que vocês me contaram.",
    cta_texto: "Ver os imóveis", cta_acao: "rolar",
  };
  const blocos = [
    { id: novoId(), tipo: "imoveis", dados: { titulo: "Os imóveis que separei", intro: body.intro || "", itens, reacoes: true } },
    { id: novoId(), tipo: "metodo", dados: { titulo: "Como eu trabalho" } },
    { id: novoId(), tipo: "cta", dados: { titulo: "Quer visitar algum?", texto: "Me diga quais chamaram sua atenção que eu organizo as visitas.", botao: "Falar no WhatsApp", mensagem: `Oi, Anderson! Sou ${primeiro}, vi a curadoria e quero conversar.` } },
  ];
  const { data, error } = await adm.from("lps").insert({
    slug, tipo: "curadoria", nome: `Curadoria ${String(body.nome || primeiro).slice(0, 70)}`, lead_id: body.lead_id || null,
    hero, blocos, opcoes: { chat: false, busca: { filtros: body.filtros ?? null, perfil: body.perfil ?? null, notas_anderson: (body.itens ?? []).map((i: any) => ({ ref: i.ref, nota: i.nota_anderson || "" })) } },
    status: body.publicar ? "publicada" : "rascunho", publicada_em: body.publicar ? new Date().toISOString() : null,
    expira_em: new Date(Date.now() + 60 * 864e5).toISOString(),
  }).select("id,slug").single();
  if (error) throw new Error(error.message);
  // novos aprovados entram como rascunho na carteira (para revisar e publicar depois no site)
  const salvos: string[] = [];
  for (const n of body.novos_aprovados ?? []) {
    const { data: ja } = await adm.from("imoveis").select("codigo").contains("campos", { imov: n.imov }).maybeSingle();
    if (ja) continue;
    const { data: ult } = await adm.from("imoveis").select("codigo").like("codigo", "AC-00%").order("codigo", { ascending: false }).limit(1);
    const prox = `AC-${String(Number(String(ult?.[0]?.codigo ?? "AC-0000").slice(3)) + 1).padStart(4, "0")}`;
    const { error: e2 } = await adm.from("imoveis").insert({
      codigo: prox, slug: `${slugify(n.tipo)}-${slugify(n.bairro)}-${slugify(n.cidade)}-${prox.toLowerCase()}`, status: "rascunho",
      titulo: n.titulo, resumo: String(n.descricao ?? "").slice(0, 160), descricao: n.descricao ?? "", tipo: n.tipo, bairro: n.bairro, cidade: n.cidade,
      preco: n.preco, preco_visivel: true, area: n.area, quartos: n.quartos ?? 0, banheiros: n.banheiros ?? 0, fotos: n.fotos_lista ?? [],
      origem: "sartori", codigo_parceiro: n.imov, aceita_permuta: n.permuta ? true : null, visita_exige_proprietario: true,
      campos: { imov: n.imov, link_sartori: n.link, parceria: "Rafael Sartori", via_curadoria: data.slug },
    });
    if (!e2) salvos.push(prox);
  }
  return { id: data.id, slug: data.slug, link: `${SITE}/curadoria/${data.slug}`, novos_salvos: salvos };
}

// ---------- servidor ----------
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405, origin);
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ erro: "json inválido" }, 400, origin); }

  let ok = false;
  const auth = req.headers.get("Authorization") ?? "";
  if (auth) {
    const sb = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data } = await sb.rpc("eh_admin");
    ok = data === true;
  }
  if (!ok && body.token) {
    const { data: cfg } = await adm.from("config").select("valor").eq("chave", "cron").maybeSingle();
    ok = !!cfg?.valor?.token && body.token === cfg.valor.token;
  }
  if (!ok) return json({ erro: "acesso negado" }, 403, origin);

  try {
    if (body.acao === "perfil") return json(await perfil(body), 200, origin);
    if (body.acao === "candidatos") return json(await candidatos(body), 200, origin);
    if (body.acao === "escolher") return json(await escolher(body), 200, origin);
    if (body.acao === "criar") return json(await criar(body), 200, origin);
    if (body.acao === "salvar_lugar") {
      const c = await geoCache();
      if (body.nome && Number(body.lat) && Number(body.lon)) { c[slugify(body.nome)] = { lat: Number(body.lat), lon: Number(body.lon) }; geoMudou = true; await salvarGeo(); }
      return json({ ok: true }, 200, origin);
    }
    if (body.acao === "lugar") return json({ lugares: await procurarLugar(String(body.q ?? "")) }, 200, origin);
    if (body.acao === "sartori") return json(await listarSartori(), 200, origin);
    return json({ erro: "ação desconhecida" }, 400, origin);
  } catch (e) {
    console.error(body.acao, e);
    return json({ erro: String((e as Error).message ?? e) }, 500, origin);
  }
});
