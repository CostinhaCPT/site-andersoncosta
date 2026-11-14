// Gera as imagens de compartilhamento (WhatsApp, Instagram, Facebook): public/og/*.jpg, 1200x630.
// WebP nem sempre aparece na prévia do WhatsApp; JPG aparece em todos.
// Só para fotos locais (/fotos/...). As dos parceiros já são JPG e são usadas direto.
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import sharp from 'sharp';
const dados = JSON.parse(readFileSync('data/imoveis.json', 'utf8'));
mkdirSync('public/og', { recursive: true });
const gerar = async (origem, destino) => {
  if (existsSync(destino)) return;
  await sharp(origem).resize(1200, 630, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82, mozjpeg: true }).toFile(destino);
};
let n = 0;
for (const i of dados) {
  const f = i.fotos?.[0];
  if (!f || !f.startsWith('/') || !existsSync('public' + f)) continue;
  try { await gerar('public' + f, `public/og/${i.codigo.toLowerCase()}.jpg`); n++; } catch (e) { console.warn('og', i.codigo, e.message); }
}
// Imagem padrão do site: a foto da capa (AC-0020)
try { await gerar('public/fotos/ac-0020/01.webp', 'public/og/site.jpg'); } catch (e) { console.warn('og site', e.message); }
console.log(`${n} imagens de compartilhamento prontas`);
