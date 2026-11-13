-- Agrupar comandas no fechamento: os itens das comandas escolhidas passam para a comanda principal
-- (guardando de qual comanda vieram) e as originais são encerradas apontando para a principal.
alter table checklist.pdv_pedido_itens add column if not exists comanda_origem_id uuid references checklist.pdv_comandas(id);
alter table checklist.pdv_comandas add column if not exists agrupada_em uuid references checklist.pdv_comandas(id);

create or replace function checklist.pdv_agrupar_comandas(p_principal uuid, p_ids uuid[]) returns integer
language plpgsql security definer set search_path = checklist, public as $$
declare pr checklist.pdv_comandas; r checklist.pdv_comandas; n int := 0; pess int := 0; nums text[] := '{}';
begin
  if not checklist.pdv_pode('pdv_operar') then raise exception 'Sem permissão para agrupar comandas.'; end if;
  select * into pr from checklist.pdv_comandas where id = p_principal for update;
  if not found or pr.status not in ('aberta','pedindo_conta') then raise exception 'A comanda principal precisa estar aberta.'; end if;
  if pr.funcionario_id is not null then raise exception 'Consumo de funcionário não pode ser agrupado.'; end if;
  if exists (select 1 from checklist.pdv_pagamentos where comanda_id = p_principal and not coalesce(estornado,false)) then
    raise exception 'A comanda principal já tem pagamento registrado.';
  end if;
  for r in select * from checklist.pdv_comandas where id = any(p_ids) and id <> p_principal for update loop
    if r.status not in ('aberta','pedindo_conta') then raise exception 'A comanda % não está aberta.', r.numero; end if;
    if r.funcionario_id is not null then raise exception 'A comanda % é consumo de funcionário.', r.numero; end if;
    if exists (select 1 from checklist.pdv_pagamentos where comanda_id = r.id and not coalesce(estornado,false)) then
      raise exception 'A comanda % já tem pagamento registrado.', r.numero;
    end if;
    update checklist.pdv_pedido_itens set comanda_origem_id = coalesce(comanda_origem_id, comanda_id), comanda_id = p_principal where comanda_id = r.id;
    get diagnostics n = row_count;
    update checklist.pdv_comandas set status = 'fechada', fechada_em = now(), fechada_por = auth.uid(), agrupada_em = p_principal,
      observacao = trim(both ' ' from coalesce(observacao,'') || ' Agrupada na comanda ' || pr.numero) where id = r.id;
    pess := pess + coalesce(r.pessoas,0);
    nums := nums || r.numero::text;
  end loop;
  if array_length(nums,1) is null then raise exception 'Escolha ao menos uma comanda para agrupar.'; end if;
  update checklist.pdv_comandas set pessoas = coalesce(pessoas,0) + pess,
    observacao = trim(both ' ' from coalesce(observacao,'') || ' Agrupou: ' || array_to_string(nums, ', ')) where id = p_principal;
  return array_length(nums,1);
end $$;
grant execute on function checklist.pdv_agrupar_comandas(uuid, uuid[]) to authenticated;
