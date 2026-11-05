export const brl = (v) => (v == null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
export const num = (v) => (v == null ? '' : v.toLocaleString('pt-BR'));
// Thumbnail generated next to every photo: 01.webp -> 01-p.webp (also .jpg)
// Miniatura: fotos próprias têm a versão "-p"; fotos da Domus (parceria) usam a versão 600x450 do servidor deles
export const miniatura = (url) => {
  const u = String(url || '');
  const t = u.match(/^(https:\/\/imagens\.tecimob\.com\.br\/.+\/images\/)([^/]+)\.jpe?g$/i);
  if (t) return `${t[1]}600x450/outside/${t[2]}.webp`;
  return u.replace(/\.(webp|jpe?g)$/i, '-p.$1');
};
