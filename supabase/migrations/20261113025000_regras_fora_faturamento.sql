-- Consumo da família/casa não entra no faturamento do restaurante: a regra de desconto pode ser marcada
-- "fora do faturamento". (Consumo de funcionário e "consumo interno" já ficam de fora pelo código.)
alter table checklist.pdv_descontos_regras add column if not exists fora_faturamento boolean not null default false;
update checklist.pdv_descontos_regras set fora_faturamento = true where nome ilike '%famil%';
