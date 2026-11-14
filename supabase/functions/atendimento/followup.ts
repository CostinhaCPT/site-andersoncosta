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
  ativo: false, modo: "ensaio", max_toques: 3, janela_dias: 10, intervalo_h: 12, primeiro_apos_h: 3, teto_dia: 30,
  janela_inicio: "08:00", janela_fim: "21:00", max_optout_dia: 3, numeros_teste: ["5547989133845"],
  templates: { "3": "encerramento_contato" },
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

/**
 * Lu 2.0 timing: the first moment >= ms that is a sensible time to message someone.
 * Never on Sunday or holiday, never before 8h, never during lunch and school pickup (11h30 to 14h), never from 21h.
 */
export function alvoPermitido(ms: number): number {
  for (let k = 0; k < 15; k++) {
    const t = k === 0 ? ms : deLocal(local(ms + k * 24 * H).y, local(ms + k * 24 * H).m, local(ms + k * 24 * H).d, 0) + 8 * H + 30 * 60_000;
    const l = local(t), base = deLocal(l.y, l.m, l.d, 0), min = l.h * 60 + l.mi;
    if (diaBloqueado(base + 12 * H)) continue;
    const jitter = Math.floor(Math.random() * 25) * 60_000;
    if (min < 8 * 60 + 30) return base + (8 * 60 + 30) * 60_000 + jitter;
    if (min >= 11 * 60 + 30 && min < 14 * 60 + 30) return base + (14 * 60 + 30) * 60_000 + jitter;
    if (min >= 20 * 60 + 30) continue;
    return t;
  }
  return ms + 7 * 24 * H;
}
const permitidoAgora = (ms: number) => {
  const l = local(ms), min = l.h * 60 + l.mi;
  return !diaBloqueado(ms) && min >= 8 * 60 && min < 21 * 60 && !(min >= 11 * 60 + 30 && min < 14 * 60);
};
/** Same local time of day as ref, on the day of dia. */
const mesmaHora = (dia: number, ref: number) => { const d = local(dia), r = local(ref); return deLocal(d.y, d.m, d.d, 0) + (r.h * 60 + r.mi) * 60_000; };

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
  const oi = nome === "tudo bem" ? "Oi!" : `Oi, ${nome}!`;
  const alvo = imovel === "a sua busca de imóvel" || imovel === "os imóveis que combinam com a sua busca" ? "a sua busca" : imovel;
  if (passo === 1) return `${oi} Aqui é a Lu, do time do Anderson. Quando tiver um minutinho, sigo com você sobre ${alvo}. Prefere que eu continue por aqui?`;
  if (passo === 2) return alvo === "a sua busca"
    ? `${oi} Se ainda estiver procurando, me conta em uma frase o que não pode faltar e eu separo o que combina.`
    : `${oi} Sobre ${alvo}: se quiser, te mostro como o preço fica em relação ao bairro. Pode ser?`;
  return `${nome === "tudo bem" ? "Oi." : `Oi, ${nome}.`} ${alvo === "a sua busca" ? "A busca" : alvo[0].toUpperCase() + alvo.slice(1)} ainda faz sentido para vocês? Se não fizer, um "não" já basta e eu paro por aqui.`;
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
    // Lu 2.0: touch 1 the same day (about 3h later, never at lunch; after 17h it goes at 19h30 or next morning),
    // touch 2 the next day near the time the person first talked, touch 3 four to five days later.
    let depois: number;
    if (proximo === 1) {
      const hu = local(h.ultima).h;
      if (hu >= 17) {
        const noite = mesmaHora(h.ultima, deLocal(2000, 1, 1, 0) + 19.5 * H);
        depois = alvoPermitido(h.ultima < noite - H ? noite : h.ultima + 12 * H);
      } else depois = alvoPermitido(h.ultima + cfg.primeiro_apos_h * H);
    } else {
      const ult = lista[lista.length - 1];
      const feito = Date.parse(ult.executado_em ?? ult.agendado_para);
      depois = proximo === 2
        ? alvoPermitido(Math.max(mesmaHora(feito + 24 * H, episodio), feito + cfg.intervalo_h * H))
        : alvoPermitido(mesmaHora(feito + 4 * 24 * H, episodio));
    }
    const faixa: Faixa = faixaDe(depois);
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
type Gerar = (leadId: string, passo: number, padrao: string) => Promise<string>;

async function executar(sb: SupabaseClient, cfg: Auto, avisar: (assunto: string, html: string) => Promise<void>, gerar?: Gerar) {
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
    // Saiu do horário permitido (relógio parado, domingo, feriado, almoço): reagenda em vez de mandar fora de hora
    if (!permitidoAgora(agora)) {
      const novo = alvoPermitido(agora);
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
    // Inside the 24h window the Lu writes the touch from the real conversation
    if (forma === "texto" && gerar) {
      const t = await gerar(item.lead_id, item.passo, item.texto);
      if (t && t !== item.texto) { item.texto = t; await sb.from("followup_fila").update({ texto: t }).eq("id", item.id); }
    }
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

export async function tick(sb: SupabaseClient, avisar: (assunto: string, html: string) => Promise<void>, gerar?: Gerar) {
  const { data } = await sb.from("config").select("valor").eq("chave", "automacao").maybeSingle();
  const cfg: Auto = { ...AUTO_PADRAO, ...(data?.valor ?? {}) };
  if (!cfg.ativo) return { ativo: false };
  const d = await disjuntor(sb, cfg);
  if (d) { await desligar(sb, d, avisar); return { ativo: false, disjuntor: d }; }
  const planejados = await planejar(sb, cfg);
  const executados = await executar(sb, cfg, avisar, gerar);
  return { ativo: true, modo: cfg.modo, planejados, executados };
}
