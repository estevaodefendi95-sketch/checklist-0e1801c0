# Paggio Operação — plano em etapas

Todas as tabelas, telas e relatórios de checklist que já existem continuam iguais. O banco já está pronto: as tabelas que o pedido lista existem no schema `checklist`. Nada no banco será criado nem alterado. Os custos sempre vêm do banco, nunca são calculados na tela.

O pedido é grande, então ele vai em 5 entregas. Cada entrega já funciona sozinha:

## Entrega 1 — Base e permissões
- Nome do app: "Paggio Operação". O visual atual continua (tokens paper/ink, modo escuro).
- Ao entrar, o app carrega as 5 permissões (`tem_permissao`) e guarda num contexto `usePermissoes()`. Junto vem um componente `<SoComCusto>`, que esconde R$ e CMV.
- Menu novo: Checklists · Fichas técnicas · Cardápios · Insumos · Vendas · Estoque · Usuários. Os itens sem permissão ficam ocultos e as rotas também são protegidas.
- Tela de usuários: 5 chaves por pessoa, salvas com upsert em `permissoes`. Para admin, tudo aparece ligado e travado.

## Entrega 2 — Insumos, fornecedores e cardápios
- Insumos: tabela com busca e filtro por categoria, e cards com total, sem preço e preço desatualizado (mais de 60 dias).
- Ao editar o preço, um painel "Antes de salvar" mostra o resultado de `simular_preco`, com as fichas que mais mudam primeiro.
- Detalhe do insumo: gráfico do histórico de preços (recharts) e as fichas que usam o insumo.
- Importar preços por CSV ou Excel (papaparse/xlsx): casa por nome, mostra uma prévia e aplica só as linhas confirmadas.
- Cadastro de fornecedores.
- Cardápios: lista editável com dias da semana, ordem, ativo e pratos com preço específico.

## Entrega 3 — Fichas técnicas
- Lista com busca, filtros, selo "Revisar" e colunas de custo e CMV coloridas (vindas de `v_fichas_custo`).
- Visualização: seletor de porções, preparações-base com link para a ficha delas, passos numerados e o selo "sem preço".
- Modo cozinha: tela cheia, fundo escuro e nenhum valor em R$.
- Editor: busca única de insumos e preparações-base, grupos de escolha, reordenação, criação de insumo na hora, foto (bucket `fichas`) e "Marcar como revisada".
- Histórico de versões com as diferenças. Admin pode restaurar uma versão.

## Entrega 4 — Vendas
- Importar por PDF (pdfjs-dist, arquivo guardado no bucket `vendas`), por CSV/Excel com escolha de colunas, ou lançar manualmente. Todas as formas mostram uma prévia editável.
- Ao salvar: cria a importação como rascunho e grava os itens. Depois vem o de-para dos itens sem ficha (ficha, fator ou "ignorar sempre"), a explosão de insumos e o botão "Confirmar e dar baixa".
- Lista de importações com opções de abrir, cancelar e baixar o arquivo original.

## Entrega 5 — Estoque e painel
- Vínculos entre itens do checklist e insumos, com sugestão pelo nome parecido e fator de contagem.
- Conversão dos itens de estoque (só admin): primeiro mostra a prévia, depois confirma.
- Preenchimento do checklist: o destaque de item abaixo do mínimo passa de vermelho para **âmbar**, como o pedido diz. Esta é a única mudança numa tela que já existe.
- Compras, com a opção de atualizar o preço do insumo. Importação de contagens.
- Teórico x contado (`estoque_comparativo`): tabela ordenada pela maior perda em R$ e card com a soma das diferenças.
- Painel inicial: quem vê custos recebe 6 cards que levam às listas filtradas. Os demais usuários continuam vendo os checklists do dia.

## Detalhes técnicos
- Bibliotecas novas: pdfjs-dist, papaparse, xlsx, recharts.
- Rotas novas: /fichas, /fichas/:id, /fichas/:id/editar, /fichas/:id/cozinha, /cardapios, /insumos, /insumos/:id, /fornecedores, /vendas, /vendas/:id, /estoque/*.
- Padrões comuns: estados de carregando, vazio e erro; confirmação antes de excluir; botões de pelo menos 44 px; valores formatados com Intl pt-BR (R$, dd/mm/aaaa).
- Antes de cada entrega, conferir as colunas exatas das tabelas e views envolvidas.

Ao aprovar, começo pela Entrega 1 e sigo em ordem.
