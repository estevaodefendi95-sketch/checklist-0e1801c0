-- Permissões por usuário: lançar desconto, tirar a taxa de serviço (10%) e tirar o couvert.
-- Quem já tinha permissão de caixa continua podendo (comportamento atual); novos usuários começam sem.
alter table checklist.permissoes add column if not exists pdv_desconto boolean not null default false;
alter table checklist.permissoes add column if not exists pdv_tirar_servico boolean not null default false;
alter table checklist.permissoes add column if not exists pdv_tirar_couvert boolean not null default false;
update checklist.permissoes set pdv_desconto = true, pdv_tirar_servico = true, pdv_tirar_couvert = true where pdv_caixa;

create or replace function checklist.trg_pdv_comanda_descontos() returns trigger
language plpgsql set search_path = checklist, public as $$
declare regra_mudou boolean; manual_mudou boolean;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;
  if new.funcionario_id is not null then return new; end if;   -- consumo de funcionário tem regra própria
  regra_mudou := (new.desconto_detalhe->>'regra_id') is distinct from (old.desconto_detalhe->>'regra_id');
  manual_mudou := coalesce((new.desconto_detalhe->>'manual_valor')::numeric, 0) <> coalesce((old.desconto_detalhe->>'manual_valor')::numeric, 0)
                  or (new.desconto_detalhe->>'manual_tipo') is distinct from (old.desconto_detalhe->>'manual_tipo');
  if coalesce(new.desconto, 0) > coalesce(old.desconto, 0) and (new.desconto_detalhe is null or regra_mudou or manual_mudou)
     and not checklist.pdv_pode('pdv_desconto') then
    raise exception 'Sem permissão para lançar desconto.' using errcode = '42501';
  end if;
  if coalesce((new.desconto_detalhe->>'tira_servico')::boolean, false) and not coalesce((old.desconto_detalhe->>'tira_servico')::boolean, false)
     and not checklist.pdv_pode('pdv_tirar_servico') then
    raise exception 'Sem permissão para tirar a taxa de serviço.' using errcode = '42501';
  end if;
  if coalesce((new.desconto_detalhe->>'tira_couvert')::boolean, false) and not coalesce((old.desconto_detalhe->>'tira_couvert')::boolean, false)
     and not checklist.pdv_pode('pdv_tirar_couvert') then
    raise exception 'Sem permissão para tirar o couvert.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_pdv_comanda_descontos on checklist.pdv_comandas;
create trigger trg_pdv_comanda_descontos before update of desconto, desconto_detalhe, taxa_servico_pct on checklist.pdv_comandas
  for each row execute function checklist.trg_pdv_comanda_descontos();
