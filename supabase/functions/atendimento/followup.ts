// Motor de follow-up com travas.
// Princípios: entra só quem foi atendido pelo robô DEPOIS de a automação ser ligada
// (nunca a base antiga); toda trava é conferida de novo no instante do envio;
// um passo por vez na fila; disjuntor desliga tudo se algo sair do normal.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { AGENDA_PADRAO, deLocal, feriado, local } from "./agenda.ts";
import { enviarTemplate, enviarTexto, waConfigurado } from "./whatsapp.ts";

export type Auto = {
  ativo: boolean; modo: "ensaio" | "teste" | "real"; ativado_em?: string;
  max_toques: number; janela_dias: number; intervalo_h: number; primeiro_apos_h: number; teto_dia: number;
  janela_inicio: string; janela_fim: string; max_optout_dia: number; numeros_teste: string[];
  templates: Record<string, string>; idioma: string;
  /** Body variables per template, in order: "nome" or "imovel". Default is ["nome"]. */
  template_params?: Record<string, string[]>;
};
export const AUTO_PADRAO: Auto = {
  ativo: false, modo: "ensaio", max_toques: 4, janela_dias: 10, intervalo_h: 48, primeiro_apos_h: 18, teto_dia: 30,
  janela_inicio: "08:00", janela_fim: "21:00", max_optout_dia: 3, numeros_teste: ["5547989133845"],
  templates: { "1": "retomada_atendimento", "2": "opcoes_curadoria", "3": "retomada_visita", "4": "encerramento_contato" },
  idioma: "pt_BR",
};

const ETAPAS_OK = ["novo", "em_conversa", "qualificado", "curadoria_enviada"];
const H = 3600_000;
type Faixa = "manha" | "tarde" | "noite";
const FAIXAS: Faixa[] = ["manha", "tarde", "noite"];
const minutos = (hhmm: string) => { const [h, m] = String(hhmm || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };

/** Band windows in minutes of the local day. Night is 22-23h only for people who talked at night. */
function janelaFaixa(f: Faixa, noturno: boolean, cfg: Auto): [number, number] {
  if (f === "manha") return [10 * 60, 11 * 60];
  if (f === "tarde") return [17 * 60, 18 * 60];
  if (noturno) return [22 * 60, 23 * 60];
  const fim = Math.min(minutos(cfg.janela_fim), 21 * 60);
  return [fim - 60, fim];
}
export const faixaDe = (ms: number): Faixa => { const h = local(ms).h; return h < 12 ? "manha" : h < 19 ? "tarde" : "noite"; };
const noturnoDe = (ms: number) => { const h = local(ms).h; return h >= 21 || h < 6; };
const diaBloqueado = (ms: number) => { const l = local(ms); return l.dow === 0 || feriado(AGENDA_PADRAO, l.y, l.m, l.d); };

/** First moment >= depois inside band f, never on Sunday or holiday. Random minute inside the band. */
export function proximoSlot(depois: number, f: Faixa, noturno: boolean, cfg: Auto): number {
  const [ini, fim] = janelaFaixa(f, noturno, cfg);
  for (let k = 0; k < 15; k++) {
    const l = local(depois + k * 24 * H);
    const base = deLocal(l.y, l.m, l.d, 0);
    if (diaBloqueado(base + 12 * H)) continue;
    const a = Math.max(base + ini * 60_000, depois), b = base + fim * 60_000 - 5 * 60_000;
    if (a <= b) return a + Math.floor(Math.random() * Math.max(1, b - a));
  }
  return depois + 7 * 24 * H;
}

const primeiroNome = (n?: string | null) => {
  const p = String(n ?? "").trim().split(/\s+/)[0] ?? "";
  return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : "tudo bem";
};

/** How a follow-up refers to the listing the person came for, or to the search when there is none. */
export async function imovelDoLead(sb: SupabaseClient, lead: Record<string, any>, passo = 1) {
  const cod = lead.imovel_codigo ?? (Array.isArray(lead.imoveis_interesse) ? lead.imoveis_interesse[0] : null);
  if (cod) {
    const { data } = await sb.from("imoveis").select("titulo, status").eq("codigo", cod).maybeSingle();
    if (data?.titulo && data.status === "disponivel") return `o imóvel "${String(data.titulo).slice(0, 80)}"`;
  }
  return passo === 3 ? "os imóveis que combinam com a sua busca" : "a sua busca de imóvel";
}

export function textoPasso(passo: number, lead: Record<string, any>, imovel = "a sua busca de imóvel") {
  const nome = primeiroNome(lead.nome);
  const oi = nome === "tudo bem" ? "Oi, tudo bem?" : `Oi, ${nome}!`;
  if (passo === 1) return `${oi} Aqui é a Lu, do time do Anderson Costa. Sobre ${imovel}, ficou alguma dúvida? Se quiser, te mando o vídeo e o custo total da compra para você avaliar com calma.`;
  if (passo === 2) return `${oi} É a Lu, do time do Anderson. Separei algumas opções que combinam com o que você me contou. Quer que eu te mande por aqui?`;
  if (passo === 3) return `${oi} O Anderson tem horários livres nesta semana para você conhecer ${imovel === "a sua busca de imóvel" ? "os imóveis que combinam com a sua busca" : imovel} de perto. Prefere manhã, tarde ou sábado?`;
  return `${nome === "tudo bem" ? "Oi." : `Oi, ${nome}.`} Não quero ser insistente, então vou pausar por aqui. Se a busca voltar a fazer sentido, é só responder esta mensagem. Anderson Costa, CRECI SC 68594.`;
}

async function log(sb: SupabaseClient, lead_id: string | null, evento: string, detalhe: Record<string, unknown> = {}) {
  await sb.from("automacao_log").insert({ lead_id, evento, detalhe });
}

const inicioDoDiaLocal = (ms = Date.now()) => { const l = local(ms); return deLocal(l.y, l.m, l.d, 0); };

/** Contact history of one lead: last person message, last message overall, WhatsApp window. */
async function historico(sb: SupabaseClient, leadId: string) {
  const { data: convs } = await sb.from("conversas").select("id, canal, status, atualizado_em").eq("lead_id", leadId);
  const ids = (convs ?? []).map((c) => c.id);
  if (!ids.length) return null;
  const { data: ult } = await sb.from("mensagens").select("papel, criado_em, conversa_id")
    .in("conversa_id", ids).in("papel", ["usuario", "assistente", "anderson"]).order("criado_em", { ascending: false }).limit(30);
  const msgs = ult ?? [];
  const canalDe = new Map((convs ?? []).map((c) => [c.id, c.canal]));
  const ultUsuario = msgs.find((m) => m.papel === "usuario");
  const ultUsuarioWa = msgs.find((m) => m.papel === "usuario" && canalDe.get(m.conversa_id) === "whatsapp");
  const ultHumano = msgs.find((m) => m.papel === "anderson");
  return {
    convs: convs ?? [],
    ultima: msgs[0] ? Date.parse(msgs[0].criado_em) : null,
    ultimaPapel: msgs[0]?.papel ?? null,
    ultUsuario: ultUsuario ? Date.parse(ultUsuario.criado_em) : null,
    ultUsuarioWa: ultUsuarioWa ? Date.parse(ultUsuarioWa.criado_em) : null,
    ultHumano: ultHumano ? Date.parse(ultHumano.criado_em) : null,
    conversaWa: (convs ?? []).filter((c) => c.canal === "whatsapp").sort((a, b) => Date.parse(b.atualizado_em) - Date.parse(a.atualizado_em))[0]?.id ?? null,
  };
}

/** Every lock, checked again at send time. Returns the reason to block, or null. */
export async function travas(sb: SupabaseClient, lead: Record<string, any>, cfg: Auto, ignorarId?: number, episodio?: number) {
  if (!lead) return "lead_inexistente";
  if (lead.nao_contatar) return "nao_contatar";
  if (!lead.whatsapp) return "sem_whatsapp";
  if (!ETAPAS_OK.includes(lead.etapa ?? "novo")) return `etapa:${lead.etapa}`;
  if (lead.automacao_pausada_ate && Date.parse(lead.automacao_pausada_ate) > Date.now()) return "pausado";
  const { data: sup } = await sb.from("supressao").select("fone").eq("fone", lead.whatsapp).maybeSingle();
  if (sup) return "supressao";
  const { count: visitas } = await sb.from("visitas").select("id", { count: "exact", head: true })
    .eq("lead_id", lead.id).in("status", ["solicitada", "confirmada"]).gte("inicio", new Date().toISOString());
  if ((visitas ?? 0) > 0) return "visita_marcada";
  const h = await historico(sb, lead.id);
  if (!h) return "sem_conversa";
  if (h.ultHumano && Date.now() - h.ultHumano < 7 * 24 * H) return "humano_ativo";
  if (h.convs.some((c) => c.status === "anderson" && Date.now() - Date.parse(c.atualizado_em) < 7 * 24 * H)) return "com_anderson";
  if (episodio && h.ultUsuario && h.ultUsuario > episodio + 1000) return "respondeu";
  const desde = new Date(Date.now() - cfg.janela_dias * 24 * H).toISOString();
  const { data: feitos } = await sb.from("followup_fila").select("id, executado_em")
    .eq("lead_id", lead.id).in("status", ["enviado", "ensaio", "manual"]).gte("executado_em", desde).order("executado_em", { ascending: false });
  const outros = (feitos ?? []).filter((f) => f.id !== ignorarId);
  if (outros.length >= cfg.max_toques) return "teto_do_lead";
  if (outros[0] && Date.now() - Date.parse(outros[0].executado_em) < (cfg.intervalo_h - 1) * H) return "intervalo_minimo";
  return null;
}

/** Best band by reply rate (needs 10+ touches per band), used after the three bands were tried. */
async function melhorFaixa(sb: SupabaseClient): Promise<Faixa> {
  const { data } = await sb.from("followup_fila").select("faixa, respondeu_em").in("status", ["enviado", "manual"])
    .gte("executado_em", new Date(Date.now() - 90 * 24 * H).toISOString()).limit(2000);
  let melhor: Faixa = "manha", taxa = -1;
  for (const f of FAIXAS) {
    const l = (data ?? []).filter((x) => x.faixa === f);
    if (l.length < 10) continue;
    const t = l.filter((x) => x.respondeu_em).length / l.length;
    if (t > taxa) { taxa = t; melhor = f; }
  }
  return melhor;
}

/** Plans the next touch (one at a time) for leads that went silent. */
async function planejar(sb: SupabaseClient, cfg: Auto) {
  if (!cfg.ativado_em) return 0;
  const ativado = Date.parse(cfg.ativado_em);
  const { data: leads } = await sb.from("leads").select("*")
    .in("etapa", ETAPAS_OK).eq("nao_contatar", false).not("whatsapp", "is", null)
    .gte("ultima_atividade", new Date(Math.max(ativado, Date.now() - 30 * 24 * H)).toISOString())
    .lte("ultima_atividade", new Date(Date.now() - 2 * H).toISOString())
    .limit(200);
  let n = 0;
  for (const lead of leads ?? []) {
    const { count: pend } = await sb.from("followup_fila").select("id", { count: "exact", head: true }).eq("lead_id", lead.id).eq("status", "pendente");
    if ((pend ?? 0) > 0) continue;
    const h = await historico(sb, lead.id);
    if (!h || !h.ultima || !h.ultUsuario) continue;          // só quem conversou com o robô
    if (h.ultimaPapel !== "assistente") continue;           // a bola está com a pessoa
    const episodio = h.ultUsuario;
    if (episodio < ativado) continue;                       // nunca a base antiga
    if (await travas(sb, lead, cfg, undefined, episodio)) continue;
    const { data: passos } = await sb.from("followup_fila").select("passo, faixa, status, executado_em, agendado_para")
      .eq("lead_id", lead.id).eq("cadencia", "sem_resposta").eq("episodio", new Date(episodio).toISOString()).order("passo");
    const lista = passos ?? [];
    const proximo = lista.length ? Math.max(...lista.map((p) => p.passo)) + 1 : 1;
    if (proximo > cfg.max_toques) continue;
    if (lista.some((p) => ["cancelado", "bloqueado", "falhou"].includes(p.status) && p.passo === proximo - 1)) continue;
    const noturno = noturnoDe(episodio);
    let depois: number, faixa: Faixa;
    if (proximo === 1) {
      depois = h.ultima + cfg.primeiro_apos_h * H;
      const evitar = faixaDe(h.ultima);
      const opc = FAIXAS.filter((f) => f !== evitar).map((f) => ({ f, t: proximoSlot(depois, f, noturno, cfg) })).sort((a, b) => a.t - b.t)[0];
      faixa = opc.f;
      depois = opc.t;
    } else {
      const ult = lista[lista.length - 1];
      const base = Date.parse(ult.executado_em ?? ult.agendado_para) + cfg.intervalo_h * H;
      const usadas = new Set(lista.map((p) => p.faixa as Faixa));
      const livres = FAIXAS.filter((f) => !usadas.has(f));
      const cand = livres.length ? livres : [await melhorFaixa(sb)];
      const opc = cand.map((f) => ({ f, t: proximoSlot(base, f, noturno, cfg) })).sort((a, b) => a.t - b.t)[0];
      faixa = opc.f;
      depois = opc.t;
    }
    if (depois > episodio + cfg.janela_dias * 24 * H) continue;
    const janela24 = h.ultUsuarioWa && depois < h.ultUsuarioWa + 23.5 * H;
    const { error } = await sb.from("followup_fila").insert({
      lead_id: lead.id, cadencia: "sem_resposta", episodio: new Date(episodio).toISOString(), passo: proximo, faixa,
      agendado_para: new Date(depois).toISOString(), forma: janela24 ? "texto" : "template",
      template: janela24 ? null : (cfg.templates[String(proximo)] ?? null), texto: textoPasso(proximo, lead, await imovelDoLead(sb, lead, proximo)),
    });
    if (!error) { n++; await log(sb, lead.id, "planejado", { passo: proximo, faixa, quando: new Date(depois).toISOString() }); }
  }
  return n;
}

async function disjuntor(sb: SupabaseClient, cfg: Auto): Promise<string | null> {
  const hoje = new Date(inicioDoDiaLocal()).toISOString();
  const { count: optouts } = await sb.from("automacao_log").select("id", { count: "exact", head: true }).eq("evento", "optout").gte("criado_em", hoje);
  if ((optouts ?? 0) > cfg.max_optout_dia) return `${optouts} pedidos para parar hoje`;
  const ontem = new Date(Date.now() - 24 * H).toISOString();
  const { data: ult } = await sb.from("followup_fila").select("status").in("status", ["enviado", "falhou"]).gte("executado_em", ontem);
  const falhas = (ult ?? []).filter((x) => x.status === "falhou").length;
  if (falhas >= 5 && falhas / Math.max(1, (ult ?? []).length) > 0.3) return `${falhas} falhas de envio em 24h`;
  return null;
}

/** Runs due touches. Every lock is checked again here. */
async function executar(sb: SupabaseClient, cfg: Auto, avisar: (assunto: string, html: string) => Promise<void>) {
  const hoje = new Date(inicioDoDiaLocal()).toISOString();
  const { count: feitosHoje } = await sb.from("followup_fila").select("id", { count: "exact", head: true })
    .in("status", ["enviado", "ensaio"]).gte("executado_em", hoje);
  const restante = Math.max(0, cfg.teto_dia - (feitosHoje ?? 0));
  if (!restante) return { executados: 0, motivo: "teto_dia" };
  const { data: fila } = await sb.from("followup_fila").select("*").eq("status", "pendente")
    .lte("agendado_para", new Date().toISOString()).order("agendado_para").limit(restante);
  const res: Record<string, number> = {};
  for (const item of fila ?? []) {
    const agora = Date.now();
    const { data: lead } = await sb.from("leads").select("*").eq("id", item.lead_id).maybeSingle();
    const motivo = await travas(sb, lead!, cfg, item.id, Date.parse(item.episodio));
    if (motivo) {
      await sb.from("followup_fila").update({ status: "bloqueado", motivo, executado_em: new Date().toISOString() }).eq("id", item.id).eq("status", "pendente");
      await log(sb, item.lead_id, "bloqueado", { id: item.id, motivo });
      res.bloqueado = (res.bloqueado ?? 0) + 1;
      continue;
    }
    // Atrasou e saiu da faixa (relógio parado, domingo, feriado): reagenda em vez de mandar fora de hora
    const [ini, fim] = janelaFaixa(item.faixa, noturnoDe(Date.parse(item.episodio)), cfg);
    const l = local(agora), min = l.h * 60 + l.mi;
    if (diaBloqueado(agora) || min < ini || min > fim + 15) {
      const novo = proximoSlot(agora, item.faixa, noturnoDe(Date.parse(item.episodio)), cfg);
      await sb.from("followup_fila").update({ agendado_para: new Date(novo).toISOString() }).eq("id", item.id);
      res.reagendado = (res.reagendado ?? 0) + 1;
      continue;
    }
    const teste = (cfg.numeros_teste ?? []).includes(lead!.whatsapp);
    const real = waConfigurado() && (cfg.modo === "real" || (cfg.modo === "teste" && teste));
    if (!real) {
      await sb.from("followup_fila").update({
        status: "ensaio", modo: cfg.modo, executado_em: new Date().toISOString(),
        motivo: waConfigurado() ? null : "sem_api: envie à mão pelo admin",
      }).eq("id", item.id).eq("status", "pendente");
      res.ensaio = (res.ensaio ?? 0) + 1;
      continue;
    }
    // Reconfirma a janela de 24h na hora do envio
    const h = await historico(sb, item.lead_id);
    const dentro24 = !!(h?.ultUsuarioWa && agora < h.ultUsuarioWa + 23.5 * H);
    const forma = dentro24 ? "texto" : "template";
    const tpl = cfg.templates[String(item.passo)];
    if (forma === "template" && !tpl) {
      await sb.from("followup_fila").update({ status: "bloqueado", motivo: "sem_template", executado_em: new Date().toISOString() }).eq("id", item.id);
      continue;
    }
    // Trava a linha antes de enviar: se outro processo pegou, não manda de novo
    const { data: pego } = await sb.from("followup_fila").update({ status: "enviado", modo: cfg.modo, forma, template: forma === "template" ? tpl : null, executado_em: new Date().toISOString() })
      .eq("id", item.id).eq("status", "pendente").select("id");
    if (!pego?.length) continue;
    const r = forma === "texto"
      ? await enviarTexto(lead!.whatsapp, item.texto)
      : await enviarTemplate(lead!.whatsapp, tpl, cfg.idioma || "pt_BR",
        await Promise.all((cfg.template_params?.[tpl] ?? ["nome"]).map(async (f) => f === "imovel" ? await imovelDoLead(sb, lead!, item.passo) : primeiroNome(lead!.nome))));
    if (!r.ok) {
      await sb.from("followup_fila").update({ status: "falhou", motivo: r.erro?.slice(0, 200) }).eq("id", item.id);
      await log(sb, item.lead_id, "falhou", { id: item.id, erro: r.erro, codigo: r.codigo });
      res.falhou = (res.falhou ?? 0) + 1;
      continue;
    }
    await sb.from("followup_fila").update({ wamid: r.wamid }).eq("id", item.id);
    if (h?.conversaWa) {
      await sb.from("mensagens").insert({ conversa_id: h.conversaWa, papel: "assistente", conteudo: item.texto, meta: { followup: item.id, wamid_saida: r.wamid } });
    }
    await log(sb, item.lead_id, "enviado", { id: item.id, passo: item.passo, forma });
    res.enviado = (res.enviado ?? 0) + 1;
  }
  const d = await disjuntor(sb, cfg);
  if (d) await desligar(sb, d, avisar);
  return res;
}

async function desligar(sb: SupabaseClient, motivo: string, avisar: (assunto: string, html: string) => Promise<void>) {
  const { data } = await sb.from("config").select("valor").eq("chave", "automacao").maybeSingle();
  await sb.from("config").update({ valor: { ...(data?.valor ?? {}), ativo: false, desligado_por: motivo, desligado_em: new Date().toISOString() }, atualizado_em: new Date().toISOString() }).eq("chave", "automacao");
  await log(sb, null, "disjuntor", { motivo });
  await avisar("Follow-up automático desligado", `<p>O disjuntor desligou os follow-ups: <b>${motivo}</b>.</p><p>Nada mais será enviado até você religar na aba WhatsApp do admin.</p>`);
}

export async function tick(sb: SupabaseClient, avisar: (assunto: string, html: string) => Promise<void>) {
  const { data } = await sb.from("config").select("valor").eq("chave", "automacao").maybeSingle();
  const cfg: Auto = { ...AUTO_PADRAO, ...(data?.valor ?? {}) };
  if (!cfg.ativo) return { ativo: false };
  const d = await disjuntor(sb, cfg);
  if (d) { await desligar(sb, d, avisar); return { ativo: false, disjuntor: d }; }
  const planejados = await planejar(sb, cfg);
  const executados = await executar(sb, cfg, avisar);
  return { ativo: true, modo: cfg.modo, planejados, executados };
}
