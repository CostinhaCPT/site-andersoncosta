'use client';
import { createClient } from '@supabase/supabase-js';
import { SITE } from '@/lib/site';

let cliente;
export function sb() {
  if (!cliente) cliente = createClient(SITE.supabaseUrl, SITE.supabaseKey, { auth: { persistSession: true, storageKey: 'ac_admin' } });
  return cliente;
}
export const BUCKET = 'imoveis';
export const urlPublica = (caminho) => `${SITE.supabaseUrl}/storage/v1/object/public/${BUCKET}/${caminho}`;
export const caminhoDaUrl = (url) => {
  const m = String(url || '').split(`/object/public/${BUCKET}/`);
  return m.length === 2 ? m[1] : null;
};
