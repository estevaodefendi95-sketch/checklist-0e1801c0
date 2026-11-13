-- Corrige "record new has no field estornado": a checagem de cada tabela agora fica separada,
-- assim o campo de pagamentos não é lido ao atualizar comandas ou itens.
create or replace function checklist.trg_exige_aprovacao() returns trigger
language plpgsql security definer set search_path = checklist, public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;
  if tg_table_name = 'pdv_pedido_itens' then
    if new.status = 'cancelado' and old.status is distinct from 'cancelado' then
      raise exception 'Cancelar item exige aprovação de administrador.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'pdv_comandas' then
    if new.status = 'cancelada' and old.status is distinct from 'cancelada' then
      raise exception 'Cancelar comanda exige aprovação de administrador.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'pdv_pagamentos' then
    if new.estornado and not old.estornado then
      raise exception 'Estornar pagamento exige aprovação de administrador.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
