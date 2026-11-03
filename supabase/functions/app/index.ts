// App do Anderson: notificações nos aparelhos e registro de atendimento por voz.
// Aceita três credenciais: sessão do admin (JWT), token pessoal do atalho (ac_...) ou token do relógio interno (cron).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SITE = "https://andersoncostaimoveis.com.br";
const H = 3600_000;

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

async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
const normal = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const semTravessao = (s: unknown) => String(s ?? "").replace(/\s*[—–]\s*/g, ", ").trim();

// ------------------------------------------------------------------ quem está chamando
async function quem(req: Request, body: Record<string, any>): Promise<"admin" | "atalho" | "cron" | null> {
  const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (body.acao === "enviar" || body.acao === "lembretes") {
    const { data } = await sb.from("config").select("valor").eq("chave", "cron").maybeSingle();
    return data?.valor?.token && body.token === data.valor.token ? "cron" : null;
  }
  const pessoal = String(body.token_pessoal ?? "").trim() || (auth.startsWith("ac_") ? auth : "");
  if (pessoal) {
    const { data } = await sb.from("tokens_pessoais").select("id, revogado").eq("hash", await sha256(pessoal)).maybeSingle();
    if (!data || data.revogado) return null;
    await sb.from("tokens_pessoais").update({ ultimo_uso: new Date().toISOString() }).eq("id", data.id);
    return "atalho";
  }
  if (!auth) return null;
  const u = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${auth}` } }, auth: { persistSession: false } });
  const { data } = await u.rpc("eh_admin");
  return data === true ? "admin" : null;
}

// ------------------------------------------------------------------ notificações
async function vapid() {
  const { data } = await sb.from("cofre").select("valor").eq("chave", "vapid").maybeSingle();
  if (data?.valor?.publicKey) return data.valor as { publicKey: string; privateKey: string };
  const k = webpush.generateVAPIDKeys();
  await sb.from("cofre").upsert({ chave: "vapid", valor: k });
  return k;
}

async function enviarPendentes() {
  const { data: notifs } = await sb.from("notificacoes").select("*").is("enviada_em", null).order("id").limit(20);
  if (!notifs?.length) return { enviadas: 0 };
  const { data: subs } = await sb.from("push_inscricoes").select("*");
  const k = await vapid();
  webpush.setVapidDetails("mailto:anderson@paixaocosta.com", k.publicKey, k.privateKey);
  let ok = 0;
  for (const n of notifs) {
    await sb.from("notificacoes").update({ enviada_em: new Date().toISOString() }).eq("id", n.id);
    for (const s of subs ?? []) {
      try {
        const det = webpush.generateRequestDetails({ endpoint: s.endpoint, keys: s.chaves }, JSON.stringify({ titulo: n.titulo, corpo: n.corpo, url: n.url, tag: n.chave ?? String(n.id) }), { TTL: 6 * 3600 });
        const r = await fetch(det.endpoint, { method: det.method, headers: det.headers as Record<string, string>, body: det.body as BodyInit });
        if (r.status === 404 || r.status === 410) await sb.from("push_inscricoes").delete().eq("id", s.id);
        else if (r.ok) { ok++; await sb.from("push_inscricoes").update({ ultimo_ok: new Date().toISOString() }).eq("id", s.id); }
        else console.error("push", r.status, (await r.text()).slice(0, 200));
      } catch (e) { console.error("push", e); }
    }
  }
  return { enviadas: ok };
}

// ------------------------------------------------------------------ registro por voz
let MODELO = Deno.env.get("CLAUDE_MODEL") ?? "";
async function modelo() {
  if (MODELO) return MODELO;
  const r = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01" } });
  const ids: string[] = ((await r.json()).data ?? []).map((m: { id: string }) => m.id);
  MODELO = ids.find((i) => i.includes("sonnet")) ?? ids[0];
  return MODELO;
}

const FERRAMENTA = {
  name: "registrar_atendimento",
  description: "Estrutura o que o corretor contou sobre um atendimento.",
  input_schema: {
    type: "object",
    properties: {
      pessoa_nome: { type: "string", description: "Nome do cliente como foi dito. Vazio se não disse." },
      pessoa_telefone: { type: "string", description: "Só dígitos, se foi dito." },
      canal: { type: "string", enum: ["presencial", "cafe", "ligacao", "whatsapp", "visita", "reuniao", "email", "outro"] },
      quando: { type: "string", description: "Data e hora do atendimento em ISO 8601 com -03:00. Se não disse, use agora." },
      resumo: { type: "string", description: "2 a 4 frases objetivas, em português, sem travessão, do que foi conversado e decidido." },
      imovel_codigos: { type: "array", items: { type: "string" }, description: "Códigos AC-0000 citados." },
      atualizar: {
        type: "object",
        properties: {
          prazo_compra: { type: "string", enum: ["ate_3m", "3_6m", "6_12m", "mais_12m", "pesquisando"] },
          credito: { type: "string", enum: ["aprovado", "a_vista", "fgts_entrada", "vai_financiar", "nao_sabe"] },
          faixa_max: { type: "number", description: "Valor máximo em reais." },
          valor_negocio: { type: "number", description: "Valor do imóvel em negociação ou proposta, em reais." },
          depende_venda: { type: "boolean" }, decisores_alinhados: { type: "boolean" }, motivacao_forte: { type: "boolean" },
          objetivo: { type: "string" }, regioes: { type: "array", items: { type: "string" } }, perfil: { type: "string" },
          email: { type: "string" },
        },
      },
      tarefas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            quando: { type: "string", description: "ISO 8601 com -03:00, ou vazio." },
            tipo: { type: "string", enum: ["tarefa", "ligar", "whatsapp", "email", "visita", "documento"] },
          },
          required: ["titulo"],
        },
      },
      pediu_para_parar: { type: "boolean", description: "O cliente pediu para não ser mais contatado." },
      eh_proprietario: { type: "boolean", description: "A pessoa quer vender ou anunciar um imóvel dela." },
    },
    required: ["canal", "resumo"],
  },
};

function agoraBR() {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function interpretar(texto: string) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: await modelo(), max_tokens: 1500,
      system: `Você organiza o CRM do Anderson Costa, corretor de imóveis em Jaraguá do Sul. Ele fala ou cola um relato de atendimento (ou a transcrição de uma conversa gravada) e você estrutura os dados. Agora é ${agoraBR()} (fuso de Brasília, -03:00). Converta datas relativas ("sábado de manhã" vira o próximo sábado às 09:00; "amanhã" é o dia seguinte; "semana que vem" é segunda às 09:00). Só registre o que foi dito: nunca invente valor, prazo, nome ou decisão. Em transcrições, o corretor é o Anderson e o cliente é a outra pessoa. Tarefas são os próximos passos que o Anderson precisa fazer.`,
      tools: [FERRAMENTA], tool_choice: { type: "tool", name: "registrar_atendimento" },
      messages: [{ role: "user", content: texto.slice(0, 30000) }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("ia: " + JSON.stringify(j).slice(0, 300));
  return (j.content?.find((b: any) => b.type === "tool_use")?.input ?? {}) as Record<string, any>;
}

/** Finds the contact. Returns one sure match, or a ranked candidate list. */
async function acharContato(i: Record<string, any>) {
  const fone = String(i.pessoa_telefone ?? "").replace(/\D/g, "");
  if (fone.length >= 8) {
    const { data } = await sb.from("contatos").select("id, nome, whatsapp").ilike("whatsapp", `%${fone.slice(-8)}`).limit(3);
    if (data?.length === 1) return { certo: data[0], candidatos: data };
  }
  const nome = normal(i.pessoa_nome);
  if (!nome) return { certo: null, candidatos: [] };
  const partes = nome.split(" ").filter((p) => p.length > 1 && !["de", "da", "do", "dos", "das", "e"].includes(p));
  const { data: todos } = await sb.from("contatos").select("id, nome, whatsapp, atualizado_em").ilike("nome", `%${partes[0]}%`).limit(200);
  const pontos = (todos ?? []).map((c) => {
    const n = normal(c.nome);
    const bate = partes.filter((p) => n.split(" ").includes(p)).length;
    return { c, bate, exato: n === nome };
  }).filter((x) => x.bate > 0).sort((a, b) => Number(b.exato) - Number(a.exato) || b.bate - a.bate || Date.parse(b.c.atualizado_em) - Date.parse(a.c.atualizado_em));
  const candidatos = pontos.slice(0, 5).map((x) => x.c);
  const exatos = pontos.filter((x) => x.exato);
  if (exatos.length === 1) return { certo: exatos[0].c, candidatos };
  // Só o primeiro nome dito e uma única pessoa com esse nome: aceita
  if (partes.length >= 2 && pontos.length && pontos[0].bate === partes.length && (pontos.length === 1 || pontos[1].bate < partes.length)) return { certo: pontos[0].c, candidatos };
  if (partes.length === 1 && pontos.length === 1) return { certo: pontos[0].c, candidatos };
  return { certo: null, candidatos };
}

const ROTULO_CANAL: Record<string, [string, string]> = {
  presencial: ["reuniao", "Encontro presencial"], cafe: ["reuniao", "Café"], ligacao: ["ligacao", "Ligação"], whatsapp: ["whatsapp", "Conversa no WhatsApp"],
  visita: ["reuniao", "Visita ao imóvel"], reuniao: ["reuniao", "Reunião"], email: ["email", "E-mail"], outro: ["nota", "Atendimento"],
};
const ETAPAS_ABERTAS = ["novo", "em_conversa", "qualificado", "curadoria_enviada", "visita_agendada", "visita_realizada", "proposta",
  "cap_contato", "cap_avaliacao", "cap_acm", "cap_negociacao", "cap_autorizado", "cap_anunciado"];

/** Writes everything into the CRM for a known contact. */
async function aplicar(registroId: string, contatoId: string, i: Record<string, any>) {
  const { data: contato } = await sb.from("contatos").select("id, nome, whatsapp, email, papeis").eq("id", contatoId).single();
  const a = (i.atualizar ?? {}) as Record<string, any>;
  const feitos: string[] = [];
  const cods = (i.imovel_codigos ?? []).map((c: string) => String(c).toUpperCase()).filter((c: string) => /^AC-\d{4}$/.test(c));

  // Negócio: o aberto mais recente (captação se a pessoa é proprietária e o assunto é o imóvel dela)
  const funil = i.eh_proprietario ? "captacao" : "compra";
  const { data: abertos } = await sb.from("leads").select("id, funil, etapa, imoveis_interesse, nome")
    .eq("contato_id", contatoId).in("etapa", ETAPAS_ABERTAS).order("atualizado_em", { ascending: false });
  let negocio: Record<string, any> | null = (abertos ?? []).find((n) => n.funil === funil) ?? (abertos ?? [])[0] ?? null;
  const temDadoDeNegocio = Object.keys(a).some((k) => k !== "email") || cods.length || i.eh_proprietario;
  if (!negocio && temDadoDeNegocio) {
    const { data } = await sb.from("leads").insert({
      contato_id: contatoId, funil, etapa: funil === "captacao" ? "cap_contato" : "em_conversa", nome: contato?.nome, whatsapp: contato?.whatsapp,
      email: contato?.email, canal: "Indicação/presencial", titulo: `${funil === "captacao" ? "Captação" : "Compra"} · ${contato?.nome ?? ""}`.trim(),
    }).select("id, funil, etapa, imoveis_interesse, nome").single();
    negocio = data; if (data) feitos.push("abri um negócio");
  }
  if (negocio) {
    const upd: Record<string, unknown> = { ultima_atividade: new Date().toISOString(), atualizado_em: new Date().toISOString() };
    for (const k of ["prazo_compra", "credito", "faixa_max", "depende_venda", "decisores_alinhados", "motivacao_forte", "objetivo", "perfil"]) if (a[k] !== undefined && a[k] !== null && a[k] !== "") upd[k] = a[k];
    if (a.regioes?.length) upd.regioes = a.regioes;
    if (a.valor_negocio) upd.valor = a.valor_negocio;
    if (cods.length) upd.imoveis_interesse = [...new Set([...(negocio.imoveis_interesse ?? []), ...cods])];
    if (i.pediu_para_parar) { upd.nao_contatar = true; upd.nao_contatar_motivo = "pediu em atendimento"; }
    await sb.from("leads").update(upd).eq("id", negocio.id);
    const mudou = Object.keys(upd).filter((k) => !["ultima_atividade", "atualizado_em"].includes(k));
    if (mudou.length) feitos.push(`atualizei ${mudou.length} ${mudou.length === 1 ? "dado" : "dados"} do negócio`);
  }
  const updC: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  if (a.email && !contato?.email) updC.email = a.email;
  if (i.eh_proprietario && !(contato?.papeis ?? []).includes("proprietario")) updC.papeis = [...(contato?.papeis ?? []), "proprietario"];
  if (i.pediu_para_parar) updC.nao_contatar = true;
  await sb.from("contatos").update(updC).eq("id", contatoId);

  const [tipo, titulo] = ROTULO_CANAL[i.canal] ?? ROTULO_CANAL.outro;
  const quando = Number.isFinite(Date.parse(i.quando)) && Date.parse(i.quando) < Date.now() + H ? new Date(Date.parse(i.quando)).toISOString() : new Date().toISOString();
  await sb.from("atividades").insert({
    contato_id: contatoId, negocio_id: negocio?.id ?? null, tipo, titulo: titulo + (cods.length ? ` · ${cods.join(", ")}` : ""),
    corpo: semTravessao(i.resumo), quando, meta: { registro_voz: registroId },
  });
  const tarefas = (i.tarefas ?? []).slice(0, 5).map((t: Record<string, any>) => ({
    titulo: semTravessao(t.titulo).slice(0, 200), tipo: t.tipo || "tarefa",
    vence_em: Number.isFinite(Date.parse(t.quando)) ? new Date(Date.parse(t.quando)).toISOString() : null,
    contato_id: contatoId, negocio_id: negocio?.id ?? null, origem: "voz",
  })).filter((t: any) => t.titulo);
  if (tarefas.length) { await sb.from("tarefas").insert(tarefas); feitos.push(`criei ${tarefas.length} ${tarefas.length === 1 ? "tarefa" : "tarefas"}`); }
  if (i.pediu_para_parar) feitos.push("marquei para não contatar");

  const resposta = `Registrado em ${contato?.nome ?? "contato"}: ${titulo.toLowerCase()}.${feitos.length ? " " + feitos.join(", ").replace(/^./, (c) => c.toUpperCase()) + "." : ""}`;
  await sb.from("registros_voz").update({ status: "aplicado", contato_id: contatoId, negocio_id: negocio?.id ?? null, aplicado_em: new Date().toISOString(), resposta }).eq("id", registroId);
  return resposta;
}

async function registrar(texto: string, origem: string) {
  const t = String(texto ?? "").trim();
  if (t.length < 8) return { resposta: "Não entendi. Pode falar de novo dizendo com quem foi e o que conversaram?" };
  const i = await interpretar(t);
  const { certo, candidatos } = await acharContato(i);
  const { data: reg } = await sb.from("registros_voz").insert({
    texto: t, origem, interpretacao: i, candidatos, status: "revisar",
    resposta: certo ? null : (i.pessoa_nome ? `Não tive certeza de quem é "${i.pessoa_nome}".` : "Não identifiquei o cliente."),
  }).select("id").single();
  if (certo) return { resposta: await aplicar(reg!.id, certo.id, i), registro: reg!.id };
  const msg = i.pessoa_nome
    ? `${candidatos.length ? `Achei ${candidatos.length} ${candidatos.length === 1 ? "pessoa parecida" : "pessoas parecidas"}` : "Não achei"} ${i.pessoa_nome} no CRM. Deixei para você confirmar no app, em Tarefas.`
    : "Não identifiquei o cliente. Deixei para você confirmar no app, em Tarefas.";
  return { resposta: msg, registro: reg!.id, revisar: true };
}

async function aplicarRevisao(body: Record<string, any>) {
  const { data: reg } = await sb.from("registros_voz").select("*").eq("id", String(body.id ?? "")).maybeSingle();
  if (!reg || reg.status !== "revisar") return { erro: "Registro não encontrado ou já resolvido." };
  if (body.descartar) { await sb.from("registros_voz").update({ status: "descartado" }).eq("id", reg.id); return { ok: true }; }
  let contatoId = String(body.contato_id ?? "");
  if (!contatoId && body.criar) {
    const i = reg.interpretacao ?? {};
    const fone = String(i.pessoa_telefone ?? "").replace(/\D/g, "");
    const { data, error } = await sb.from("contatos").insert({
      nome: String(body.nome || i.pessoa_nome || "").trim() || null, whatsapp: fone.length >= 10 ? (fone.length <= 11 ? "55" + fone : fone) : null,
      papeis: [i.eh_proprietario ? "proprietario" : "comprador"], origem: { canal: "registro por voz" }, canal: "Indicação/presencial",
    }).select("id").single();
    if (error) return { erro: error.message };
    contatoId = data.id;
  }
  if (!contatoId) return { erro: "Escolha o contato." };
  return { ok: true, resposta: await aplicar(reg.id, contatoId, reg.interpretacao ?? {}) };
}

// ------------------------------------------------------------------ servidor

// ------------------------------------------------------------------ relatório do proprietário
const REGRAS_RELATORIO = `Você escreve, na primeira pessoa e com a voz de Anderson Costa (corretor, CRECI SC 68594, Jaraguá do Sul), a parte de análise do relatório mensal que ele envia ao proprietário de um imóvel que está vendendo.
Regras: use só os números enviados, sem inventar nada. Nunca use travessão. Tom profissional, próximo e franco, sem promessas de venda nem prazos. Nada de nomes, telefones ou dados de compradores: fale de "um casal", "uma família", "um investidor".
Estrutura em 4 blocos curtos, com estes títulos exatos em linhas próprias:
O que fiz neste período
O que o mercado está dizendo
Minha leitura
Próximos passos
Em "O que o mercado está dizendo", resuma as impressões dos visitantes e dos interessados (se houver) sem identificar ninguém. Em "Minha leitura", compare o preço por m² do imóvel com a referência e com a mediana dos concorrentes quando esses números existirem, e diga com tato se o preço está ajudando ou atrapalhando. Se faltarem dados, diga que ainda é cedo para conclusões. Em "Próximos passos", 2 a 4 ações concretas que eu vou fazer. Termine com uma frase cordial e sem bajulação. Máximo de 280 palavras.`;
async function textoRelatorio(id: string) {
  const { data: r } = await sb.from("relatorios").select("*").eq("id", id).maybeSingle();
  if (!r) throw new Error("Relatório não encontrado.");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: await modelo(), max_tokens: 1200, system: REGRAS_RELATORIO,
      messages: [{ role: "user", content: `Período: ${r.inicio} a ${r.fim}.\nDados:\n${JSON.stringify(r.dados)}` }] }),
  });
  const j = await resp.json();
  if (!resp.ok) throw new Error("A IA não respondeu. Tente de novo.");
  const texto = (j.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").replace(/[ \t]*[—–][ \t]*/g, ", ").trim();
  await sb.from("relatorios").update({ texto, atualizado_em: new Date().toISOString() }).eq("id", id);
  return { texto };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405, origin);
  let body: Record<string, any>;
  const bruto = await req.text();
  try { body = JSON.parse(bruto || "{}"); } catch { body = { acao: "registrar", texto: bruto }; } // atalho pode mandar texto puro
  if (!body.acao) body.acao = "registrar";
  const papel = await quem(req, body);
  if (!papel) return json({ erro: "acesso negado", resposta: "Acesso negado. Confira o token do atalho." }, 403, origin);
  try {
    if (papel === "cron") {
      if (body.acao === "enviar") return json(await enviarPendentes(), 200, origin);
      await sb.rpc("gerar_lembretes"); return json(await enviarPendentes(), 200, origin);
    }
    if (body.acao === "registrar") return json(await registrar(body.texto ?? body.mensagem ?? "", papel === "atalho" ? String(body.origem ?? "atalho") : "admin"), 200, origin);
    if (papel !== "admin") return json({ erro: "só pelo admin" }, 403, origin);
    if (body.acao === "vapid") return json({ chave: (await vapid()).publicKey }, 200, origin);
    if (body.acao === "inscrever") {
      const s = body.inscricao ?? {};
      if (!s.endpoint || !s.keys?.p256dh || !s.keys?.auth) return json({ erro: "inscrição inválida" }, 400, origin);
      await sb.from("push_inscricoes").upsert({ endpoint: s.endpoint, chaves: s.keys, dispositivo: String(body.dispositivo ?? "").slice(0, 80) }, { onConflict: "endpoint" });
      return json({ ok: true }, 200, origin);
    }
    if (body.acao === "testar") {
      await sb.from("notificacoes").insert({ titulo: "Notificações ligadas", corpo: "Você vai ser avisado de leads quentes, visitas e tarefas.", chave: "teste-" + Date.now() });
      return json({ ok: true }, 200, origin);
    }
    if (body.acao === "token_novo") {
      const token = "ac_" + Array.from(crypto.getRandomValues(new Uint8Array(24))).map((x) => x.toString(16).padStart(2, "0")).join("");
      await sb.from("tokens_pessoais").insert({ nome: String(body.nome ?? "Atalho").slice(0, 60), hash: await sha256(token) });
      return json({ token }, 200, origin);
    }
    if (body.acao === "revisao") return json(await aplicarRevisao(body), 200, origin);
    if (body.acao === "relatorio_texto") {
      try { return json(await textoRelatorio(String(body.id)), 200, origin); }
      catch (e) { return json({ erro: (e as Error).message }, 200, origin); }
    }
    return json({ erro: "ação desconhecida" }, 400, origin);
  } catch (e) {
    console.error(e);
    return json({ erro: "falha", resposta: "Tive um problema para registrar. Tente de novo em instantes." }, 200, origin);
  }
});
