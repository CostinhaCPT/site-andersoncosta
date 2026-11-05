// Áudio, foto e voz do atendimento: transcrição, armazenamento privado e síntese de fala.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const OPENAI = Deno.env.get("OPENAI_API_KEY") ?? "";
const BUCKET = "anexos";
export const MAX_AUDIO_BYTES = 2_500_000; // ~1 min em qualquer formato do celular
export const MAX_IMAGEM_BYTES = 2_000_000;

export function base64ParaBytes(b64: string) {
  const limpo = b64.includes(",") ? b64.split(",")[1] : b64;
  const bin = atob(limpo);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesParaBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function extensao(mime: string) {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

export async function transcrever(bytes: Uint8Array, mime: string): Promise<string> {
  const ext = extensao(mime);
  for (const model of ["gpt-4o-mini-transcribe", "whisper-1"]) {
    const fd = new FormData();
    fd.append("file", new Blob([bytes as BlobPart], { type: mime.split(";")[0] || "audio/webm" }), `audio.${ext}`);
    fd.append("model", model);
    fd.append("language", "pt");
    fd.append("prompt", "Conversa sobre compra de imóveis em Jaraguá do Sul, Guaramirim, Schroeder, Corupá e Massaranduba. Bairros: Amizade, Três Rios do Norte, Três Rios do Sul, Ilha da Figueira, Vila Nova, Nereu Ramos, Centro. Termos: ITBI, FGTS, financiamento, geminado, suíte.");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${OPENAI}` }, body: fd,
    });
    if (r.ok) return String((await r.json()).text ?? "").trim();
    console.error("transcricao", model, r.status, (await r.text()).slice(0, 300));
  }
  throw new Error("falha na transcrição");
}

export async function guardarAnexo(sb: SupabaseClient, conversaId: string, bytes: Uint8Array, mime: string) {
  const mes = new Date().toISOString().slice(0, 7);
  const caminho = `${mes}/${conversaId}/${Date.now()}.${extensao(mime)}`;
  const enviar = () => sb.storage.from(BUCKET).upload(caminho, bytes, { contentType: mime.split(";")[0], upsert: false });
  let { error } = await enviar();
  if (error && /not found|does not exist/i.test(error.message)) {
    await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 5_000_000 });
    ({ error } = await enviar());
  }
  if (error) { console.error("anexo", error.message); return null; }
  return caminho;
}

// Apaga anexos com mais de 90 dias (pastas por mês)
export async function limparAnexos(sb: SupabaseClient) {
  const limite = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 7);
  const { data: meses } = await sb.storage.from(BUCKET).list("", { limit: 100 });
  let apagados = 0;
  for (const m of meses ?? []) {
    if (!/^\d{4}-\d{2}$/.test(m.name) || m.name >= limite) continue;
    const { data: conversas } = await sb.storage.from(BUCKET).list(m.name, { limit: 1000 });
    for (const c of conversas ?? []) {
      const { data: arqs } = await sb.storage.from(BUCKET).list(`${m.name}/${c.name}`, { limit: 1000 });
      const caminhos = (arqs ?? []).map((a) => `${m.name}/${c.name}/${a.name}`);
      if (caminhos.length) { await sb.storage.from(BUCKET).remove(caminhos); apagados += caminhos.length; }
    }
  }
  return apagados;
}

// Números por extenso em português, para a voz não ler "862 reais mil"
const UN = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze",
  "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEM = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number) {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100, p: string[] = [];
  if (c) p.push(CEM[c]);
  if (r) p.push(r < 20 ? UN[r] : DEZ[Math.floor(r / 10)] + (r % 10 ? " e " + UN[r % 10] : ""));
  return p.join(" e ");
}

export function extenso(n: number) {
  n = Math.round(n);
  if (n === 0) return "zero";
  const grupos: [number, string, string][] = [[1e9, "bilhão", "bilhões"], [1e6, "milhão", "milhões"], [1e3, "mil", "mil"], [1, "", ""]];
  const partes: { v: number; t: string }[] = [];
  let resto = n;
  for (const [base, sing, plur] of grupos) {
    const q = Math.floor(resto / base);
    resto %= base;
    if (!q) continue;
    const t = base === 1e3 && q === 1 ? "mil" : base === 1 ? ate999(q) : `${ate999(q)} ${q === 1 ? sing : plur}`;
    partes.push({ v: q, t });
  }
  return partes.map((p, i) => (i === 0 ? "" : p.v < 100 || p.v % 100 === 0 ? " e " : ", ") + p.t).join("");
}

function reais(total: number) {
  const t = extenso(total);
  return total >= 1e6 && total % 1e6 === 0 ? `${t} de reais` : `${t} reais`;
}

export function paraFala(texto: string) {
  return texto
    .replace(/https?:\/\/\S+/g, "")
    .replace(/R\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(?:\s?(mil|milhão|milhões|milhao|milhoes)\b)?/gi,
      (_m, int: string, dec: string | undefined, suf: string | undefined) => {
        const base = Number(int.replace(/\./g, "")) + (dec ? Number("0." + dec) : 0);
        const mult = !suf ? 1 : /^mil$/i.test(suf) ? 1e3 : 1e6;
        return reais(suf ? base * mult : Math.floor(base));
      })
    .replace(/(\d{1,3})\.(\d{3})\b/g, "$1$2")
    .replace(/\s?m²/g, " metros quadrados")
    .replace(/\bAC-0*(\d+)\b/g, "código $1")
    .replace(/\bDM-0*(\d+)\b/g, "referência $1")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 1200);
}

export async function sintetizar(texto: string, formato: "mp3" | "opus" = "mp3"): Promise<Uint8Array> {
  const input = paraFala(texto);
  const tentativas = [
    {
      model: "gpt-4o-mini-tts", voice: "coral", input, response_format: formato,
      instructions: "Fale em português do Brasil, com sotaque neutro, tom cordial e calmo, como uma atendente atenciosa conversando por mensagem de voz. Ritmo natural, sem pressa.",
    },
    { model: "tts-1", voice: "nova", input, response_format: formato },
  ];
  for (const body of tentativas) {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) return new Uint8Array(await r.arrayBuffer());
    console.error("voz", body.model, r.status, (await r.text()).slice(0, 300));
  }
  throw new Error("falha na síntese de voz");
}
