// Lu como assistente do Anderson no WhatsApp dele.
// - tick (cron a cada 5 min): lembra ligações e tarefas 30 min antes, visitas 1 h antes, manda as perguntas dos clientes
//   que a ficha não responde e envia convite de agenda (.ics) para cada ligação ou visita marcada.
// - dono (chamado pelo atendimento quando a mensagem vem do número do Anderson): se ele responde a uma pergunta,
//   a Lu repassa ao cliente com as palavras dela e guarda a informação no imóvel; "feito" conclui o lembrete;
//   qualquer outra mensagem devolve as pendências do dia.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "";
const GRAPH = `https://graph.facebook.com/${Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v23.0"}`;
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const SITE = "https://andersoncostaimoveis.com.br";
const TZ = "America/Sao_Paulo";
const PADRAO = { ativo: true, numero: "5547989133845", email: "anderson@paixaocosta.com", antecedencia_min: 30, antecedencia_visita_min: 60, silencio_inicio: 21, silencio_fim: 7 };

type Cfg = typeof PADRAO;
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const digitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const semTravessao = (s: string) => s.replace(/[ \t]*[—–][ \t]*/g, ", ");
const hora = (d: string | Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(d));
const dia = (d: string | Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(d));
const horaBr = () => Number(new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date()));
const codigoImovel = (s: string) => s.match(/\b(?:DM|AC)-\d{2,5}\b/i)?.[0]?.toUpperCase() ?? null;
// Parâmetro de modelo do WhatsApp não aceita quebra de linha, tab nem 4+ espaços seguidos
const paramModelo = (s: string) => s.replace(/[\r\n\t]+/g, " · ").replace(/ {4,}/g, " ").slice(0, 900);

async function cfg(): Promise<Cfg> {
  const { data } = await sb.from("config").select("valor").eq("chave", "assistente").maybeSingle();
  return { ...PADRAO, ...(data?.valor ?? {}) };
}
async function tokenOk(t: unknown) {
  const { data } = await sb.from("config").select("valor").eq("chave", "cron").maybeSingle();
  return !!data?.valor?.token && data.valor.token === t;
}
async function log(evento: string, detalhe: Record<string, unknown>, leadId: string | null = null) {
  await sb.from("automacao_log").insert({ evento, detalhe, lead_id: leadId });
}
async function jaFeito(evento: string, chave: string, valor: string) {
  const { data } = await sb.from("automacao_log").select("id").eq("evento", evento).eq(`detalhe->>${chave}`, valor).limit(1);
  return !!data?.length;
}
// Para mensagens ao Anderson: pula se já foi entregue; se falhou, tenta de novo a cada hora (até 6 vezes).
async function tentativas(evento: string, chave: string, valor: string) {
  const { data } = await sb.from("automacao_log").select("detalhe, criado_em").eq("evento", evento).eq(`detalhe->>${chave}`, valor).order("criado_em", { ascending: false }).limit(10);
  const l = data ?? [];
  if (l.some((x: any) => x.detalhe?.ok)) return { pular: true, n: l.length };
  if (l.length >= 6 || (l[0] && Date.now() - Date.parse(l[0].criado_em) < 55 * 6e4)) return { pular: true, n: l.length };
  return { pular: false, n: l.length };
}

// ------------------------------------------------------------------ WhatsApp
async function wa(para: string, conteudo: Record<string, unknown>) {
  if (!TOKEN || !PHONE_ID) return { ok: false, erro: "whatsapp nao configurado" };
  const r = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: digitos(para), ...conteudo }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, erro: String(j?.error?.message ?? `http ${r.status}`), codigo: j?.error?.code };
  return { ok: true, wamid: String(j?.messages?.[0]?.id ?? "") };
}
async function janelaDonoAberta() {
  const { data } = await sb.from("automacao_log").select("criado_em").eq("evento", "assist_entrada").order("criado_em", { ascending: false }).limit(1);
  return !!data?.[0] && Date.now() - Date.parse(data[0].criado_em) < 23.5 * 36e5;
}
// Mensagem para o Anderson: texto livre dentro da janela de 24 h; fora dela, modelo aprovado; se nada der, e-mail e aviso no app.
async function paraAnderson(c: Cfg, texto: string, modelo: "lu_lembrete" | "lu_pergunta", resumoModelo: string, primeira = true) {
  texto = semTravessao(texto);
  let r = { ok: false, erro: "" } as { ok: boolean; wamid?: string; erro?: string; codigo?: number };
  if (await janelaDonoAberta()) r = await wa(c.numero, { type: "text", text: { body: texto, preview_url: false } });
  if (!r.ok) {
    r = await wa(c.numero, { type: "template", template: { name: modelo, language: { code: "pt_BR" }, components: [{ type: "body", parameters: [{ type: "text", text: paramModelo(resumoModelo) }] }] } });
  }
  if (!r.ok && primeira) {
    await sb.from("notificacoes").insert({ titulo: "Lu: " + resumoModelo.slice(0, 70), corpo: texto.slice(0, 160), url: "/admin/?aba=tarefas" }).then(() => {}, () => {});
    await email(c.email, "Lu: " + resumoModelo.slice(0, 90), `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${esc(texto)}</pre>`);
  }
  return r;
}

// ------------------------------------------------------------------ e-mail e agenda
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
async function email(para: string, assunto: string, html: string, ics?: string) {
  if (!RESEND) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Lu, assistente do Anderson <onboarding@resend.dev>", to: [para], subject: assunto, html,
      ...(ics ? { attachments: [{ filename: "convite.ics", content: btoa(unescape(encodeURIComponent(ics))), content_type: "text/calendar; method=REQUEST; charset=UTF-8" }] } : {}),
    }),
  });
  return r.ok;
}
const icsTxt = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsData = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
function dobrar(l: string) { const o: string[] = []; let s = l; while (s.length > 74) { o.push(s.slice(0, 74)); s = " " + s.slice(74); } o.push(s); return o.join("\r\n"); }
function montarIcs(o: { uid: string; ini: number; fim: number; titulo: string; descricao: string; email: string; alarmeMin: number }) {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Anderson Costa Imoveis//Lu//PT-BR", "CALSCALE:GREGORIAN", "METHOD:REQUEST",
    "BEGIN:VEVENT", `UID:${o.uid}`, `DTSTAMP:${icsData(Date.now())}`, `DTSTART:${icsData(o.ini)}`, `DTEND:${icsData(o.fim)}`,
    `SUMMARY:${icsTxt(o.titulo)}`, `DESCRIPTION:${icsTxt(o.descricao)}`,
    `ORGANIZER;CN=Lu (assistente):mailto:onboarding@resend.dev`,
    `ATTENDEE;CN=Anderson Costa;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${o.email}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsTxt(o.titulo)}`, `TRIGGER:-PT${o.alarmeMin}M`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].map(dobrar).join("\r\n");
}

// ------------------------------------------------------------------ contexto do lead
async function contextoLead(leadId: string | null) {
  if (!leadId) return { lead: null, conversa: null } as { lead: any; conversa: any };
  const { data: lead } = await sb.from("leads").select("id, nome, whatsapp, etapa, pontuacao, imoveis_interesse").eq("id", leadId).maybeSingle();
  const { data: cs } = await sb.from("conversas").select("id, resumo, contexto, status").eq("lead_id", leadId).order("atualizado_em", { ascending: false }).limit(1);
  return { lead, conversa: cs?.[0] ?? null };
}
function linhasLead(lead: any, conversa: any) {
  const out: string[] = [];
  if (conversa?.resumo) out.push(String(conversa.resumo).replace(/\s+/g, " ").slice(0, 420));
  if (lead?.whatsapp) out.push(`WhatsApp do cliente: https://wa.me/${digitos(lead.whatsapp)}`);
  return out;
}

// ------------------------------------------------------------------ tick
async function tick() {
  const c = await cfg();
  if (!c.ativo) return { ativo: false };
  const agora = Date.now();
  const feito = { lembretes: 0, visitas: 0, perguntas: 0, convites: 0, erros: [] as string[] };

  // 1) Lembrete de tarefa com horário (ligar, WhatsApp combinado, reunião), 30 min antes
  const ate = new Date(agora + (c.antecedencia_min + 5) * 6e4).toISOString();
  const { data: ts } = await sb.from("tarefas").select("id, titulo, descricao, tipo, vence_em, negocio_id, origem")
    .is("concluida_em", null).gte("vence_em", new Date(agora - 5 * 6e4).toISOString()).lte("vence_em", ate)
    .not("origem", "like", "pente_fino%").not("origem", "like", "lu-pedido-%").limit(20);
  for (const t of ts ?? []) {
    const tt = await tentativas("assist_lembrete", "tarefa_id", t.id);
    if (tt.pular) continue;
    const { lead, conversa } = await contextoLead(t.negocio_id);
    const min = Math.max(0, Math.round((Date.parse(t.vence_em) - agora) / 6e4));
    const texto = [`Lembrete da Lu: em ${min} min (${hora(t.vence_em)}), ${t.titulo}.`, ...linhasLead(lead, conversa), "", 'Quando terminar, responda "feito" nesta mensagem que eu tiro da sua lista.'].join("\n");
    const r = await paraAnderson(c, texto, "lu_lembrete", `${hora(t.vence_em)}, ${t.titulo}`, tt.n === 0);
    await log("assist_lembrete", { tarefa_id: t.id, wamid: r.wamid ?? null, ok: r.ok, erro: r.erro ?? null }, t.negocio_id);
    r.ok ? feito.lembretes++ : feito.erros.push(`lembrete ${t.id}: ${r.erro}`);
  }

  // 2) Visita confirmada, 1 h antes
  const ateV = new Date(agora + (c.antecedencia_visita_min + 5) * 6e4).toISOString();
  const { data: vs } = await sb.from("visitas").select("id, lead_id, imovel_codigo, inicio, status, observacoes")
    .in("status", ["confirmada", "solicitada"]).gte("inicio", new Date(agora - 5 * 6e4).toISOString()).lte("inicio", ateV).limit(10);
  for (const v of vs ?? []) {
    const tt = await tentativas("assist_visita", "visita_id", v.id);
    if (tt.pular) continue;
    const { lead, conversa } = await contextoLead(v.lead_id);
    const im = v.imovel_codigo ? (await sb.from("imoveis").select("titulo, slug").eq("codigo", v.imovel_codigo).maybeSingle()).data : null;
    const texto = [`Lembrete da Lu: visita às ${hora(v.inicio)} com ${lead?.nome ?? "o cliente"}${v.imovel_codigo ? ` no ${v.imovel_codigo}` : ""}${v.status === "solicitada" ? " (ainda não confirmada)" : ""}.`,
      ...(im ? [`${im.titulo}: ${SITE}/imovel/${im.slug}/`] : []), ...linhasLead(lead, conversa)].join("\n");
    const r = await paraAnderson(c, texto, "lu_lembrete", `visita às ${hora(v.inicio)} com ${lead?.nome ?? "cliente"}${v.imovel_codigo ? ` no ${v.imovel_codigo}` : ""}`, tt.n === 0);
    await log("assist_visita", { visita_id: v.id, wamid: r.wamid ?? null, ok: r.ok }, v.lead_id);
    r.ok ? feito.visitas++ : feito.erros.push(`visita ${v.id}: ${r.erro}`);
  }

  // 3) Perguntas que só o Anderson responde (tarefas lu-pedido), fora do horário de silêncio
  const h = horaBr();
  if (h >= c.silencio_fim && h < c.silencio_inicio) {
    const { data: ps } = await sb.from("tarefas").select("id, titulo, descricao, negocio_id, origem, imovel_codigo, criado_em")
      .is("concluida_em", null).like("origem", "lu-pedido-%").gte("criado_em", new Date(agora - 36 * 36e5).toISOString()).order("criado_em").limit(5);
    for (const p of ps ?? []) {
      const tt = await tentativas("assist_pergunta", "tarefa_id", p.id);
    if (tt.pular) continue;
      const { lead } = await contextoLead(p.negocio_id);
      const pedido = String(p.descricao || p.titulo).replace(/^Enviar para [^:]+:\s*/i, "").replace(/\s+/g, " ").slice(0, 500);
      const texto = [`Pergunta de cliente (${lead?.nome ?? "lead"}): ${pedido}`, "", "Responda esta mensagem (toque e segure, depois Responder) com a informação. Eu repasso para o cliente com as minhas palavras e guardo no imóvel para as próximas vezes."].join("\n");
      const r = await paraAnderson(c, texto, "lu_pergunta", `${lead?.nome ?? "Cliente"}: ${pedido}`, tt.n === 0);
      await log("assist_pergunta", { tarefa_id: p.id, conversa_id: String(p.origem).replace("lu-pedido-", ""), lead_id: p.negocio_id, wamid: r.wamid ?? null, ok: r.ok, pedido }, p.negocio_id);
      r.ok ? feito.perguntas++ : feito.erros.push(`pergunta ${p.id}: ${r.erro}`);
    }
  }

  // 4) Convite de agenda para cada ligação/reunião marcada e cada visita
  const { data: novas } = await sb.from("tarefas").select("id, titulo, descricao, tipo, vence_em, negocio_id")
    .is("concluida_em", null).in("tipo", ["ligar", "reuniao", "visita"]).gte("vence_em", new Date(agora).toISOString()).limit(20);
  const { data: novasV } = await sb.from("visitas").select("id, lead_id, imovel_codigo, inicio, fim, status").in("status", ["confirmada", "solicitada"]).gte("inicio", new Date(agora).toISOString()).limit(20);
  const itens = [
    ...(novas ?? []).map((t) => ({ chave: `t-${t.id}`, ini: Date.parse(t.vence_em), fim: Date.parse(t.vence_em) + 15 * 6e4, titulo: t.titulo, lead: t.negocio_id, extra: t.descricao ?? "" })),
    ...(novasV ?? []).map((v) => ({ chave: `v-${v.id}`, ini: Date.parse(v.inicio), fim: v.fim ? Date.parse(v.fim) : Date.parse(v.inicio) + 60 * 6e4, titulo: `Visita${v.imovel_codigo ? ` ${v.imovel_codigo}` : ""}`, lead: v.lead_id, extra: v.status === "solicitada" ? "Ainda não confirmada." : "" })),
  ];
  for (const it of itens) {
    if (await jaFeito("assist_agenda", "chave", it.chave)) continue;
    const { lead, conversa } = await contextoLead(it.lead);
    const titulo = it.chave.startsWith("v-") && lead?.nome ? `${it.titulo} com ${lead.nome}` : it.titulo;
    const descricao = [it.extra, ...linhasLead(lead, conversa), `Painel: ${SITE}/admin/`].filter(Boolean).join("\n");
    const ics = montarIcs({ uid: `lu-${it.chave}@andersoncostaimoveis.com.br`, ini: it.ini, fim: it.fim, titulo, descricao, email: c.email, alarmeMin: it.chave.startsWith("v-") ? 60 : 30 });
    const ok = await email(c.email, `Agenda: ${titulo} · ${dia(new Date(it.ini))} ${hora(new Date(it.ini))}`, `<p>${esc(titulo)}</p><p>${esc(descricao).replace(/\n/g, "<br>")}</p>`, ics);
    await log("assist_agenda", { chave: it.chave, ok }, it.lead);
    ok ? feito.convites++ : feito.erros.push(`agenda ${it.chave}`);
  }
  return feito;
}

// ------------------------------------------------------------------ mensagens do Anderson para a Lu
let MODELO = Deno.env.get("CLAUDE_MODEL") ?? "";
async function modelo() {
  if (MODELO) return MODELO;
  const r = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01" } });
  const ids: string[] = ((await r.json()).data ?? []).map((m: { id: string }) => m.id);
  MODELO = ids.find((i) => i.includes("sonnet")) ?? ids[0];
  return MODELO;
}
async function redigirResposta(pedido: string, resposta: string, historico: string, nome: string, codigo: string | null) {
  const ferramenta = {
    name: "resposta", description: "Mensagem da Lu para o cliente e a informação a guardar no imóvel.",
    input_schema: { type: "object", required: ["mensagem"], properties: {
      mensagem: { type: "string", description: "Mensagem curta de WhatsApp da Lu para o cliente, em 1 a 3 frases, com a informação que o Anderson passou e um convite para o próximo passo com o Anderson (visita ou conversa). Comece retomando o assunto, sem cumprimento longo." },
      fato: { type: "string", description: "A informação objetiva sobre o imóvel, para guardar e responder outros clientes (ex.: Terreno de 300 m²). Vazio se a resposta for só sobre este cliente." },
      titulo_fato: { type: "string", description: "Título curto do fato (ex.: tamanho do terreno)." },
    } },
  };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: await modelo(), max_tokens: 700, tools: [ferramenta], tool_choice: { type: "tool", name: "resposta" },
      system: "Você é a Lu, assistente do corretor Anderson Costa (Jaraguá do Sul). Um cliente perguntou algo que não estava na ficha; o Anderson respondeu para você. Escreva a mensagem para o cliente usando só o que o Anderson disse, sem inventar nada. Português do Brasil, tom próximo, frases curtas, sem travessão, sem emoji, sem listas. Fale do imóvel pelo lado positivo e leve para a conversa ou visita com o Anderson.",
      messages: [{ role: "user", content: `Cliente: ${nome}\nImóvel: ${codigo ?? "não identificado"}\nO que o cliente queria saber: ${pedido}\nResposta do Anderson: ${resposta}\n\nÚltimas mensagens da conversa:\n${historico}` }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("IA indisponível: " + String(j?.error?.message ?? r.status));
  const t = j.content?.find((b: any) => b.type === "tool_use")?.input ?? {};
  return { mensagem: semTravessao(String(t.mensagem ?? "")).trim(), fato: semTravessao(String(t.fato ?? "")).trim(), titulo_fato: String(t.titulo_fato ?? "").trim() };
}
async function pendenciasHoje() {
  const fimDia = new Date(); fimDia.setUTCHours(26, 59, 0, 0); // ~23:59 no horário de Brasília
  const { data: ts } = await sb.from("tarefas").select("titulo, vence_em").is("concluida_em", null).lte("vence_em", fimDia.toISOString()).not("origem", "like", "pente_fino%").order("vence_em").limit(12);
  const { data: vs } = await sb.from("visitas").select("inicio, imovel_codigo, lead_id").in("status", ["confirmada", "solicitada"]).gte("inicio", new Date().toISOString()).lte("inicio", fimDia.toISOString()).order("inicio");
  const l: string[] = [];
  for (const v of vs ?? []) { const { lead } = await contextoLead(v.lead_id); l.push(`${hora(v.inicio)} visita ${v.imovel_codigo ?? ""} com ${lead?.nome ?? "cliente"}`); }
  for (const t of ts ?? []) l.push(`${Date.parse(t.vence_em) < Date.now() - 36e5 ? "atrasada" : hora(t.vence_em)} ${t.titulo}`);
  return l.length ? `Sua lista de hoje:\n${l.map((x) => "- " + x).join("\n")}` : "Nada pendente para hoje. Bom trabalho!";
}

async function dono(m: any) {
  const c = await cfg();
  if (m?.id && (await jaFeito("assist_entrada", "wamid", String(m.id)))) return { ok: true, repetida: true };
  await log("assist_entrada", { wamid: m?.id ?? null, tipo: m?.type ?? null });
  if (m?.id) await fetch(`${GRAPH}/${PHONE_ID}/messages`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: m.id }) }).catch(() => {});
  const texto = String(m?.text?.body ?? m?.button?.text ?? "").trim();
  const ref = String(m?.context?.id ?? "");
  const responder = (t: string) => wa(c.numero, { type: "text", text: { body: semTravessao(t), preview_url: false } });

  if (ref) {
    // Resposta a uma pergunta de cliente
    const { data: pq } = await sb.from("automacao_log").select("detalhe").eq("evento", "assist_pergunta").eq("detalhe->>wamid", ref).limit(1);
    const p = pq?.[0]?.detalhe as any;
    if (p) {
      if (!texto) { await responder("Me manda a resposta em texto, por favor, que eu repasso para o cliente."); return { ok: true }; }
      const { data: t } = await sb.from("tarefas").select("id, titulo, descricao, imovel_codigo, concluida_em").eq("id", p.tarefa_id).maybeSingle();
      const { lead, conversa } = await contextoLead(p.lead_id);
      const { data: msgs } = await sb.from("mensagens").select("papel, conteudo, criado_em").eq("conversa_id", p.conversa_id).in("papel", ["usuario", "assistente", "anderson"]).order("criado_em", { ascending: false }).limit(12);
      const hist = (msgs ?? []).reverse().map((x: any) => `${x.papel === "usuario" ? "Cliente" : "Lu"}: ${String(x.conteudo).slice(0, 300)}`).join("\n");
      const codigo = t?.imovel_codigo ?? codigoImovel(`${p.pedido} ${t?.titulo ?? ""}`) ?? (conversa?.contexto?.imovel ?? null);
      const red = await redigirResposta(p.pedido, texto, hist, lead?.nome ?? "cliente", codigo);
      const ultUsuario = (msgs ?? []).find((x: any) => x.papel === "usuario");
      const janelaCliente = ultUsuario && Date.now() - Date.parse(ultUsuario.criado_em) < 23.5 * 36e5;
      let enviado = false;
      if (lead?.whatsapp && janelaCliente && conversa?.status !== "anderson" && red.mensagem) {
        const r = await wa(lead.whatsapp, { type: "text", text: { body: red.mensagem, preview_url: false } });
        if (r.ok) {
          enviado = true;
          await sb.from("mensagens").insert({ conversa_id: p.conversa_id, papel: "assistente", conteudo: red.mensagem, meta: { wamid: r.wamid, origem: "resposta_anderson" } });
          await sb.from("automacao_log").insert({ lead_id: p.lead_id, evento: "wa_saida", detalhe: {} });
        }
      }
      if (t && !t.concluida_em && enviado) await sb.from("tarefas").update({ concluida_em: new Date().toISOString() }).eq("id", t.id);
      let guardado = "";
      if (red.fato && codigo) {
        await sb.from("conhecimento").insert({ tema: `imovel:${codigo}`, titulo: `${codigo}: ${red.titulo_fato || "informação do Anderson"}`, conteudo: red.fato, fonte: "Anderson pelo WhatsApp", revisado_em: new Date().toISOString().slice(0, 10) });
        guardado = `\nGuardei no ${codigo}: ${red.fato}`;
      }
      await log("assist_resposta", { tarefa_id: p.tarefa_id, enviado, codigo, fato: red.fato || null }, p.lead_id);
      await responder(enviado
        ? `Mandei para ${lead?.nome ?? "o cliente"}: "${red.mensagem}"${guardado}`
        : `Não consegui mandar pelo número da Lu (a conversa ${conversa?.status === "anderson" ? "está com você" : "passou de 24 h sem o cliente escrever"}). Sugestão de texto para você mandar:\n"${red.mensagem}"\n${lead?.whatsapp ? `https://wa.me/${digitos(lead.whatsapp)}` : ""}${guardado}`);
      return { ok: true, enviado };
    }
    // Resposta a um lembrete
    const { data: lb } = await sb.from("automacao_log").select("detalhe").eq("evento", "assist_lembrete").eq("detalhe->>wamid", ref).limit(1);
    const tl = (lb?.[0]?.detalhe as any)?.tarefa_id;
    if (tl && /\b(feito|feita|ok|pronto|liguei|conclu|resolvid|falei)/i.test(texto)) {
      await sb.from("tarefas").update({ concluida_em: new Date().toISOString() }).eq("id", tl);
      await responder("Anotado, tirei da sua lista.");
      return { ok: true };
    }
  }
  await responder(await pendenciasHoje() + '\n\nPara eu concluir um lembrete, responda "feito" em cima dele. Para responder um cliente, responda em cima da pergunta.');
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true });
  const body = await req.json().catch(() => ({}));
  if (!(await tokenOk(body.token))) return json({ erro: "negado" }, 403);
  try {
    if (body.acao === "tick") return json(await tick());
    if (body.acao === "dono") return json(await dono(body.m));
    if (body.acao === "pendencias") return json({ texto: await pendenciasHoje() });
    return json({ erro: "acao desconhecida" }, 400);
  } catch (e) {
    console.error("assistente", e);
    return json({ erro: String((e as Error)?.message ?? e) }, 500);
  }
});
