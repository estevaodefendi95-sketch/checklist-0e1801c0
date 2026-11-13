-- a equipe de operação (garçom/caixa) pode ajustar mesas no salão: lugares, número e posição
drop policy if exists pdv_mesas_escrever on checklist.pdv_mesas;
create policy pdv_mesas_escrever on checklist.pdv_mesas for all using (checklist.pdv_pode('pdv_operar')) with check (checklist.pdv_pode('pdv_operar'));
