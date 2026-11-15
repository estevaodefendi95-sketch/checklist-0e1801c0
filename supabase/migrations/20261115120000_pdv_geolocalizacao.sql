-- Restrição por localização: usuários marcados só operam o PDV dentro do raio do restaurante.
alter table checklist.pdv_config
  add column if not exists geo_ativo boolean not null default false,
  add column if not exists local_lat double precision,
  add column if not exists local_lng double precision,
  add column if not exists raio_equipe_m int not null default 200 check (raio_equipe_m between 20 and 5000),
  add column if not exists raio_tablet_m int not null default 500 check (raio_tablet_m between 20 and 5000),
  add column if not exists geo_tablet_ativo boolean not null default false;
alter table checklist.permissoes add column if not exists pdv_so_no_local boolean not null default false;

create table if not exists checklist.pdv_presenca (
  user_id uuid primary key,
  lat double precision not null, lng double precision not null, precisao real,
  dist_m int not null, dentro boolean not null,
  valido_ate timestamptz not null, atualizado_em timestamptz not null default now()
);
alter table checklist.pdv_presenca enable row level security;
revoke all on checklist.pdv_presenca from anon, authenticated;

create or replace function checklist.pdv_distancia_m(la1 double precision, lo1 double precision, la2 double precision, lo2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(power(sin(radians(la2 - la1) / 2), 2) + cos(radians(la1)) * cos(radians(la2)) * power(sin(radians(lo2 - lo1) / 2), 2)))
$$;

-- permissão "pura" (como era o pdv_pode); o app usa esta para montar os menus
create or replace function checklist.pdv_pode_perm(p text) returns boolean language sql stable security definer set search_path = checklist, public as $$
  select coalesce((select r.role='admin' or coalesce(r.is_master,false) from checklist.profiles r where r.id=auth.uid()),false)
  or coalesce((select coalesce((to_jsonb(pm)->>p)::boolean,false) from checklist.permissoes pm where pm.user_id=auth.uid()),false)
$$;

create or replace function checklist.pdv_no_local() returns boolean language sql stable security definer set search_path = checklist, public as $$
  select case
    when not coalesce((select geo_ativo and local_lat is not null and local_lng is not null from checklist.pdv_config where id=1), false) then true
    when coalesce((select r.role='admin' or coalesce(r.is_master,false) from checklist.profiles r where r.id=auth.uid()), false) then true
    when not coalesce((select pm.pdv_so_no_local from checklist.permissoes pm where pm.user_id=auth.uid()), false) then true
    else coalesce((select pr.dentro and pr.valido_ate > now() from checklist.pdv_presenca pr where pr.user_id=auth.uid()), false)
  end
$$;

-- operar, receber, descontos: só dentro do local (quando o usuário é restrito)
create or replace function checklist.pdv_pode(p text) returns boolean language sql stable security definer set search_path = checklist, public as $$
  select checklist.pdv_pode_perm(p)
     and (p not in ('pdv_operar','pdv_caixa','pdv_desconto','pdv_tirar_servico','pdv_tirar_couvert') or checklist.pdv_no_local())
$$;

create or replace function checklist.pdv_registrar_presenca(p_lat double precision, p_lng double precision, p_precisao real default null)
returns jsonb language plpgsql security definer set search_path = checklist, public as $$
declare c record; d double precision; ok boolean;
begin
  if auth.uid() is null then raise exception 'sem login'; end if;
  select * into c from checklist.pdv_config where id = 1;
  if c.local_lat is null or c.local_lng is null then return jsonb_build_object('dentro', true, 'dist_m', 0, 'raio_m', c.raio_equipe_m); end if;
  d := checklist.pdv_distancia_m(p_lat, p_lng, c.local_lat, c.local_lng);
  ok := (d - least(coalesce(p_precisao, 0), 100)) <= c.raio_equipe_m;
  insert into checklist.pdv_presenca(user_id, lat, lng, precisao, dist_m, dentro, valido_ate, atualizado_em)
  values (auth.uid(), p_lat, p_lng, p_precisao, round(d)::int, ok, now() + interval '2 minutes', now())
  on conflict (user_id) do update set lat = excluded.lat, lng = excluded.lng, precisao = excluded.precisao, dist_m = excluded.dist_m,
    dentro = excluded.dentro, valido_ate = excluded.valido_ate, atualizado_em = now();
  return jsonb_build_object('dentro', ok, 'dist_m', round(d)::int, 'raio_m', c.raio_equipe_m);
end $$;

create or replace function checklist.pdv_geo_estado() returns jsonb language sql stable security definer set search_path = checklist, public as $$
  select jsonb_build_object(
    'ativo', coalesce(c.geo_ativo and c.local_lat is not null and c.local_lng is not null, false),
    'restrito', coalesce(pm.pdv_so_no_local, false) and not coalesce((select r.role='admin' or coalesce(r.is_master,false) from checklist.profiles r where r.id=auth.uid()), false),
    'raio_m', c.raio_equipe_m)
  from checklist.pdv_config c left join checklist.permissoes pm on pm.user_id = auth.uid() where c.id = 1
$$;

revoke execute on function checklist.pdv_pode_perm(text), checklist.pdv_no_local(), checklist.pdv_registrar_presenca(double precision, double precision, real), checklist.pdv_geo_estado() from public, anon;
grant execute on function checklist.pdv_pode_perm(text), checklist.pdv_no_local(), checklist.pdv_registrar_presenca(double precision, double precision, real), checklist.pdv_geo_estado() to authenticated;
