# Alterar a frequência de um modelo já criado

## O que muda

Na tela **Modelos & Itens** (`src/pages/AdminTemplates.tsx`), quando um modelo estiver selecionado, o painel direito (itens) ganha, no topo, um bloco próprio com:

- rótulo **"frequência da conferência deste modelo"**
- um select com as duas opções: **conferência diária** (`diaria`) e **conferência semanal** (`semanal`)
- o valor atual do modelo, usando `frequencia` e tratando como **diária** quando o campo estiver vazio

Ao trocar a opção no select:

- grava o novo valor na tabela `checklist_templates` dessa linha e devolve a linha atualizada
- substitui essa linha na lista de modelos da tela (o seletor, a lista à esquerda e o texto "diário/semanal" ao lado do nome passam a mostrar a frequência nova na hora)
- se a gravação falhar, mantém a opção anterior e mostra `Não foi possível alterar: ...` com o motivo

Abaixo do select, em texto pequeno:

> Os itens e o histórico são mantidos. Só muda como a contagem é aberta.

## O que não muda

- Nenhum item, resposta ou execução é criado, alterado ou apagado.
- Itens, unidades, estoques mínimos, ordem, exclusões e as demais telas continuam exatamente como estão.
- Visual, tokens de cor (`paper`/`ink`/`line`), modo escuro e comportamento no celular preservados — o bloco usa o mesmo formato dos blocos já existentes na tela.
- Login, permissões e o app instalável não são tocados.

## Detalhes técnicos

- Novo handler `alterarFrequencia(id, frequencia)` em `AdminTemplates.tsx`:
  `db.from('checklist_templates').update({ frequencia }).eq('id', id).select().single()`;
  em caso de `error`, `alert('Não foi possível alterar: ' + error.message)`; com `data`,
  `setTemplates((prev) => prev.map((t) => (t.id === id ? data : t)))`.
- Novo estado `salvandoFrequencia` para desabilitar o select durante a gravação e evitar duplo clique.
- O bloco é renderizado dentro do ramo `templateSelecionado` já existente, antes do bloco de adicionar item, usando `const templateAtual = templates.find((t) => t.id === templateSelecionado)`.
- O select usa `value={templateAtual?.frequencia ?? 'diaria'}` e `onChange` tipado como `'diaria' | 'semanal'`; as opções reutilizam os mesmos textos do select de criação de modelo (`conferência diária` / `conferência semanal`).
- Sem mudanças em `src/lib/types.ts`, `src/lib/periodo.ts`, no schema ou nas policies: a coluna `frequencia` já existe em `checklist.checklist_templates` com padrão `'diaria'`, e a leitura/escrita já usam `db` (schema `checklist`).
- Verificação: build sem erros de tipo e teste manual de alternar diária ↔ semanal em um modelo existente, confirmando que o seletor da esquerda e o PDF/relatório passam a abrir a contagem no novo formato sem perder itens nem histórico.
