# Contagem de estoque no checklist

Sem criar/alterar tabelas — usa colunas existentes do schema `checklist` via `db`.

## 1. Tipos (src/lib/types.ts)
- ChecklistTemplate: `frequencia?: 'diaria' | 'semanal'`
- ChecklistItem: `unidade?: string | null`, `estoque_minimo?: number | null`

## 2. Novo src/lib/periodo.ts
- `dataReferencia(frequencia, base = new Date())`: semanal → segunda-feira (startOfWeek, weekStartsOn 1); senão a data base; formato `yyyy-MM-dd`.

## 3. AdminTemplates
- Criar modelo: select conferência diária/semanal → `frequencia`. Lista: "tipo · diário/semanal".
- Adicionar/editar item: se quantidade, inputs "unidade (kg, un, cx)" e "estoque mínimo" (number, decimal, min 0); grava null quando vazio ou quando tipo não é quantidade.
- Lista de itens: " · mín. X unidade".

## 4. ChecklistExecucao
- Busca template primeiro, depois execução por `dataReferencia(template.frequencia)` (busca e criação).
- Cabeçalho: "semana de dd/MM/yyyy" para semanal.
- Helper `abaixoDoMinimo(item, valor)`.
- Campo quantidade: inputMode decimal, unidade ao lado, "mín. X unidade" sob o nome, vermelho (alert) + "abaixo do mínimo · mín. X" quando abaixo.
- Caixa "para repor (N)" acima da lista.

## 5. Dashboard
- Execuções `.gte('data', dataReferencia('semanal'))`; status pela execução com `data === dataReferencia(t.frequencia)`; rótulo "semanal".

## 6. Relatório PDF
- Execuções entre segunda da semana e a data escolhida, filtradas por `data === dataReferencia(template.frequencia, data)` + podeAcessarArea.
- Colunas item | contagem | mínimo | situação; "REPOR" com linha vermelha (didParseCell).
- Após cada tabela, texto vermelho "Para repor: ..." com splitTextToSize(180) ajustando y.

Visual, login, permissões, PWA e outras telas inalterados.
