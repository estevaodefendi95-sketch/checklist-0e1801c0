# Checklist — cozinha, bar & salão

App de checklist diário de abertura/fechamento com controle de estoque mínimo,
login por perfil (admin / editor / visualizador), restrição por área e
geração de relatório em PDF filtrado por dia.

## ⚠️ Sobre o schema isolado

Esse app usa o projeto Supabase **"Conta azul"**, que já hospeda outro sistema
(financeiro/ERP) no schema `public`. Pra não conflitar, todas as tabelas do
checklist vivem num schema próprio chamado **`checklist`**. O front já está
configurado pra falar com esse schema (`src/lib/supabase.ts`, client `db`).

**Passo obrigatório no painel do Supabase:** vá em **Project Settings → Data
API → Exposed schemas** e adicione `checklist` na lista (por padrão só
`public` fica exposto pela API REST). Sem isso, o app não consegue ler/gravar
nada, mesmo com o schema e as tabelas já criados.

## 1. Configurar o Supabase

O schema já foi aplicado neste projeto (`checklist.*` — tabelas, RLS e
trigger de novo usuário). Se precisar recriar do zero em outro projeto, rode
`supabase/schema.sql` inteiro no SQL Editor.

1. Confirme em **Authentication → Providers** que "Email" está habilitado.
2. Crie o primeiro usuário (você) em **Authentication → Users**.
3. No **SQL Editor**, promova esse usuário a admin:
   ```sql
   update checklist.profiles set role = 'admin' where id = 'UUID_DO_SEU_USUARIO';
   ```
   (o UUID aparece em Authentication → Users)

## 2. Configurar o projeto localmente

```bash
npm install
cp .env.example .env
```

Edite `.env` com a URL e a `anon key` do projeto **Conta azul** (em
**Project Settings → API**):

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
```

```bash
npm run dev
```

## 3. Fluxo de uso

- **Admin** entra em `/admin/templates` e cria os modelos (ex: "abertura
  cozinha", "fechamento bar") com os itens de conferência de cada um —
  cada item pode ser checkbox, sim/não, quantidade ou texto livre.
- **Admin** entra em `/admin/usuarios` pra definir o perfil (admin/editor/
  visualizador) e quais áreas (Cozinha/Bar/Salão) cada pessoa enxerga.
- Qualquer pessoa autorizada abre a área na tela inicial, escolhe
  abertura ou fechamento do dia, preenche os itens e conclui.
- Depois de concluído, um admin ou editor da área pode **aprovar** o
  checklist — isso grava quem aprovou, o perfil dela na hora e o horário,
  separado de quem preencheu.
- Cada dia gera um registro novo (a execução é única por modelo + data),
  então o checklist de segunda nunca sobrescreve o de terça — tudo fica
  no histórico, filtrável por data em `/historico`.
- Em `/relatorio`, escolha uma data e gere o PDF com todos os checklists
  daquele dia, itens, respostas e aprovação.

## 4. Deploy (Lovable)

Este repositório já está conectado a um projeto Lovable. Basta configurar
as env vars em **Project Settings → Environment Variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

e clicar em **Update preview**.

## Estrutura

- `supabase/schema.sql` — schema completo (`checklist.*`): tabelas, RLS, trigger de novo usuário
- `src/lib/supabase.ts` — client Supabase + client `db` apontando pro schema `checklist`
- `src/context/AuthContext.tsx` — sessão, perfil, checagem de área/permissão
- `src/pages/Dashboard.tsx` — tela inicial com status do dia por área
- `src/pages/ChecklistExecucao.tsx` — preenchimento e aprovação
- `src/pages/Historico.tsx` — navegação por data
- `src/pages/Relatorio.tsx` — geração de PDF
- `src/pages/AdminTemplates.tsx` — CRUD de modelos e itens (admin)
- `src/pages/AdminUsuarios.tsx` — papéis e áreas por usuário (admin)
