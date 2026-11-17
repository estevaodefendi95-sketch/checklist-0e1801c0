-- Grupos de opções por quantidade (+/−): o cliente escolhe QUANTOS, não "3 pratos".
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'checklist.pdv_grupos_opcoes'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%tipo%';
  if c is not null then execute format('alter table checklist.pdv_grupos_opcoes drop constraint %I', c); end if;
  alter table checklist.pdv_grupos_opcoes add constraint pdv_grupos_opcoes_tipo_check
    check (tipo in ('acompanhamento','combo','informacao','quantidade'));
end $$;

do $$
declare g record; oid uuid;
begin
  for g in select id, nome from checklist.pdv_grupos_opcoes where nome in ('Copos extras','Taças','Pratos extras') loop
    select id into oid from checklist.pdv_opcoes where grupo_id = g.id order by ordem limit 1;
    delete from checklist.pdv_opcoes where grupo_id = g.id and id <> oid;
    update checklist.pdv_opcoes set ordem = 0,
      nome = case g.nome when 'Copos extras' then 'Copo extra' when 'Taças' then 'Taça' else 'Prato extra' end
     where id = oid;
    update checklist.pdv_grupos_opcoes set tipo = 'quantidade', min_escolhas = 0,
      max_escolhas = case g.nome when 'Pratos extras' then 8 else 4 end where id = g.id;
  end loop;
end $$;
