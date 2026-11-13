// Sincronização dos imóveis da Domus (parceria do Anderson) a partir do site público deles.
// Lê o sitemap e os dados de cada imóvel, cria os novos no CRM (como rascunho, até ganharem as fotos limpas do Drive)
// e mantém preço e disponibilidade em dia. Imóvel que sai do site da Domus vira "vendido" e o Anderson é avisado.
// Nunca mexe nos textos, fotos e status que o Anderson editou. Credencial: token do relógio (config.cron) ou admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { decode, Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BASE = "https://domuscorretores.com.br";
const PREFIXO = "DM-";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const slugify = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const numero = (s: unknown) => {
  if (s === null || s === undefined || s === "") return null;
  if (typeof s === "number") return s;
  const t = String(s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const limparHtml = (h: string) => String(h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();

function tipoDe(d: any): string {
  const t = d.subtype?.type?.id ?? "", s = (d.subtype?.title ?? "").toLowerCase();
  if (t === "apartamento") return "apartamento";
  if (t === "terreno" || t === "loteamento") return "terreno";
  if (t === "chacara") return "chacara";
  if (s.startsWith("geminad")) return "casa-geminada";
  if (t === "sobrado" || s === "sobrado") return "sobrado";
  return "casa";
}
const NOME_TIPO: Record<string, string> = { casa: "Casa", "casa-geminada": "Geminado", apartamento: "Apartamento", sobrado: "Sobrado", terreno: "Terreno", chacara: "Chácara" };

/** Converte os dados públicos de um imóvel da Domus para a tabela imoveis. */
function mapear(d: any) {
  const tipo = tipoDe(d);
  const areas = d.areas ?? {}, rooms = d.rooms ?? {};
  const v = (k: string) => numero(areas[k]?.value);
  const area = tipo === "apartamento" ? (v("private_area") ?? v("primary_area") ?? v("built_area"))
    : tipo === "terreno" ? (v("total_area") ?? v("primary_area"))
    : (v("built_area") ?? v("primary_area") ?? v("private_area"));
  const terreno = tipo === "apartamento" ? null : (v("total_area") ?? (areas.primary_area?.name === "ground_total_area" ? v("primary_area") : null));
  const r = (k: string) => Number(rooms[k]?.value ?? 0) || 0;
  const quartos = r("bedroom"), suites = r("suite") || r("suites_total"), banheiros = r("bathroom"), vagas = r("garage") + r("parking");
  const bairro = d.neighborhood?.name ?? "", cidade = d.neighborhood?.city?.name ?? "Jaraguá do Sul";
  const ref = String(d.reference);
  const nome = NOME_TIPO[tipo] ?? "Imóvel";
  const partes = [quartos ? `${quartos} ${quartos > 1 ? "quartos" : "quarto"}` : "", suites ? `${suites} ${suites > 1 ? "suítes" : "suíte"}` : ""].filter(Boolean).join(", ");
  const titulo = `${nome}${partes ? ` com ${partes}` : ""} no ${bairro}`.trim();
  const ficha = [area ? `${Math.round(area)} m²` : "", partes, vagas ? `${vagas} ${vagas > 1 ? "vagas" : "vaga"}` : ""].filter(Boolean).join(" · ");
  const caracteristicas = [...(d.characteristics ?? []), ...(d.condo_characteristics ?? [])].map((c: any) => String(c.title ?? "").trim()).filter(Boolean);
  const destaques = [...new Set(caracteristicas.map((c) => c.charAt(0).toUpperCase() + c.slice(1)))].slice(0, 8);
  const fotosDomus = (d.images_extra ?? []).map((i: any) => i.file_url?.large).filter(Boolean);
  return {
    codigo: PREFIXO + ref,
    codigo_parceiro: ref,
    origem: "domus",
    slug: `${slugify(nome)}-${slugify(bairro)}-${slugify(cidade)}-dm${ref}`,
    titulo,
    resumo: `${nome} no ${bairro}, ${cidade}. ${ficha}.`.replace(/\. \./, "."),
    tipo, cidade, bairro,
    preco: numero(d.price),
    area, terreno, quartos, suites, banheiros, vagas,
    condominio: numero(d.condominium_price),
    aceita_permuta: !!d.is_exchangeable,
    aceita_financiamento: !!d.is_financeable,
    destaques,
    visita_exige_proprietario: true, // imóvel de parceiro: a visita sempre é combinada antes
    campos: {
      parceria: "Domus", split_pct: 15, ref_domus: ref, link_domus: `${BASE}/imovel/${d.url}`,
      situacao: d.situation ?? null, sol: d.solar_position ?? null, descricao_domus: limparHtml(d.description).slice(0, 6000),
      fotos_domus: fotosDomus, mobiliado: d.furniture ?? null, atualizado_domus: d.updated_at_timestamp ?? null,
    },
  };
}

async function lerImovel(url: string) {
  const h = await (await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (sincronizacao parceria)" } })).text();
  const m = h.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  return JSON.parse(m[1])?.props?.initialState?.property?.data ?? null;
}

async function sincronizar(opcoes: { limite?: number } = {}) {
  const sm = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]).filter((x) => x.includes("/imovel/"));
  if (urls.length < 20) throw new Error(`Sitemap da Domus veio com só ${urls.length} imóveis; sincronização interrompida por segurança.`);
  const lista = opcoes.limite ? urls.slice(0, opcoes.limite) : urls;
  const lidos: any[] = [];
  for (let i = 0; i < lista.length; i += 15) {
    const lote = await Promise.all(lista.slice(i, i + 15).map((u) => lerImovel(u).catch(() => null)));
    lidos.push(...lote.filter(Boolean));
  }
  const ativos = lidos.filter((d) => d.transaction === "VENDA" && d.status === "Disponível" && d.is_published !== false);
  const { data: atuais } = await sb.from("imoveis").select("id,codigo,status,preco,campos").eq("origem", "domus");
  const porCodigo = new Map((atuais ?? []).map((x: any) => [x.codigo, x]));
  const res = { lidos: lidos.length, novos: 0, preco_mudou: 0, saiu: 0, voltou: 0, erros: [] as string[] };
  const avisos: string[] = [];

  for (const d of ativos) {
    const novo = mapear(d);
    const atual: any = porCodigo.get(novo.codigo);
    if (!atual) {
      const { error } = await sb.from("imoveis").insert({ ...novo, status: "rascunho" });
      if (error) res.erros.push(`${novo.codigo}: ${error.message}`); else res.novos++;
      continue;
    }
    porCodigo.delete(novo.codigo);
    const upd: Record<string, unknown> = { campos: { ...(atual.campos ?? {}), ...novo.campos }, atualizado_em: new Date().toISOString() };
    if (novo.preco && Number(atual.preco) !== novo.preco) {
      upd.preco = novo.preco; res.preco_mudou++;
      avisos.push(`${novo.codigo}: preço de ${Number(atual.preco).toLocaleString("pt-BR")} para ${novo.preco.toLocaleString("pt-BR")}`);
    }
    if (atual.status === "vendido" && atual.campos?.saiu_domus) { upd.status = atual.campos.status_antes ?? "rascunho"; res.voltou++; (upd.campos as any).saiu_domus = null; }
    const { error } = await sb.from("imoveis").update(upd).eq("id", atual.id);
    if (error) res.erros.push(`${novo.codigo}: ${error.message}`);
  }
  // O que sumiu do site da Domus (ou deixou de estar disponível) sai do ar aqui também
  if (!opcoes.limite) {
    for (const x of porCodigo.values() as Iterable<any>) {
      if (x.status === "vendido") continue;
      await sb.from("imoveis").update({ status: "vendido", campos: { ...(x.campos ?? {}), saiu_domus: new Date().toISOString(), status_antes: x.status }, atualizado_em: new Date().toISOString() }).eq("id", x.id);
      res.saiu++; avisos.push(`${x.codigo} saiu do site da Domus e foi tirado do ar`);
    }
  }
  if (avisos.length) {
    await sb.from("notificacoes").insert({ titulo: "Domus: mudanças nos imóveis parceiros", corpo: avisos.slice(0, 4).join(" · ") + (avisos.length > 4 ? ` e mais ${avisos.length - 4}` : ""), url: "/admin/?aba=imoveis", chave: `domus-${new Date().toISOString().slice(0, 10)}` }).then(() => {}, () => {});
  }
  await sb.from("config").upsert({ chave: "domus", valor: { ultima: new Date().toISOString(), ...res, avisos: avisos.slice(0, 30) } });
  return res;
}


// ------------------------------------------------------------------ textos com IA (mesmas regras do botão "Escrever com IA")
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
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
- Use somente os fatos enviados (ficha e texto de referência do parceiro). Nunca invente metragem, distância, material, vista, sol, ano, reforma, marca, escola ou vizinhança.
- Nunca cite rua, número, nome de condomínio ou edifício, nome de proprietário, de corretor ou de imobiliária. Não mencione a parceria.
- Nunca use travessão (o traço longo). Use vírgula, ponto, dois-pontos ou parênteses.
- Sem clichês: imperdível, oportunidade única, no coração de, sofisticação e conforto, mais que uma casa, um estilo de vida, sonho, maravilhoso, espetacular, Imagine. Sem exclamação. Sem emoji.
- Fatos vencem adjetivos. Português do Brasil, frases curtas, tom sereno de quem conhece o imóvel.

Campos:
- titulo: tipo + diferencial concreto + bairro, até 70 caracteres. Sem preço, sem código.
- resumo: uma frase de até 110 caracteres dizendo o que o imóvel tem de mais útil para quem vai morar.
- descricao: 2 ou 3 parágrafos curtos separados por linha em branco. Não repita preço.
- destaques: 3 a 5 itens de até 6 palavras cada, cada um um fato.
- atencao: pontos de atenção honestos que decorrem dos fatos (geminado divide parede; apartamento sem elevador; vaga descoberta). Se não houver, lista vazia. Nunca invente defeito.
- perfil_ideal: uma frase sobre para quem o imóvel faz sentido.`;
const FERRAMENTA = {
  name: "textos_imovel", description: "Devolve os textos da página do imóvel.",
  input_schema: { type: "object", required: ["titulo", "resumo", "descricao", "destaques", "atencao", "perfil_ideal"], properties: {
    titulo: { type: "string" }, resumo: { type: "string" }, descricao: { type: "string" },
    destaques: { type: "array", items: { type: "string" } }, atencao: { type: "array", items: { type: "string" } }, perfil_ideal: { type: "string" } } },
};
const limpar = (s: unknown) => String(s ?? "").replace(/[ \t]*[—–][ \t]*/g, ", ").replace(/!/g, ".").trim();
/** Escreve os textos dos imóveis da Domus que ainda não têm texto próprio (preço mínimo opcional). */
async function redigir(qtd = 6, minimo = 0) {
  let q = sb.from("imoveis").select("id,codigo,tipo,bairro,cidade,preco,area,terreno,quartos,suites,banheiros,vagas,condominio,aceita_financiamento,aceita_permuta,destaques,campos")
    .eq("origem", "domus").neq("status", "vendido").order("preco", { ascending: false }).limit(400);
  if (minimo) q = q.gte("preco", minimo);
  const { data: todos, error: erroLista } = await q;
  if (erroLista) throw new Error(erroLista.message);
  const lista = (todos ?? []).filter((x: any) => !x.campos?.textos_ia).slice(0, qtd);
  const feitos: string[] = [], falhas: string[] = [];
  await Promise.all((lista ?? []).map(async (im: any) => {
    const ficha = { tipo: im.tipo, bairro: im.bairro, cidade: im.cidade, area_m2: im.area, terreno_m2: im.terreno, quartos: im.quartos, suites: im.suites, banheiros: im.banheiros, vagas: im.vagas,
      condominio: im.condominio, financiamento: im.aceita_financiamento, permuta: im.aceita_permuta, caracteristicas: (im.destaques ?? []).join("; "), situacao: im.campos?.situacao, sol: im.campos?.sol };
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: await modelo(), max_tokens: 1500, system: REGRAS + "\n\nResponda somente chamando a ferramenta textos_imovel.", tools: [FERRAMENTA], tool_choice: { type: "auto" },
        messages: [{ role: "user", content: `Ficha:\n${JSON.stringify(ficha)}\n\nTexto de referência do parceiro (fonte dos fatos, não copie):\n${String(im.campos?.descricao_domus ?? "").slice(0, 3500)}` }] }),
    });
    const j = await r.json().catch(() => ({}));
    const t = j.content?.find((b: any) => b.type === "tool_use")?.input;
    if (!t) { falhas.push(`${im.codigo}: ${JSON.stringify(j).slice(0, 200)}`); return; }
    const { error: e2 } = await sb.from("imoveis").update({
      titulo: limpar(t.titulo).slice(0, 90), resumo: limpar(t.resumo), descricao: limpar(t.descricao),
      destaques: (t.destaques ?? []).map(limpar).filter(Boolean).slice(0, 6), atencao: (t.atencao ?? []).map(limpar).filter(Boolean),
      perfil_ideal: limpar(t.perfil_ideal), campos: { ...(im.campos ?? {}), textos_ia: new Date().toISOString() }, embedding: null, atualizado_em: new Date().toISOString(),
    }).eq("id", im.id);
    if (e2) falhas.push(`${im.codigo}: ${e2.message}`); else feitos.push(im.codigo);
  }));
  return { candidatos: lista.length, redigidos: feitos, falhas };
}

// ------------------------------------------------------------------ selo nas fotos com marca da Domus
// Imóvel sem fotos limpas do Drive usa as fotos da Domus; aqui o selo Anderson Costa vai por cima da marca deles
// (centro da foto), com autorização da Domus e do corretor que agenciou. Grava em imoveis/domus/<ref>/sNN.jpg.
let MARCA: Image | null = null;
const SELO_V = 3; // v2 (nov/2026): selo menor em vidro fosco + wordmark nítido; miniatura 720 px. v3 (12/11/2026): realce de luz e cor antes do selo
const MARCA_B64 = "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";
const ehDomus = (u: string) => /imagens\.tecimob\.com\.br/.test(String(u));
// Desfoque suave (box blur separável, 3 passadas ~ gaussiano) direto no bitmap RGBA, sem efeito de mosaico
function desfocar(img: Image, r: number) {
  const w = img.width, h = img.height, px = img.bitmap as Uint8ClampedArray, tmp = new Float32Array(px.length);
  const passada = (src: ArrayLike<number>, dst: Float32Array | Uint8ClampedArray, horizontal: boolean) => {
    const n = horizontal ? w : h, linhas = horizontal ? h : w;
    for (let l = 0; l < linhas; l++) for (let c = 0; c < 4; c++) {
      const idx = (i: number) => ((horizontal ? l * w + i : i * w + l) * 4 + c);
      let soma = 0;
      for (let i = -r; i <= r; i++) soma += src[idx(Math.min(n - 1, Math.max(0, i)))];
      for (let i = 0; i < n; i++) {
        dst[idx(i)] = soma / (2 * r + 1);
        soma += src[idx(Math.min(n - 1, i + r + 1))] - src[idx(Math.max(0, i - r))];
      }
    }
  };
  for (let k = 0; k < 3; k++) { passada(px, tmp, true); passada(tmp, px, false); }
  return img;
}
// Realce automático (aprovado pelo Anderson em 12/11/2026): fotos da Domus chegam escuras.
// Níveis automáticos (corta 0,5% de cada ponta), clareia meios-tons até brilho médio ~150 (nunca escurece),
// segura as altas luzes para o céu não estourar e dá +12% de saturação e +4% de contraste. Tudo por tabela, rápido.
function realcar(img: Image) {
  const px = img.bitmap as Uint8ClampedArray, n = px.length / 4;
  const hist = new Uint32Array(256);
  let soma = 0;
  for (let i = 0; i < px.length; i += 4) { const l = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8; hist[l]++; soma += l; }
  const corte = n * 0.005;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > corte) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > corte) { hi = v; break; } }
  if (hi < lo + 60) hi = Math.min(255, lo + 60);
  const k = 255 / (hi - lo);
  // brilho médio depois dos níveis, para achar o gama que leva a ~150
  let media = 0;
  for (let v = 0; v < 256; v++) media += hist[v] * Math.min(255, Math.max(0, (v - lo) * k));
  media = media / n / 255;
  const g = media > 0.02 ? Math.min(1, Math.max(0.55, Math.log(150 / 255) / Math.log(media))) : 1;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    let x = Math.min(1, Math.max(0, ((v - lo) * k) / 255));
    x = Math.pow(x, g);
    x = x - 0.08 * Math.max(0, x - 0.8) ** 2;
    x = 0.5 + (x - 0.5) * 1.04;
    lut[v] = Math.round(Math.min(1, Math.max(0, x)) * 255);
  }
  for (let i = 0; i < px.length; i += 4) {
    const r = lut[px[i]], gg = lut[px[i + 1]], b = lut[px[i + 2]];
    const l = 0.299 * r + 0.587 * gg + 0.114 * b;
    px[i] = l + (r - l) * 1.12; px[i + 1] = l + (gg - l) * 1.12; px[i + 2] = l + (b - l) * 1.12;
  }
  return img;
}
async function selarFoto(url: string, destino: string) {
  if (!MARCA) MARCA = (await decode(Uint8Array.from(atob(MARCA_B64), (c) => c.charCodeAt(0)))) as Image;
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`foto ${r.status}`);
  let img = (await decode(new Uint8Array(await r.arrayBuffer()))) as Image;
  // lado maior até 1200 px e JPEG 66 (cabe no armazenamento gratuito); miniatura 720 px para os cards ficarem nítidos
  if (img.width >= img.height && img.width > 1200) img = img.resize(1200, Image.RESIZE_AUTO);
  else if (img.height > img.width && img.height > 1200) img = img.resize(Image.RESIZE_AUTO, 1200);
  realcar(img);
  const W = img.width, H = img.height, S = Math.min(W, H);
  // A marca da Domus fica no centro e ocupa ~23% da largura e ~7% da altura (fotos verticais).
  // O selo cobre com folga: 36% do lado menor, proporção 2,5:1, vidro fosco (desfoque) + leve tom escuro.
  const bw = Math.round(0.36 * S), bh = Math.round(bw / 2.5);
  const x = Math.round((W - bw) / 2), y = Math.round((H - bh) / 2);
  const vidro = desfocar(img.clone().crop(x, y, bw, bh), Math.max(6, Math.round(bh / 9)));
  const tom = new Image(bw, bh).fill(Image.rgbaToColor(12, 12, 12, 120));
  vidro.composite(tom, 0, 0).roundCorners(Math.round(bh * 0.22));
  img.composite(vidro, x, y);
  const m = MARCA.clone().resize(Math.round(bw * 0.74), Image.RESIZE_AUTO);
  img.composite(m, Math.round((W - m.width) / 2), Math.round((H - m.height) / 2));
  const mini = img.clone().resize(W >= H ? 720 : Image.RESIZE_AUTO, W >= H ? Image.RESIZE_AUTO : 720);
  const a = await sb.storage.from("imoveis").upload(`${destino}.jpg`, await img.encodeJPEG(66), { contentType: "image/jpeg", upsert: true, cacheControl: "604800" });
  const b = await sb.storage.from("imoveis").upload(`${destino}-p.jpg`, await mini.encodeJPEG(64), { contentType: "image/jpeg", upsert: true, cacheControl: "604800" });
  if (a.error || b.error) throw new Error((a.error ?? b.error)!.message);
  return `${URL_SB}/storage/v1/object/public/imoveis/${destino}.jpg?v=${SELO_V}`;
}
// Imóvel precisa de selo: ainda tem foto da Domus, ou foi selado numa versão antiga do selo
const precisaSelo = (x: any) => {
  if (x.campos?.selo_erro) return false;
  const f = (x.fotos ?? []) as string[];
  if (!f.length) return (x.campos?.fotos_domus ?? []).length > 0;
  if (f.some(ehDomus)) return true;
  return f.some((u) => u.includes("/imoveis/domus/")) && (x.campos?.fotos_domus ?? []).length > 0 && (x.campos?.selo_v ?? 1) < SELO_V;
};
async function selar(codigo?: string, maxFotos = 30) {
  let q = sb.from("imoveis").select("id,codigo,fotos,campos").eq("origem", "domus").neq("status", "vendido");
  q = codigo ? q.eq("codigo", codigo) : q.order("preco", { ascending: false });
  const { data } = await q.limit(codigo ? 1 : 400);
  const alvo = (data ?? []).find((x: any) => (codigo ? (x.campos?.fotos_domus ?? []).length > 0 || (x.fotos ?? []).some(ehDomus) : precisaSelo(x)));
  if (!alvo) return { pendentes: 0 };
  const atuais = (alvo.fotos ?? []) as string[];
  const resselar = !atuais.some(ehDomus) && (alvo.campos?.fotos_domus ?? []).length > 0;
  const ref = alvo.campos?.ref_domus ?? alvo.codigo.replace(PREFIXO, "");
  const fd = (alvo.campos?.fotos_domus ?? []) as string[];
  // No reselo mantém a lista e a ordem que o Anderson deixou: cada sNN.jpg volta para a foto original NN da Domus
  const destinos: string[] = [];
  const origem: string[] = resselar
    ? atuais.map((u, i) => { const n = u.match(/\/imoveis\/domus\/[^/]+\/s(\d+)\.jpg/); destinos[i] = n ? `s${n[1]}` : ""; return n && fd[+n[1] - 1] ? fd[+n[1] - 1] : u; })
    : ((!atuais.length ? fd : atuais) as string[]);
  const prog: string[] = alvo.campos?.selo_feitas ?? [];
  const saida = origem.map((u, i) => (ehDomus(u) ? (prog[i] ?? null) : u));
  let feitas = 0, falhas = 0;
  for (let i = 0; i < origem.length && feitas < maxFotos; i++) {
    if (saida[i]) continue;
    try { saida[i] = await selarFoto(origem[i], `domus/${ref}/${destinos[i] || "s" + String(i + 1).padStart(2, "0")}`); feitas++; }
    catch (e) { console.error(alvo.codigo, i, e); falhas++; saida[i] = null; }
  }
  const completo = saida.every(Boolean);
  const campos = { ...(alvo.campos ?? {}) };
  if (completo) { delete campos.selo_feitas; campos.fotos_seladas = new Date().toISOString(); campos.fotos_marca_domus = false; campos.selo_v = SELO_V; }
  else { campos.selo_feitas = saida; if (falhas && !feitas) campos.selo_erro = new Date().toISOString(); }
  const upd: Record<string, unknown> = { campos, atualizado_em: new Date().toISOString() };
  // durante o reselo o site continua com as fotos antigas (mesmo endereço); a troca acontece no fim, com ?v=2
  if (completo) upd.fotos = saida;
  await sb.from("imoveis").update(upd).eq("id", alvo.id);
  return { codigo: alvo.codigo, feitas, falhas, completo, total: origem.length };
}

async function autorizado(req: Request, body: Record<string, any>) {
  const { data } = await sb.from("config").select("valor").eq("chave", "cron").maybeSingle();
  if (data?.valor?.token && body.token === data.valor.token) return true;
  const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!auth) return false;
  const u = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${auth}` } }, auth: { persistSession: false } });
  const { data: ok } = await u.rpc("eh_admin");
  return ok === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "https://andersoncostaimoveis.com.br", "Access-Control-Allow-Headers": "content-type, authorization, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* vazio */ }
  if (!(await autorizado(req, body))) return json({ erro: "acesso negado" }, 403);
  try {
    if (body.acao === "selar") return json(await selar(body.codigo, Number(body.max ?? 30)));
    if (body.acao === "redigir") return json(await redigir(Number(body.qtd ?? 6), Number(body.minimo ?? 0)));
    return json(await sincronizar({ limite: body.limite }));
  }
  catch (e) { console.error(e); return json({ erro: (e as Error).message }, 200); }
});
