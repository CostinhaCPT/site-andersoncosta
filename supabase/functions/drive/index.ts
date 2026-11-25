// Fotos limpas do Drive (pasta "Imóveis DOMUS", inclusive a do Rafael Sartori) para o site, sem marca d'água nenhuma.
// Quem lê o Drive é um Google Apps Script rodando na conta do Anderson (só ele tem acesso às pastas).
// O script manda o índice das pastas e depois as fotos, uma por chamada. Credencial: config.drive.token.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const PUB = `${URL_SB}/storage/v1/object/public/imoveis/`;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

async function cfg(chave: string) {
  const { data } = await sb.from("config").select("valor").eq("chave", chave).maybeSingle();
  return (data?.valor ?? {}) as Record<string, any>;
}
async function salvarCfg(chave: string, valor: unknown) {
  await sb.from("config").upsert({ chave, valor });
}
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const pasta = (cod: string) => `limpas/${cod.toLowerCase()}`;

// 1) índice de todas as pastas com fotos; casa sozinho as da Domus que começam com o número do imóvel ("398 - ...")
async function indice(body: any) {
  const pastas = (body.pastas ?? []) as any[];
  const mapa = await cfg("drive_mapa");
  const { data: ims } = await sb.from("imoveis").select("codigo").like("codigo", "DM-%");
  const existe = new Set((ims ?? []).map((x: any) => x.codigo));
  let novas = 0;
  for (const p of pastas) {
    if (/INATIVOS|N[ÃA]O USAR|vendid/i.test(`${p.caminho}/${p.nome}`)) continue;
    const m = String(p.nome).match(/^\s*(\d{2,4})\s*[-–]/);
    const cod = m ? `DM-${Number(m[1])}` : null;
    if (cod && existe.has(cod) && !mapa[cod]) { mapa[cod] = { pasta: p.id, nome: p.nome, auto: true }; novas++; }
  }
  await salvarCfg("drive_indice", { em: new Date().toISOString(), pastas });
  await salvarCfg("drive_mapa", mapa);
  return { pastas: pastas.length, mapeadas: Object.keys(mapa).length, novas };
}

// 2) o que baixar agora: imóveis mapeados cuja pasta mudou desde a última cópia (prioridade: agendados no Estúdio e AC)
async function plano(body: any) {
  const mapa = await cfg("drive_mapa");
  const idx = await cfg("drive_indice");
  const mods = new Map((idx.pastas ?? []).map((p: any) => [p.id, p.mod]));
  const cods = Object.keys(mapa);
  if (!cods.length) return { fila: [] };
  const { data: ims } = await sb.from("imoveis").select("codigo,status,campos").in("codigo", cods).neq("status", "vendido");
  const { data: ag } = await sb.from("criativos").select("imovel_codigo").in("status", ["agendado", "rascunho"]);
  const pri = new Set((ag ?? []).map((x: any) => x.imovel_codigo));
  const fila = (ims ?? [])
    .filter((x: any) => (x.campos?.fotos_limpas_mod ?? 0) < (mods.get(mapa[x.codigo].pasta) ?? 1))
    .sort((a: any, b: any) => (pri.has(b.codigo) ? 1 : 0) - (pri.has(a.codigo) ? 1 : 0) || (b.codigo.startsWith("AC") ? 1 : 0) - (a.codigo.startsWith("AC") ? 1 : 0))
    .slice(0, Number(body.limite) || 5)
    .map((x: any) => ({ codigo: x.codigo, pasta: mapa[x.codigo].pasta, mod: mods.get(mapa[x.codigo].pasta) ?? 1 }));
  return { fila, total_mapeados: cods.length };
}

// 3) uma foto (grande 1600 px e miniatura 720 px, já redimensionadas pelo Google)
async function foto(body: any) {
  const nn = String(body.i).padStart(2, "0");
  const base = `${pasta(String(body.codigo))}/${nn}`;
  for (const [suf, dado] of [["", body.grande], ["-p", body.pequena]] as const) {
    if (!dado) continue;
    const { error } = await sb.storage.from("imoveis").upload(`${base}${suf}.jpg`, b64(dado), { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(error.message);
  }
  return { ok: true };
}

// 4) troca a galeria do imóvel pelas fotos limpas (o site e o Estúdio passam a usar só elas)
async function fechar(body: any) {
  const cod = String(body.codigo); const n = Number(body.n);
  if (!n) return { erro: "sem fotos" };
  const { data: im } = await sb.from("imoveis").select("id,status,origem,fotos,campos").eq("codigo", cod).single();
  if (!im) return { erro: "imóvel não encontrado" };
  const v = Date.now().toString(36);
  const fotos = Array.from({ length: n }, (_, i) => `${PUB}${pasta(cod)}/${String(i + 1).padStart(2, "0")}.jpg?v=${v}`);
  const antigas = ((im.fotos ?? []) as string[]).filter((u) => u.startsWith(PUB) && !u.includes("/limpas/"));
  const campos = { ...(im.campos ?? {}), fotos_drive: true, fotos_limpas: new Date().toISOString(), fotos_limpas_mod: Number(body.mod) || Date.now(), fotos_antigas: antigas.length ? antigas : im.campos?.fotos_antigas };
  const upd: Record<string, unknown> = { fotos, campos };
  if (im.status === "rascunho" && im.origem === "domus") upd.status = "disponivel";
  await sb.from("imoveis").update(upd).eq("id", im.id);
  // sobra de fotos de uma cópia anterior maior
  const { data: lista } = await sb.storage.from("imoveis").list(pasta(cod), { limit: 200 });
  const sobra = (lista ?? []).map((f: any) => f.name).filter((nm: string) => Number(nm.slice(0, 2)) > n).map((nm: string) => `${pasta(cod)}/${nm}`);
  if (sobra.length) await sb.storage.from("imoveis").remove(sobra);
  // as cópias antigas com selo só saem do armazenamento quando o Anderson liberar (config.drive.apagar_antigas)
  const c = await cfg("drive");
  let apagadas = 0;
  if (c.apagar_antigas && antigas.length) {
    const caminhos = antigas.flatMap((u) => { const p = u.slice(PUB.length).split("?")[0]; return [p, p.replace(/\.(jpe?g|webp)$/i, "-p.$1")]; });
    const { data } = await sb.storage.from("imoveis").remove(caminhos);
    apagadas = data?.length ?? 0;
  }
  return { ok: true, fotos: n, apagadas };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405);
  let body: any; try { body = await req.json(); } catch { return json({ erro: "json inválido" }, 400); }
  const c = await cfg("drive");
  if (!c.token || body.token !== c.token) return json({ erro: "acesso negado" }, 403);
  try {
    if (body.acao === "indice") return json(await indice(body));
    if (body.acao === "plano") return json(await plano(body));
    if (body.acao === "foto") return json(await foto(body));
    if (body.acao === "fechar") return json(await fechar(body));
    return json({ erro: "ação desconhecida" }, 400);
  } catch (e) { return json({ erro: (e as Error).message }, 500); }
});
