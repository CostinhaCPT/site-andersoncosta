// Admin helper: writes listing copy from the facts Anderson types in the admin.
// Requires a logged-in admin (checked with public.eh_admin()).
import { createClient } from "npm:@supabase/supabase-js@2";
import { AGENDA_PADRAO, type Agenda, enviarEmail, montarIcs, remetente, rotuloCompleto } from "./agenda.ts";
import { enviarTexto, waConfigurado } from "./whatsapp.ts";

const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SITE = "https://andersoncostaimoveis.com.br";

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
- Use somente os fatos enviados. Nunca invente metragem, distância, material, vista, sol, ano, reforma, marca, escola ou vizinhança. Se um fato não veio, não escreva sobre ele.
- Nunca use travessão (o traço longo). Use vírgula, ponto, dois-pontos ou parênteses.
- Sem clichês: imperdível, oportunidade única, no coração de, sofisticação e conforto, mais que uma casa, um estilo de vida, sonho, maravilhoso, espetacular, Imagine. Sem exclamação. Sem emoji.
- Fatos vencem adjetivos. Transforme característica em benefício concreto, deixando o fato visível.
- Português do Brasil, frases curtas, tom sereno de quem conhece o imóvel.

Campos:
- titulo: tipo + diferencial concreto + bairro, até 70 caracteres. Ex.: "Casa térrea com quintal de 300 m² no Amizade". Sem preço, sem código.
- resumo: uma frase de até 110 caracteres dizendo o que o imóvel tem de mais útil para quem vai morar.
- descricao: 2 ou 3 parágrafos curtos separados por linha em branco. Primeiro parágrafo: o que mais importa no dia a dia. Depois os fatos (áreas, cômodos, vagas, lazer, diferenciais). Não repita preço.
- destaques: 3 a 5 itens de até 6 palavras cada, cada um um fato.
- atencao: pontos de atenção honestos. Use os que vieram nas notas e os que decorrem diretamente dos fatos (geminado divide parede com o vizinho; apartamento sem elevador; vaga descoberta). Se não houver nenhum fundamentado, devolva lista vazia. Nunca invente defeito.
- perfil_ideal: uma frase sobre para quem o imóvel faz sentido, baseada nos fatos.
- faltam: lista curta de dados que melhorariam o texto e que o Anderson deveria confirmar com o proprietário (ex.: posição solar, ano de construção, valor do condomínio).`;

const FERRAMENTA = {
  name: "textos_imovel",
  description: "Devolve os textos da página do imóvel.",
  input_schema: {
    type: "object",
    properties: {
      titulo: { type: "string" }, resumo: { type: "string" }, descricao: { type: "string" },
      destaques: { type: "array", items: { type: "string" } }, atencao: { type: "array", items: { type: "string" } },
      perfil_ideal: { type: "string" }, faltam: { type: "array", items: { type: "string" } },
    },
    required: ["titulo", "resumo", "descricao", "destaques", "atencao", "perfil_ideal", "faltam"],
  },
};

const limpar = (s: string) => String(s ?? "").replace(/\s*[—–]\s*/g, ", ").replace(/!/g, ".").trim();

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405, origin);

  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: admin } = await sb.rpc("eh_admin");
  if (admin !== true) return json({ erro: "acesso negado" }, 403, origin);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ erro: "json inválido" }, 400, origin); }
  if (body.acao === "lp") {
    try { return json(await montarLp(sb, body), 200, origin); } catch (e) { console.error("lp", e); return json({ erro: String((e as Error).message ?? e) }, 500, origin); }
  }
  if (body.acao === "wa_enviar") {
    try { return json(await waEnviar(body), 200, origin); } catch (e) { console.error("wa", e); return json({ erro: String((e as Error).message ?? e) }, 500, origin); }
  }
  if (body.acao === "wa_status") return json({ configurado: waConfigurado() }, 200, origin);
  if (body.acao === "visita") {
    try { return json(await acaoVisita(sb, body), 200, origin); } catch (e) { console.error("visita", e); return json({ erro: String((e as Error).message ?? e) }, 500, origin); }
  }
  const f = (body.ficha ?? {}) as Record<string, unknown>;
  const fatos = Object.entries(f).filter(([, v]) => v !== null && v !== "" && v !== undefined && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("; ") : v}`).join("\n");
  const notas = String(body.notas ?? "").slice(0, 4000);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: await modelo(), max_tokens: 1500, system: REGRAS, tools: [FERRAMENTA], tool_choice: { type: "tool", name: "textos_imovel" },
      messages: [{ role: "user", content: `Ficha do imóvel:\n${fatos}\n\nNotas do Anderson (fatos, fala do proprietário, pontos de atenção):\n${notas || "nenhuma"}` }],
    }),
  });
  const j = await r.json();
  if (!r.ok) { console.error("anthropic", JSON.stringify(j).slice(0, 300)); return json({ erro: "falha na IA" }, 502, origin); }
  const t = j.content?.find((b: any) => b.type === "tool_use")?.input ?? {};
  return json({
    titulo: limpar(t.titulo).slice(0, 90), resumo: limpar(t.resumo), descricao: limpar(t.descricao),
    destaques: (t.destaques ?? []).map(limpar).filter(Boolean), atencao: (t.atencao ?? []).map(limpar).filter(Boolean),
    perfil_ideal: limpar(t.perfil_ideal), faltam: (t.faltam ?? []).map(limpar).filter(Boolean),
  }, 200, origin);
});

// ------------------------------------------------------------------ visitas
const foneBR = (w: string) => String(w || "").replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** op: confirmar | recusar | cancelar | realizada | avisar (resend invites). Optional novo_inicio reschedules. */
async function acaoVisita(sb: any, body: Record<string, any>) {
  const { data: cfg } = await sb.from("config").select("valor").eq("chave", "agenda").maybeSingle();
  const a: Agenda = { ...AGENDA_PADRAO, ...(cfg?.valor ?? {}) };
  const { data: v, error } = await sb.from("visitas").select("*").eq("id", body.id).single();
  if (error || !v) throw new Error("visita não encontrada");
  const { data: lead } = v.lead_id ? await sb.from("leads").select("id, nome, whatsapp, email, etapa").eq("id", v.lead_id).single() : { data: null };
  const { data: im } = v.imovel_codigo ? await sb.from("imoveis").select("codigo, titulo, bairro, cidade").eq("codigo", v.imovel_codigo).maybeSingle() : { data: null };

  const op = String(body.op);
  const upd: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  let ini = Date.parse(v.inicio), fim = Date.parse(v.fim);
  if (body.novo_inicio) {
    const n = Date.parse(body.novo_inicio);
    if (!Number.isFinite(n)) throw new Error("data inválida");
    fim = n + (fim - ini); ini = n;
    upd.inicio = new Date(ini).toISOString(); upd.fim = new Date(fim).toISOString();
  }
  if (op === "confirmar") { upd.status = "confirmada"; upd.confirmada_em = new Date().toISOString(); }
  else if (op === "recusar") upd.status = "recusada";
  else if (op === "cancelar") upd.status = "cancelada";
  else if (op === "realizada") upd.status = "realizada";
  else if (op !== "avisar") throw new Error("operação inválida");
  const { error: e2 } = await sb.from("visitas").update(upd).eq("id", v.id);
  if (e2) throw e2;
  if (lead && op === "confirmar" && ["novo", "em_conversa", "qualificado", "curadoria_enviada"].includes(lead.etapa ?? "novo")) {
    await sb.from("leads").update({ etapa: "visita_agendada", atualizado_em: new Date().toISOString() }).eq("id", lead.id);
  }
  if (lead && op === "realizada" && ["novo", "em_conversa", "qualificado", "curadoria_enviada", "visita_agendada"].includes(lead.etapa ?? "novo")) {
    await sb.from("leads").update({ etapa: "visita_realizada", atualizado_em: new Date().toISOString() }).eq("id", lead.id);
  }

  const quando = rotuloCompleto(ini);
  const primeiro = String(lead?.nome ?? "").split(" ")[0];
  const qual = im ? `${im.titulo} (${im.codigo})` : "";
  const textos: Record<string, string> = {
    confirmar: `Oi, ${primeiro}! Aqui é o Anderson Costa. Sua visita está confirmada para ${quando}${im ? `, no imóvel ${im.codigo}` : ""}. Te passo o endereço por aqui. Qualquer imprevisto, me avise.`,
    avisar: `Oi, ${primeiro}! Aqui é o Anderson Costa. Lembrando da nossa visita ${quando}${im ? `, imóvel ${im.codigo}` : ""}. Segue de pé?`,
    recusar: `Oi, ${primeiro}! Aqui é o Anderson Costa. Sobre a visita que você pediu para ${quando}: nesse horário não vou conseguir. Pode ser em outro dia ou horário? Me diga o que fica melhor para você.`,
    cancelar: `Oi, ${primeiro}! Aqui é o Anderson Costa. Precisei cancelar nossa visita de ${quando}. Me desculpe pelo transtorno. Podemos remarcar?`,
    realizada: `Oi, ${primeiro}! Obrigado pela visita${im ? ` ao imóvel ${im.codigo}` : ""}. O que você e sua família acharam?`,
  };
  const msg = textos[op] ?? "";
  const whatsapp_url = lead?.whatsapp && msg ? `https://wa.me/${lead.whatsapp}?text=${encodeURIComponent(msg)}` : null;

  // Invites: Anderson always; the lead only when a verified sender exists
  let emails = 0;
  if (["confirmar", "avisar", "cancelar"].includes(op) && (op !== "avisar" || v.status === "confirmada" || upd.status === "confirmada")) {
    const cancelar = op === "cancelar";
    const seq = Math.floor(Date.now() / 1000) - 1767225600; // monotonic sequence
    const base = { uid: `visita-${v.id}@andersoncostaimoveis.com.br`, ini, fim, cancelar, sequencia: seq, local: im ? `${im.bairro ?? ""}, ${im.cidade ?? ""}` : undefined };
    const icsA = montarIcs({ ...base, titulo: `Visita ${im?.codigo ?? ""} · ${lead?.nome ?? ""}`.trim(), descricao: `${qual}\nLead: ${lead?.nome ?? ""} ${foneBR(lead?.whatsapp ?? "")}\n${v.observacoes ?? ""}`, organizador: a.remetente || a.email_avisos, convidados: [{ email: a.email_avisos, nome: "Anderson Costa" }] });
    if (await enviarEmail({ de: remetente(a), para: [a.email_avisos], assunto: `${cancelar ? "Cancelada" : "Visita"} · ${quando} · ${lead?.nome ?? ""}`, html: `<p>${cancelar ? "Visita cancelada" : "Visita confirmada"}: <b>${esc(quando)}</b>${qual ? ` · ${esc(qual)}` : ""} · ${esc(lead?.nome ?? "")} ${esc(foneBR(lead?.whatsapp ?? ""))}</p>${whatsapp_url ? `<p><a href="${whatsapp_url}">Mandar mensagem no WhatsApp</a></p>` : ""}`, ics: icsA })) emails++;
    if (a.remetente && lead?.email) {
      const icsL = montarIcs({ ...base, titulo: `Visita com Anderson Costa${im ? ` · ${im.codigo}` : ""}`, descricao: `${qual}\nAnderson Costa, CRECI SC 68594, (47) 98913-3845`, organizador: a.remetente, convidados: [{ email: lead.email, nome: lead.nome }] });
      if (await enviarEmail({ de: remetente(a), para: [lead.email], responder: a.email_avisos, assunto: cancelar ? `Visita cancelada · ${quando}` : `Visita confirmada · ${quando}`, html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:560px"><p>Oi, ${esc(primeiro)}.</p><p>${cancelar ? "Sua visita de" : "Sua visita com o Anderson Costa está confirmada para"} <b>${esc(quando)}</b>${cancelar ? " foi cancelada. O Anderson fala com você para remarcar." : im ? `, no imóvel ${esc(im.titulo)}.` : "."}</p>${cancelar ? "" : "<p>O endereço chega pelo WhatsApp. O convite em anexo coloca a visita na sua agenda.</p>"}<p>Anderson Costa · CRECI SC 68594<br>(47) 98913-3845</p></div>`, ics: icsL })) emails++;
    }
  }
  return { ok: true, whatsapp_url, emails, mensagem: msg };
}

// ------------------------------------------------------------- landing pages
const TIPOS_BLOCO = ["imoveis", "imovel_destaque", "analise", "texto", "lista", "metodo", "sobre", "faq", "formulario", "cta"];
const FERRAMENTA_LP = {
  name: "montar_lp",
  description: "Devolve a estrutura e os textos da landing page.",
  input_schema: {
    type: "object",
    properties: {
      nome_interno: { type: "string", description: "Nome curto para o Anderson identificar a página no admin" },
      hero: {
        type: "object",
        properties: {
          eyebrow: { type: "string" }, titulo: { type: "string" }, subtitulo: { type: "string" }, cta_texto: { type: "string" },
          cta_acao: { type: "string", enum: ["rolar", "formulario", "whatsapp"] },
        },
        required: ["titulo", "subtitulo", "cta_texto", "cta_acao"],
      },
      blocos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tipo: { type: "string", enum: TIPOS_BLOCO },
            titulo: { type: "string" }, texto: { type: "string" }, intro: { type: "string" },
            pontos: { type: "array", items: { type: "string" } },
            perguntas: { type: "array", items: { type: "object", properties: { p: { type: "string" }, r: { type: "string" } }, required: ["p", "r"] } },
            imoveis: { type: "array", items: { type: "object", properties: { codigo: { type: "string" }, porque: { type: "string" }, atencao: { type: "string" } }, required: ["codigo", "porque"] } },
            codigo: { type: "string" }, botao: { type: "string" }, mensagem: { type: "string" },
          },
          required: ["tipo"],
        },
      },
    },
    required: ["nome_interno", "hero", "blocos"],
  },
};

const REGRAS_LP = `${REGRAS.split("Campos:")[0]}
Você monta landing pages para o Anderson. A página tem cabeçalho, hero e rodapé fixos; você escolhe e ordena os blocos do meio e escreve os textos.

Blocos disponíveis:
- imoveis: cards dos imóveis escolhidos. Para cada um, "porque" (1 ou 2 frases ligando o imóvel ao que a pessoa precisa) e, se houver ponto de atenção real nos fatos, "atencao".
- imovel_destaque: galeria, ficha e descrição de um imóvel (campo codigo).
- analise: análise de compra de um imóvel (preço por m², custo total com ITBI, simulação). Campo codigo.
- texto: título e parágrafos.
- lista: título e pontos curtos.
- metodo: os 3 passos do Método Compra Segura (só o título é seu).
- sobre: apresentação do Anderson.
- faq: perguntas e respostas. Responda só com o que é fato: ITBI de 2% em Jaraguá do Sul, escritura e registro em torno de 1,2% do valor, a curadoria é gratuita para quem compra, o Anderson faz a simulação de financiamento. Não invente prazos, taxas de banco nem condições.
- formulario: nome e WhatsApp, com título, texto curto e botão.
- cta: faixa com botão de WhatsApp (titulo, texto, botao, mensagem em primeira pessoa do lead).

Regras de estrutura:
- Curadoria (página para um lead específico): use {nome} onde quiser o primeiro nome do lead. Comece por imoveis com o "porque" de cada um ligado ao perfil do lead; inclua analise do imóvel que mais combina; depois metodo e cta. Não use formulario (o lead já é conhecido). Tom pessoal, primeira pessoa do Anderson.
- Campanha (anúncio): o hero precisa conversar com o público e o ângulo informados, com promessa concreta e verdadeira. Use 4 a 6 blocos. Inclua formulario. O cta_acao do hero deve ser "formulario".
- Nada de urgência falsa, escassez inventada, depoimento inventado ou número que não veio nos fatos.
- Cada bloco deve ter um motivo para existir. Menos é mais.`;

async function montarLp(sb: any, body: Record<string, any>) {
  const codigos: string[] = (body.codigos ?? []).map((c: string) => String(c).toUpperCase()).slice(0, 8);
  const { data: ims } = codigos.length
    ? await sb.from("imoveis").select("codigo,titulo,tipo,bairro,cidade,preco,area,terreno,quartos,suites,vagas,resumo,destaques,atencao,perfil_ideal,ref_m2").in("codigo", codigos)
    : { data: [] };
  let leadTxt = "";
  if (body.lead_id) {
    const { data: l } = await sb.from("leads").select("nome,objetivo,regioes,perfil,prazo,motivacao,faixa_investimento,pagamento,decisores,notas,prazo_compra,credito").eq("id", body.lead_id).maybeSingle();
    if (l) leadTxt = Object.entries(l).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\n");
  }
  const fatos = (ims ?? []).map((i: any) => `- ${i.codigo}: ${i.titulo}. ${i.tipo} em ${i.bairro}, ${i.cidade}. Preço ${i.preco ?? "sob consulta"}. ${i.area ?? "?"} m², ${i.quartos ?? 0} quartos, ${i.suites ?? 0} suítes, ${i.vagas ?? 0} vagas.${i.terreno ? ` Terreno ${i.terreno} m².` : ""} Destaques: ${(i.destaques ?? []).join("; ")}. Atenção: ${(i.atencao ?? []).join("; ") || "nenhum registrado"}. ${i.resumo ?? ""}`).join("\n");
  const pedido = [
    `Tipo de página: ${body.tipo === "curadoria" ? "curadoria para um lead" : "campanha de anúncio"}`,
    body.objetivo ? `Objetivo: ${body.objetivo}` : "", body.publico ? `Público: ${body.publico}` : "", body.angulo ? `Ângulo ou promessa: ${body.angulo}` : "",
    body.notas ? `Notas do Anderson: ${String(body.notas).slice(0, 2000)}` : "",
    leadTxt ? `Perfil do lead:\n${leadTxt}` : "", fatos ? `Imóveis (use só estes fatos):\n${fatos}` : "Nenhum imóvel escolhido.",
  ].filter(Boolean).join("\n\n");

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: await modelo(), max_tokens: 3000, system: REGRAS_LP, tools: [FERRAMENTA_LP], tool_choice: { type: "tool", name: "montar_lp" },
      messages: [{ role: "user", content: pedido }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("falha na IA");
  const t = j.content?.find((b: any) => b.type === "tool_use")?.input ?? {};
  const validos = new Set(codigos);
  const id = () => Math.random().toString(36).slice(2, 10);
  const blocos = (t.blocos ?? []).filter((b: any) => TIPOS_BLOCO.includes(b.tipo)).map((b: any) => {
    const tit = limpar(b.titulo ?? "");
    switch (b.tipo) {
      case "imoveis": return { id: id(), tipo: b.tipo, dados: { titulo: tit, intro: limpar(b.intro ?? ""), reacoes: true, itens: (b.imoveis ?? []).filter((x: any) => validos.has(String(x.codigo).toUpperCase())).map((x: any) => ({ codigo: String(x.codigo).toUpperCase(), porque: limpar(x.porque), atencao: limpar(x.atencao ?? "") })) } };
      case "imovel_destaque": case "analise": return validos.has(String(b.codigo).toUpperCase()) ? { id: id(), tipo: b.tipo, dados: { codigo: String(b.codigo).toUpperCase() } } : null;
      case "texto": return { id: id(), tipo: b.tipo, dados: { titulo: tit, texto: limpar(b.texto ?? "") } };
      case "lista": return { id: id(), tipo: b.tipo, dados: { titulo: tit, itens: (b.pontos ?? []).map(limpar) } };
      case "metodo": return { id: id(), tipo: b.tipo, dados: { titulo: tit || "Como eu trabalho" } };
      case "sobre": return { id: id(), tipo: b.tipo, dados: { titulo: tit || "Quem vai te atender", texto: "Sou o Anderson Costa, corretor em Jaraguá do Sul (CRECI SC 68594). Antes de ser corretor, passei quase 20 anos em marketing e vendas. Trabalho com poucos clientes por vez para conseguir entender cada família, comparar com números e ser honesto sobre cada imóvel." } };
      case "faq": return { id: id(), tipo: b.tipo, dados: { titulo: tit || "Perguntas frequentes", itens: (b.perguntas ?? []).map((x: any) => ({ p: limpar(x.p), r: limpar(x.r) })) } };
      case "formulario": return { id: id(), tipo: b.tipo, dados: { titulo: tit, texto: limpar(b.texto ?? ""), botao: limpar(b.botao ?? "Quero falar com o Anderson") } };
      case "cta": return { id: id(), tipo: b.tipo, dados: { titulo: tit, texto: limpar(b.texto ?? ""), botao: limpar(b.botao ?? "Falar no WhatsApp"), mensagem: limpar(b.mensagem ?? "Oi, Anderson! Vi a página e quero conversar.") } };
    }
    return null;
  }).filter(Boolean);
  const h = t.hero ?? {};
  return {
    nome: limpar(t.nome_interno ?? "").slice(0, 80),
    hero: { eyebrow: limpar(h.eyebrow ?? ""), titulo: limpar(h.titulo ?? ""), subtitulo: limpar(h.subtitulo ?? ""), cta_texto: limpar(h.cta_texto ?? ""), cta_acao: ["rolar", "formulario", "whatsapp"].includes(h.cta_acao) ? h.cta_acao : "rolar" },
    blocos,
  };
}

// ------------------------------------------------------------------ WhatsApp
/** Anderson replies from the admin through the official number. Only inside the 24h window the person opened. */
async function waEnviar(body: Record<string, any>) {
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const texto = String(body.texto ?? "").trim().slice(0, 3500);
  if (!texto) return { erro: "Escreva a mensagem." };
  if (!waConfigurado()) return { erro: "O WhatsApp oficial ainda não está conectado. Use o botão do seu WhatsApp por enquanto." };
  const { data: c } = await svc.from("conversas").select("id, canal, lead_id, contexto").eq("id", String(body.conversa_id ?? "")).maybeSingle();
  if (!c || c.canal !== "whatsapp") return { erro: "Conversa não encontrada." };
  const { data: ult } = await svc.from("mensagens").select("criado_em").eq("conversa_id", c.id).eq("papel", "usuario")
    .order("criado_em", { ascending: false }).limit(1);
  const ultima = ult?.[0] ? Date.parse(ult[0].criado_em) : 0;
  if (Date.now() - ultima > 24 * 3600_000 - 5 * 60_000) {
    return { erro: "Passaram 24h desde a última mensagem da pessoa. A Meta só libera mensagem livre dentro dessa janela. Chame pelo seu WhatsApp ou espere ela responder." };
  }
  const { data: lead } = await svc.from("leads").select("whatsapp").eq("id", c.lead_id).maybeSingle();
  const para = String(c.contexto?.wa_id ?? lead?.whatsapp ?? "");
  const r = await enviarTexto(para, texto);
  if (!r.ok) return { erro: `A Meta recusou o envio: ${r.erro}` };
  await svc.from("mensagens").insert({ conversa_id: c.id, papel: "anderson", conteudo: texto, meta: { wamid_saida: r.wamid } });
  await svc.from("conversas").update({ status: "anderson", atualizado_em: new Date().toISOString() }).eq("id", c.id);
  await svc.from("automacao_log").insert({ lead_id: c.lead_id, evento: "wa_saida", detalhe: { humano: true } });
  return { ok: true };
}
