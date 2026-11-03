export const brl = (v) => (v == null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
export const num = (v) => (v == null ? '' : v.toLocaleString('pt-BR'));
// Thumbnail generated next to every photo: 01.webp -> 01-p.webp (also .jpg)
export const miniatura = (url) => String(url || '').replace(/\.(webp|jpe?g)$/i, '-p.$1');
