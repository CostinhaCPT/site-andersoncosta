-- Admin do site: quem administra, permissões e bucket de fotos (aplicada em 28/10/2026)
create table if not exists public.admins (email text primary key, criado_em timestamptz default now());
alter table public.admins enable row level security;
insert into public.admins(email) values
  ('anderson@andersoncostaimoveis.com.br'), ('contato@andersoncostaimoveis.com.br'), ('anderson@paixaocosta.com')
on conflict do nothing;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke execute on function public.eh_admin() from public, anon;
grant execute on function public.eh_admin() to authenticated;
create policy "admin le a lista" on public.admins for select to authenticated using (public.eh_admin());

alter table public.imoveis add column if not exists ref_amostra integer;
alter table public.imoveis add column if not exists ordem integer;
create unique index if not exists imoveis_codigo_uk on public.imoveis(codigo);
create unique index if not exists imoveis_slug_uk on public.imoveis(slug);
create policy "admin gerencia imoveis" on public.imoveis for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

create policy "admin le leads" on public.leads for select to authenticated using (public.eh_admin());
create policy "admin atualiza leads" on public.leads for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy "admin le conversas" on public.conversas for select to authenticated using (public.eh_admin());
create policy "admin le mensagens" on public.mensagens for select to authenticated using (public.eh_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imoveis', 'imoveis', true, 6000000, array['image/webp','image/jpeg'])
on conflict (id) do nothing;
create policy "admin envia fotos" on storage.objects for insert to authenticated with check (bucket_id = 'imoveis' and public.eh_admin());
create policy "admin altera fotos" on storage.objects for update to authenticated using (bucket_id = 'imoveis' and public.eh_admin());
create policy "admin apaga fotos" on storage.objects for delete to authenticated using (bucket_id = 'imoveis' and public.eh_admin());
