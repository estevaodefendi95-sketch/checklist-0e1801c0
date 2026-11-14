-- Eventos da casa: escolhidos no check-in; podem ter valor (lançado na comanda) ou ser só controle interno (valor 0).
create table if not exists checklist.pdv_eventos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  data date,                                   -- null = vale em qualquer dia
  valor numeric(10,2) not null default 0 check (valor >= 0),
  cobrar text not null default 'pessoa' check (cobrar in ('pessoa','comanda')),
  ativo boolean not null default true,
  observacao text,
  criado_em timestamptz not null default now()
);
alter table checklist.pdv_eventos enable row level security;
create policy pdv_eventos_ler on checklist.pdv_eventos for select using (checklist.pdv_pode('pdv_operar'));
create policy pdv_eventos_escrever on checklist.pdv_eventos for all using (checklist.pdv_pode('pdv_gerir')) with check (checklist.pdv_pode('pdv_gerir'));

alter table checklist.pdv_comandas add column if not exists evento_id uuid references checklist.pdv_eventos(id) on delete set null;
alter table checklist.pdv_pedido_itens add column if not exists evento_id uuid references checklist.pdv_eventos(id) on delete set null;
create index if not exists idx_pdv_comandas_evento on checklist.pdv_comandas(evento_id);
create index if not exists idx_pdv_pedido_itens_evento on checklist.pdv_pedido_itens(evento_id);

-- define (ou troca/remove) o evento da comanda; se o evento tem valor, lança o item na conta
create or replace function checklist.pdv_definir_evento(p_comanda uuid, p_evento uuid) returns void
language plpgsql security definer set search_path = checklist, public as $$
declare e record; pessoas_c int;
begin
  if not checklist.pdv_pode('pdv_operar') then raise exception 'sem permissão'; end if;
  if not exists (select 1 from checklist.pdv_comandas where id = p_comanda and status in ('aberta','pedindo_conta')) then
    raise exception 'comanda não está aberta';
  end if;
  delete from checklist.pdv_pedido_itens where comanda_id = p_comanda and evento_id is not null;
  update checklist.pdv_comandas set evento_id = p_evento where id = p_comanda;
  if p_evento is null then return; end if;
  select * into e from checklist.pdv_eventos where id = p_evento;
  if not found then raise exception 'evento não encontrado'; end if;
  if e.valor > 0 then
    select pessoas into pessoas_c from checklist.pdv_comandas where id = p_comanda;
    insert into checklist.pdv_pedido_itens(comanda_id, nome, qtd, preco_unit, destino, origem, status, tipo, evento_id)
    values (p_comanda, 'Evento — ' || e.nome, case when e.cobrar = 'pessoa' then greatest(coalesce(pessoas_c,1),1) else 1 end, e.valor, 'caixa', 'sistema', 'entregue', 'produto', e.id);
  end if;
end $$;
revoke execute on function checklist.pdv_definir_evento(uuid, uuid) from public, anon;
grant execute on function checklist.pdv_definir_evento(uuid, uuid) to authenticated;
