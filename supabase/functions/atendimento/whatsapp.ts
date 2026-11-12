// WhatsApp Cloud API (oficial da Meta): envio, mídia, assinatura do webhook.
// Sem credenciais configuradas, nada é enviado: tudo vira registro.
import type { Opcao } from "./agenda.ts";

const TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
export const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const VERSAO = Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v23.0";
const GRAPH = `https://graph.facebook.com/${VERSAO}`;

export const waConfigurado = () => !!(TOKEN && PHONE_ID);
export const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** Brazilian mobiles sometimes arrive without the 9th digit (55 47 8xxx-xxxx). Normalise to 13 digits. */
export function foneCanonico(wa: string) {
  const d = soDigitos(wa);
  if (/^55\d{2}[6-9]\d{7}$/.test(d)) return d.slice(0, 4) + "9" + d.slice(4);
  return d;
}

/** Validates X-Hub-Signature-256 (HMAC SHA-256 of the raw body with the app secret). */
export async function assinaturaValida(bruto: string, cabecalho: string | null) {
  if (!APP_SECRET) return false;
  if (!cabecalho?.startsWith("sha256=")) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(bruto)));
  const hex = Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
  const recebido = cabecalho.slice(7).toLowerCase();
  if (recebido.length !== hex.length) return false;
  let dif = 0;
  for (let i = 0; i < hex.length; i++) dif |= hex.charCodeAt(i) ^ recebido.charCodeAt(i);
  return dif === 0;
}

export type Envio = { ok: boolean; wamid?: string; erro?: string; codigo?: number; simulado?: boolean };

async function enviar(para: string, conteudo: Record<string, unknown>): Promise<Envio> {
  if (!waConfigurado()) return { ok: false, simulado: true, erro: "whatsapp_nao_configurado" };
  const r = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: soDigitos(para), ...conteudo }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("wa envio", r.status, JSON.stringify(j).slice(0, 400));
    return { ok: false, erro: j?.error?.message ?? `http ${r.status}`, codigo: j?.error?.code };
  }
  return { ok: true, wamid: j?.messages?.[0]?.id };
}

/** Sends a voice note: uploads OGG/Opus audio to the Cloud API and sends it as a voice message. */
export async function enviarAudio(para: string, ogg: Uint8Array): Promise<Envio> {
  if (!waConfigurado()) return { ok: false, simulado: true, erro: "whatsapp_nao_configurado" };
  const fd = new FormData();
  fd.append("messaging_product", "whatsapp");
  fd.append("type", "audio/ogg");
  fd.append("file", new Blob([ogg as BlobPart], { type: "audio/ogg" }), "resposta.ogg");
  const up = await fetch(`${GRAPH}/${PHONE_ID}/media`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: fd });
  const j = await up.json().catch(() => ({}));
  if (!up.ok || !j?.id) { console.error("wa upload audio", up.status, JSON.stringify(j).slice(0, 300)); return { ok: false, erro: j?.error?.message ?? `http ${up.status}` }; }
  return enviar(para, { type: "audio", audio: { id: j.id, voice: true } });
}

/** WhatsApp formatting: markdown links and headings do not render there. */
export function paraWhats(t: string) {
  return t
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1: $2")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .slice(0, 4000);
}

export const enviarTexto = (para: string, texto: string) =>
  enviar(para, { type: "text", text: { body: paraWhats(texto), preview_url: /https?:\/\//.test(texto) } });

/** Visit options as a tappable list (up to 10 rows; we send the options plus "Nenhum desses serve"). */
export function enviarHorarios(para: string, opcoes: Opcao[], corpo: string) {
  const rows = opcoes.slice(0, 9).map((o) => ({
    id: `v:${o.inicio}`,
    title: o.rotulo.slice(0, 24),
    description: o.tipo === "pedido" ? "Pedido: o Anderson confirma" : "Livre na agenda",
  }));
  rows.push({ id: "v:nenhum", title: "Nenhum desses serve", description: "Prefiro outro dia ou horário" });
  return enviar(para, {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: corpo.slice(0, 1000) },
      footer: { text: "Anderson Costa · CRECI SC 68594" },
      action: { button: "Ver horários", sections: [{ title: "Horários", rows }] },
    },
  });
}

/** Approved template (required outside the 24h customer service window). */
export function enviarTemplate(para: string, nome: string, idioma: string, variaveis: string[]) {
  return enviar(para, {
    type: "template",
    template: {
      name: nome, language: { code: idioma },
      ...(variaveis.length ? { components: [{ type: "body", parameters: variaveis.map((t) => ({ type: "text", text: t })) }] } : {}),
    },
  });
}

/** Lists the WABA templates and submits new ones (name, category, language, body text with {{n}} and examples). */
export async function gerirTemplates(waba: string, criar: Record<string, any>[]) {
  if (!TOKEN || !/^\d{6,20}$/.test(waba)) return { erro: "sem token ou waba inválido" };
  const criados: unknown[] = [];
  for (const t of criar.slice(0, 10)) {
    const nome = String(t.nome ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 60);
    const texto = String(t.texto ?? "").slice(0, 1000);
    if (!nome || !texto) { criados.push({ nome, erro: "nome ou texto vazio" }); continue; }
    const exemplos = Array.isArray(t.exemplos) ? t.exemplos.map(String) : [];
    const r = await fetch(`${GRAPH}/${waba}/message_templates`, {
      method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nome, language: String(t.idioma ?? "pt_BR"), category: String(t.categoria ?? "MARKETING"),
        components: [{ type: "BODY", text: texto, ...(exemplos.length ? { example: { body_text: [exemplos] } } : {}) }],
      }),
    });
    criados.push({ nome, status: r.status, resposta: await r.json().catch(() => ({})) });
  }
  const l = await fetch(`${GRAPH}/${waba}/message_templates?fields=name,status,category,language,rejected_reason&limit=50`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  return { criados, lista: (await l.json().catch(() => ({})))?.data ?? [] };
}

export async function marcarLida(wamid: string) {
  if (!waConfigurado()) return;
  await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: wamid }),
  }).catch(() => {});
}

/** Downloads a media file (audio or image) sent by the person. */
export async function baixarMidia(id: string, maxBytes: number): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!TOKEN) return null;
  const meta = await fetch(`${GRAPH}/${id}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!meta.ok) { console.error("wa midia meta", meta.status); return null; }
  const m = await meta.json();
  if (Number(m.file_size ?? 0) > maxBytes) return null;
  const arq = await fetch(m.url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!arq.ok) { console.error("wa midia", arq.status); return null; }
  const bytes = new Uint8Array(await arq.arrayBuffer());
  if (bytes.length > maxBytes) return null;
  return { bytes, mime: String(m.mime_type ?? "application/octet-stream").split(";")[0] };
}

/** Opt-out intent. Deliberately strict on explicit phrases to avoid false positives like "não quero casa". */
const OPT_OUT = [
  /^\s*(parar|pare|sair|stop|cancelar|descadastrar)\s*[.!]?\s*$/i,
  /^\s*parar (as )?mensagens\s*$/i,
  /n[aã]o\s+(me\s+)?(mand[ae]|envi[ae])\s+mais/i,
  /(parem?|pode\s+parar)\s+de\s+(me\s+)?(mandar|enviar|chamar)/i,
  /n[aã]o\s+quero\s+(mais\s+)?receber/i,
  /(me\s+)?(tir[ae]|remov[ae])\s+(meu\s+n[uú]mero|da\s+lista|dos?\s+contatos?)/i,
  /n[aã]o\s+(tenho\s+)?mais\s+interesse/i,
  /n[aã]o\s+me\s+(chame|chamem|procure|procurem)\s+mais/i,
];
export const pediuParaParar = (t: string) => OPT_OUT.some((r) => r.test(t));
