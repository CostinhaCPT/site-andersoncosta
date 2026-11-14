// Cérebro do atendimento do site andersoncostaimoveis.com.br
// Recebe a mensagem do chat, conversa com o Claude usando ferramentas
// (busca híbrida de imóveis e conhecimento, registro do lead e passagem
// para o Anderson) e devolve as respostas para o widget.
import { createClient } from "npm:@supabase/supabase-js@2";
import { PROMPT } from "./prompt.ts";
import {
  AGENDA_PADRAO, type Agenda, dentroDoHorario, enviarEmail, type Faixa, gerarHorarios, livre, lerIcal, montarIcs,
  ocupadosDoIcal, type Opcao, remetente, rotuloCompleto, sugerirTres, verificarPreferencia,
} from "./agenda.ts";
import {
  base64ParaBytes, bytesParaBase64, guardarAnexo, limparAnexos, MAX_AUDIO_BYTES, MAX_IMAGEM_BYTES, sintetizar, transcrever,
} from "./midia.ts";
import {
  assinaturaValida, baixarMidia, enviarAudio, enviarHorarios, enviarTexto, foneCanonico, gerirTemplates, marcarLida, pediuParaParar, VERIFY_TOKEN,
} from "./whatsapp.ts";
import { tick as followupTick } from "./followup.ts";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OPENAI = Deno.env.get("OPENAI_API_KEY") ?? "";
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const META_TOKEN = Deno.env.get("META_CAPI_TOKEN") ?? "";
const META_TESTE = Deno.env.get("META_TEST_CODE") ?? "";
const META_PIXEL = Deno.env.get("META_PIXEL_ID") ?? "1625123092241726";
const EMAIL_ALERTA = "anderson@paixaocosta.com";
const WHATS = "5547989133845";
const SITE = "https://andersoncostaimoveis.com.br";

const LIMITE_IP_HORA = 40; // mensagens por IP por hora
const LIMITE_CONVERSA = 60; // mensagens da pessoa por conversa
const MAX_CHARS = 1200;

// ---------------------------------------------------------------- utilidades
function cors(origin: string | null) {
  const ok = origin && (
    origin === SITE || origin === "https://www.andersoncostaimoveis.com.br" ||
    origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")
  );
  return {
    "Access-Control-Allow-Origin": ok ? origin! : SITE,
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

async function sha(texto: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto + "ac-sal-2026"));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

const brl = (v: number | null) =>
  v == null ? "sob consulta" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function agoraBR() {
  return new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// --------------------------------------------------------------- IA externa
let MODELO = Deno.env.get("CLAUDE_MODEL") ?? "";
async function modelo() {
  if (MODELO) return MODELO;
  const r = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01" },
  });
  const j = await r.json();
  if (!r.ok) throw new Error("anthropic_models: " + JSON.stringify(j).slice(0, 300));
  const ids: string[] = (j.data ?? []).map((m: { id: string }) => m.id);
  MODELO = ids.find((i) => i.includes("sonnet")) ?? ids[0];
  return MODELO;
}

async function claude(system: string, messages: unknown[], semFerramentas = false) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json",
    },
    body: JSON.stringify({
      model: await modelo(), max_tokens: 1024,
      system: [{ type: "text", text: system }], tools: FERRAMENTAS, messages,
      ...(semFerramentas ? { tool_choice: { type: "none" } } : {}),
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("anthropic: " + JSON.stringify(j).slice(0, 400));
  return j;
}

async function embed(textos: string[]): Promise<number[][]> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: textos }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("openai: " + JSON.stringify(j).slice(0, 300));
  return j.data.map((d: { embedding: number[] }) => d.embedding);
}


// ------------------------------------------------------------ configuração
type ConfigChat = { ativo: boolean; pedir_contato: boolean; saudacao: string; instrucoes_extras: string };
const CHAT_PADRAO: ConfigChat = { ativo: true, pedir_contato: true, saudacao: "", instrucoes_extras: "" };
let cacheConfig: { quando: number; chat: ConfigChat; agenda: Agenda } | null = null;
async function config() {
  if (cacheConfig && Date.now() - cacheConfig.quando < 60_000) return cacheConfig;
  const { data } = await sb.from("config").select("chave, valor").in("chave", ["chat", "agenda"]);
  const m = Object.fromEntries((data ?? []).map((r) => [r.chave, r.valor]));
  cacheConfig = { quando: Date.now(), chat: { ...CHAT_PADRAO, ...(m.chat ?? {}) }, agenda: { ...AGENDA_PADRAO, ...(m.agenda ?? {}) } };
  return cacheConfig;
}

async function ocupados(a: Agenda): Promise<Faixa[]> {
  const de = Date.now(), ate = de + (a.janela_dias + 2) * 86400_000;
  const [{ data: vs }, ical] = await Promise.all([
    sb.from("visitas").select("inicio, fim").in("status", ["confirmada", "solicitada"])
      .gte("fim", new Date(de).toISOString()).lte("inicio", new Date(ate).toISOString()),
    lerIcal(a.ical_url),
  ]);
  const lista: Faixa[] = (vs ?? []).map((v) => ({ ini: Date.parse(v.inicio), fim: Date.parse(v.fim) }));
  if (ical) { try { lista.push(...ocupadosDoIcal(ical, de, ate)); } catch (e) { console.error("ical parse", e); } }
  return lista;
}

async function imovelDaVisita(codigo?: string | null) {
  if (!codigo) return null;
  const { data } = await sb.from("imoveis").select("codigo, titulo, bairro, cidade, slug, visita_exige_proprietario, status")
    .eq("codigo", String(codigo).toUpperCase()).maybeSingle();
  return data;
}

/** Other visits in the same neighbourhood, so options can cluster and save driving. */
async function visitasVizinhas(bairro?: string | null): Promise<Faixa[]> {
  if (!bairro) return [];
  const { data: vs } = await sb.from("visitas").select("inicio, fim, imovel_codigo").in("status", ["confirmada", "solicitada"])
    .gte("inicio", new Date().toISOString()).not("imovel_codigo", "is", null);
  const cods = [...new Set((vs ?? []).map((v) => v.imovel_codigo))];
  if (!cods.length) return [];
  const { data: ims } = await sb.from("imoveis").select("codigo, bairro").in("codigo", cods);
  const mesmo = new Set((ims ?? []).filter((i) => i.bairro === bairro).map((i) => i.codigo));
  return (vs ?? []).filter((v) => mesmo.has(v.imovel_codigo)).map((v) => ({ ini: Date.parse(v.inicio), fim: Date.parse(v.fim) }));
}

const foneBR = (w: string) => String(w || "").replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");

async function agendarVisita(body: Record<string, any>) {
  const { agenda: a } = await config();
  const conversaId = String(body.conversa_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(conversaId)) return { erro: "conversa inválida", status: 400 };
  const ini = Date.parse(String(body.inicio ?? ""));
  if (!Number.isFinite(ini) || ini < Date.now() + 3600_000 || ini > Date.now() + 90 * 86400_000) {
    return { erro: "Escolha um horário a partir de daqui a uma hora e dentro dos próximos 90 dias.", status: 400 };
  }
  const { data: conv } = await sb.from("conversas").select("id, lead_id, contexto").eq("id", conversaId).maybeSingle();
  if (!conv) return { erro: "conversa não encontrada", status: 404 };

  let leadId = conv.lead_id as string | null;
  const nome = String(body.nome ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const fone = String(body.whatsapp ?? "").replace(/\D/g, "");
  if (!leadId) {
    if (nome.length < 2 || fone.length < 10 || fone.length > 13) return { erro: "precisa_contato", status: 400 };
    const { data: l, error } = await sb.from("leads").insert({
      nome, whatsapp: fone.length <= 11 ? "55" + fone : fone, etapa: "em_conversa",
      origem: { ...(conv.contexto?.utm ?? {}), pagina: conv.contexto?.pagina ?? "", canal: "chat do site" },
    }).select("id").single();
    if (error) throw error;
    leadId = l.id;
    await sb.from("conversas").update({ lead_id: leadId }).eq("id", conversaId);
  }
  const { count } = await sb.from("visitas").select("id", { count: "exact", head: true })
    .eq("conversa_id", conversaId).in("status", ["solicitada", "confirmada"]);
  if ((count ?? 0) >= 3) return { erro: "Você já tem visitas pedidas nesta conversa. O Anderson te chama para ajustar.", status: 429 };

  const codigo = String(body.imovel ?? conv.contexto?.imovel ?? "").slice(0, 20) || null;
  const imovel = await imovelDaVisita(codigo);
  const fim = ini + a.duracao_min * 60_000;
  const noHorario = dentroDoHorario(a, ini);
  const vago = livre(a, ini, await ocupados(a));
  const motivos: string[] = [];
  if (!noHorario) motivos.push("fora do horário comercial");
  if (noHorario && !vago) motivos.push("horário já ocupado na agenda");
  if (imovel?.visita_exige_proprietario) motivos.push("precisa combinar com o proprietário");
  const status = motivos.length ? "solicitada" : "confirmada";
  const obs = String(body.observacao ?? "").trim().slice(0, 500) || null;

  const { data: v, error } = await sb.from("visitas").insert({
    lead_id: leadId, conversa_id: conversaId, imovel_codigo: imovel?.codigo ?? codigo, inicio: new Date(ini).toISOString(),
    fim: new Date(fim).toISOString(), status, fora_horario: !noHorario, motivo_validacao: motivos.join("; ") || null,
    origem: "chat", observacoes: obs, ...(status === "confirmada" ? { confirmada_em: new Date().toISOString() } : {}),
  }).select("id").single();
  if (error) throw error;

  const { data: lead } = await sb.from("leads").select("nome, whatsapp, email, etapa").eq("id", leadId).single();
  const etapasAntes = ["novo", "em_conversa", "qualificado", "curadoria_enviada"];
  if (lead && etapasAntes.includes(lead.etapa ?? "novo")) {
    await sb.from("leads").update({ etapa: "visita_agendada", atualizado_em: new Date().toISOString() }).eq("id", leadId);
  }

  const quando = rotuloCompleto(ini);
  const qual = imovel ? `${imovel.titulo} (${imovel.codigo})` : "imóvel a definir";
  const texto = status === "confirmada"
    ? `Visita confirmada: ${quando}, ${qual}. O Anderson te manda o endereço pelo WhatsApp e lembra um dia antes.`
    : `Pedido de visita registrado para ${quando}, ${qual}. Como ${motivos[0]}, o Anderson confirma com você pelo WhatsApp.`;
  await sb.from("mensagens").insert({ conversa_id: conversaId, papel: "assistente", conteudo: texto, meta: { visita: v.id } });

  // E-mail ao Anderson (sempre) e convite ao lead quando houver remetente verificado
  const ref = conversaId.slice(0, 6).toUpperCase();
  const msgLead = status === "confirmada"
    ? `Oi, ${(lead?.nome ?? "").split(" ")[0]}! Aqui é o Anderson Costa. Sua visita está confirmada para ${quando}${imovel ? `, no imóvel ${imovel.codigo}` : ""}. Te mando o endereço por aqui. Qualquer imprevisto, me avise.`
    : `Oi, ${(lead?.nome ?? "").split(" ")[0]}! Aqui é o Anderson Costa. Recebi seu pedido de visita para ${quando}${imovel ? ` no imóvel ${imovel.codigo}` : ""}. Posso confirmar esse horário ou prefere outro?`;
  const zap = lead?.whatsapp ? `https://wa.me/${lead.whatsapp}?text=${encodeURIComponent(msgLead)}` : "";
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px">
<h2 style="margin:0 0 6px">${status === "confirmada" ? "Visita confirmada" : "Pedido de visita para você validar"}</h2>
<p style="margin:0 0 14px;color:#666">${esc(quando)} · ${esc(qual)} · atendimento ${ref}</p>
${motivos.length ? `<p style="background:#fff3d6;padding:10px;border-radius:6px">Precisa da sua validação: ${esc(motivos.join(", "))}.</p>` : ""}
<p><b>${esc(lead?.nome ?? "Lead")}</b> · ${esc(foneBR(lead?.whatsapp ?? ""))}${lead?.email ? " · " + esc(lead.email) : ""}</p>
${obs ? `<p>Observação: ${esc(obs)}</p>` : ""}
${zap ? `<p><a href="${zap}" style="display:inline-block;background:#25d366;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:bold">${status === "confirmada" ? "Mandar confirmação no WhatsApp" : "Responder no WhatsApp"}</a></p>` : ""}
<p><a href="${SITE}/admin/">Abrir a agenda no admin</a></p></div>`;
  const ics = status === "confirmada" ? montarIcs({
    uid: `visita-${v.id}@andersoncostaimoveis.com.br`, ini, fim,
    titulo: `Visita ${imovel?.codigo ?? ""} · ${lead?.nome ?? "lead do site"}`.trim(),
    descricao: `${qual}\nLead: ${lead?.nome ?? ""} ${foneBR(lead?.whatsapp ?? "")}\n${obs ?? ""}`,
    local: imovel ? `${imovel.bairro ?? ""}, ${imovel.cidade ?? ""}` : undefined,
    organizador: a.remetente || a.email_avisos, convidados: [{ email: a.email_avisos, nome: "Anderson Costa" }],
  }) : undefined;
  await enviarEmail({
    de: remetente(a), para: [a.email_avisos], assunto: `${status === "confirmada" ? "Visita" : "Validar visita"} · ${quando} · ${lead?.nome ?? ""}`,
    html, ics, responder: lead?.email ?? undefined,
  });
  if (a.remetente && lead?.email && status === "confirmada") {
    await enviarEmail({
      de: remetente(a), para: [lead.email], assunto: `Visita confirmada · ${quando}`, responder: a.email_avisos,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:560px"><p>Oi, ${esc((lead.nome ?? "").split(" ")[0])}.</p><p>Sua visita com o Anderson Costa está confirmada para <b>${esc(quando)}</b>${imovel ? `, no imóvel ${esc(imovel.titulo)}` : ""}.</p><p>O endereço chega pelo WhatsApp. O convite em anexo coloca a visita na sua agenda.</p><p>Anderson Costa · CRECI SC 68594<br>(47) 98913-3845</p></div>`,
      ics: montarIcs({
        uid: `visita-${v.id}@andersoncostaimoveis.com.br`, ini, fim, titulo: `Visita com Anderson Costa${imovel ? ` · ${imovel.codigo}` : ""}`,
        descricao: `${qual}\nAnderson Costa, CRECI SC 68594, (47) 98913-3845`, local: imovel ? `${imovel.bairro ?? ""}, ${imovel.cidade ?? ""}` : undefined,
        organizador: a.remetente, convidados: [{ email: lead.email, nome: lead.nome }],
      }),
    });
  }
  const zapAnderson = `https://wa.me/${WHATS}?text=${encodeURIComponent(`Oi, Anderson! ${status === "confirmada" ? "Agendei" : "Pedi"} uma visita pelo site para ${quando}${imovel ? `, imóvel ${imovel.codigo}` : ""}.\n\nCódigo do atendimento: ${ref}`)}`;
  return { status, visita_id: v.id, inicio: new Date(ini).toISOString(), quando, texto, whatsapp_url: zapAnderson };
}

// -------------------------------------------------------------- landing pages
const TIPOS_EVENTO_LP = ["abriu", "viu_imovel", "reagiu", "clique", "lead"];
async function eventoLp(body: Record<string, any>, req: Request) {
  const slug = String(body.slug ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
  const tipo = String(body.tipo ?? "");
  if (!slug || !TIPOS_EVENTO_LP.includes(tipo)) return { erro: "inválido", status: 400 };
  const { data: lp } = await sb.from("lps").select("id, slug, tipo, nome, lead_id").eq("slug", slug).eq("status", "publicada").maybeSingle();
  if (!lp) return { erro: "página não encontrada", status: 404 };
  const sessao = String(body.sessao ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 40) || null;
  const ipHash = await sha((req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconhecido");
  const { count } = await sb.from("lp_eventos").select("id", { count: "exact", head: true })
    .eq("dados->>ip", ipHash).gte("criado_em", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= 60) return { ok: true };
  const bruto = (body.dados ?? {}) as Record<string, unknown>;
  const dados: Record<string, unknown> = { ip: ipHash, utm: body.utm && typeof body.utm === "object" ? body.utm : undefined };
  for (const k of ["codigo", "titulo", "reacao", "motivo", "onde", "variante", "ref"]) {
    if (bruto[k] != null) dados[k] = String(bruto[k]).slice(0, 200);
  }
  const { agenda: a } = await config();
  let leadId: string | null = lp.lead_id;

  if (tipo === "lead") {
    const nome = String(bruto.nome ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const fone = String(bruto.whatsapp ?? "").replace(/\D/g, "");
    if (nome.length < 2 || fone.length < 10 || fone.length > 13) return { erro: "dados inválidos", status: 400 };
    const { count: leads } = await sb.from("lp_eventos").select("id", { count: "exact", head: true })
      .eq("tipo", "lead").eq("dados->>ip", ipHash).gte("criado_em", new Date(Date.now() - 3600_000).toISOString());
    if ((leads ?? 0) >= 5) return { erro: "muitas tentativas", status: 429 };
    const whatsapp = fone.length <= 11 ? "55" + fone : fone;
    const { data: novo, error } = await sb.from("leads").insert({
      nome, whatsapp, etapa: "novo", canal: "Landing page",
      origem: { ...((body.utm as Record<string, unknown>) ?? {}), pagina: `/lp/${slug}/`, lp: lp.nome, canal: "landing page" },
    }).select("id").single();
    if (error) throw error;
    leadId = novo.id;
    const primeiro = nome.split(" ")[0];
    const zap = `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Oi, ${primeiro}! Aqui é o Anderson Costa. Vi que você deixou seu contato na página. Posso te ajudar?`)}`;
    await enviarEmail({
      de: remetente(a), para: [a.email_avisos], assunto: `Lead da landing page · ${nome} · ${lp.nome}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><h2 style="margin:0 0 6px">Novo lead: ${esc(nome)}</h2><p style="color:#666;margin:0 0 14px">Página: ${esc(lp.nome)} · ${esc(foneBR(whatsapp))}</p><p><a href="${zap}" style="display:inline-block;background:#25d366;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:bold">Chamar no WhatsApp</a></p><p><a href="${SITE}/admin/">Abrir o pipeline</a></p></div>`,
    });
  }

  await sb.from("lp_eventos").insert({ lp_id: lp.id, lead_id: leadId, tipo, dados, sessao });

  if (lp.tipo === "curadoria" && lp.lead_id && tipo !== "lead") {
    const { data: lead } = await sb.from("leads").select("id, nome, whatsapp, imoveis_interesse, notas").eq("id", lp.lead_id).single();
    const upd: Record<string, unknown> = { ultima_atividade: new Date().toISOString() };
    const primeiro = String(lead?.nome ?? "").split(" ")[0];
    const zapLead = (t: string) => lead?.whatsapp ? `https://wa.me/${lead.whatsapp}?text=${encodeURIComponent(t)}` : "";
    const botao = (url: string, t: string) => url ? `<p><a href="${url}" style="display:inline-block;background:#25d366;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:bold">${t}</a></p>` : "";
    if (tipo === "abriu") {
      const { count: antes } = await sb.from("lp_eventos").select("id", { count: "exact", head: true })
        .eq("lp_id", lp.id).eq("tipo", "abriu").gte("criado_em", new Date(Date.now() - 12 * 3600_000).toISOString());
      if ((antes ?? 0) <= 1) {
        await enviarEmail({
          de: remetente(a), para: [a.email_avisos], assunto: `${lead?.nome ?? "Lead"} abriu a curadoria agora`,
          html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><h2 style="margin:0 0 6px">${esc(lead?.nome ?? "")} está vendo a curadoria</h2><p style="color:#666">É um bom momento para mandar uma mensagem.</p>${botao(zapLead(`Oi, ${primeiro}! Viu os imóveis que separei? Qual chamou mais sua atenção?`), "Chamar no WhatsApp")}</div>`,
        });
      }
    }
    if (tipo === "reagiu" && dados.reacao === "visitar") {
      if (dados.codigo) upd.imoveis_interesse = [...new Set([...(lead?.imoveis_interesse ?? []), String(dados.codigo)])];
      await enviarEmail({
        de: remetente(a), para: [a.email_avisos], assunto: `${lead?.nome ?? "Lead"} quer visitar ${dados.codigo ?? dados.titulo ?? ""}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><h2 style="margin:0 0 6px">Pedido de visita pela curadoria</h2><p>${esc(lead?.nome ?? "")} marcou "quero visitar" em <b>${esc(dados.titulo ?? dados.codigo ?? "")}</b>.</p>${botao(zapLead(`Oi, ${primeiro}! Vi que você quer visitar ${dados.codigo ?? "o imóvel"}. Qual dia e horário ficam bons para você?`), "Combinar no WhatsApp")}</div>`,
      });
    }
    if (tipo === "reagiu" && dados.reacao === "nao") {
      const linha = `Curadoria ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}: não gostou de ${dados.codigo ?? dados.titulo ?? "um imóvel"}${dados.motivo ? ` (${dados.motivo})` : ""}.`;
      upd.notas = [lead?.notas, linha].filter(Boolean).join("\n");
    }
    await sb.from("leads").update(upd).eq("id", lp.lead_id);
  }
  return { ok: true };
}

// ---------------------------------------------------------------- ferramentas
const FERRAMENTAS = [
  {
    name: "buscar_imoveis",
    description: "Busca imóveis disponíveis no catálogo do Anderson por descrição livre e filtros opcionais. Retorna no máximo 6 imóveis.",
    input_schema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "O que a pessoa procura, em linguagem natural (ex.: casa térrea com quintal perto do Centro)" },
        cidade: { type: "string" },
        bairros: { type: "array", items: { type: "string" } },
        tipos: { type: "array", items: { type: "string", enum: ["casa", "casa-geminada", "apartamento", "terreno"] } },
        preco_min: { type: "number" },
        preco_max: { type: "number" },
        quartos_min: { type: "integer" },
      },
      required: ["consulta"],
    },
  },
  {
    name: "buscar_conhecimento",
    description: "Consulta a base de conhecimento do Anderson: método, financiamento, FGTS, documentos, permuta, bairros, regiões e sobre o Anderson.",
    input_schema: { type: "object", properties: { pergunta: { type: "string" } }, required: ["pergunta"] },
  },
  {
    name: "registrar_lead",
    description: "Salva ou atualiza o que já se sabe da pessoa. Chame sempre que aprender algo novo. Envie só os campos novos.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" }, whatsapp: { type: "string" }, email: { type: "string" },
        objetivo: { type: "string", description: "morar, investir, vender ou alugar" },
        regioes: { type: "array", items: { type: "string" } },
        perfil: { type: "string", description: "quem vai morar, quartos, o que não pode faltar" },
        prazo: { type: "string" }, motivacao: { type: "string" },
        faixa_investimento: { type: "string" },
        pagamento: { type: "string", description: "financiamento, FGTS, à vista, permuta" },
        tem_imovel_para_vender: { type: "boolean" },
        decisores: { type: "string" }, outro_corretor: { type: "string" },
        imoveis_interesse: { type: "array", items: { type: "string" }, description: "códigos AC-0000" },
        prazo_compra: { type: "string", enum: ["ate_3m", "3_6m", "6_12m", "mais_12m", "pesquisando"], description: "Para quando pretende comprar" },
        credito: { type: "string", enum: ["aprovado", "a_vista", "fgts_entrada", "vai_financiar", "nao_sabe"], description: "Situação do dinheiro: crédito já aprovado no banco, compra à vista, FGTS mais entrada definida, vai financiar sem simulação, não sabe" },
        faixa_max: { type: "number", description: "Valor máximo que a pessoa considera, em reais" },
        depende_venda: { type: "boolean", description: "true se a compra depende de vender o imóvel atual" },
        decisores_alinhados: { type: "boolean", description: "true se quem decide junto já está alinhado" },
        motivacao_forte: { type: "boolean", description: "true se há um motivo concreto com data (casamento, filho, transferência, fim do aluguel)" },
        nao_contatar: { type: "boolean", description: "true se a pessoa pediu para não receber mensagens" },
      },
    },
  },
  {
    name: "passar_para_anderson",
    description: "Passa a conversa para o Anderson: envia o resumo por e-mail para ele e mostra à pessoa o botão de WhatsApp com a mensagem pronta.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "conversa marcada, visita, negociação, vendedor, investidor, pediu para falar com ele, lead qualificado, irritação ou outro" },
        resumo: { type: "string", description: "Resumo para o Anderson: nome, tipo de lead, objetivo, região, quem vai morar, prazo e motivação nas palavras da pessoa, faixa, pagamento, imóveis de interesse, objeções, formato e horário de conversa combinados, pontuação e a primeira frase sugerida para ele abrir a conversa" },
        mensagem_whatsapp: { type: "string", description: "Mensagem em primeira pessoa, como se fosse a própria pessoa escrevendo ao Anderson, até 4 linhas" },
        pontuacao: { type: "string", enum: ["A", "B", "C", "D"] },
      },
      required: ["motivo", "resumo", "mensagem_whatsapp"],
    },
  },
];

type Ctx = {
  canal: "site" | "whatsapp";
  conversaId: string;
  leadId: string | null;
  handoff: { whatsapp_url: string } | null;
  agenda: { imovel: string | null; titulo: string | null; exige_validacao: boolean; opcoes: Opcao[]; modo: string; situacao?: string } | null;
  /** Test run: no alert to Anderson, nothing sent to anyone. */
  simulacao?: boolean;
};

async function buscarImoveis(i: Record<string, unknown>) {
  const consulta = String(i.consulta ?? "");
  const [emb] = await embed([consulta]);
  const { data, error } = await sb.rpc("buscar_imoveis_hibrido", {
    consulta,
    consulta_emb: JSON.stringify(emb),
    f_cidade: i.cidade ?? null,
    f_bairros: (i.bairros as string[])?.length ? i.bairros : null,
    f_tipos: (i.tipos as string[])?.length ? i.tipos : null,
    f_preco_min: i.preco_min ?? null,
    f_preco_max: i.preco_max ?? null,
    f_quartos_min: i.quartos_min ?? null,
    limite: 6,
  });
  if (error) throw error;
  if (!data?.length) return { encontrados: 0, imoveis: [] };
  return {
    encontrados: data.length,
    imoveis: data.map((m: Record<string, any>) => ({
      codigo: m.codigo, titulo: m.titulo, tipo: m.tipo, bairro: m.bairro, cidade: m.cidade,
      preco: m.preco_visivel ? brl(m.preco) : "sob consulta",
      area_m2: m.area, terreno_m2: m.terreno, quartos: m.quartos, suites: m.suites, vagas: m.vagas,
      resumo: m.resumo, destaques: m.destaques, pontos_de_atencao: m.atencao,
      preco_m2_referencia_bairro: m.ref_m2 ? brl(m.ref_m2) : null,
      link: `${SITE}/imovel/${m.slug}/`,
    })),
  };
}

async function buscarConhecimento(i: Record<string, unknown>) {
  const pergunta = String(i.pergunta ?? "");
  const [emb] = await embed([pergunta]);
  const { data, error } = await sb.rpc("buscar_conhecimento_hibrido", {
    consulta: pergunta, consulta_emb: JSON.stringify(emb), limite: 3,
  });
  if (error) throw error;
  return (data ?? []).map((c: Record<string, any>) => ({ titulo: c.titulo, conteudo: c.conteudo }));
}

const CAMPOS_LEAD = [
  "nome", "whatsapp", "email", "objetivo", "regioes", "perfil", "prazo", "motivacao",
  "faixa_investimento", "pagamento", "tem_imovel_para_vender", "decisores", "outro_corretor",
  "imoveis_interesse", "prazo_compra", "credito", "faixa_max", "depende_venda", "decisores_alinhados", "motivacao_forte",
];

async function registrarLead(i: Record<string, unknown>, ctx: Ctx) {
  const dados: Record<string, unknown> = {};
  for (const c of CAMPOS_LEAD) if (i[c] !== undefined && i[c] !== null && i[c] !== "") dados[c] = i[c];
  if (i.nao_contatar) {
    dados.etapa = "perdido"; dados.motivo_perda = "pediu para não ser contatado";
    dados.nao_contatar = true; dados.nao_contatar_motivo = "pediu na conversa";
  }
  if (ctx.canal === "whatsapp") delete dados.whatsapp; // o número é o da própria conversa
  dados.atualizado_em = new Date().toISOString();
  dados.ultima_atividade = dados.atualizado_em;
  if (ctx.leadId) {
    const { error } = await sb.from("leads").update(dados).eq("id", ctx.leadId);
    if (error) throw error;
    if (i.nao_contatar) await registrarOptOut(ctx.leadId, "ia");
  } else {
    const { data, error } = await sb.from("leads").insert({ ...dados, etapa: "em_conversa" }).select("id").single();
    if (error) throw error;
    ctx.leadId = data.id;
    await sb.from("conversas").update({ lead_id: ctx.leadId }).eq("id", ctx.conversaId);
  }
  return { ok: true };
}

async function passarParaAnderson(i: Record<string, unknown>, ctx: Ctx) {
  const { data: conv } = await sb.from("conversas").select("passada_em, contexto").eq("id", ctx.conversaId).single();
  const ref = ctx.conversaId.slice(0, 6).toUpperCase();
  const texto = `${String(i.mensagem_whatsapp ?? "").trim()}\n\nCódigo do atendimento: ${ref}`;
  const url = `https://wa.me/${WHATS}?text=${encodeURIComponent(texto)}`;
  ctx.handoff = ctx.canal === "whatsapp" ? null : { whatsapp_url: url };

  await sb.from("conversas").update({
    status: "anderson", resumo: i.resumo, passada_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
  }).eq("id", ctx.conversaId);

  let lead: Record<string, any> = {};
  if (ctx.leadId) {
    const upd: Record<string, unknown> = { etapa: "qualificado", atualizado_em: new Date().toISOString() };
    if (i.pontuacao) upd.pontuacao = i.pontuacao;
    const { data } = await sb.from("leads").update(upd).eq("id", ctx.leadId).select("*").single();
    lead = data ?? {};
  }

  // Só um e-mail por conversa
  if (!conv?.passada_em && !ctx.simulacao) await enviarAlerta(i, lead, ref, conv?.contexto ?? {}, ctx.conversaId, ctx.canal);
  return ctx.canal === "whatsapp"
    ? { ok: true, observacao: "O Anderson assume esta conversa aqui mesmo no WhatsApp. Não fale em botão." }
    : { ok: true, botao_whatsapp_exibido: true };
}

async function enviarAlerta(
  i: Record<string, unknown>, lead: Record<string, any>, ref: string, contexto: Record<string, any>, conversaId: string,
  canal: "site" | "whatsapp" = "site",
) {
  await sb.from("notificacoes").insert({
    titulo: `Lead para você: ${lead.nome ?? "sem nome"}`, corpo: String(i.resumo ?? "").slice(0, 160),
    url: canal === "whatsapp" ? "/admin/?aba=whats" : "/admin/?aba=pipeline", chave: `handoff-${conversaId}`,
  }).then(() => {}, () => {});
  if (!RESEND) return;
  const { data: msgs } = await sb.from("mensagens").select("papel, conteudo")
    .eq("conversa_id", conversaId).in("papel", ["usuario", "assistente"]).order("criado_em").limit(40);
  const conversa = (msgs ?? []).map((m) =>
    `<p style="margin:6px 0"><b>${m.papel === "usuario" ? "Lead" : "Assistente"}:</b> ${esc(m.conteudo).replace(/\n/g, "<br>")}</p>`
  ).join("");
  const linha = (k: string, v: unknown) =>
    v == null || v === "" || (Array.isArray(v) && !v.length) ? "" :
      `<tr><td style="padding:4px 12px 4px 0;color:#666">${k}</td><td style="padding:4px 0">${esc(Array.isArray(v) ? v.join(", ") : v)}</td></tr>`;
  const nota = String(i.pontuacao ?? lead.pontuacao ?? "?");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:640px">
<h2 style="margin:0 0 4px">Lead ${esc(nota)} ${canal === "whatsapp" ? "do WhatsApp" : "do site"}: ${esc(lead.nome ?? "sem nome")}</h2>
<p style="margin:0 0 16px;color:#666">Motivo: ${esc(i.motivo)} · Código ${ref}</p>
<p style="white-space:pre-wrap;background:#f5f2ec;padding:12px;border-radius:6px">${esc(i.resumo)}</p>
<table>${linha("WhatsApp", lead.whatsapp)}${linha("E-mail", lead.email)}${linha("Objetivo", lead.objetivo)}${linha("Regiões", lead.regioes)}${linha("Perfil", lead.perfil)}${linha("Prazo", lead.prazo)}${linha("Faixa", lead.faixa_investimento)}${linha("Pagamento", lead.pagamento)}${linha("Imóvel para vender", lead.tem_imovel_para_vender == null ? null : lead.tem_imovel_para_vender ? "sim" : "não")}${linha("Imóveis de interesse", lead.imoveis_interesse)}${linha("Página", contexto.pagina)}${linha("Campanha", contexto.utm && Object.keys(contexto.utm).length ? JSON.stringify(contexto.utm) : null)}</table>
<p style="color:#666">${canal === "whatsapp"
    ? `O robô pausou nesta conversa. Responda pelo admin, aba WhatsApp: <a href="${SITE}/admin/">abrir</a>.`
    : `O lead recebeu o botão para te chamar no WhatsApp com a mensagem pronta e o código ${ref}.`}</p>
<h3 style="margin:24px 0 8px">Conversa</h3>${conversa}</div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Atendimento do site <onboarding@resend.dev>",
      to: [EMAIL_ALERTA],
      subject: `${canal === "whatsapp" ? "WhatsApp · " : ""}Lead ${nota} · ${lead.nome ?? "sem nome"} · ${lead.objetivo ?? ""} ${lead.regioes?.[0] ?? ""}`.trim(),
      html,
      ...(lead.email ? { reply_to: lead.email } : {}),
    }),
  });
  if (!r.ok) console.error("resend", r.status, await r.text());
}

async function executar(nome: string, input: Record<string, unknown>, ctx: Ctx) {
  try {
    if (nome === "buscar_imoveis") return await buscarImoveis(input);
    if (nome === "buscar_conhecimento") return await buscarConhecimento(input);
    if (nome === "registrar_lead") return await registrarLead(input, ctx);
    if (nome === "passar_para_anderson") return await passarParaAnderson(input, ctx);
    if (nome === "oferecer_visita" || nome === "verificar_horario") {
      const { agenda: a } = await config();
      const im = await imovelDaVisita(input.imovel_codigo as string);
      const ocupado = await ocupados(a);
      let opcoes: Opcao[]; let situacao = "sugestao";
      if (nome === "oferecer_visita") opcoes = sugerirTres(a, ocupado, await visitasVizinhas(im?.bairro));
      else {
        const r = verificarPreferencia(a, ocupado, { data: input.data as string, hora: input.hora as string, periodo: input.periodo as string });
        opcoes = r.opcoes; situacao = r.situacao;
      }
      ctx.agenda = {
        imovel: im?.codigo ?? null, titulo: im?.titulo ?? null, exige_validacao: !!im?.visita_exige_proprietario,
        opcoes, modo: nome === "oferecer_visita" ? "sugestao" : "preferencia", situacao,
      };
      return {
        ok: true, botoes_exibidos: opcoes.length, situacao,
        opcoes: opcoes.map((o) => `${o.rotulo}${o.tipo === "pedido" ? " (fora do expediente: vira pedido para o Anderson confirmar)" : " (livre)"}`),
        imovel: im?.codigo ?? "não identificado",
        observacao: im?.visita_exige_proprietario ? "Este imóvel precisa de combinação com o proprietário: qualquer horário escolhido vai para o Anderson confirmar." : "Horário livre escolhido no expediente fica confirmado na hora.",
      };
    }
    return { erro: "ferramenta desconhecida" };
  } catch (e) {
    console.error(nome, e);
    return { erro: "falha temporária ao consultar; siga a conversa sem esse dado" };
  }
}

// ------------------------------------------------------------------ indexação
async function indexar() {
  let total = 0;
  const { data: ims } = await sb.from("imoveis").select("*").is("embedding", null).limit(50);
  if (ims?.length) {
    const textos = ims.map((m: Record<string, any>) => [
      m.titulo, `${m.tipo} em ${m.bairro}, ${m.cidade}`, `preço ${brl(m.preco)}`,
      `${m.area ?? "?"} m², terreno ${m.terreno ?? "-"} m², ${m.quartos} quartos, ${m.suites} suítes, ${m.vagas} vagas`,
      m.resumo, (m.destaques ?? []).join(", "), m.descricao, (m.atencao ?? []).join(", "), m.perfil_ideal,
    ].filter(Boolean).join("\n"));
    const embs = await embed(textos);
    for (let k = 0; k < ims.length; k++) {
      await sb.from("imoveis").update({ embedding: JSON.stringify(embs[k]) }).eq("id", ims[k].id);
    }
    total += ims.length;
  }
  const { data: cs } = await sb.from("conhecimento").select("id, titulo, conteudo").is("embedding", null).limit(100);
  if (cs?.length) {
    const embs = await embed(cs.map((c) => `${c.titulo}\n${c.conteudo}`));
    for (let k = 0; k < cs.length; k++) {
      await sb.from("conhecimento").update({ embedding: JSON.stringify(embs[k]) }).eq("id", cs[k].id);
    }
    total += cs.length;
  }
  return total;
}

// ------------------------------------------------------------------- conversa
function montarHistorico(msgs: { papel: string; conteudo: string }[]) {
  const out: { role: string; content: string }[] = [];
  for (const m of msgs) {
    const role = m.papel === "usuario" ? "user" : "assistant";
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.role === role) ultimo.content += "\n\n" + m.conteudo;
    else out.push({ role, content: m.conteudo });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

// Cartões com foto para os imóveis citados em cada mensagem
async function montarCartoes(blocos: string[]) {
  const slugs = new Set<string>();
  const porBloco = blocos.map((b) => {
    const achados = [...b.matchAll(/\/imovel\/([a-z0-9-]+)\/?/gi)].map((m) => m[1]);
    achados.forEach((x) => slugs.add(x));
    return achados;
  });
  if (!slugs.size) return blocos.map(() => []);
  const { data } = await sb.from("imoveis")
    .select("slug, codigo, titulo, bairro, cidade, preco, preco_visivel, area, quartos, suites, vagas, fotos")
    .in("slug", [...slugs]);
  const mapa = new Map((data ?? []).map((m: Record<string, any>) => [m.slug, {
    codigo: m.codigo, titulo: m.titulo, bairro: m.bairro, cidade: m.cidade,
    preco: m.preco_visivel ? brl(m.preco) : "Preço sob consulta",
    detalhes: [m.area ? `${m.area} m²` : null, m.quartos ? `${m.quartos} quartos` : null, m.vagas ? `${m.vagas} vagas` : null].filter(Boolean).join(" · "),
    foto: String((m.fotos ?? [])[0] ?? "").replace(/\.webp$/, "-p.webp") || null,
    link: `/imovel/${m.slug}/`,
  }]));
  return porBloco.map((lista) => lista.map((x) => mapa.get(x)).filter(Boolean));
}

async function transcricaoHtml(conversaId: string) {
  const { data: msgs } = await sb.from("mensagens").select("papel, conteudo")
    .eq("conversa_id", conversaId).in("papel", ["usuario", "assistente"]).order("criado_em").limit(40);
  if (!msgs?.length) return "<p style=\"color:#666\">A pessoa preencheu o contato e não chegou a escrever.</p>";
  return msgs.map((m) =>
    `<p style="margin:6px 0"><b>${m.papel === "usuario" ? "Lead" : "Assistente"}:</b> ${esc(m.conteudo).replace(/\n/g, "<br>")}</p>`
  ).join("");
}

// Avisa o Anderson sobre quem deixou o contato e parou de responder (para recuperar)
async function avisarAbandonos() {
  const parado = new Date(Date.now() - 30 * 60e3).toISOString();
  const desde = new Date(Date.now() - 3 * 864e5).toISOString();
  const { data } = await sb.from("conversas").select("id, contexto, lead_id, criado_em, atualizado_em")
    .is("passada_em", null).not("lead_id", "is", null).lt("atualizado_em", parado).gte("criado_em", desde)
    .order("criado_em").limit(20);
  let avisados = 0;
  for (const c of data ?? []) {
    if (c.contexto?.abandono_avisado) continue;
    const { data: lead } = await sb.from("leads").select("*").eq("id", c.lead_id).single();
    if (!lead?.whatsapp || lead.etapa === "perdido") continue;
    const primeiro = String(lead.nome ?? "").split(" ")[0];
    const recuperar = `Oi, ${primeiro}! Aqui é o Anderson Costa. Vi que você conversou com minha assistente no site sobre imóveis. Posso te ajudar a seguir daqui?`;
    const linkWhats = `https://wa.me/${lead.whatsapp}?text=${encodeURIComponent(recuperar)}`;
    const ref = String(c.id).slice(0, 6).toUpperCase();
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:640px">
<h2 style="margin:0 0 4px">Lead parou no meio do chat: ${esc(lead.nome)}</h2>
<p style="margin:0 0 16px;color:#666">Deixou o contato e não concluiu a conversa · Código ${ref}${lead.pontuacao ? " · Nota " + esc(lead.pontuacao) : ""}</p>
<p><a href="${linkWhats}" style="display:inline-block;background:#1f9d55;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Chamar ${esc(primeiro)} no WhatsApp</a></p>
<p style="color:#666;font-size:13px">A mensagem já vai pronta: "${esc(recuperar)}"</p>
<table>
<tr><td style="padding:4px 12px 4px 0;color:#666">WhatsApp</td><td>${esc(lead.whatsapp)}</td></tr>
${lead.email ? `<tr><td style="padding:4px 12px 4px 0;color:#666">E-mail</td><td>${esc(lead.email)}</td></tr>` : ""}
${lead.objetivo ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Objetivo</td><td>${esc(lead.objetivo)}</td></tr>` : ""}
${lead.faixa_investimento ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Faixa</td><td>${esc(lead.faixa_investimento)}</td></tr>` : ""}
${lead.imoveis_interesse?.length ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Interesse</td><td>${esc(lead.imoveis_interesse.join(", "))}</td></tr>` : ""}
${c.contexto?.pagina ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Página</td><td>${esc(c.contexto.pagina)}</td></tr>` : ""}
</table>
<h3 style="margin:24px 0 8px">Conversa</h3>${await transcricaoHtml(c.id)}</div>`;
    if (RESEND) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Atendimento do site <onboarding@resend.dev>", to: [EMAIL_ALERTA],
          subject: `Recuperar lead · ${lead.nome} parou no chat`, html,
          ...(lead.email ? { reply_to: lead.email } : {}),
        }),
      });
      if (!r.ok) { console.error("resend abandono", r.status, await r.text()); continue; }
    }
    await sb.from("conversas").update({ contexto: { ...c.contexto, abandono_avisado: new Date().toISOString() } }).eq("id", c.id);
    avisados++;
  }
  return avisados;
}

// Um link sozinho vai junto da mensagem anterior, em vez de virar um balão separado
function juntarLinks(blocos: string[]) {
  const out: string[] = [];
  for (const b of blocos) {
    if (/^https?:\/\/\S+$/.test(b) && out.length) out[out.length - 1] += "\n" + b;
    else out.push(b);
  }
  return out;
}

// Which ad brought the person in: the ad name in Ads Manager carries the listing code (e.g. "AC-0010 | ...")
async function contextoAnuncio(conversa: Record<string, any>): Promise<{ imovel: string | null; texto: string }> {
  const r = conversa.contexto?.referral;
  if (!r || r.source_type !== "ad") return { imovel: null, texto: "" };
  const { data } = await sb.from("ads_entidades").select("nome, titulo").eq("id", String(r.source_id ?? "")).maybeSingle();
  const nome = String(data?.nome ?? "");
  const cod = nome.match(/\b(AC-\d{4}|DM-\d{2,4})\b/i)?.[1]?.toUpperCase() ?? null;
  const titulo = String(r.headline ?? data?.titulo ?? "").replace(/["{}]/g, "").slice(0, 120);
  const curadoria = !cod && /curadoria/i.test(nome + " " + titulo);
  const texto = cod
    ? `A pessoa chegou clicando no anúncio "${titulo}", que é do imóvel ${cod} (dados em "Imóvel visto"). Quando ela disser "isso", "esse", "mais informações" ou mandar print, é desse imóvel que está falando. Nunca pergunte qual imóvel ou anúncio foi: comece falando dele.`
    : curadoria
      ? `A pessoa chegou clicando no anúncio de curadoria ("${titulo}"). Ela não veio por um imóvel específico: apresente a curadoria em uma frase e comece a descoberta pelo que ela procura.`
      : titulo ? `A pessoa chegou clicando no anúncio "${titulo}".` : "";
  return { imovel: cod, texto };
}

async function simularConversa(body: Record<string, any>) {
  const falas = (Array.isArray(body.mensagens) ? body.mensagens : []).map((x: unknown) => String(x).slice(0, 500)).slice(0, 12);
  const referral = body.anuncio_id
    ? { source_type: "ad", source_id: String(body.anuncio_id), headline: String(body.headline ?? "") }
    : null;
  const { data: lead, error: e1 } = await sb.from("leads").insert({
    nome: String(body.nome ?? "Teste").slice(0, 40), canal: "WhatsApp", etapa: "novo", nao_contatar: true, nao_contatar_motivo: "simulação",
    origem: { canal: "simulacao", ...(referral ? { anuncio: referral.source_id, anuncio_titulo: referral.headline } : {}) },
  }).select("id").single();
  if (e1) throw e1;
  const { data: conv, error: e2 } = await sb.from("conversas").insert({
    canal: "whatsapp", lead_id: lead.id, contexto: { simulacao: true, ...(referral ? { referral } : {}) },
  }).select("*").single();
  if (e2) { await sb.from("leads").delete().eq("id", lead.id); throw e2; }
  const transcricao: { pessoa: string; lu: string; ferramentas?: unknown }[] = [];
  let final: unknown = null;
  try {
    for (const f of falas) {
      await sb.from("mensagens").insert({ conversa_id: conv.id, papel: "usuario", conteudo: f, meta: { simulacao: true } });
      const { data: atual } = await sb.from("conversas").select("*").eq("id", conv.id).single();
      const ctx: Ctx = { canal: "whatsapp", conversaId: conv.id, leadId: lead.id, handoff: null, agenda: null, simulacao: true };
      const r = await turno(ctx, atual ?? conv, {}, null);
      transcricao.push({ pessoa: f, lu: r.resposta, ...(ctx.agenda ? { ferramentas: { visita: ctx.agenda.opcoes.length } } : {}) });
      if (atual?.status === "anderson") break;
    }
    const { data: l } = await sb.from("leads").select("*").eq("id", lead.id).single();
    const { data: c } = await sb.from("conversas").select("status, resumo, contexto").eq("id", conv.id).single();
    final = { lead: Object.fromEntries(Object.entries(l ?? {}).filter(([k, v]) => v != null && !["tsv", "termometro_detalhe"].includes(k))), conversa: c };
  } finally {
    await sb.from("mensagens").delete().eq("conversa_id", conv.id);
    await sb.from("conversas").delete().eq("id", conv.id);
    await sb.from("automacao_log").delete().eq("lead_id", lead.id);
    await sb.from("notificacoes").delete().like("chave", `%${conv.id}%`);
    await sb.from("leads").delete().eq("id", lead.id);
  }
  return { transcricao, final };
}

async function contextoImovel(codigo?: string) {
  if (!codigo) return "nenhum";
  const { data } = await sb.from("imoveis").select("codigo, titulo, bairro, preco, preco_visivel, slug")
    .eq("codigo", codigo).maybeSingle();
  if (!data) return "nenhum";
  return `${data.codigo}: ${data.titulo}, ${data.bairro}, ${data.preco_visivel ? brl(data.preco) : "preço sob consulta"} (${SITE}/imovel/${data.slug}/)`;
}


// ---------------------------------------------------------------- API de Conversões da Meta
async function sha256(texto: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
const EVENTOS_META = ["ViewContent", "Contact", "Lead", "LeadQualificado"];
// Telefone no formato E.164 sem "+": só números, com 55 e DDD
function foneE164(t: string) {
  let f = String(t ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (f.length === 10 || f.length === 11) f = "55" + f;
  return /^55\d{10,11}$/.test(f) ? f : "";
}
function emailNorm(t: string) {
  const e = String(t ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : "";
}
const textoCapi = (v: unknown, n = 60) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);
async function enviarCapi(body: Record<string, any>, req: Request) {
  if (!META_TOKEN) return { enviado: false, motivo: "sem token" };
  const evento = String(body.evento ?? "");
  const eid = String(body.eid ?? "").slice(0, 64);
  const url = String(body.url ?? "");
  if (!EVENTOS_META.includes(evento) || eid.length < 8 || !url.startsWith(SITE)) return { enviado: false, motivo: "inválido" };

  let nome = String(body.nome ?? "").trim().toLowerCase();
  let fone = foneE164(body.telefone);
  let email = emailNorm(body.email);
  let externo = "";
  const conv = String(body.conversa_id ?? "");
  if (evento !== "ViewContent" && /^[0-9a-f-]{36}$/i.test(conv)) {
    const { data } = await sb.from("conversas").select("lead_id, leads(nome, whatsapp, email)").eq("id", conv).maybeSingle();
    const l = (data as any)?.leads;
    if (l) {
      nome = nome || String(l.nome ?? "").trim().toLowerCase();
      fone = fone || foneE164(l.whatsapp);
      email = email || emailNorm(l.email);
    }
    if ((data as any)?.lead_id) externo = String((data as any).lead_id);
  }
  const partes = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter(Boolean);

  // Dados pessoais só saem daqui com SHA-256; fbp/fbc, IP e user agent vão como a Meta pede (sem hash)
  const ud: Record<string, unknown> = {
    client_ip_address: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || undefined,
    client_user_agent: req.headers.get("user-agent") ?? undefined,
    fbp: /^fb\.\d\.\d+\.\d+$/.test(String(body.fbp ?? "")) ? String(body.fbp) : undefined,
    fbc: /^fb\.\d\.\d+\..+$/.test(String(body.fbc ?? "")) ? String(body.fbc).slice(0, 500) : undefined,
    country: [await sha256("br")],
  };
  if (fone) ud.ph = [await sha256(fone)];
  if (email) ud.em = [await sha256(email)];
  if (partes[0]) ud.fn = [await sha256(partes[0])];
  if (partes.length > 1) ud.ln = [await sha256(partes[partes.length - 1])];
  if (externo) ud.external_id = [await sha256(externo)];

  const custom: Record<string, unknown> = {};
  const codigo = textoCapi(body.imovel, 20);
  if (codigo) { custom.content_ids = [codigo]; custom.content_type = "home_listing"; }
  if (evento === "ViewContent" && codigo) {
    // Preço vem do banco (não do navegador) e só vai quando é público no site
    const { data: im } = await sb.from("imoveis").select("preco, preco_visivel").eq("codigo", codigo).maybeSingle();
    const preco = Number((im as any)?.preco ?? 0);
    const visivel = (im as any)?.preco_visivel !== false;
    if (preco > 0 && visivel) { custom.value = preco; custom.currency = "BRL"; }
  }
  if (evento === "Lead") {
    const cat = textoCapi(body.categoria, 30);
    if (cat) custom.content_category = cat;
    if (body.orcamento) custom.orcamento = textoCapi(body.orcamento);
    if (body.tipo) custom.tipo_imovel = textoCapi(body.tipo, 30);
  }

  const payload: Record<string, unknown> = {
    data: [{
      event_name: evento, event_time: Math.floor(Date.now() / 1000), event_id: eid,
      action_source: "website", event_source_url: url.slice(0, 500), user_data: ud, custom_data: custom,
    }],
  };
  const teste = String(body.teste ?? "");
  if (/^TEST[0-9A-Z]{3,12}$/.test(teste)) payload.test_event_code = teste;
  else if (META_TESTE) payload.test_event_code = META_TESTE;
  const r = await fetch(`https://graph.facebook.com/v23.0/${META_PIXEL}/events?access_token=${META_TOKEN}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const resp = await r.json().catch(() => ({}));
  if (!r.ok) console.error("capi", r.status, JSON.stringify(resp).slice(0, 300));
  return { enviado: r.ok, recebidos: (resp as any)?.events_received ?? 0 };
}


// ------------------------------------------------------------------ WhatsApp
const PROMPT_WHATS = `

## Ajustes para o WhatsApp (valem acima da seção do chat do site)

- Esta conversa acontece no WhatsApp de atendimento do Anderson. Não existe janela de saudação: se esta for sua primeira resposta na conversa, apresente-se em poucas palavras como a Lu, do time do Anderson Costa ("Oi, Mariana! Aqui é a Lu, do time do Anderson."), e já ajude com o que a pessoa escreveu.
- Origem desta conversa: {anuncio_contexto}
- O WhatsApp da pessoa já é conhecido, é o número desta conversa. Nunca peça o número. Peça só o nome, se ainda não souber.
- Mensagens que vêm do botão do site terminam com "Código: XXXX". É só um código interno de rastreio: nunca comente nem repita. Se a mensagem citar um imóvel (ref. DM-123 ou o título), comece falando dele.
- Escreva no máximo 3 mensagens curtas por resposta. Nada de títulos com # nem tabelas. Use *negrito* só se ajudar muito.
- Ao indicar imóvel, coloque o link completo em linha própria. O WhatsApp mostra a prévia com a foto.
- Os horários de conversa vão escritos na mensagem, dois por vez, tirados da lista "Horários livres do Anderson para conversa".
- passar_para_anderson: diga que o Anderson continua com a pessoa aqui mesmo, neste número, ou na ligação combinada. Não fale em botão nem em link. O campo mensagem_whatsapp pode ser um resumo de uma linha.
- Se a pessoa pedir para não receber mais mensagens, chame registrar_lead com nao_contatar true na mesma resposta e confirme em uma frase, com respeito, que ela não vai mais receber mensagens.`;

type ConfigWa = { ativo: boolean; modo_teste: boolean; numeros_teste: string[] };
async function configWa(): Promise<ConfigWa> {
  const { data } = await sb.from("config").select("valor").eq("chave", "whatsapp").maybeSingle();
  return { ativo: false, modo_teste: true, numeros_teste: [], ...(data?.valor ?? {}) };
}

async function avisarAnderson(assunto: string, html: string) {
  // Notificação no app (iPhone, Mac) além do e-mail
  const corpo = html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  await sb.from("notificacoes").insert({ titulo: assunto.slice(0, 80), corpo, url: "/admin/?aba=whats" }).then(() => {}, () => {});
  if (!RESEND) return;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Atendimento do site <onboarding@resend.dev>", to: [EMAIL_ALERTA], subject: assunto, html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:640px">${html}</div>` }),
  });
  if (!r.ok) console.error("resend aviso", r.status, await r.text());
}

/** Permanent stop: lead flag, suppression list (via trigger) and an audit line that feeds the circuit breaker. */
async function registrarOptOut(leadId: string | null, origem: string) {
  if (!leadId) return;
  const { data: l } = await sb.from("leads").select("nao_contatar, whatsapp").eq("id", leadId).maybeSingle();
  if (!l || l.nao_contatar) return;
  await sb.from("leads").update({ nao_contatar: true, nao_contatar_motivo: `pediu para parar (${origem})`, atualizado_em: new Date().toISOString() }).eq("id", leadId);
  if (l.whatsapp) await sb.from("supressao").upsert({ fone: l.whatsapp, motivo: "pediu para parar", origem });
  await sb.from("automacao_log").insert({ lead_id: leadId, evento: "optout", detalhe: { origem } });
}

async function contarSaida(leadId: string | null, n = 1) {
  if (n > 0) await sb.from("automacao_log").insert(Array.from({ length: n }, () => ({ lead_id: leadId, evento: "wa_saida", detalhe: {} })));
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function processarWebhook(payload: Record<string, any>) {
  for (const entry of payload.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      const v = ch.value ?? {};
      for (const st of v.statuses ?? []) {
        if (st.status !== "failed") continue;
        const erro = st.errors?.[0];
        await sb.from("followup_fila").update({ status: "falhou", motivo: String(erro?.title ?? erro?.message ?? "falhou").slice(0, 200) }).eq("wamid", st.id);
        await sb.from("automacao_log").insert({ evento: "wa_falha", detalhe: { wamid: st.id, codigo: erro?.code, titulo: erro?.title } });
      }
      for (const m of v.messages ?? []) {
        const contato = (v.contacts ?? []).find((c: any) => c.wa_id === m.from) ?? v.contacts?.[0];
        try { await mensagemWhatsapp(m, contato); } catch (e) {
          console.error("wa mensagem", e);
          await avisarAnderson("Falha no robô do WhatsApp", `<p>Uma mensagem de ${esc(m.from)} não foi respondida por erro técnico. Veja no admin, aba WhatsApp.</p><pre>${esc(String((e as Error)?.message ?? e)).slice(0, 800)}</pre>`);
        }
      }
    }
  }
}

async function mensagemWhatsapp(m: Record<string, any>, contato: Record<string, any> | undefined) {
  const waId = String(m.from ?? "");
  const fone = foneCanonico(waId);
  if (!fone) return;
  const { data: ja } = await sb.from("mensagens").select("id").eq("meta->>wamid", m.id).limit(1);
  if (ja?.length) return; // a Meta reenviou o mesmo evento

  // Lead e conversa
  const { data: leads } = await sb.from("leads").select("id, nome, etapa, nao_contatar").in("whatsapp", [...new Set([fone, waId])])
    .order("criado_em", { ascending: false }).limit(1);
  let lead = leads?.[0] ?? null;
  // Veio do botão do site? A mensagem pronta traz "Código: XXXX", que liga à página, ao imóvel e à campanha
  const codSite = String(m.text?.body ?? "").match(/C[óo]digo:\s*([A-Z2-9]{4})\b/i)?.[1]?.toUpperCase() ?? null;
  let clique: Record<string, any> | null = null;
  if (codSite) {
    const { data: cl } = await sb.from("automacao_log").select("detalhe").eq("evento", "wa_clique").eq("detalhe->>codigo", codSite)
      .order("criado_em", { ascending: false }).limit(1);
    clique = (cl?.[0]?.detalhe as Record<string, any>) ?? null;
  }
  let leadNovo = false, conversaNova = false;
  if (!lead) {
    leadNovo = true;
    const nome = String(contato?.profile?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || null;
    const { data, error } = await sb.from("leads").insert({
      nome, whatsapp: fone, etapa: "novo", canal: clique ? "Site" : "WhatsApp",
      origem: { canal: "whatsapp", ...(clique ? { site: true, pagina: clique.pagina, imovel: clique.imovel, ...(clique.utm ?? {}) } : {}),
        ...(m.referral ? { anuncio: m.referral.source_id, anuncio_tipo: m.referral.source_type, ctwa_clid: m.referral.ctwa_clid, anuncio_titulo: m.referral.headline } : {}) },
    }).select("id, nome, etapa, nao_contatar").single();
    if (error) throw error;
    lead = data;
  }
  const { data: convs } = await sb.from("conversas").select("*").eq("canal", "whatsapp").eq("lead_id", lead!.id)
    .neq("status", "encerrada").order("atualizado_em", { ascending: false }).limit(1);
  let conversa = convs?.[0] ?? null;
  if (!conversa) {
    const { data, error } = await sb.from("conversas").insert({
      canal: "whatsapp", lead_id: lead!.id, contexto: { wa_id: waId, ...(m.referral ? { referral: m.referral } : {}),
        ...(clique ? { pagina: clique.pagina, utm: clique.utm ?? {}, ...(clique.imovel ? { imovel: clique.imovel } : {}) } : {}) },
    }).select("*").single();
    if (error) throw error;
    conversa = data;
    conversaNova = true;
  }

  if (clique?.imovel && conversa!.contexto?.imovel !== clique.imovel) {
    conversa!.contexto = { ...(conversa!.contexto ?? {}), imovel: clique.imovel, pagina: clique.pagina };
    await sb.from("conversas").update({ contexto: conversa!.contexto }).eq("id", conversa!.id);
  }

  // Conteúdo
  let texto = "";
  let imagem: { base64: string; mime: string } | null = null;
  let escolha: string | null = null;
  const tipo = String(m.type ?? "");
  const meta: Record<string, unknown> = { wamid: m.id, tipo, canal: "whatsapp" };
  if (tipo === "text") texto = String(m.text?.body ?? "");
  else if (tipo === "interactive") {
    const r = m.interactive?.list_reply ?? m.interactive?.button_reply ?? {};
    escolha = String(r.id ?? ""); texto = String(r.title ?? "");
  } else if (tipo === "button") { texto = String(m.button?.text ?? ""); escolha = String(m.button?.payload ?? ""); }
  else if (tipo === "audio") {
    const md = await baixarMidia(m.audio?.id, MAX_AUDIO_BYTES);
    const t = md ? await transcrever(md.bytes, md.mime) : "";
    if (md) { const c = await guardarAnexo(sb, conversa!.id, md.bytes, md.mime); if (c) meta.anexos = [c]; }
    texto = t ? `[Áudio transcrito] ${t}` : "[Áudio que não consegui transcrever]";
    meta.audio = true;
  } else if (tipo === "image") {
    const md = await baixarMidia(m.image?.id, MAX_IMAGEM_BYTES);
    if (md && ["image/jpeg", "image/png", "image/webp"].includes(md.mime)) {
      imagem = { base64: bytesParaBase64(md.bytes), mime: md.mime };
      const c = await guardarAnexo(sb, conversa!.id, md.bytes, md.mime); if (c) meta.anexos = [c];
    }
    texto = ["[Foto enviada pela pessoa]", String(m.image?.caption ?? "")].filter(Boolean).join("\n");
    meta.imagem = true;
  } else texto = `[A pessoa enviou ${tipo === "location" ? "uma localização" : tipo === "sticker" ? "uma figurinha" : tipo === "document" ? "um documento" : tipo === "video" ? "um vídeo" : "um conteúdo"} que eu não consigo abrir]`;
  texto = texto.trim().slice(0, MAX_CHARS);
  if (!texto) return;

  const { error: eIns } = await sb.from("mensagens").insert({ conversa_id: conversa!.id, papel: "usuario", conteudo: texto, meta });
  // Aviso no app (iPhone/Mac) quando chega lead novo ou um antigo volta a conversar
  if (leadNovo || conversaNova) {
    const origemTxt = m.referral?.source_type === "ad" ? `Anúncio: ${String(m.referral.headline ?? m.referral.source_id ?? "").slice(0, 50)}`
      : clique ? `Site${clique.imovel ? ` · ${clique.imovel}` : ""}` : "WhatsApp direto";
    await sb.from("notificacoes").insert({
      titulo: `${leadNovo ? "Novo lead" : "Lead voltou"}: ${lead!.nome ?? foneBR(fone)}`.slice(0, 80),
      corpo: `${origemTxt}. "${texto.replace(/\s+/g, " ").slice(0, 90)}"`.slice(0, 160),
      url: "/admin/?aba=whats", chave: `lead-${conversa!.id}`,
    }).then(() => {}, () => {});
  }
  if (eIns) { if ((eIns as any).code === "23505") return; throw eIns; }
  await sb.from("conversas").update({ atualizado_em: new Date().toISOString() }).eq("id", conversa!.id);
  await sb.from("leads").update({ ultima_atividade: new Date().toISOString() }).eq("id", lead!.id);
  await marcarLida(m.id);

  // Pedido para parar: trava permanente, antes de qualquer outra coisa
  if (pediuParaParar(texto) || /^(parar|stop|sair)$/i.test(escolha ?? "")) await registrarOptOut(lead!.id, "whatsapp");

  // Robô desligado ou em teste com número de fora: só guarda e avisa
  const cw = await configWa();
  const permitido = cw.ativo && (!cw.modo_teste || (cw.numeros_teste ?? []).includes(fone));
  const avisoRecente = conversa!.contexto?.ultimo_aviso && Date.now() - Date.parse(conversa!.contexto.ultimo_aviso) < 30 * 60_000;
  if (!permitido || conversa!.status === "anderson") {
    if (!avisoRecente) {
      await sb.from("conversas").update({ contexto: { ...conversa!.contexto, ultimo_aviso: new Date().toISOString() } }).eq("id", conversa!.id);
      await avisarAnderson(`WhatsApp · ${lead!.nome ?? fone} escreveu`, `<p><b>${esc(lead!.nome ?? "Sem nome")}</b> · ${esc(foneBR(fone))}</p><p style="background:#f5f2ec;padding:12px;border-radius:6px">${esc(texto)}</p><p>${conversa!.status === "anderson" ? "A conversa está com você, o robô não responde." : "O robô está desligado ou em modo teste para este número."} <a href="${SITE}/admin/">Responder pelo admin</a>.</p>`);
    }
    return;
  }

  const ctx: Ctx = { canal: "whatsapp", conversaId: conversa!.id, leadId: lead!.id, handoff: null, agenda: null };

  // Escolha de horário na lista
  if (escolha?.startsWith("v:") && escolha !== "v:nenhum") {
    const r: Record<string, any> = await agendarVisita({ conversa_id: conversa!.id, inicio: escolha.slice(2), imovel: conversa!.contexto?.ultima_agenda?.imovel });
    const resp = r.texto ?? r.erro ?? "Não consegui registrar esse horário agora. O Anderson te chama para combinar.";
    if (!r.texto) await sb.from("mensagens").insert({ conversa_id: conversa!.id, papel: "assistente", conteudo: resp });
    const e = await enviarTexto(waId, resp); if (e.ok) await contarSaida(lead!.id);
    return;
  }
  if (escolha === "v:nenhum") {
    await sb.from("mensagens").update({ conteudo: "Nenhum desses horários serve para mim." }).eq("meta->>wamid", m.id);
  }

  // Junta mensagens em sequência: espera um pouco e deixa a mais nova responder por todas
  await dormir(4000);
  const { data: depois } = await sb.from("mensagens").select("id, meta").eq("conversa_id", conversa!.id).eq("papel", "usuario")
    .order("criado_em", { ascending: false }).limit(1);
  if (depois?.[0] && depois[0].meta?.wamid !== m.id) return;

  const { data: atual } = await sb.from("conversas").select("*").eq("id", conversa!.id).single();
  if (atual?.status === "anderson") return; // o Anderson assumiu enquanto esperávamos
  const { count } = await sb.from("mensagens").select("id", { count: "exact", head: true }).eq("conversa_id", conversa!.id).eq("papel", "usuario");
  if ((count ?? 0) >= LIMITE_CONVERSA * 2) {
    await sb.from("conversas").update({ status: "anderson" }).eq("id", conversa!.id);
    await avisarAnderson(`WhatsApp · conversa longa com ${lead!.nome ?? fone}`, `<p>O robô parou de responder porque a conversa ficou muito longa. <a href="${SITE}/admin/">Assuma pelo admin</a>.</p>`);
    return;
  }

  // Quem mandou áudio (dirigindo, no trânsito) recebe a resposta em áudio, e os links vão por escrito
  const veioAudio = tipo === "audio";
  const { resposta, blocos } = await turno(ctx, atual ?? conversa!, veioAudio ? { voz: true } : {}, imagem);
  let enviados = 0, falou = false;
  if (veioAudio && OPENAI) {
    try {
      const ogg = await sintetizar(resposta, "opus");
      const e = await enviarAudio(waId, ogg);
      if (e.ok) { enviados++; falou = true; }
    } catch (e) { console.error("wa voz", e); }
  }
  if (falou) {
    const links = [...new Set(resposta.match(/https?:\/\/\S+/g) ?? [])];
    if (links.length) { const e = await enviarTexto(waId, (links.length > 1 ? "Os links que comentei:\n" : "O link que comentei:\n") + links.join("\n")); if (e.ok) enviados++; }
  } else {
    for (const b of blocos) { const e = await enviarTexto(waId, b); if (e.ok) enviados++; }
  }
  if (ctx.agenda?.opcoes?.length) {
    const e = await enviarHorarios(waId, ctx.agenda.opcoes, ctx.agenda.situacao && ctx.agenda.situacao !== "sugestao"
      ? "Separei estas opções. Toque em Ver horários e escolha a que fica melhor."
      : "Toque em Ver horários e escolha o que fica melhor para você.");
    if (e.ok) enviados++;
    const { data: c2 } = await sb.from("conversas").select("contexto").eq("id", conversa!.id).single();
    await sb.from("conversas").update({ contexto: { ...(c2?.contexto ?? {}), ultima_agenda: { imovel: ctx.agenda.imovel, em: new Date().toISOString() } } }).eq("id", conversa!.id);
  }
  await contarSaida(lead!.id, enviados);
}

// Free slots in Anderson's calendar, given to the model as text so it can offer two of them for a call.
async function horariosConversa(a: Agenda) {
  try {
    const livres = sugerirTres(a, await ocupados(a)).filter((o) => o.tipo === "livre").map((o) => o.rotulo);
    return livres.length ? `\n\n## Horários livres do Anderson para conversa\n\n${livres.join("; ")}. Ofereça dois destes. Se nenhum servir, pergunte o melhor dia e período e diga que o Anderson confirma.` : "";
  } catch (e) { console.error("horarios conversa", e); return ""; }
}

// Writes a follow-up touch in the Lu's voice from the real conversation. Falls back to the fixed text on any problem.
async function gerarRetomada(leadId: string, passo: number, padrao: string): Promise<string> {
  try {
    const { data: convs } = await sb.from("conversas").select("id, contexto").eq("lead_id", leadId).eq("canal", "whatsapp")
      .order("atualizado_em", { ascending: false }).limit(1);
    const conv = convs?.[0];
    if (!conv) return padrao;
    const { data: hist } = await sb.from("mensagens").select("papel, conteudo").eq("conversa_id", conv.id)
      .in("papel", ["usuario", "assistente"]).order("criado_em", { ascending: true }).limit(40);
    const { data: l } = await sb.from("leads").select(CAMPOS_LEAD.join(",")).eq("id", leadId).maybeSingle();
    const leadTxt = JSON.stringify(Object.fromEntries(Object.entries(l ?? {}).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length))));
    const passoTxt = passo === 1
      ? "toque 1, no mesmo dia: continue o fio de onde parou, entregue a próxima informação que ela ia querer e termine com uma pergunta de uma palavra (ou nenhuma, se a sua última mensagem já terminou numa pergunta)"
      : passo === 2
        ? "toque 2, no dia seguinte: traga uma novidade que ela ainda não tinha (comparação com o bairro, um imóvel do cadastro que combina com o que ela contou, ou o que o imóvel tem que a foto não mostra)"
        : "toque 3: a pergunta que permite dizer não, com as palavras desta conversa (o imóvel, o nome, o que ela contou), deixando claro que um não basta";
    const system = PROMPT.replaceAll("{canal}", "WhatsApp").replaceAll("{pagina}", "conversa pelo WhatsApp")
      .replaceAll("{imovel_contexto}", await contextoImovel(conv.contexto?.imovel)).replaceAll("{utm}", "{}")
      .replaceAll("{agora}", agoraBR()).replaceAll("{lead}", leadTxt).replaceAll("{saudacao}", "")
      + `\n\n## Agora: retomada\n\nA pessoa parou de responder, provavelmente porque a vida interrompeu. Escreva só o ${passoTxt}. Uma ou duas frases, sem se apresentar de novo, sem "ficou alguma dúvida", sem "lembrete", sem cobrar resposta e sem falar de imposto. Não use ferramentas. Responda apenas com o texto exato da mensagem.`;
    const messages = montarHistorico(hist ?? []);
    if (!messages.length) return padrao;
    if (messages[messages.length - 1].role === "assistant") messages.push({ role: "user", content: "(a pessoa ainda não respondeu)" });
    const resp = await claude(system, messages);
    const texto = (resp.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n\n")
      .replace(/\s*—\s*/g, ", ").trim();
    if (!texto || texto.length > 700 || /ficou alguma d[uú]vida|assistente virtual|ITBI/i.test(texto)) return padrao;
    return texto;
  } catch (e) { console.error("gerar retomada", e); return padrao; }
}

// ------------------------------------------------------------ um turno da IA
/** Runs the model with tools on the conversation history and stores the reply. Shared by site and WhatsApp. */
async function turno(
  ctx: Ctx, conversa: Record<string, any>, ctxIn: Record<string, any>, imagem: { base64: string; mime: string } | null,
) {
  if (ctx.leadId) await sb.from("leads").update({ ultima_atividade: new Date().toISOString() }).eq("id", ctx.leadId);

  const { data: hist } = await sb.from("mensagens").select("papel, conteudo")
    .eq("conversa_id", ctx.conversaId).in("papel", ["usuario", "assistente"])
    .order("criado_em", { ascending: true }).limit(40);

  let leadTxt = "nenhum ainda";
  if (ctx.leadId) {
    const { data: l } = await sb.from("leads").select(CAMPOS_LEAD.join(",") + ",termometro,termometro_faixa").eq("id", ctx.leadId).single();
    const limpo = Object.fromEntries(Object.entries(l ?? {}).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)));
    leadTxt = JSON.stringify(limpo);
  }
  const pagina = ctx.canal === "whatsapp" ? "conversa pelo WhatsApp" : String(ctxIn.pagina ?? conversa.contexto?.pagina ?? "");
  const cfg = await config();
  const extras = String(cfg.chat.instrucoes_extras ?? "").trim().slice(0, 3000);
  const anuncio = ctx.canal === "whatsapp" ? await contextoAnuncio(conversa) : { imovel: null, texto: "" };
  if (anuncio.imovel && !conversa.contexto?.imovel) {
    conversa.contexto = { ...(conversa.contexto ?? {}), imovel: anuncio.imovel };
    await sb.from("conversas").update({ contexto: conversa.contexto }).eq("id", ctx.conversaId);
    if (ctx.leadId) {
      const { data: li } = await sb.from("leads").select("imovel_codigo, imoveis_interesse").eq("id", ctx.leadId).maybeSingle();
      const lista = Array.isArray(li?.imoveis_interesse) ? li!.imoveis_interesse : [];
      await sb.from("leads").update({
        imovel_codigo: li?.imovel_codigo ?? anuncio.imovel,
        imoveis_interesse: lista.includes(anuncio.imovel) ? lista : [...lista, anuncio.imovel],
      }).eq("id", ctx.leadId);
    }
  }
  const system = PROMPT
    .replaceAll("{canal}", ctx.canal === "whatsapp" ? "WhatsApp" : "chat do site")
    .replaceAll("{pagina}", pagina || "não informada")
    .replaceAll("{imovel_contexto}", await contextoImovel(ctxIn.imovel ?? conversa.contexto?.imovel ?? anuncio.imovel ?? undefined))
    .replaceAll("{utm}", JSON.stringify(conversa.contexto?.utm ?? {}))
    .replaceAll("{agora}", agoraBR())
    .replaceAll("{lead}", leadTxt)
    .replaceAll("{saudacao}", String(cfg.chat.saudacao || (ctxIn.saudacao ?? "Oi! Aqui é a Lu, do time do Anderson Costa. Me conta o que você está procurando que eu te ajudo a encontrar.")).replace(/["{}]/g, "").slice(0, 250))
    + (ctx.canal === "whatsapp" ? PROMPT_WHATS.replace("{anuncio_contexto}", anuncio.texto || "nenhum") : "")
    + await horariosConversa(cfg.agenda)
    + (ctxIn.voz && ctx.canal === "whatsapp" ? `\n\n## Resposta em áudio\n\nA pessoa mandou áudio, provavelmente está dirigindo ou sem poder ler. Sua resposta vai virar uma mensagem de voz, então escreva exatamente como uma pessoa fala num áudio de WhatsApp, não como texto lido. Regras: comece com uma reação curta e natural ("Oi! Olha, separei duas opções pra você." ou "Tenho sim, olha só."), e se for a sua primeira resposta na conversa diga logo no começo que é a Lu, do time do Anderson; use linguagem falada do dia a dia (pra, tá, olha, então), frases curtas, sem listas, sem "a primeira é... a segunda é..."; fale no máximo de dois imóveis, só o essencial de cada um (bairro, tipo, quartos e preço arredondado, como "uns novecentos e cinquenta mil"), sem metragem detalhada; um ponto de atenção só se for importante; uns 20 a 30 segundos de fala (no máximo 60 palavras); sem emoji e sem códigos de referência. Pode colocar os links no fim, eles vão por escrito e não serão lidos. Termine com uma pergunta simples que dê para responder por áudio.` : "")
    + (extras ? `\n\n## Orientações extras do Anderson\n\nSiga estas orientações dele, desde que não contrariem as regras acima (honestidade, não inventar, nunca afirmar ser humana, sem travessão):\n${extras}` : "");

  // Mensagens em sequência: a resposta do turno anterior pode ser gravada depois da mensagem que disparou
  // este turno. Sem isso o histórico termina na assistente e a API recusa. A mensagem que chegou por último
  // vai para o fim, porque a resposta anterior não a tinha visto.
  const ordem = [...(hist ?? [])];
  if (ordem.length && ordem[ordem.length - 1].papel === "assistente") {
    let i = ordem.length - 1;
    while (i >= 0 && ordem[i].papel !== "usuario") i--;
    if (i >= 0) ordem.push(...ordem.splice(i, 1));
  }
  const messages: any[] = montarHistorico(ordem);
  if (!messages.length || messages[messages.length - 1].role !== "user") return { resposta: "", blocos: [] as string[], cartoes: [] as unknown[] };
  if (imagem && messages.length && messages[messages.length - 1].role === "user") {
    const ultimo = messages[messages.length - 1];
    ultimo.content = [
      { type: "image", source: { type: "base64", media_type: imagem.mime, data: imagem.base64.split(",").pop() } },
      { type: "text", text: ultimo.content },
    ];
  }
  const partes: string[] = [];
  const trilha: string[] = [];
  for (let rodada = 0; rodada < 6; rodada++) {
    const resp = await claude(system, messages, rodada === 5);
    trilha.push(`${resp.stop_reason}:${(resp.content ?? []).map((b: any) => b.type === "tool_use" ? b.name : b.type).join("+")}`);
    const usos = resp.content.filter((b: any) => b.type === "tool_use");
    // Texto dito antes de usar uma ferramenta ("vou buscar...") não vai para a pessoa
    if (resp.stop_reason !== "tool_use" || !usos.length) {
      for (const b of resp.content) if (b.type === "text" && b.text.trim()) partes.push(b.text.trim());
      break;
    }
    messages.push({ role: "assistant", content: resp.content });
    const resultados = [];
    for (const u of usos) {
      const r = await executar(u.name, u.input ?? {}, ctx);
      await sb.from("mensagens").insert({
        conversa_id: ctx.conversaId, papel: "ferramenta", conteudo: u.name,
        meta: { input: u.input, resultado: r },
      });
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(r) });
    }
    messages.push({ role: "user", content: resultados });
  }

  if (!partes.length) {
    // The model ended without text (or kept calling tools): ask once more for the reply itself, tools off
    console.error("turno sem texto", JSON.stringify(trilha));
    try {
      if (messages[messages.length - 1].role === "assistant") messages.push({ role: "user", content: "(continue: responda à pessoa agora, só com o texto da mensagem)" });
      const resp = await claude(system, messages, true);
      for (const b of resp.content ?? []) if (b.type === "text" && b.text.trim()) partes.push(b.text.trim());
    } catch (e) { console.error("turno retry", e); }
  }
  const resposta = partes.join("\n\n").replace(/\s*—\s*/g, ", ").trim() ||
    "Desculpa, me perdi aqui. Pode repetir o que você procura?";
  await sb.from("mensagens").insert({ conversa_id: ctx.conversaId, papel: "assistente", conteudo: resposta });
  await sb.from("conversas").update({ atualizado_em: new Date().toISOString() }).eq("id", ctx.conversaId);

  const blocos = juntarLinks(resposta.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean));
  let cartoes: unknown[] = blocos.map(() => []);
  try { cartoes = await montarCartoes(blocos); } catch (e) { console.error("cartoes", e); }
  return { resposta, blocos, cartoes };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const url = new URL(req.url);
  // Webhook da Meta: verificação (GET) e eventos (POST com ?canal=whatsapp)
  if (req.method === "GET" && url.searchParams.has("hub.mode")) {
    const ok = VERIFY_TOKEN && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 }) : new Response("negado", { status: 403 });
  }
  if (req.method === "POST" && url.searchParams.get("canal") === "whatsapp") {
    const bruto = await req.text();
    if (!(await assinaturaValida(bruto, req.headers.get("x-hub-signature-256")))) return new Response("assinatura inválida", { status: 401 });
    let payload: Record<string, any>;
    try { payload = JSON.parse(bruto); } catch { return new Response("json inválido", { status: 400 }); }
    // Responde 200 na hora (a Meta reenvia se demorar) e processa em segundo plano
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    const job = processarWebhook(payload).catch((e) => console.error("webhook", e));
    if (rt?.waitUntil) rt.waitUntil(job); else await job;
    return new Response("ok", { status: 200 });
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405, origin);

  let body: Record<string, any>;
  let conversaAtual: string | null = null;
  try { body = await req.json(); } catch { return json({ erro: "json inválido" }, 400, origin); }

  try {
    if (body.acao === "followup_tick") {
      const { data: t } = await sb.from("config").select("valor").eq("chave", "cron").maybeSingle();
      if (!t?.valor?.token || t.valor.token !== body.token) return json({ erro: "negado" }, 403, origin);
      return json(await followupTick(sb, avisarAnderson, gerarRetomada), 200, origin);
    }
    if (body.acao === "simular") {
      // Runs a scripted WhatsApp conversation through the real assistant, sends nothing, and deletes every trace.
      const { data: t } = await sb.from("config").select("valor").eq("chave", "cron").maybeSingle();
      if (!t?.valor?.token || t.valor.token !== body.token) return json({ erro: "negado" }, 403, origin);
      return json(await simularConversa(body), 200, origin);
    }
    if (body.acao === "wa_templates") {
      // Submits or lists WhatsApp message templates. Same cron token as the follow-up tick.
      const { data: t } = await sb.from("config").select("valor").eq("chave", "cron").maybeSingle();
      if (!t?.valor?.token || t.valor.token !== body.token) return json({ erro: "negado" }, 403, origin);
      return json(await gerirTemplates(String(body.waba ?? ""), Array.isArray(body.criar) ? body.criar : []), 200, origin);
    }
    if (body.acao === "indexar") return json({ indexados: await indexar() }, 200, origin);
    if (body.acao === "status") {
      const m = await modelo();
      return json({ modelo: m, openai: !!OPENAI, resend: !!RESEND, capi: !!META_TOKEN }, 200, origin);
    }

    if (body.acao === "limpar") return json({ apagados: await limparAnexos(sb) }, 200, origin);
    if (body.acao === "abandonos") return json({ avisados: await avisarAbandonos() }, 200, origin);
    if (body.acao === "capi") return json(await enviarCapi(body, req), 200, origin);
    // Clique no botão de WhatsApp do site: guarda página, imóvel e campanha pelo código que vai na mensagem
    if (body.acao === "wa_clique") {
      const cod = String(body.codigo ?? "").toUpperCase();
      if (!/^[A-Z2-9]{4}$/.test(cod)) return json({ ok: false }, 200, origin);
      const lim = (v: unknown, n = 300) => (v == null ? null : String(v).slice(0, n));
      const o = (body.origem && typeof body.origem === "object") ? body.origem : {};
      const utm = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "landing"]
        .filter((k) => o[k]).map((k) => [k, lim(o[k], 200)]));
      await sb.from("automacao_log").insert({ evento: "wa_clique", detalhe: { codigo: cod, pagina: lim(body.pagina), imovel: lim(body.imovel, 40), local: lim(body.local, 40), utm } });
      return json({ ok: true }, 200, origin);
    }
    // One-time setup of the Resend sending domain, guarded by a token stored in config
    if (body.acao === "setup_resend") {
      const { data: t } = await sb.from("config").select("valor").eq("chave", "setup").maybeSingle();
      if (!t?.valor?.token || t.valor.token !== body.token) return json({ erro: "negado" }, 403, origin);
      const h = { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" };
      let r: Response;
      if (body.op === "criar") r = await fetch("https://api.resend.com/domains", { method: "POST", headers: h, body: JSON.stringify({ name: String(body.dominio), region: "sa-east-1" }) });
      else if (body.op === "verificar") r = await fetch(`https://api.resend.com/domains/${encodeURIComponent(body.id)}/verify`, { method: "POST", headers: h });
      else if (body.op === "ver") r = await fetch(`https://api.resend.com/domains/${encodeURIComponent(body.id)}`, { headers: h });
      else r = await fetch("https://api.resend.com/domains", { headers: h });
      return json({ http: r.status, resposta: await r.json().catch(() => null) }, 200, origin);
    }
    if (body.acao === "lp_evento") {
      const r = await eventoLp(body, req);
      return json(r, typeof (r as any).status === "number" ? (r as any).status : 200, origin);
    }
    if (body.acao === "config_publica") {
      const { chat } = await config();
      return json({ ativo: chat.ativo, pedir_contato: chat.pedir_contato, saudacao: chat.saudacao }, 200, origin);
    }
    if (body.acao === "horarios") {
      const { agenda: a } = await config();
      const im = await imovelDaVisita(body.imovel);
      return json({
        dias: gerarHorarios(a, await ocupados(a)), duracao_min: a.duracao_min,
        exige_validacao: !!im?.visita_exige_proprietario, imovel: im ? { codigo: im.codigo, titulo: im.titulo } : null,
      }, 200, origin);
    }
    if (body.acao === "agendar") {
      const r = await agendarVisita(body);
      return json(r, (r as any).status && typeof (r as any).status === "number" ? (r as any).status : 200, origin);
    }

    // Cadastro rápido feito na abertura do chat
    if (body.acao === "contato") {
      const nome = String(body.nome ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      const fone = String(body.whatsapp ?? "").replace(/\D/g, "");
      const email = String(body.email ?? "").trim().toLowerCase().slice(0, 120);
      if (nome.length < 2 || fone.length < 10 || fone.length > 13) return json({ erro: "dados inválidos" }, 400, origin);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ erro: "email inválido" }, 400, origin);
      const ipC = await sha((req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconhecido");
      const { count: recentes } = await sb.from("conversas").select("id", { count: "exact", head: true })
        .eq("contexto->>ip", ipC).gte("criado_em", new Date(Date.now() - 3600_000).toISOString());
      if ((recentes ?? 0) >= 10) return json({ erro: "muitas tentativas" }, 429, origin);
      const c = (body.contexto ?? {}) as Record<string, any>;
      const { data: lead, error: e1 } = await sb.from("leads").insert({
        nome, whatsapp: fone.length <= 11 ? "55" + fone : fone, email: email || null, etapa: "novo",
        origem: { ...(c.utm ?? {}), pagina: String(c.pagina ?? "").slice(0, 300), canal: "chat do site" },
      }).select("id").single();
      if (e1) throw e1;
      const { data: conv, error: e2 } = await sb.from("conversas").insert({
        canal: "site", lead_id: lead.id,
        contexto: {
          ip: ipC, pagina: String(c.pagina ?? "").slice(0, 300), imovel: c.imovel ?? null, utm: c.utm ?? {},
          consentimento_contato: new Date().toISOString(),
        },
      }).select("id").single();
      if (e2) throw e2;
      return json({ conversa_id: conv.id }, 200, origin);
    }

    // Lê em voz alta a última resposta, só quando a pessoa falou por áudio
    if (body.acao === "falar") {
      if (!/^[0-9a-f-]{36}$/i.test(String(body.conversa_id ?? ""))) return json({ erro: "conversa inválida" }, 400, origin);
      const { data: ult } = await sb.from("mensagens").select("papel, conteudo, meta")
        .eq("conversa_id", body.conversa_id).in("papel", ["usuario", "assistente"])
        .order("criado_em", { ascending: false }).limit(2);
      const resp = ult?.find((m) => m.papel === "assistente");
      const pergunta = ult?.find((m) => m.papel === "usuario");
      if (!resp || !pergunta?.meta?.audio) return json({ erro: "sem resposta para ler" }, 400, origin);
      const mp3 = await sintetizar(resp.conteudo);
      return new Response(mp3 as BodyInit, { status: 200, headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", ...cors(origin) } });
    }

    let texto = String(body.mensagem ?? "").trim().slice(0, MAX_CHARS);
    let transcricao: string | null = null;
    let audioBytes: Uint8Array | null = null;
    let imagemBytes: Uint8Array | null = null;
    const audioMime = String(body.audio?.mime ?? "audio/webm").slice(0, 60);
    let imagemMime = String(body.imagem?.mime ?? "image/jpeg").slice(0, 40);
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(imagemMime)) imagemMime = "image/jpeg";
    if (body.audio?.base64) {
      audioBytes = base64ParaBytes(String(body.audio.base64));
      if (audioBytes.length > MAX_AUDIO_BYTES) return json({ respostas: ["Esse áudio ficou longo demais para mim. Pode mandar um de até 1 minuto?"] }, 200, origin);
    }
    if (body.imagem?.base64) {
      imagemBytes = base64ParaBytes(String(body.imagem.base64));
      if (imagemBytes.length > MAX_IMAGEM_BYTES) return json({ respostas: ["A foto ficou pesada demais. Pode tentar outra?"] }, 200, origin);
    }
    if (!texto && !audioBytes && !imagemBytes) return json({ erro: "mensagem vazia" }, 400, origin);

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconhecido";
    const ipHash = await sha(ip);
    const { data: usados } = await sb.rpc("msgs_por_ip", {
      p_ip: ipHash, p_desde: new Date(Date.now() - 3600_000).toISOString(),
    });
    if ((usados ?? 0) >= LIMITE_IP_HORA) {
      return json({ respostas: ["Recebi muitas mensagens em pouco tempo. Se quiser, chame o Anderson direto no WhatsApp."], limite: true, handoff: { whatsapp_url: `https://wa.me/${WHATS}` } }, 200, origin);
    }
    if (audioBytes) {
      transcricao = await transcrever(audioBytes, audioMime);
      if (!transcricao) return json({ respostas: ["Não consegui entender o áudio. Pode tentar de novo ou escrever?"], transcricao: "" }, 200, origin);
    }

    // Conversa: reaproveita ou cria
    const ctxIn = (body.contexto ?? {}) as Record<string, any>;
    let conversa: Record<string, any> | null = null;
    if (body.conversa_id && /^[0-9a-f-]{36}$/i.test(body.conversa_id)) {
      const { data } = await sb.from("conversas").select("*").eq("id", body.conversa_id).maybeSingle();
      conversa = data;
    }
    if (!conversa) {
      const { data, error } = await sb.from("conversas").insert({
        canal: "site",
        contexto: {
          ip: ipHash, pagina: String(ctxIn.pagina ?? "").slice(0, 300),
          imovel: ctxIn.imovel ?? null, utm: ctxIn.utm ?? {},
        },
      }).select("*").single();
      if (error) throw error;
      conversa = data;
    }
    conversaAtual = conversa!.id;
    const ctx: Ctx = { canal: "site", conversaId: conversa!.id, leadId: conversa!.lead_id, handoff: null, agenda: null };

    const { count } = await sb.from("mensagens").select("id", { count: "exact", head: true })
      .eq("conversa_id", ctx.conversaId).eq("papel", "usuario");
    if ((count ?? 0) >= LIMITE_CONVERSA) {
      return json({ conversa_id: ctx.conversaId, respostas: ["Essa conversa ficou longa. Para seguir, o melhor é falar direto com o Anderson."], handoff: { whatsapp_url: `https://wa.me/${WHATS}` } }, 200, origin);
    }

    const anexos: string[] = [];
    if (audioBytes) { const c = await guardarAnexo(sb, ctx.conversaId, audioBytes, audioMime); if (c) anexos.push(c); }
    if (imagemBytes) { const c = await guardarAnexo(sb, ctx.conversaId, imagemBytes, imagemMime); if (c) anexos.push(c); }
    const partesUsuario: string[] = [];
    if (imagemBytes) partesUsuario.push("[Foto enviada pela pessoa]");
    if (transcricao) partesUsuario.push(`[Áudio transcrito] ${transcricao}`);
    if (texto) partesUsuario.push(texto);
    texto = partesUsuario.join("\n");
    await sb.from("mensagens").insert({
      conversa_id: ctx.conversaId, papel: "usuario", conteudo: texto,
      meta: { audio: !!audioBytes, imagem: !!imagemBytes, anexos },
    });

    const { blocos, cartoes } = await turno(ctx, conversa!, ctxIn, imagemBytes ? { base64: String(body.imagem.base64), mime: imagemMime } : null);
    return json({
      conversa_id: ctx.conversaId,
      respostas: blocos,
      cartoes,
      handoff: ctx.handoff,
      agenda: ctx.agenda,
      transcricao,
      voz: !!audioBytes,
    }, 200, origin);
  } catch (e) {
    console.error(e);
    return json({
      erro: "falha",
      conversa_id: conversaAtual,
      respostas: ["Tive um problema técnico agora. Se preferir, chame o Anderson direto no WhatsApp."],
      handoff: { whatsapp_url: `https://wa.me/${WHATS}` },
    }, 200, origin);
  }
});
