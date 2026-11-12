alter table checklist.pdv_categorias add column if not exists horarios jsonb;
alter table checklist.pdv_produtos add column if not exists horarios jsonb;
-- horarios: [{"dia":0-6,"inicio":"HH:MM","fim":"HH:MM"}]; vazio/nulo = sempre visível. Faixa com fim < início vira a madrugada.
update checklist.pdv_categorias set horarios = (
  select jsonb_agg(jsonb_build_object('dia', d, 'inicio', to_char(coalesce(horario_inicio, time '00:00'), 'HH24:MI'), 'fim', to_char(coalesce(horario_fim, time '23:59'), 'HH24:MI')) order by d)
  from unnest(case when dias_semana is null or cardinality(dias_semana) = 0 then array[0,1,2,3,4,5,6] else dias_semana end) d)
where horarios is null and (horario_inicio is not null or horario_fim is not null or cardinality(coalesce(dias_semana, '{}')) > 0);
update checklist.pdv_produtos set horarios = (
  select jsonb_agg(jsonb_build_object('dia', d, 'inicio', to_char(coalesce(horario_inicio, time '00:00'), 'HH24:MI'), 'fim', to_char(coalesce(horario_fim, time '23:59'), 'HH24:MI')) order by d)
  from unnest(case when dias_semana is null or cardinality(dias_semana) = 0 then array[0,1,2,3,4,5,6] else dias_semana end) d)
where horarios is null and (horario_inicio is not null or horario_fim is not null or cardinality(coalesce(dias_semana, '{}')) > 0);
-- (função checklist.pdv_horarios_ok aplicada via migração do projeto)
