# Checklist — cozinha, bar & salão

App de checklist diário de abertura/fechamento com controle de estoque mínimo,
login por perfil (admin / editor / visualizador), restrição por área e
geração de relatório em PDF filtrado por dia.

## 1. Configurar o Supabase

1. Abra o **SQL Editor** do seu projeto Supabase (o `nortyx` reativado pela nuvem do Lovable).
2. Cole e rode o conteúdo de `supabase/schema.sql` inteiro. Isso cria as tabelas,
   os tipos, o RLS (permissões por área e por perfil) e o gatilho que cria um
   `profile` automaticamente para cada novo usuário.
3. Em **Authentication → Providers**, confirme que "Email" está habilitado.
4. Em **Authentication → Users**, crie o primeiro usuário (você) manualmente
   com e-mail e senha — ou habilite "Enable email confirmations" e convide por lá.
5. No **SQL Editor**, promova esse primeiro usuário a admin:
   ```sql
   update profiles set role = 'admin' where id = 'UUID_DO_SEU_USUARIO';
   ```
   (o UUID aparece na tabela `auth.users` ou em Authentication → Users)

## 2. Configurar o projeto localmente

```bash
npm install
cp .env.example .env
```

Edite `.env` com a URL e a `anon key` do seu projeto (em
**Project Settings → API** no painel do Supabase):

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

## 4. Deploy

### GitHub
```bash
git init
git add .
git commit -m "checklist inicial"
git remote add origin <seu-repo>
git push -u origin main
```

### Vercel
Importe o repositório na Vercel e adicione as variáveis de ambiente
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em **Settings → Environment
Variables**. O comando de build já é o padrão (`npm run build`, saída em
`dist`).

## Estrutura

- `supabase/schema.sql` — schema completo: tabelas, RLS, trigger de novo usuário
- `src/context/AuthContext.tsx` — sessão, perfil, checagem de área/permissão
- `src/pages/Dashboard.tsx` — tela inicial com status do dia por área
- `src/pages/ChecklistExecucao.tsx` — preenchimento e aprovação
- `src/pages/Historico.tsx` — navegação por data
- `src/pages/Relatorio.tsx` — geração de PDF
- `src/pages/AdminTemplates.tsx` — CRUD de modelos e itens (admin)
- `src/pages/AdminUsuarios.tsx` — papéis e áreas por usuário (admin)
