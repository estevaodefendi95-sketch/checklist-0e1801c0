-- CRM: clientes (check-in com nome e telefone obrigatórios), cashback, réguas e visões de relatório.
create table if not exists checklist.pdv_clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  telefone text not null unique check (telefone ~ '^[0-9]{10,13}$'),
  nascimento date,
  email text, cpf text, observacao text,
  aceita_marketing boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table checklist.pdv_comandas add column if not exists cliente_id uuid references checklist.pdv_clientes(id) on delete set null;
create index if not exists pdv_comandas_cliente_idx on checklist.pdv_comandas(cliente_id);
alter table checklist.pdv_config add column if not exists cashback_pct numeric not null default 0 check (cashback_pct >= 0 and cashback_pct <= 100);

create table if not exists checklist.pdv_cashback_mov (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references checklist.pdv_clientes(id) on delete cascade,
  tipo text not null check (tipo in ('credito','uso','ajuste')),
  valor numeric not null,
  comanda_id uuid references checklist.pdv_comandas(id) on delete set null,
  motivo text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists pdv_cashback_cliente_idx on checklist.pdv_cashback_mov(cliente_id);

create table if not exists checklist.crm_regras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('aniversario','ticket_medio','produto','inativos','recorrentes')),
  params jsonb not null default '{}',
  acao text not null default 'mensagem' check (acao in ('mensagem','cashback')),
  cashback_valor numeric not null default 0,
  mensagem text not null default '',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create table if not exists checklist.crm_envios (
  id uuid primary key default gen_random_uuid(),
  regra_id uuid references checklist.crm_regras(id) on delete cascade,
  cliente_id uuid not null references checklist.pdv_clientes(id) on delete cascade,
  acao text not null default 'mensagem',
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);
create index if not exists crm_envios_idx on checklist.crm_envios(regra_id, cliente_id, criado_em);

alter table checklist.pdv_clientes enable row level security;
alter table checklist.pdv_cashback_mov enable row level security;
alter table checklist.crm_regras enable row level security;
alter table checklist.crm_envios enable row level security;
create policy pdv_clientes_ler on checklist.pdv_clientes for select using (checklist.pdv_pode('pdv_operar'));
create policy pdv_clientes_inserir on checklist.pdv_clientes for insert with check (checklist.pdv_pode('pdv_operar'));
create policy pdv_clientes_editar on checklist.pdv_clientes for update using (checklist.pdv_pode('pdv_operar')) with check (checklist.pdv_pode('pdv_operar'));
create policy pdv_clientes_apagar on checklist.pdv_clientes for delete using (checklist.pdv_pode('pdv_gerir'));
create policy pdv_cashback_ler on checklist.pdv_cashback_mov for select using (checklist.pdv_pode('pdv_operar'));
create policy pdv_cashback_escrever on checklist.pdv_cashback_mov for insert with check (checklist.pdv_pode('pdv_gerir'));
create policy crm_regras_ler on checklist.crm_regras for select using (checklist.pdv_pode('pdv_operar'));
create policy crm_regras_escrever on checklist.crm_regras for all using (checklist.pdv_pode('pdv_gerir')) with check (checklist.pdv_pode('pdv_gerir'));
create policy crm_envios_ler on checklist.crm_envios for select using (checklist.pdv_pode('pdv_operar'));
create policy crm_envios_inserir on checklist.crm_envios for insert with check (checklist.pdv_pode('pdv_operar'));

-- cria/atualiza o cliente pelo telefone (nome e telefone obrigatórios; nascimento opcional)
create or replace function checklist.pdv_cliente_garantir(p_nome text, p_telefone text, p_nascimento date default null)
returns uuid language plpgsql security definer set search_path = checklist, public as $$
declare tel text := regexp_replace(coalesce(p_telefone,''), '\D', '', 'g'); id uuid;
begin
  if not checklist.pdv_pode('pdv_operar') then raise exception 'sem permissão'; end if;
  if length(trim(coalesce(p_nome,''))) = 0 then raise exception 'Informe o nome do cliente.'; end if;
  if length(tel) > 11 and left(tel,2) = '55' then tel := substr(tel,3); end if;
  if length(tel) < 10 or length(tel) > 11 then raise exception 'Informe o telefone com DDD.'; end if;
  insert into checklist.pdv_clientes(nome, telefone, nascimento) values (trim(p_nome), tel, p_nascimento)
  on conflict (telefone) do update set nome = excluded.nome, nascimento = coalesce(excluded.nascimento, checklist.pdv_clientes.nascimento), atualizado_em = now()
  returning pdv_clientes.id into id;
  return id;
end $$;
revoke execute on function checklist.pdv_cliente_garantir(text,text,date) from public, anon;
grant execute on function checklist.pdv_cliente_garantir(text,text,date) to authenticated;

-- cashback automático ao fechar a comanda de um cliente (percentual em pdv_config.cashback_pct)
create or replace function checklist.crm_cashback_ao_fechar() returns trigger language plpgsql security definer set search_path = checklist, public as $$
declare pct numeric; tot numeric;
begin
  if new.status = 'fechada' and old.status <> 'fechada' and new.cliente_id is not null then
    select cashback_pct into pct from checklist.pdv_config where id = 1;
    if coalesce(pct,0) > 0 then
      select coalesce(subtotal,0) into tot from checklist.pdv_comanda_totais where comanda_id = new.id;
      if tot > 0 then
        insert into checklist.pdv_cashback_mov(cliente_id, tipo, valor, comanda_id, motivo, criado_por)
        values (new.cliente_id, 'credito', round(tot * pct / 100, 2), new.id, 'Cashback automático ' || pct || '%', null);
      end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function checklist.crm_cashback_ao_fechar() from public, anon, authenticated;
drop trigger if exists crm_cashback_fechar on checklist.pdv_comandas;
create trigger crm_cashback_fechar after update of status on checklist.pdv_comandas for each row execute function checklist.crm_cashback_ao_fechar();

-- clientes já existentes nas comandas (nome + telefone válidos)
with c as (
  select distinct on (t) t, nome_cliente from (
    select case when length(d) > 11 and left(d,2) = '55' then substr(d,3) else d end t, nome_cliente, aberta_em
    from (select regexp_replace(coalesce(telefone,''), '\D', '', 'g') d, nome_cliente, aberta_em from checklist.pdv_comandas where nome_cliente is not null and length(trim(nome_cliente)) > 0) x
  ) y where length(t) between 10 and 11 order by t, aberta_em desc
)
insert into checklist.pdv_clientes(nome, telefone) select nome_cliente, t from c on conflict (telefone) do nothing;
update checklist.pdv_comandas cm set cliente_id = cl.id from checklist.pdv_clientes cl
where cm.cliente_id is null and cl.telefone = case when length(regexp_replace(coalesce(cm.telefone,''), '\D', '', 'g')) > 11 and left(regexp_replace(coalesce(cm.telefone,''), '\D', '', 'g'),2) = '55' then substr(regexp_replace(coalesce(cm.telefone,''), '\D', '', 'g'),3) else regexp_replace(coalesce(cm.telefone,''), '\D', '', 'g') end;

create or replace view checklist.v_clientes_resumo with (security_invoker = true) as
select c.*,
  coalesce(v.visitas,0)::int visitas, coalesce(v.gasto,0) gasto,
  case when coalesce(v.visitas,0) > 0 then round(v.gasto / v.visitas, 2) else 0 end ticket_medio,
  case when coalesce(v.pessoas,0) > 0 then round(v.gasto / v.pessoas, 2) else 0 end ticket_pessoa,
  v.ultima_visita, v.primeira_visita, coalesce(v.visitas_90d,0)::int visitas_90d,
  coalesce(cb.saldo,0) cashback_saldo
from checklist.pdv_clientes c
left join (
  select cm.cliente_id, count(*) visitas, sum(t.subtotal) gasto, sum(greatest(cm.pessoas,1)) pessoas,
         max(cm.fechada_em) ultima_visita, min(cm.fechada_em) primeira_visita,
         count(*) filter (where cm.fechada_em > now() - interval '90 days') visitas_90d
  from checklist.pdv_comandas cm join checklist.pdv_comanda_totais t on t.comanda_id = cm.id
  where cm.status = 'fechada' and cm.cliente_id is not null group by cm.cliente_id) v on v.cliente_id = c.id
left join (select cliente_id, sum(valor) saldo from checklist.pdv_cashback_mov group by cliente_id) cb on cb.cliente_id = c.id;

create or replace view checklist.v_cliente_produtos with (security_invoker = true) as
select cm.cliente_id, i.produto_id, i.nome, sum(i.qtd)::int qtd, sum(i.qtd * i.preco_unit) valor,
       count(distinct cm.id)::int visitas, max(i.criado_em) ultima
from checklist.pdv_pedido_itens i join checklist.pdv_comandas cm on cm.id = i.comanda_id
where cm.cliente_id is not null and cm.status = 'fechada' and i.status <> 'cancelado' and coalesce(i.tipo,'produto') not in ('couvert','rodizio')
group by cm.cliente_id, i.produto_id, i.nome;

create or replace view checklist.v_comandas_busca with (security_invoker = true) as
select c.id, c.numero, c.mesa_id, m.numero mesa, c.nome_cliente, c.telefone, c.pessoas, c.status, c.aberta_em, c.fechada_em, c.cliente_id,
  coalesce(t.total,0) total, coalesce(t.pago,0) pago,
  exists(select 1 from checklist.pdv_pedido_itens i where i.comanda_id = c.id and i.tipo = 'couvert' and i.status <> 'cancelado') tem_couvert,
  exists(select 1 from checklist.pdv_pedido_itens i where i.comanda_id = c.id and i.tipo = 'rodizio' and i.status <> 'cancelado') tem_rodizio
from checklist.pdv_comandas c left join checklist.pdv_mesas m on m.id = c.mesa_id left join checklist.pdv_comanda_totais t on t.comanda_id = c.id;
grant select on checklist.v_clientes_resumo, checklist.v_cliente_produtos, checklist.v_comandas_busca to authenticated;

-- número da comanda (cartão físico) digitado no check-in; automáticos começam em 1000
alter table checklist.pdv_comandas alter column numero set generated by default;
alter table checklist.pdv_comandas alter column numero restart with 1000;
create unique index if not exists pdv_comanda_numero_aberta on checklist.pdv_comandas(numero) where status in ('aberta','pedindo_conta');
