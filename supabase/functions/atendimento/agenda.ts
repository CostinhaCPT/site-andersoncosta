// Visit scheduling: business-hour slots, busy times from the Google Calendar
// secret iCal address, .ics invites and e-mail through Resend.
// Brazil has no daylight saving time since 2019, so local time is fixed at -03:00.

export type Agenda = {
  dias: number[]; // 0 = domingo ... 6 = sábado
  inicio: string; fim: string; inicio_sabado: string; fim_sabado: string;
  duracao_min: number; intervalo_min: number; antecedencia_horas: number; janela_dias: number;
  ical_url: string; email_avisos: string; remetente?: string; feriados_extras?: string[];
};
export type Faixa = { ini: number; fim: number };

export const AGENDA_PADRAO: Agenda = {
  dias: [1, 2, 3, 4, 5, 6], inicio: "08:00", fim: "18:00", inicio_sabado: "08:00", fim_sabado: "12:00",
  duracao_min: 60, intervalo_min: 30, antecedencia_horas: 12, janela_dias: 14,
  ical_url: "", email_avisos: "anderson@paixaocosta.com",
};

const OFF = -3 * 3600_000; // America/Sao_Paulo
const PASSO_MIN = 30;
const minutos = (hhmm: string) => { const [h, m] = String(hhmm || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const pad = (n: number) => String(n).padStart(2, "0");

/** Local (BRT) calendar parts of an instant. */
export function local(ms: number) {
  const d = new Date(ms + OFF);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}
/** Instant for a BRT wall-clock time. */
export const deLocal = (y: number, m: number, d: number, min = 0) => Date.UTC(y, m - 1, d, 0, min) - OFF;

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DIAS_LONGOS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export function rotuloData(ms: number, longo = false) {
  const l = local(ms);
  return `${longo ? DIAS_LONGOS[l.dow] : DIAS[l.dow]}, ${pad(l.d)}/${pad(l.m)}`;
}
export const rotuloHora = (ms: number) => { const l = local(ms); return `${pad(l.h)}:${pad(l.mi)}`; };
export const rotuloCompleto = (ms: number) => `${rotuloData(ms, true)} às ${rotuloHora(ms).replace(":00", "h").replace(":", "h")}`;

// National holidays, Easter-based ones and Jaraguá do Sul's anniversary (25/07)
function pascoa(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return Date.UTC(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
}
export function feriado(a: Agenda, y: number, m: number, d: number) {
  const md = `${pad(m)}-${pad(d)}`;
  if (["01-01", "04-21", "05-01", "07-25", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].includes(md)) return true;
  const p = pascoa(y), dia = Date.UTC(y, m - 1, d);
  if ([-48, -47, -2, 60].some((k) => p + k * 86400_000 === dia)) return true; // carnaval, sexta santa, corpus christi
  return (a.feriados_extras ?? []).includes(`${y}-${md}`);
}

/** Business window (in minutes of the day) for a day, or null if closed. */
function janelaDoDia(a: Agenda, dow: number, y?: number, m?: number, d?: number): [number, number] | null {
  if (!a.dias.includes(dow)) return null;
  if (y && m && d && feriado(a, y, m, d)) return null;
  return dow === 6 ? [minutos(a.inicio_sabado), minutos(a.fim_sabado)] : [minutos(a.inicio), minutos(a.fim)];
}

/** True when [ini, ini+duração] sits inside the business window of its day. */
export function dentroDoHorario(a: Agenda, ini: number) {
  const l = local(ini);
  const j = janelaDoDia(a, l.dow, l.y, l.m, l.d);
  if (!j) return false;
  const m0 = l.h * 60 + l.mi;
  return m0 >= j[0] && m0 + a.duracao_min <= j[1];
}

export function livre(a: Agenda, ini: number, ocupado: Faixa[]) {
  const fim = ini + a.duracao_min * 60_000, folga = a.intervalo_min * 60_000;
  return !ocupado.some((o) => ini - folga < o.fim && fim + folga > o.ini);
}

export function gerarHorarios(a: Agenda, ocupado: Faixa[], agora = Date.now()) {
  const minimo = agora + a.antecedencia_horas * 3600_000;
  const hoje = local(agora);
  const dias: { data: string; rotulo: string; horarios: { inicio: string; hora: string }[] }[] = [];
  for (let k = 0; k <= a.janela_dias; k++) {
    const base = deLocal(hoje.y, hoje.m, hoje.d + k);
    const l = local(base);
    const j = janelaDoDia(a, l.dow, l.y, l.m, l.d);
    if (!j) continue;
    const horarios = [];
    for (let m0 = j[0]; m0 + a.duracao_min <= j[1]; m0 += PASSO_MIN) {
      const ini = deLocal(l.y, l.m, l.d, m0);
      if (ini < minimo || !livre(a, ini, ocupado)) continue;
      horarios.push({ inicio: new Date(ini).toISOString(), hora: rotuloHora(ini) });
    }
    if (horarios.length) dias.push({ data: `${l.y}-${pad(l.m)}-${pad(l.d)}`, rotulo: rotuloData(base), horarios });
  }
  return dias;
}

// ------------------------------------------------------------------ iCal
function desdobrar(txt: string) {
  return txt.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}
function offsetDe(tz: string, ms: number) {
  try {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ms;
  } catch { return OFF; }
}
/** Parses DTSTART-like values. Returns ms and whether it is an all-day date. */
function lerData(params: string, valor: string): { ms: number; diaTodo: boolean } | null {
  const m = valor.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { ms: deLocal(+y, +mo, +d), diaTodo: true };
  const comoUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  if (z) return { ms: comoUtc, diaTodo: false };
  const tz = params.match(/TZID=([^;:]+)/)?.[1];
  const off = tz ? offsetDe(tz.replace(/"/g, ""), comoUtc) : OFF;
  return { ms: comoUtc - off, diaTodo: false };
}
const DIA_ICS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

type Ev = { uid: string; ini: number; fim: number; diaTodo: boolean; rrule?: string; exdates: number[]; recId?: number; cancelado: boolean; transparente: boolean; opaco: boolean };

export function ocupadosDoIcal(txt: string, de: number, ate: number): Faixa[] {
  const eventos: Ev[] = [];
  let atual: Ev | null = null;
  let duracao = 0;
  for (const linha of desdobrar(txt)) {
    if (linha === "BEGIN:VEVENT") { atual = { uid: "", ini: 0, fim: 0, diaTodo: false, exdates: [], cancelado: false, transparente: false, opaco: false }; duracao = 0; continue; }
    if (linha === "END:VEVENT") {
      if (atual && atual.ini) {
        if (!atual.fim) atual.fim = duracao ? atual.ini + duracao : atual.ini + (atual.diaTodo ? 86400_000 : 3600_000);
        eventos.push(atual);
      }
      atual = null; continue;
    }
    if (!atual) continue;
    const i = linha.indexOf(":");
    if (i < 0) continue;
    const chave = linha.slice(0, i), valor = linha.slice(i + 1).trim();
    const [nome, ...resto] = chave.split(";");
    const params = resto.join(";");
    if (nome === "UID") atual.uid = valor;
    else if (nome === "DTSTART") { const r = lerData(params, valor); if (r) { atual.ini = r.ms; atual.diaTodo = r.diaTodo; } }
    else if (nome === "DTEND") { const r = lerData(params, valor); if (r) atual.fim = r.ms; }
    else if (nome === "DURATION") {
      const m = valor.match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/);
      if (m) duracao = ((+(m[1] || 0) * 7 + +(m[2] || 0)) * 24 * 60 + +(m[3] || 0) * 60 + +(m[4] || 0)) * 60_000;
    } else if (nome === "RRULE") atual.rrule = valor;
    else if (nome === "EXDATE") for (const v of valor.split(",")) { const r = lerData(params, v); if (r) atual.exdates.push(r.ms); }
    else if (nome === "RECURRENCE-ID") { const r = lerData(params, valor); if (r) atual.recId = r.ms; }
    else if (nome === "STATUS") atual.cancelado = valor === "CANCELLED";
    else if (nome === "TRANSP") { atual.transparente = valor === "TRANSPARENT"; atual.opaco = valor === "OPAQUE"; }
  }

  // Overridden instances are removed from their series and stand on their own
  const sobrescritos = new Map<string, Set<number>>();
  for (const e of eventos) if (e.recId) {
    if (!sobrescritos.has(e.uid)) sobrescritos.set(e.uid, new Set());
    sobrescritos.get(e.uid)!.add(e.recId);
  }
  const ocupado: Faixa[] = [];
  const conta = (e: Ev, ini: number) => {
    // All-day events only block when explicitly marked busy (Google marks them free by default)
    if (e.cancelado || e.transparente || (e.diaTodo && !e.opaco)) return;
    const fim = ini + (e.fim - e.ini);
    if (fim > de && ini < ate) ocupado.push({ ini, fim });
  };
  for (const e of eventos) {
    if (!e.rrule) { conta(e, e.ini); continue; }
    const r = Object.fromEntries(e.rrule.split(";").map((p) => p.split("=")));
    const freq = r.FREQ, intervalo = Math.max(1, +(r.INTERVAL || 1));
    const ate2 = r.UNTIL ? (lerData("", r.UNTIL)?.ms ?? ate) : ate;
    const limiteContagem = r.COUNT ? +r.COUNT : Infinity;
    const pular = new Set([...e.exdates, ...(sobrescritos.get(e.uid) ?? [])]);
    const l0 = local(e.ini);
    const horaMin = l0.h * 60 + l0.mi;
    let n = 0;
    const emitir = (ini: number) => { n++; if (!pular.has(ini)) conta(e, ini); };
    if (freq === "DAILY") {
      for (let k = 0; n < limiteContagem; k += intervalo) {
        const ini = deLocal(l0.y, l0.m, l0.d + k, horaMin);
        if (ini > ate2 || ini > ate) break;
        emitir(ini);
      }
    } else if (freq === "WEEKLY") {
      const dias = (r.BYDAY ? r.BYDAY.split(",").map((s: string) => DIA_ICS[s.slice(-2)]) : [l0.dow]).sort();
      const inicioSemana = deLocal(l0.y, l0.m, l0.d - l0.dow);
      for (let w = 0; n < limiteContagem; w += intervalo) {
        const ls = local(inicioSemana);
        let parou = false;
        for (const dw of dias) {
          const ini = deLocal(ls.y, ls.m, ls.d + w * 7 + dw, horaMin);
          if (ini < e.ini) continue;
          if (ini > ate2 || ini > ate || n >= limiteContagem) { parou = true; break; }
          emitir(ini);
        }
        if (parou) break;
      }
    } else if (freq === "MONTHLY" && !r.BYDAY) {
      for (let k = 0; n < limiteContagem; k += intervalo) {
        const ini = deLocal(l0.y, l0.m + k, l0.d, horaMin);
        if (ini > ate2 || ini > ate) break;
        if (local(ini).d === l0.d) emitir(ini);
      }
    } else conta(e, e.ini); // other rules: keep only the first instance
  }
  return ocupado;
}

let cacheIcal: { url: string; quando: number; txt: string } | null = null;
export async function lerIcal(url: string) {
  if (!url) return "";
  if (cacheIcal && cacheIcal.url === url && Date.now() - cacheIcal.quando < 5 * 60_000) return cacheIcal.txt;
  try {
    const r = await fetch(url.replace(/^webcal:/, "https:"), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) { console.error("ical", r.status); return cacheIcal?.url === url ? cacheIcal.txt : ""; }
    const txt = await r.text();
    cacheIcal = { url, quando: Date.now(), txt };
    return txt;
  } catch (e) { console.error("ical", e); return cacheIcal?.url === url ? cacheIcal.txt : ""; }
}

// ---------------------------------------------------------------- convites
const icsTexto = (s: string) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsData = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
function dobrar(l: string) {
  const out = []; let s = l;
  while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); }
  out.push(s); return out.join("\r\n");
}
export function montarIcs(o: {
  uid: string; ini: number; fim: number; titulo: string; descricao: string; local?: string;
  organizador: string; convidados: { email: string; nome?: string }[]; cancelar?: boolean; sequencia?: number;
}) {
  const linhas = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Anderson Costa Imoveis//Agenda//PT-BR", "CALSCALE:GREGORIAN",
    `METHOD:${o.cancelar ? "CANCEL" : "REQUEST"}`, "BEGIN:VEVENT",
    `UID:${o.uid}`, `DTSTAMP:${icsData(Date.now())}`, `DTSTART:${icsData(o.ini)}`, `DTEND:${icsData(o.fim)}`,
    `SEQUENCE:${o.sequencia ?? 0}`, `SUMMARY:${icsTexto(o.titulo)}`, `DESCRIPTION:${icsTexto(o.descricao)}`,
    ...(o.local ? [`LOCATION:${icsTexto(o.local)}`] : []),
    `ORGANIZER;CN=Anderson Costa:mailto:${o.organizador}`,
    ...o.convidados.map((c) => `ATTENDEE;CN=${icsTexto(c.nome || c.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${c.email}`),
    `STATUS:${o.cancelar ? "CANCELLED" : "CONFIRMED"}`, "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Visita", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

/** Sends an e-mail through Resend. Without a verified domain only the account owner can receive. */
export async function enviarEmail(o: { de: string; para: string[]; assunto: string; html: string; ics?: string; responder?: string }) {
  const chave = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!chave || !o.para.length) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: o.de, to: o.para, subject: o.assunto, html: o.html,
      ...(o.responder ? { reply_to: o.responder } : {}),
      ...(o.ics ? { attachments: [{ filename: "visita.ics", content: b64(o.ics), content_type: "text/calendar; charset=utf-8; method=REQUEST" }] } : {}),
    }),
  });
  if (!r.ok) console.error("resend", r.status, (await r.text()).slice(0, 300));
  return r.ok;
}

export const remetente = (a: Agenda) =>
  a.remetente ? `Anderson Costa Imóveis <${a.remetente}>` : "Agenda do site <onboarding@resend.dev>";

// ------------------------------------------------------- sugestões e preferência
export type Opcao = { inicio: string; rotulo: string; tipo: "livre" | "pedido" };
const periodo = (min: number) => (min < 12 * 60 ? "manha" : min < 13 * 60 + 30 ? "almoco" : min < 18 * 60 ? "tarde" : "noite");
export const rotuloOpcao = (ms: number) => `${rotuloData(ms)} às ${rotuloHora(ms)}`;

/**
 * Picks 3 options spread across routines (weekday morning, weekday afternoon,
 * saturday), favouring the soonest slots and slots next to another visit in the
 * same neighbourhood that day (less driving).
 */
export function sugerirTres(a: Agenda, ocupado: Faixa[], vizinhas: Faixa[] = [], agora = Date.now()): Opcao[] {
  const dias = gerarHorarios(a, ocupado, agora);
  const cands = dias.flatMap((d, iDia) => d.horarios.map((h) => {
    const ms = Date.parse(h.inicio), l = local(ms), m0 = l.h * 60 + l.mi;
    // Next to another visit in the same area that day: the closer, the bigger the bonus
    const dist = Math.min(Infinity, ...vizinhas.filter((v) => local(v.ini).d === l.d).map((v) => Math.abs(v.ini - ms)));
    const perto = dist <= 3 * 3600_000 ? 2.5 * (1 - dist / (3 * 3600_000)) : 0;
    const meiaHora = m0 % 60 === 0 ? 0 : 0.3; // round hours read better
    const almoco = periodo(m0) === "almoco" ? 1.5 : 0;
    return { ms, dow: l.dow, dia: d.data, grupo: l.dow === 6 ? "sabado" : periodo(m0), nota: iDia + meiaHora + almoco - perto };
  }));
  cands.sort((x, y) => x.nota - y.nota || x.ms - y.ms);
  const escolhidos: typeof cands = [];
  for (const g of ["manha", "tarde", "sabado"]) {
    const c = cands.find((x) => x.grupo === g && !escolhidos.some((e) => e.dia === x.dia));
    if (c) escolhidos.push(c);
  }
  for (const c of cands) {
    if (escolhidos.length >= 3) break;
    if (!escolhidos.some((e) => e.dia === c.dia)) escolhidos.push(c);
  }
  for (const c of cands) { if (escolhidos.length >= 3) break; if (!escolhidos.includes(c)) escolhidos.push(c); }
  return escolhidos.sort((x, y) => x.ms - y.ms).map((c) => ({ inicio: new Date(c.ms).toISOString(), rotulo: rotuloOpcao(c.ms), tipo: "livre" }));
}

/**
 * Checks what the lead asked for (a date plus an exact time or a period) against
 * the agenda. Returns the exact slot if free, close alternatives if busy, or a
 * request for Anderson to approve when it falls outside business hours.
 */
export function verificarPreferencia(
  a: Agenda, ocupado: Faixa[], p: { data?: string; hora?: string; periodo?: string }, agora = Date.now(),
) {
  const minimo = agora + a.antecedencia_horas * 3600_000;
  const [y, m, d] = String(p.data ?? "").split("-").map(Number);
  if (!y || !m || !d) return { situacao: "data_invalida", opcoes: [] as Opcao[] };
  const faixaPeriodo: Record<string, [number, number]> = { manha: [0, 720], tarde: [720, 1080], noite: [1080, 1440] };
  const todos = gerarHorarios(a, ocupado, agora).flatMap((x) => x.horarios.map((h) => Date.parse(h.inicio)));
  const doDia = todos.filter((ms) => { const l = local(ms); return l.y === y && l.m === m && l.d === d; });

  if (p.hora && /^\d{1,2}:\d{2}$/.test(p.hora)) {
    const ini = deLocal(y, m, d, minutos(p.hora));
    if (ini < agora + 3600_000) return { situacao: "passado", opcoes: [] as Opcao[] };
    if (dentroDoHorario(a, ini) && ini >= minimo && livre(a, ini, ocupado)) {
      return { situacao: "livre", opcoes: [{ inicio: new Date(ini).toISOString(), rotulo: rotuloOpcao(ini), tipo: "livre" as const }] };
    }
    if (!dentroDoHorario(a, ini)) {
      const perto = doDia.sort((x, z) => Math.abs(x - ini) - Math.abs(z - ini)).slice(0, 2);
      return {
        situacao: "fora_do_expediente",
        opcoes: [
          { inicio: new Date(ini).toISOString(), rotulo: rotuloOpcao(ini), tipo: "pedido" as const },
          ...perto.map((ms) => ({ inicio: new Date(ms).toISOString(), rotulo: rotuloOpcao(ms), tipo: "livre" as const })),
        ],
      };
    }
    const alt = todos.filter((ms) => Math.abs(ms - ini) <= 3 * 86400_000)
      .sort((x, z) => Math.abs(x - ini) - Math.abs(z - ini)).slice(0, 3).sort((x, z) => x - z);
    return { situacao: "ocupado", opcoes: alt.map((ms) => ({ inicio: new Date(ms).toISOString(), rotulo: rotuloOpcao(ms), tipo: "livre" as const })) };
  }

  const [p0, p1] = faixaPeriodo[String(p.periodo ?? "")] ?? [0, 1440];
  const noPeriodo = doDia.filter((ms) => { const l = local(ms), mm = l.h * 60 + l.mi; return mm >= p0 && mm < p1; });
  if (noPeriodo.length) {
    const passo = Math.max(1, Math.floor(noPeriodo.length / 3));
    const sel = [noPeriodo[0], noPeriodo[passo], noPeriodo[passo * 2]].filter((x, i, arr) => x && arr.indexOf(x) === i).slice(0, 3);
    return { situacao: "livre", opcoes: sel.map((ms) => ({ inicio: new Date(ms).toISOString(), rotulo: rotuloOpcao(ms), tipo: "livre" as const })) };
  }
  // Nothing that day/period: same period on the nearest days, or a request when the period is outside hours
  const alvo = deLocal(y, m, d, p0);
  const alt = todos.filter((ms) => { const l = local(ms), mm = l.h * 60 + l.mi; return mm >= p0 && mm < p1; })
    .sort((x, z) => Math.abs(x - alvo) - Math.abs(z - alvo)).slice(0, 3).sort((x, z) => x - z);
  const pedido = deLocal(y, m, d, p.periodo === "noite" ? 19 * 60 : p.periodo === "tarde" ? 14 * 60 : 9 * 60);
  const opPedido = pedido > agora + 3600_000 && !dentroDoHorario(a, pedido)
    ? [{ inicio: new Date(pedido).toISOString(), rotulo: rotuloOpcao(pedido), tipo: "pedido" as const }] : [];
  const opAlt = alt.slice(0, opPedido.length ? 2 : 3).map((ms) => ({ inicio: new Date(ms).toISOString(), rotulo: rotuloOpcao(ms), tipo: "livre" as const }));
  return { situacao: opPedido.length ? "fora_do_expediente" : "sem_vaga_no_dia", opcoes: [...opPedido, ...opAlt] };
}
