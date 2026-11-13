-- "avisado": o garçom já levou o pedido à cozinha/bar à mão; o agente de impressão ignora esse status
alter table checklist.pdv_fila_impressao drop constraint if exists pdv_fila_impressao_status_check;
alter table checklist.pdv_fila_impressao add constraint pdv_fila_impressao_status_check
  check (status = any (array['pendente','imprimindo','ok','erro','avisado']));
create index if not exists pdv_fila_impressao_status_idx on checklist.pdv_fila_impressao (status, criado_em desc);
