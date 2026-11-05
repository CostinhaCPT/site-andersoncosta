// Sincronização dos imóveis da Domus (parceria do Anderson) a partir do site público deles.
// Lê o sitemap e os dados de cada imóvel, cria os novos no CRM (como rascunho, até ganharem as fotos limpas do Drive)
// e mantém preço e disponibilidade em dia. Imóvel que sai do site da Domus vira "vendido" e o Anderson é avisado.
// Nunca mexe nos textos, fotos e status que o Anderson editou. Credencial: token do relógio (config.cron) ou admin.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BASE = "https://domuscorretores.com.br";
const PREFIXO = "DM-";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const slugify = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const numero = (s: unknown) => {
  if (s === null || s === undefined || s === "") return null;
  if (typeof s === "number") return s;
  const t = String(s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const limparHtml = (h: string) => String(h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();

function tipoDe(d: any): string {
  const t = d.subtype?.type?.id ?? "", s = (d.subtype?.title ?? "").toLowerCase();
  if (t === "apartamento") return "apartamento";
  if (t === "terreno" || t === "loteamento") return "terreno";
  if (t === "chacara") return "chacara";
  if (s.startsWith("geminad")) return "casa-geminada";
  if (t === "sobrado" || s === "sobrado") return "sobrado";
  return "casa";
}
const NOME_TIPO: Record<string, string> = { casa: "Casa", "casa-geminada": "Geminado", apartamento: "Apartamento", sobrado: "Sobrado", terreno: "Terreno", chacara: "Chácara" };

/** Converte os dados públicos de um imóvel da Domus para a tabela imoveis. */
function mapear(d: any) {
  const tipo = tipoDe(d);
  const areas = d.areas ?? {}, rooms = d.rooms ?? {};
  const v = (k: string) => numero(areas[k]?.value);
  const area = tipo === "apartamento" ? (v("private_area") ?? v("primary_area") ?? v("built_area"))
    : tipo === "terreno" ? (v("total_area") ?? v("primary_area"))
    : (v("built_area") ?? v("primary_area") ?? v("private_area"));
  const terreno = tipo === "apartamento" ? null : (v("total_area") ?? (areas.primary_area?.name === "ground_total_area" ? v("primary_area") : null));
  const r = (k: string) => Number(rooms[k]?.value ?? 0) || 0;
  const quartos = r("bedroom"), suites = r("suite") || r("suites_total"), banheiros = r("bathroom"), vagas = r("garage") + r("parking");
  const bairro = d.neighborhood?.name ?? "", cidade = d.neighborhood?.city?.name ?? "Jaraguá do Sul";
  const ref = String(d.reference);
  const nome = NOME_TIPO[tipo] ?? "Imóvel";
  const partes = [quartos ? `${quartos} ${quartos > 1 ? "quartos" : "quarto"}` : "", suites ? `${suites} ${suites > 1 ? "suítes" : "suíte"}` : ""].filter(Boolean).join(", ");
  const titulo = `${nome}${partes ? ` com ${partes}` : ""} no ${bairro}`.trim();
  const ficha = [area ? `${Math.round(area)} m²` : "", partes, vagas ? `${vagas} ${vagas > 1 ? "vagas" : "vaga"}` : ""].filter(Boolean).join(" · ");
  const caracteristicas = [...(d.characteristics ?? []), ...(d.condo_characteristics ?? [])].map((c: any) => String(c.title ?? "").trim()).filter(Boolean);
  const destaques = [...new Set(caracteristicas.map((c) => c.charAt(0).toUpperCase() + c.slice(1)))].slice(0, 8);
  const fotosDomus = (d.images_extra ?? []).map((i: any) => i.file_url?.large).filter(Boolean);
  return {
    codigo: PREFIXO + ref,
    codigo_parceiro: ref,
    origem: "domus",
    slug: `${slugify(nome)}-${slugify(bairro)}-${slugify(cidade)}-dm${ref}`,
    titulo,
    resumo: `${nome} no ${bairro}, ${cidade}. ${ficha}.`.replace(/\. \./, "."),
    tipo, cidade, bairro,
    preco: numero(d.price),
    area, terreno, quartos, suites, banheiros, vagas,
    condominio: numero(d.condominium_price),
    aceita_permuta: !!d.is_exchangeable,
    aceita_financiamento: !!d.is_financeable,
    destaques,
    visita_exige_proprietario: true, // imóvel de parceiro: a visita sempre é combinada antes
    campos: {
      parceria: "Domus", split_pct: 15, ref_domus: ref, link_domus: `${BASE}/imovel/${d.url}`,
      situacao: d.situation ?? null, sol: d.solar_position ?? null, descricao_domus: limparHtml(d.description).slice(0, 6000),
      fotos_domus: fotosDomus, mobiliado: d.furniture ?? null, atualizado_domus: d.updated_at_timestamp ?? null,
    },
  };
}

async function lerImovel(url: string) {
  const h = await (await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (sincronizacao parceria)" } })).text();
  const m = h.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  return JSON.parse(m[1])?.props?.initialState?.property?.data ?? null;
}

async function sincronizar(opcoes: { limite?: number } = {}) {
  const sm = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]).filter((x) => x.includes("/imovel/"));
  if (urls.length < 20) throw new Error(`Sitemap da Domus veio com só ${urls.length} imóveis; sincronização interrompida por segurança.`);
  const lista = opcoes.limite ? urls.slice(0, opcoes.limite) : urls;
  const lidos: any[] = [];
  for (let i = 0; i < lista.length; i += 15) {
    const lote = await Promise.all(lista.slice(i, i + 15).map((u) => lerImovel(u).catch(() => null)));
    lidos.push(...lote.filter(Boolean));
  }
  const ativos = lidos.filter((d) => d.transaction === "VENDA" && d.status === "Disponível" && d.is_published !== false);
  const { data: atuais } = await sb.from("imoveis").select("id,codigo,status,preco,campos").eq("origem", "domus");
  const porCodigo = new Map((atuais ?? []).map((x: any) => [x.codigo, x]));
  const res = { lidos: lidos.length, novos: 0, preco_mudou: 0, saiu: 0, voltou: 0, erros: [] as string[] };
  const avisos: string[] = [];

  for (const d of ativos) {
    const novo = mapear(d);
    const atual: any = porCodigo.get(novo.codigo);
    if (!atual) {
      const { error } = await sb.from("imoveis").insert({ ...novo, status: "rascunho" });
      if (error) res.erros.push(`${novo.codigo}: ${error.message}`); else res.novos++;
      continue;
    }
    porCodigo.delete(novo.codigo);
    const upd: Record<string, unknown> = { campos: { ...(atual.campos ?? {}), ...novo.campos }, atualizado_em: new Date().toISOString() };
    if (novo.preco && Number(atual.preco) !== novo.preco) {
      upd.preco = novo.preco; res.preco_mudou++;
      avisos.push(`${novo.codigo}: preço de ${Number(atual.preco).toLocaleString("pt-BR")} para ${novo.preco.toLocaleString("pt-BR")}`);
    }
    if (atual.status === "vendido" && atual.campos?.saiu_domus) { upd.status = atual.campos.status_antes ?? "rascunho"; res.voltou++; (upd.campos as any).saiu_domus = null; }
    const { error } = await sb.from("imoveis").update(upd).eq("id", atual.id);
    if (error) res.erros.push(`${novo.codigo}: ${error.message}`);
  }
  // O que sumiu do site da Domus (ou deixou de estar disponível) sai do ar aqui também
  if (!opcoes.limite) {
    for (const x of porCodigo.values() as Iterable<any>) {
      if (x.status === "vendido") continue;
      await sb.from("imoveis").update({ status: "vendido", campos: { ...(x.campos ?? {}), saiu_domus: new Date().toISOString(), status_antes: x.status }, atualizado_em: new Date().toISOString() }).eq("id", x.id);
      res.saiu++; avisos.push(`${x.codigo} saiu do site da Domus e foi tirado do ar`);
    }
  }
  if (avisos.length) {
    await sb.from("notificacoes").insert({ titulo: "Domus: mudanças nos imóveis parceiros", corpo: avisos.slice(0, 4).join(" · ") + (avisos.length > 4 ? ` e mais ${avisos.length - 4}` : ""), url: "/admin/?aba=imoveis", chave: `domus-${new Date().toISOString().slice(0, 10)}` }).then(() => {}, () => {});
  }
  await sb.from("config").upsert({ chave: "domus", valor: { ultima: new Date().toISOString(), ...res, avisos: avisos.slice(0, 30) } });
  return res;
}


// ------------------------------------------------------------------ textos com IA (mesmas regras do botão "Escrever com IA")
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
let MODELO = Deno.env.get("CLAUDE_MODEL") ?? "";
async function modelo() {
  if (MODELO) return MODELO;
  const r = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01" } });
  const ids: string[] = ((await r.json()).data ?? []).map((m: { id: string }) => m.id);
  MODELO = ids.find((i) => i.includes("sonnet")) ?? ids[0];
  return MODELO;
}
const REGRAS = `Você é a copywriter de Anderson Costa, corretor de imóveis em Jaraguá do Sul (CRECI SC 68594). Escreve os textos da página de um imóvel no site dele. O jeito dele de trabalhar se chama Método Compra Segura: fatos, honestidade sobre os pontos de atenção e foco na vida de quem vai morar.

Regras inegociáveis:
- Use somente os fatos enviados (ficha e texto de referência do parceiro). Nunca invente metragem, distância, material, vista, sol, ano, reforma, marca, escola ou vizinhança.
- Nunca cite rua, número, nome de condomínio ou edifício, nome de proprietário, de corretor ou de imobiliária. Não mencione a parceria.
- Nunca use travessão (o traço longo). Use vírgula, ponto, dois-pontos ou parênteses.
- Sem clichês: imperdível, oportunidade única, no coração de, sofisticação e conforto, mais que uma casa, um estilo de vida, sonho, maravilhoso, espetacular, Imagine. Sem exclamação. Sem emoji.
- Fatos vencem adjetivos. Português do Brasil, frases curtas, tom sereno de quem conhece o imóvel.

Campos:
- titulo: tipo + diferencial concreto + bairro, até 70 caracteres. Sem preço, sem código.
- resumo: uma frase de até 110 caracteres dizendo o que o imóvel tem de mais útil para quem vai morar.
- descricao: 2 ou 3 parágrafos curtos separados por linha em branco. Não repita preço.
- destaques: 3 a 5 itens de até 6 palavras cada, cada um um fato.
- atencao: pontos de atenção honestos que decorrem dos fatos (geminado divide parede; apartamento sem elevador; vaga descoberta). Se não houver, lista vazia. Nunca invente defeito.
- perfil_ideal: uma frase sobre para quem o imóvel faz sentido.`;
const FERRAMENTA = {
  name: "textos_imovel", description: "Devolve os textos da página do imóvel.",
  input_schema: { type: "object", required: ["titulo", "resumo", "descricao", "destaques", "atencao", "perfil_ideal"], properties: {
    titulo: { type: "string" }, resumo: { type: "string" }, descricao: { type: "string" },
    destaques: { type: "array", items: { type: "string" } }, atencao: { type: "array", items: { type: "string" } }, perfil_ideal: { type: "string" } } },
};
const limpar = (s: unknown) => String(s ?? "").replace(/[ \t]*[—–][ \t]*/g, ", ").replace(/!/g, ".").trim();
/** Escreve os textos dos imóveis da Domus que ainda não têm texto próprio (preço mínimo opcional). */
async function redigir(qtd = 6, minimo = 0) {
  let q = sb.from("imoveis").select("id,codigo,tipo,bairro,cidade,preco,area,terreno,quartos,suites,banheiros,vagas,condominio,aceita_financiamento,aceita_permuta,destaques,campos")
    .eq("origem", "domus").neq("status", "vendido").order("preco", { ascending: false }).limit(400);
  if (minimo) q = q.gte("preco", minimo);
  const { data: todos, error: erroLista } = await q;
  if (erroLista) throw new Error(erroLista.message);
  const lista = (todos ?? []).filter((x: any) => !x.campos?.textos_ia).slice(0, qtd);
  const feitos: string[] = [], falhas: string[] = [];
  await Promise.all((lista ?? []).map(async (im: any) => {
    const ficha = { tipo: im.tipo, bairro: im.bairro, cidade: im.cidade, area_m2: im.area, terreno_m2: im.terreno, quartos: im.quartos, suites: im.suites, banheiros: im.banheiros, vagas: im.vagas,
      condominio: im.condominio, financiamento: im.aceita_financiamento, permuta: im.aceita_permuta, caracteristicas: (im.destaques ?? []).join("; "), situacao: im.campos?.situacao, sol: im.campos?.sol };
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: await modelo(), max_tokens: 1500, system: REGRAS + "\n\nResponda somente chamando a ferramenta textos_imovel.", tools: [FERRAMENTA], tool_choice: { type: "auto" },
        messages: [{ role: "user", content: `Ficha:\n${JSON.stringify(ficha)}\n\nTexto de referência do parceiro (fonte dos fatos, não copie):\n${String(im.campos?.descricao_domus ?? "").slice(0, 3500)}` }] }),
    });
    const j = await r.json().catch(() => ({}));
    const t = j.content?.find((b: any) => b.type === "tool_use")?.input;
    if (!t) { falhas.push(`${im.codigo}: ${JSON.stringify(j).slice(0, 200)}`); return; }
    const { error: e2 } = await sb.from("imoveis").update({
      titulo: limpar(t.titulo).slice(0, 90), resumo: limpar(t.resumo), descricao: limpar(t.descricao),
      destaques: (t.destaques ?? []).map(limpar).filter(Boolean).slice(0, 6), atencao: (t.atencao ?? []).map(limpar).filter(Boolean),
      perfil_ideal: limpar(t.perfil_ideal), campos: { ...(im.campos ?? {}), textos_ia: new Date().toISOString() }, embedding: null, atualizado_em: new Date().toISOString(),
    }).eq("id", im.id);
    if (e2) falhas.push(`${im.codigo}: ${e2.message}`); else feitos.push(im.codigo);
  }));
  return { candidatos: lista.length, redigidos: feitos, falhas };
}

async function autorizado(req: Request, body: Record<string, any>) {
  const { data } = await sb.from("config").select("valor").eq("chave", "cron").maybeSingle();
  if (data?.valor?.token && body.token === data.valor.token) return true;
  const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!auth) return false;
  const u = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${auth}` } }, auth: { persistSession: false } });
  const { data: ok } = await u.rpc("eh_admin");
  return ok === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "https://andersoncostaimoveis.com.br", "Access-Control-Allow-Headers": "content-type, authorization, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* vazio */ }
  if (!(await autorizado(req, body))) return json({ erro: "acesso negado" }, 403);
  try {
    if (body.acao === "redigir") return json(await redigir(Number(body.qtd ?? 6), Number(body.minimo ?? 0)));
    return json(await sincronizar({ limite: body.limite }));
  }
  catch (e) { console.error(e); return json({ erro: (e as Error).message }, 200); }
});
