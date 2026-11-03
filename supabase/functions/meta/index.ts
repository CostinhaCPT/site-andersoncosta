// Estúdio: Instagram, Facebook e anúncios da Meta.
// Publica peças aprovadas, lê métricas, responde comentário com mensagem e cria anúncio sempre PAUSADO.
// Credencial: token de usuário do sistema da BM (META_SOCIAL_TOKEN), colado pelo Anderson nos segredos do Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const TOKEN = Deno.env.get("META_SOCIAL_TOKEN") ?? "";
const CONTA_ADS = (Deno.env.get("META_AD_ACCOUNT_ID") ?? "").replace(/^act_/, "");
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const VERIFY = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const G = `https://graph.facebook.com/${Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v23.0"}`;
const SITE = "https://andersoncostaimoveis.com.br";
const JARAGUA = { latitude: -26.4851, longitude: -49.0713 };

function cors(origin: string | null) {
  const ok = origin && (origin === SITE || origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1"));
  return { "Access-Control-Allow-Origin": ok ? origin! : SITE, "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
}
const json = (b: unknown, s: number, o: string | null) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors(o) } });
const normal = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ Graph API
class ErroMeta extends Error { constructor(m: string, public codigo?: number) { super(m); } }
async function graph(caminho: string, opcoes: { metodo?: string; params?: Record<string, unknown>; token?: string } = {}) {
  const token = opcoes.token ?? TOKEN;
  if (!token) throw new ErroMeta("A conta da Meta ainda não está conectada (falta o META_SOCIAL_TOKEN).");
  const metodo = opcoes.metodo ?? "GET";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(opcoes.params ?? {})) if (v !== undefined && v !== null) p.set(k, typeof v === "string" ? v : JSON.stringify(v));
  p.set("access_token", token);
  const r = metodo === "GET" ? await fetch(`${G}/${caminho}?${p}`) : await fetch(`${G}/${caminho}`, { method: metodo, body: p });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new ErroMeta(j.error?.error_user_msg || j.error?.message || `Meta respondeu ${r.status}`, j.error?.code);
  return j;
}

type Ids = { pagina: string; pagina_nome: string; pagina_token: string; ig: string; ig_usuario: string };
let cacheIds: Ids | null = null;
/** Discovers the Facebook Page and the Instagram account linked to it from the system user token. */
async function ids(): Promise<Ids> {
  if (cacheIds) return cacheIds;
  const { data } = await sb.from("cofre").select("valor").eq("chave", "meta_ids").maybeSingle();
  if (data?.valor?.ig && data.valor.pagina_token) return (cacheIds = data.valor as Ids);
  const r = await graph("me/accounts", { params: { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "50" } });
  const pag = (r.data ?? []).find((p: any) => p.instagram_business_account) ?? r.data?.[0];
  if (!pag) throw new ErroMeta("Não achei nenhuma Página do Facebook liberada para o token. Adicione a Página ao usuário do sistema na BM.");
  if (!pag.instagram_business_account) throw new ErroMeta(`A Página "${pag.name}" não tem Instagram profissional conectado.`);
  cacheIds = { pagina: pag.id, pagina_nome: pag.name, pagina_token: pag.access_token, ig: pag.instagram_business_account.id, ig_usuario: pag.instagram_business_account.username };
  await sb.from("cofre").upsert({ chave: "meta_ids", valor: cacheIds });
  return cacheIds;
}

// ------------------------------------------------------------------ publicação
async function esperarContainer(id: string, tentativas = 40) {
  for (let k = 0; k < tentativas; k++) {
    const s = await graph(id, { params: { fields: "status_code,status" } });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new ErroMeta(`A Meta não processou o arquivo: ${s.status ?? s.status_code}`);
    await dormir(3000);
  }
  throw new ErroMeta("O vídeo demorou demais para processar na Meta. Tente de novo em alguns minutos.");
}

async function publicarInstagram(c: Record<string, any>) {
  const { ig } = await ids();
  const arqs = (c.arquivos ?? []) as { url: string; tipo: string }[];
  if (!arqs.length) throw new ErroMeta("A peça não tem arquivo.");
  const legenda = String(c.legenda ?? "").slice(0, 2200);
  let container: string;
  if (c.tipo === "carrossel" && arqs.length > 1) {
    const filhos: string[] = [];
    for (const a of arqs.slice(0, 10)) {
      const f = await graph(`${ig}/media`, { metodo: "POST", params: a.tipo === "video" ? { media_type: "VIDEO", video_url: a.url, is_carousel_item: "true" } : { image_url: a.url, is_carousel_item: "true" } });
      if (a.tipo === "video") await esperarContainer(f.id);
      filhos.push(f.id);
    }
    container = (await graph(`${ig}/media`, { metodo: "POST", params: { media_type: "CAROUSEL", children: filhos.join(","), caption: legenda } })).id;
  } else if (c.tipo === "story") {
    const a = arqs[0];
    container = (await graph(`${ig}/media`, { metodo: "POST", params: a.tipo === "video" ? { media_type: "STORIES", video_url: a.url } : { media_type: "STORIES", image_url: a.url } })).id;
    if (a.tipo === "video") await esperarContainer(container);
  } else if (c.tipo === "reel" || arqs[0].tipo === "video") {
    container = (await graph(`${ig}/media`, { metodo: "POST", params: { media_type: "REELS", video_url: arqs[0].url, caption: legenda, share_to_feed: "true" } })).id;
    await esperarContainer(container);
  } else {
    container = (await graph(`${ig}/media`, { metodo: "POST", params: { image_url: arqs[0].url, caption: legenda } })).id;
  }
  const pub = await graph(`${ig}/media_publish`, { metodo: "POST", params: { creation_id: container } });
  const info = await graph(pub.id, { params: { fields: "permalink" } }).catch(() => ({}));
  return { ig_media_id: pub.id as string, ig_permalink: (info as any).permalink ?? null };
}

async function publicarFacebook(c: Record<string, any>) {
  const { pagina, pagina_token } = await ids();
  const imagens = ((c.arquivos ?? []) as { url: string; tipo: string }[]).filter((a) => a.tipo !== "video");
  if (c.tipo === "story" || !imagens.length) return null; // story e vídeo ficam só no Instagram nesta versão
  if (imagens.length === 1) return (await graph(`${pagina}/photos`, { metodo: "POST", token: pagina_token, params: { url: imagens[0].url, caption: c.legenda ?? "" } })).post_id ?? null;
  const fotos: string[] = [];
  for (const a of imagens.slice(0, 10)) fotos.push((await graph(`${pagina}/photos`, { metodo: "POST", token: pagina_token, params: { url: a.url, published: "false" } })).id);
  const p: Record<string, unknown> = { message: c.legenda ?? "" };
  fotos.forEach((id, i) => { p[`attached_media[${i}]`] = { media_fbid: id }; });
  return (await graph(`${pagina}/feed`, { metodo: "POST", token: pagina_token, params: p })).id ?? null;
}

async function publicar(id: string) {
  const { data: c } = await sb.from("criativos").select("*").eq("id", id).single();
  if (!c) throw new ErroMeta("Peça não encontrada.");
  if (!["agendado", "rascunho", "erro"].includes(c.status)) return c;
  const { data: pego } = await sb.from("criativos").update({ status: "publicando", erro: null }).eq("id", id).in("status", ["agendado", "rascunho", "erro"]).select("id");
  if (!pego?.length) return c;
  try {
    const out: Record<string, unknown> = {};
    if ((c.redes ?? []).includes("instagram")) Object.assign(out, await publicarInstagram(c));
    if ((c.redes ?? []).includes("facebook")) out.fb_post_id = await publicarFacebook(c);
    await sb.from("criativos").update({ ...out, status: "publicado", publicado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq("id", id);
    // Vídeo publicado sai do armazenamento (o plano grátis tem pouco espaço)
    const videos = (c.arquivos ?? []).filter((a: any) => a.tipo === "video" && a.caminho).map((a: any) => a.caminho);
    if (videos.length) await sb.storage.from("imoveis").remove(videos);
    await sb.from("notificacoes").insert({ titulo: "Publicado no Instagram", corpo: c.titulo ?? c.tipo, url: "/admin/?aba=estudio" }).then(() => {}, () => {});
    return { ...c, ...out, status: "publicado" };
  } catch (e) {
    const msg = (e as Error).message;
    await sb.from("criativos").update({ status: "erro", erro: msg.slice(0, 500) }).eq("id", id);
    await sb.from("notificacoes").insert({ titulo: "Falha ao publicar", corpo: msg.slice(0, 150), url: "/admin/?aba=estudio" }).then(() => {}, () => {});
    throw e;
  }
}

// ------------------------------------------------------------------ métricas
async function metricas() {
  const { ig } = await ids();
  const perfil = await graph(ig, { params: { fields: "followers_count,follows_count,media_count,username" } });
  let alcance: number | null = null;
  try {
    const r = await graph(`${ig}/insights`, { params: { metric: "reach", period: "day" } });
    alcance = r.data?.[0]?.values?.at(-1)?.value ?? null;
  } catch { /* métrica pode não estar disponível em contas pequenas */ }
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  await sb.from("perfil_metricas").upsert({ dia: hoje, dados: { ...perfil, alcance_dia: alcance } });

  // Posts feitos pelo app (com música): acha o post no Instagram pela legenda e guarda o id para medir
  const { data: soltos } = await sb.from("criativos").select("id, legenda, publicado_em").eq("status", "publicado").eq("modo", "assistido").is("ig_media_id", null)
    .gte("publicado_em", new Date(Date.now() - 20 * 864e5).toISOString()).limit(30);
  if (soltos?.length) {
    try {
      const r = await graph(`${ig}/media`, { params: { fields: "id,caption,permalink,timestamp", limit: "40" } });
      const chave = (t: unknown) => normal(t).replace(/[^a-z0-9]/g, "").slice(0, 60);
      for (const c of soltos) {
        const k = chave(c.legenda); if (k.length < 20) continue;
        const m = (r.data ?? []).find((x: any) => chave(x.caption) === k);
        if (m) await sb.from("criativos").update({ ig_media_id: m.id, ig_permalink: m.permalink, publicado_em: m.timestamp }).eq("id", c.id);
      }
    } catch (e) { console.error("ligar posts do app", e); }
  }

  const { data: pecas } = await sb.from("criativos").select("id, tipo, ig_media_id").eq("status", "publicado").not("ig_media_id", "is", null)
    .gte("publicado_em", new Date(Date.now() - 60 * 864e5).toISOString()).limit(80);
  for (const p of pecas ?? []) {
    const lista = p.tipo === "story" ? ["reach", "views", "replies", "shares"] : ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions"];
    let m: Record<string, number> = {};
    try {
      const r = await graph(`${p.ig_media_id}/insights`, { params: { metric: lista.join(",") } });
      for (const d of r.data ?? []) m[d.name] = d.values?.[0]?.value ?? d.total_value?.value ?? 0;
    } catch {
      try { const r = await graph(`${p.ig_media_id}/insights`, { params: { metric: "reach" } }); m = { reach: r.data?.[0]?.values?.[0]?.value ?? 0 }; } catch { continue; }
    }
    await sb.from("criativos").update({ metricas: m, metricas_em: new Date().toISOString() }).eq("id", p.id);
  }

  if (CONTA_ADS) {
    try {
      const r = await graph(`act_${CONTA_ADS}/insights`, { params: { level: "ad", fields: "ad_id,ad_name,spend,impressions,reach,clicks,actions", date_preset: "maximum", limit: "200" } });
      for (const a of r.data ?? []) {
        const conversas = (a.actions ?? []).find((x: any) => /messaging_conversation_started/.test(x.action_type))?.value ?? 0;
        await sb.from("anuncios").update({ metricas: { gasto: Number(a.spend), impressoes: Number(a.impressions), alcance: Number(a.reach), cliques: Number(a.clicks), conversas: Number(conversas) }, metricas_em: new Date().toISOString() }).eq("anuncio_id", a.ad_id);
      }
    } catch (e) { console.error("ads insights", e); }
  }
  return { ok: true, seguidores: perfil.followers_count };
}

// ------------------------------------------------------------------ anúncio (sempre pausado)
async function criarAnuncio(body: Record<string, any>) {
  if (!CONTA_ADS) throw new ErroMeta("Falta o META_AD_ACCOUNT_ID nos segredos do Supabase.");
  const { pagina, ig } = await ids();
  const { data: c } = await sb.from("criativos").select("*").eq("id", String(body.criativo_id ?? "")).single();
  if (!c) throw new ErroMeta("Escolha a peça do anúncio.");
  const img = (c.arquivos ?? []).find((a: any) => a.tipo !== "video");
  if (!img) throw new ErroMeta("Nesta versão o anúncio usa uma imagem. Escolha um carrossel ou post com foto.");
  const moradia = !!body.categoria_moradia;
  const raio = Math.max(moradia ? 25 : 5, Math.min(80, Number(body.raio_km) || 25));
  const idadeMin = moradia ? 18 : Math.max(18, Number(body.idade_min) || 28), idadeMax = moradia ? 65 : Math.min(65, Number(body.idade_max) || 65);
  const orc = Math.max(6, Number(body.orcamento_dia) || 20), dias = Math.max(1, Math.min(60, Number(body.dias) || 7));
  const nome = `${c.imovel_codigo ?? "Imovel"} · ${String(c.titulo ?? c.tipo).slice(0, 40)} · ${new Date().toLocaleDateString("pt-BR")}`;
  const { data: reg } = await sb.from("anuncios").insert({
    imovel_codigo: c.imovel_codigo, criativo_id: c.id, nome, orcamento_dia: orc, dias, raio_km: raio, idade_min: idadeMin, idade_max: idadeMax, texto: body.texto ?? c.legenda,
  }).select("id").single();
  try {
    const bytes = new Uint8Array(await (await fetch(img.url)).arrayBuffer());
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const up = await graph(`act_${CONTA_ADS}/adimages`, { metodo: "POST", params: { bytes: btoa(bin) } });
    const hash = (Object.values(up.images ?? {})[0] as any)?.hash;
    const camp = await graph(`act_${CONTA_ADS}/campaigns`, { metodo: "POST", params: {
      name: nome, objective: "OUTCOME_ENGAGEMENT", status: "PAUSED", special_ad_categories: moradia ? ["HOUSING"] : [],
      ...(moradia ? { special_ad_category_country: ["BR"] } : {}), is_adset_budget_sharing_enabled: "false",
    } });
    const inicio = new Date(Date.now() + 3600_000), fim = new Date(inicio.getTime() + dias * 864e5);
    const conj = await graph(`act_${CONTA_ADS}/adsets`, { metodo: "POST", params: {
      name: nome, campaign_id: camp.id, daily_budget: String(Math.round(orc * 100)), billing_event: "IMPRESSIONS",
      optimization_goal: "CONVERSATIONS", destination_type: "WHATSAPP", bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      promoted_object: { page_id: pagina }, status: "PAUSED", start_time: inicio.toISOString(), end_time: fim.toISOString(),
      targeting: { geo_locations: { custom_locations: [{ ...JARAGUA, radius: raio, distance_unit: "kilometer" }] }, age_min: idadeMin, age_max: idadeMax },
    } });
    const criativo = await graph(`act_${CONTA_ADS}/adcreatives`, { metodo: "POST", params: {
      name: nome, object_story_spec: {
        page_id: pagina, instagram_user_id: ig,
        link_data: { image_hash: hash, link: "https://api.whatsapp.com/send", message: String(body.texto ?? c.legenda ?? "").slice(0, 2000),
          call_to_action: { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } } },
      },
    } });
    const ad = await graph(`act_${CONTA_ADS}/ads`, { metodo: "POST", params: { name: nome, adset_id: conj.id, creative: { creative_id: criativo.id }, status: "PAUSED" } });
    await sb.from("anuncios").update({ campanha_id: camp.id, conjunto_id: conj.id, anuncio_id: ad.id, status: "criado_pausado" }).eq("id", reg!.id);
    return { ok: true, campanha_id: camp.id, link: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${CONTA_ADS}&selected_campaign_ids=${camp.id}` };
  } catch (e) {
    await sb.from("anuncios").update({ status: "erro", erro: (e as Error).message.slice(0, 500) }).eq("id", reg!.id);
    throw e;
  }
}

async function mudarAnuncio(body: Record<string, any>) {
  const { data: a } = await sb.from("anuncios").select("*").eq("id", String(body.id ?? "")).single();
  if (!a?.campanha_id) throw new ErroMeta("Anúncio não encontrado.");
  const status = body.ativar ? "ACTIVE" : "PAUSED";
  for (const id of [a.campanha_id, a.conjunto_id, a.anuncio_id]) await graph(id, { metodo: "POST", params: { status } });
  await sb.from("anuncios").update({ status: body.ativar ? "ativo" : "pausado" }).eq("id", a.id);
  return { ok: true };
}

// ------------------------------------------------------------------ legenda com IA
let MODELO = Deno.env.get("CLAUDE_MODEL") ?? "";
async function modelo() {
  if (MODELO) return MODELO;
  const r = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01" } });
  const idsM: string[] = ((await r.json()).data ?? []).map((m: { id: string }) => m.id);
  MODELO = idsM.find((i) => i.includes("sonnet")) ?? idsM[0];
  return MODELO;
}
const REGRAS_COPY = `Você é a copywriter de Anderson Costa, corretor de imóveis de médio e alto padrão em Jaraguá do Sul (CRECI SC 68594). O jeito dele se chama Método Compra Segura: curadoria, números e honestidade sobre cada imóvel.
Regras inegociáveis: só use os fatos enviados, nunca invente metragem, vista, sol, distância, escola, acabamento, mobília ou vizinhança. Nunca use travessão (— ou –). Sem clichês (imperdível, oportunidade única, sonho, maravilhoso, espetacular, no coração de, mais que uma casa). Fatos vencem adjetivos. Português do Brasil, frases curtas, tom próximo e seguro de quem conhece o imóvel. Não exponha endereço exato.

A legenda segue exatamente o padrão que já funciona no Instagram dele:
1. Primeira linha: "🏡✨ " + frase forte com o tipo e o bairro (ex.: "🏡✨ Casa nova no Jaraguá 99, feita para viver bem de verdade").
2. Linha em branco e 1 ou 2 parágrafos curtos sobre para quem o imóvel serve e a proposta do projeto.
3. Lista com um emoji no começo de cada linha, um fato por linha, sem ponto final: 🛏️ suítes e dormitórios, 💼 escritório, 🛋️ sala e integração, 🍽️ cozinha, 🔥 churrasqueira ou área de festas, 🏊 piscina, 🚗 vagas, 🌞 iluminação, ✔️ itens inclusos. Use só o que estiver nos fatos.
4. Uma frase de transição ("E nos fundos, um dos grandes diferenciais:" ou parecida) e o diferencial com 🌿 ou 💎.
5. "📍 Localização:" com o bairro e a cidade (distância só se estiver nos fatos).
6. Uma frase de fechamento sobre o que o imóvel entrega.
7. "📲 Me chama no direct ou WhatsApp e eu te apresento todos os detalhes."
8. "Anderson Costa · CRECI SC 68594"
9. Linha em branco e 5 hashtags em minúsculas, uma por linha: #bairro (sem espaço e sem acento), #jaraguadosul, #imoveisjaraguadosul e 2 ligadas ao tipo (ex.: #casaterrea, #casanova, #altopadrao).
Se houver palavra-chave para comentar, troque a linha 7 por "💬 Comente PALAVRA que eu te mando os detalhes no direct."`;
async function gerarTextos(body: Record<string, any>) {
  const { data: im } = await sb.from("imoveis").select("codigo,titulo,resumo,descricao,destaques,atencao,tipo,bairro,cidade,preco,preco_visivel,area,terreno,quartos,suites,banheiros,vagas,perfil_ideal,slug").eq("codigo", String(body.imovel ?? "")).maybeSingle();
  if (!im) throw new ErroMeta("Imóvel não encontrado.");
  const ferramenta = {
    name: "textos_post", description: "Textos da peça no padrão do Instagram do Anderson.",
    input_schema: { type: "object", required: ["rotulo", "ambientes", "localizacao", "legenda"], properties: {
      rotulo: { type: "string", description: "Destaque curto que vai acima do bairro na capa, até 28 caracteres, o maior trunfo do imóvel com número quando houver. Ex.: Mais de 1200 m² de terreno, Casa mobiliada, Casa térrea nova, Vista para a cidade (só se estiver nos fatos)." },
      ambientes: { type: "string", description: "Linha 'Ambientes' da capa: 2 frases curtas, até 22 palavras no total, sobre os ambientes e para quem a casa serve. Ex.: Casa ampla com excelente padrão construtivo e espaço externo para ampliação. Perfeita para famílias que buscam conforto e qualidade." },
      localizacao: { type: "string", description: "Linha 'Localização' da capa: 1 frase de até 24 palavras começando com 'Situada'. Distâncias e pontos de referência só se estiverem nos fatos ou nas notas; se não houver, fale do bairro e da cidade sem números." },
      legenda: { type: "string", description: "Legenda completa seguindo o padrão das regras." },
      palavra_chave: { type: "string", description: "Opcional: uma palavra em maiúsculas para o comentário virar mensagem automática (ex.: o nome do bairro sem espaço). Deixe vazio se não fizer sentido." },
      resposta_dm: { type: "string", description: "Mensagem automática para quem comentar: curta, cordial, com o link do imóvel." },
    } },
  };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: await modelo(), max_tokens: 1800, system: REGRAS_COPY, tools: [ferramenta], tool_choice: { type: "tool", name: "textos_post" },
      messages: [{ role: "user", content: `Peça: ${body.tipo ?? "carrossel"}. Objetivo: ${body.objetivo ?? "gerar conversas no direct e no WhatsApp com compradores qualificados"}.\nLink do imóvel: ${SITE}/imovel/${im.slug}/\nFatos:\n${JSON.stringify({ ...im, preco: im.preco_visivel ? im.preco : "sob consulta" })}\n${body.notas ? `Notas do Anderson: ${body.notas}` : ""}` }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new ErroMeta("Falha na IA de textos.");
  const t = j.content?.find((b: any) => b.type === "tool_use")?.input ?? {};
  const limpa = (s: unknown) => String(s ?? "").replace(/[ \t]*[—–][ \t]*/g, ", ").trim();
  return { rotulo: limpa(t.rotulo), ambientes: limpa(t.ambientes), localizacao: limpa(t.localizacao), legenda: limpa(t.legenda), palavra_chave: limpa(t.palavra_chave).toUpperCase().replace(/[^A-Z0-9À-Ú]/g, "").slice(0, 20), resposta_dm: limpa(t.resposta_dm) };
}

// ------------------------------------------------------------------ comentário vira mensagem
async function assinaturaValida(bruto: string, cab: string | null) {
  if (!APP_SECRET || !cab?.startsWith("sha256=")) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hex = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(bruto)))).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === cab.slice(7).toLowerCase();
}
async function comentario(v: Record<string, any>) {
  const mediaId = v.media?.id, texto = String(v.text ?? ""), cid = String(v.id ?? "");
  if (!mediaId || !cid) return;
  const { ig, ig_usuario } = await ids();
  if (v.from?.id === ig || v.from?.username === ig_usuario) return; // o próprio Anderson comentando
  const { data: c } = await sb.from("criativos").select("id, palavra_chave, resposta_dm").eq("ig_media_id", mediaId).maybeSingle();
  if (!c?.palavra_chave || !normal(texto).includes(normal(c.palavra_chave))) return;
  const { error } = await sb.from("comentarios_dm").insert({ comentario_id: cid, criativo_id: c.id, ig_usuario: v.from?.username ?? null, texto: texto.slice(0, 500) });
  if (error) return; // já respondido
  const msg = c.resposta_dm || "Oi! Aqui é a assistente virtual do Anderson Costa. Te mandei as informações. Se quiser, me conta o que você procura que eu separo uma curadoria.";
  try {
    try { await graph(`${ig}/messages`, { metodo: "POST", params: { recipient: { comment_id: cid }, message: { text: msg } } }); }
    catch { const { pagina, pagina_token } = await ids(); await graph(`${pagina}/messages`, { metodo: "POST", token: pagina_token, params: { recipient: { comment_id: cid }, message: { text: msg } } }); }
    await graph(`${cid}/replies`, { metodo: "POST", params: { message: "Te mandei no Direct." } }).catch(() => {});
    await sb.from("comentarios_dm").update({ respondido: true }).eq("comentario_id", cid);
    await sb.from("notificacoes").insert({ titulo: `Comentário virou conversa: @${v.from?.username ?? "alguém"}`, corpo: texto.slice(0, 120), url: "/admin/?aba=estudio" }).then(() => {}, () => {});
  } catch (e) { await sb.from("comentarios_dm").update({ erro: (e as Error).message.slice(0, 300) }).eq("comentario_id", cid); }
}

// ------------------------------------------------------------------ servidor
async function papel(req: Request, body: Record<string, any>) {
  if (body.acao === "publicar_agendados" || body.acao === "metricas") {
    const { data } = await sb.from("config").select("valor").eq("chave", "cron").maybeSingle();
    if (data?.valor?.token && body.token === data.valor.token) return "cron";
  }
  const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!auth) return null;
  const u = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${auth}` } }, auth: { persistSession: false } });
  const { data } = await u.rpc("eh_admin");
  return data === true ? "admin" : null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.has("hub.mode")) {
    const ok = VERIFY && url.searchParams.get("hub.verify_token") === VERIFY;
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("negado", { status: 403 });
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405, origin);
  const bruto = await req.text();
  // Webhook do Instagram (comentários)
  if (req.headers.get("x-hub-signature-256")) {
    if (!(await assinaturaValida(bruto, req.headers.get("x-hub-signature-256")))) return new Response("assinatura inválida", { status: 401 });
    const p = JSON.parse(bruto);
    const job = (async () => { for (const e of p.entry ?? []) for (const ch of e.changes ?? []) if (ch.field === "comments") await comentario(ch.value ?? {}).catch((x) => console.error("comentario", x)); })();
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime; if (rt?.waitUntil) rt.waitUntil(job); else await job;
    return new Response("ok");
  }
  let body: Record<string, any>;
  try { body = JSON.parse(bruto || "{}"); } catch { return json({ erro: "json inválido" }, 400, origin); }
  const quem = await papel(req, body);
  if (!quem) return json({ erro: "acesso negado" }, 403, origin);
  try {
    if (body.acao === "publicar_agendados") {
      const { data } = await sb.from("criativos").select("id, modo, tipo, imovel_codigo, titulo").eq("status", "agendado").lte("agendado_para", new Date().toISOString()).order("agendado_para").limit(5);
      const res = [];
      for (const c of data ?? []) {
        if (c.modo === "assistido") {
          // Com música: a Meta não deixa programa de fora pôr música da biblioteca. Avisa o Anderson para postar pelo app.
          const { data: pego } = await sb.from("criativos").update({ status: "aguardando", atualizado_em: new Date().toISOString() }).eq("id", c.id).eq("status", "agendado").select("id");
          if (pego?.length) await sb.from("notificacoes").insert({ titulo: `Hora de postar ${c.imovel_codigo ?? ""}`.trim(), corpo: `${c.titulo ?? c.tipo}: toque para salvar, copiar a legenda e escolher a música.`, url: `/admin/?aba=estudio&postar=${c.id}`, chave: `postar-${c.id}` }).then(() => {}, () => {});
          res.push({ id: c.id, aviso: true });
          continue;
        }
        try { await publicar(c.id); res.push({ id: c.id, ok: true }); } catch (e) { res.push({ id: c.id, erro: (e as Error).message }); }
      }
      return json({ publicados: res }, 200, origin);
    }
    if (body.acao === "metricas") return json(await metricas(), 200, origin);
    if (quem !== "admin") return json({ erro: "acesso negado" }, 403, origin);
    if (body.acao === "status") {
      if (!TOKEN) return json({ conectado: false, motivo: "Falta conectar a conta da Meta." }, 200, origin);
      try { const i = await ids(); return json({ conectado: true, pagina: i.pagina_nome, instagram: i.ig_usuario, anuncios: !!CONTA_ADS }, 200, origin); }
      catch (e) { return json({ conectado: false, motivo: (e as Error).message }, 200, origin); }
    }
    if (body.acao === "reconectar") { await sb.from("cofre").delete().eq("chave", "meta_ids"); cacheIds = null; return json(await ids().then((i) => ({ ok: true, instagram: i.ig_usuario })), 200, origin); }
    if (body.acao === "publicar") return json({ ok: true, criativo: await publicar(String(body.id)) }, 200, origin);
    if (body.acao === "textos") return json(await gerarTextos(body), 200, origin);
    if (body.acao === "anuncio") return json(await criarAnuncio(body), 200, origin);
    if (body.acao === "anuncio_status") return json(await mudarAnuncio(body), 200, origin);
    return json({ erro: "ação desconhecida" }, 400, origin);
  } catch (e) {
    console.error(e);
    return json({ erro: (e as Error).message }, 200, origin);
  }
});
