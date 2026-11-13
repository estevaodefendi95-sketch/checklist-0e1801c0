import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ReactNode, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePermissoes } from '../context/PermissoesContext'
import { applyTheme } from '../lib/theme'
import { ler, gravar } from '../lib/armazenamento'
import { Icone, NomeIcone } from './Icone'
import { LinhaVersao } from './AvisoAtualizacao'
import { Sino } from './Avisos'
import { Assistente } from './Assistente'

const roleLabel: Record<string, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  visualizador: 'Visualizador',
}

interface Item {
  to: string
  rotulo: string
  curto?: string // rótulo da barra inferior
  icone: NomeIcone
  grupo: 'atendimento' | 'operacao' | 'cardapio' | 'admin'
  emBreve?: boolean
}

const RECOLHIDO = 'paggio-menu-recolhido'
const ROTULO_GRUPO: Record<Item['grupo'], string> = {
  atendimento: 'Atendimento',
  operacao: 'Operação',
  cardapio: 'Cardápio e custos',
  admin: 'Configurações',
}

function ativo(to: string, pathname: string) {
  if (to === '/') return pathname === '/'
  // /relatorio não pode ficar aceso dentro de /relatorio/estoque (e vice-versa)
  if (to === '/relatorio') return pathname === '/relatorio'
  if (to === '/pdv') return pathname === '/pdv' || pathname.startsWith('/pdv/comanda/')
  return pathname === to || pathname.startsWith(to + '/')
}

export function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const { pode, master } = usePermissoes()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [recolhido, setRecolhido] = useState(() => ler<boolean>(RECOLHIDO, false))
  const [maisAberto, setMaisAberto] = useState(false)
  const admin = profile?.role === 'admin'

  // itens sem permissão nem entram na lista
  const itens: Item[] = [
    ...(pode('pdv_operar')
      ? [
          { to: '/pdv', rotulo: 'Salão e mesas', curto: 'Salão', icone: 'pdv', grupo: 'atendimento' } as Item,
        ]
      : []),
    ...(pode('pdv_operar')
      ? [
          { to: '/pdv/comandas', rotulo: 'Comandas', curto: 'Comandas', icone: 'nota', grupo: 'atendimento' } as Item,
          { to: '/pdv/crm', rotulo: 'Clientes e CRM', curto: 'CRM', icone: 'crm', grupo: 'atendimento' } as Item,
          { to: '/pdv/consumo', rotulo: 'Consumo de funcionários', curto: 'Equipe', icone: 'usuarios', grupo: 'atendimento' } as Item,
          { to: '/pdv/reservas', rotulo: 'Reservas', curto: 'Reservas', icone: 'checklist', grupo: 'atendimento' } as Item,
          { to: '/whatsapp', rotulo: 'WhatsApp', curto: 'WhatsApp', icone: 'chat', grupo: 'atendimento' } as Item,
        ]
      : []),
    ...(pode('pdv_caixa') ? [{ to: '/pdv/caixa', rotulo: 'Caixa', icone: 'caixa', grupo: 'atendimento' } as Item] : []),
    ...(pode('pdv_operar')
      ? [{ to: '/pdv/relatorios', rotulo: 'Relatório de vendas', curto: 'Vendas', icone: 'vendas', grupo: 'atendimento' } as Item]
      : []),
    { to: '/', rotulo: 'Checklists', curto: 'Checklist', icone: 'checklist', grupo: 'operacao' },
    { to: '/areas', rotulo: 'Áreas', icone: 'areas', grupo: 'operacao' },
    { to: '/relatorio/estoque', rotulo: 'Estoque', icone: 'estoque', grupo: 'operacao' },
    ...(pode('pdv_operar') || pode('lancar_estoque') ? [{ to: '/estoque/alertas', rotulo: 'Alertas de estoque', curto: 'Alertas', icone: 'estoque', grupo: 'operacao' } as Item] : []),
    { to: '/historico', rotulo: 'Histórico', icone: 'historico', grupo: 'operacao' },
    { to: '/relatorio', rotulo: 'Relatórios', icone: 'relatorio', grupo: 'operacao' },
    { to: '/fichas', rotulo: 'Fichas técnicas', curto: 'Fichas', icone: 'fichas', grupo: 'cardapio' },
    { to: '/cardapios', rotulo: 'Cardápios', icone: 'cardapios', grupo: 'cardapio' },
    { to: '/insumos', rotulo: 'Insumos', icone: 'insumos', grupo: 'cardapio' },
    ...(pode('editar_precos') || pode('lancar_estoque') || pode('pdv_gerir')
      ? [
          { to: '/compras', rotulo: 'Notas de compra', curto: 'Compras', icone: 'nota', grupo: 'cardapio' } as Item,
          { to: '/fornecedores', rotulo: 'Fornecedores', icone: 'fornecedores', grupo: 'cardapio' } as Item,
        ]
      : []),
    ...(pode('pdv_fiscal') || pode('pdv_caixa') ? [{ to: '/pdv/eventos', rotulo: 'Notas de eventos', curto: 'Eventos', icone: 'evento', grupo: 'admin' } as Item] : []),
    ...(pode('pdv_gerir') || pode('pdv_fiscal')
      ? [{ to: '/pdv/config', rotulo: 'Configurações do PDV', curto: 'Config.', icone: 'impressora', grupo: 'admin' } as Item]
      : []),
    ...(master ? [{ to: '/usuarios', rotulo: 'Usuários', icone: 'usuarios', grupo: 'admin' } as Item] : []),
    ...(admin
      ? [{ to: '/admin/templates', rotulo: 'Áreas e modelos', icone: 'modelos', grupo: 'admin' } as Item]
      : []),
  ]
  const NA_BARRA = pode('pdv_operar') ? ['/pdv', '/', '/relatorio/estoque'] : ['/', '/areas', '/fichas']

  useEffect(() => setMaisAberto(false), [pathname])

  function alternarRecolhido() {
    setRecolhido((v) => {
      gravar(RECOLHIDO, !v)
      return !v
    })
  }
  async function sair() {
    await signOut()
    navigate('/login')
  }

  const largura = recolhido ? 'lg:w-[72px]' : 'lg:w-[232px]'
  const recuo = recolhido ? 'lg:pl-[72px]' : 'lg:pl-[232px]'
  const maisAtivo = !NA_BARRA.some((to) => ativo(to, pathname))

  return (
    <div className="min-h-screen bg-paper">
      {/* ---------- menu lateral (≥ 1024 px) ---------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col bg-brand text-brand-ink transition-[width] duration-200 lg:flex ${largura}`}
        aria-label="Menu principal"
      >
        <div className={`flex items-center px-5 pb-4 pt-6 ${recolhido ? 'justify-center px-0' : ''}`}>
          <Link to="/" className="leading-none" title="Paggio Operação">
            <b className="font-display text-2xl font-semibold">{recolhido ? 'P' : 'Paggio'}</b>
            {!recolhido && <small className="mt-1 block text-[11px] uppercase tracking-[0.08em] opacity-75">Operação</small>}
          </Link>
        </div>

        <div className="px-3.5"><Sino className="w-full hover:bg-brand-ink/10" rotulo={!recolhido} /></div>
        <nav className="flex-1 overflow-y-auto px-3.5">
          {(['atendimento', 'operacao', 'cardapio', 'admin'] as const).map((g) => {
            const doGrupo = itens.filter((i) => i.grupo === g)
            if (!doGrupo.length) return null
            return (
              <div key={g} className="mb-2">
                {!recolhido && (
                  <div className="px-2.5 pb-1.5 pt-3.5 text-[11px] uppercase tracking-[0.08em] opacity-60">
                    {ROTULO_GRUPO[g]}
                  </div>
                )}
                {recolhido && g !== 'atendimento' && <hr className="mx-3 my-2 border-brand-ink/20" />}
                {doGrupo.map((i) => (
                  <ItemLateral key={i.to} item={i} recolhido={recolhido} ativo={ativo(i.to, pathname)} />
                ))}
              </div>
            )
          })}
        </nav>

        <div className="space-y-1 border-t border-brand-ink/15 px-3.5 py-3">
          {!recolhido && profile && (
            <div className="px-2.5 pb-1 leading-tight">
              <div className="truncate text-sm font-semibold">{profile.nome}</div>
              <div className="text-xs opacity-70">{roleLabel[profile.role]}</div>
            </div>
          )}
          <BotaoTema className="text-brand-ink hover:bg-brand-ink/10" mostrarTexto={!recolhido} />
          <button
            onClick={sair}
            title="Sair"
            className={`flex min-h-[44px] w-full items-center gap-3 rounded-[10px] px-2.5 text-sm hover:bg-brand-ink/10 ${recolhido ? 'justify-center px-0' : ''}`}
          >
            <Icone nome="sair" />
            {!recolhido && 'Sair'}
          </button>
          <button
            onClick={alternarRecolhido}
            aria-expanded={!recolhido}
            title={recolhido ? 'Expandir menu' : 'Recolher menu'}
            className="mt-1 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[10px] border border-brand-ink/30 text-sm hover:bg-brand-ink/10"
          >
            <Icone nome={recolhido ? 'expandir' : 'recolher'} tamanho={18} />
            {!recolhido && 'Recolher menu'}
          </button>
        </div>
      </aside>

      {/* ---------- conteúdo ---------- */}
      <div className={`transition-[padding] duration-200 ${recuo}`}>
        {/* celular/tablet retrato: só a marca; o título fica na própria página */}
        <div className="flex items-center justify-between px-4 pt-[calc(14px+env(safe-area-inset-top))] text-xs uppercase tracking-[0.08em] text-ink-soft md:px-6 lg:hidden">
          <span>Paggio Operação</span>
          <Sino className="text-brand" />
        </div>
        <main className="mx-auto max-w-6xl px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-3 md:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          {children}
          <LinhaVersao className="mt-12 text-center text-ink-soft" />
        </main>
      </div>

      <Assistente />
      {/* ---------- barra inferior (< 1024 px) ---------- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface px-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5 lg:hidden"
        aria-label="Menu inferior"
      >
        {itens
          .filter((i) => NA_BARRA.includes(i.to))
          .map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/'} className="group">
              {({ isActive }) => <ItemBarra icone={i.icone} rotulo={i.curto ?? i.rotulo} ativo={isActive} />}
            </NavLink>
          ))}
        <button onClick={() => setMaisAberto(true)} aria-haspopup="dialog" aria-expanded={maisAberto}>
          <ItemBarra icone="mais" rotulo="Mais" ativo={maisAtivo || maisAberto} />
        </button>
      </nav>

      {/* ---------- folha "Mais" ---------- */}
      {maisAberto && (
        <FolhaMais
          itens={itens.filter((i) => !NA_BARRA.includes(i.to))}
          pathname={pathname}
          nome={profile?.nome}
          papel={profile ? roleLabel[profile.role] : ''}
          onFechar={() => setMaisAberto(false)}
          onSair={sair}
        />
      )}
    </div>
  )
}

function ItemLateral({ item, recolhido, ativo }: { item: Item; recolhido: boolean; ativo: boolean }) {
  const base = `flex min-h-[44px] items-center gap-3 rounded-[10px] text-sm ${recolhido ? 'justify-center' : 'px-2.5'}`
  if (item.emBreve) {
    return (
      <div className={`${base} cursor-default opacity-50`} title={`${item.rotulo}: em breve`} aria-disabled="true">
        <Icone nome={item.icone} />
        {!recolhido && (
          <>
            <span className="truncate">{item.rotulo}</span>
            <span className="ml-auto text-[11px] opacity-80">em breve</span>
          </>
        )}
      </div>
    )
  }
  return (
    <Link
      to={item.to}
      title={recolhido ? item.rotulo : undefined}
      aria-current={ativo ? 'page' : undefined}
      className={`${base} ${ativo ? 'bg-brand-ink font-semibold text-brand' : 'hover:bg-brand-ink/10'}`}
    >
      <Icone nome={item.icone} />
      {!recolhido && <span className="truncate">{item.rotulo}</span>}
    </Link>
  )
}

function ItemBarra({ icone, rotulo, ativo }: { icone: NomeIcone; rotulo: string; ativo: boolean }) {
  return (
    <span
      className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-[10px] text-xs ${
        ativo ? 'font-bold text-brand' : 'text-ink-soft'
      }`}
    >
      <span
        className={`grid h-7 w-10 place-items-center rounded-lg ${ativo ? 'bg-brand text-brand-ink' : 'bg-brand-soft text-brand'}`}
      >
        <Icone nome={icone} tamanho={18} />
      </span>
      {rotulo}
    </span>
  )
}

function FolhaMais({
  itens,
  pathname,
  nome,
  papel,
  onFechar,
  onSair,
}: {
  itens: Item[]
  pathname: string
  nome?: string
  papel: string
  onFechar: () => void
  onSair: () => void
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])

  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Mais opções">
      <button className="absolute inset-0 bg-ink/40" onClick={onFechar} aria-label="Fechar" />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[20px] bg-surface px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 shadow-[var(--shadow-sheet)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden="true" />
        <div className="mb-3 flex items-center justify-between">
          <div className="leading-tight">
            <div className="font-semibold">{nome}</div>
            <div className="apoio">{papel}</div>
          </div>
          <button onClick={onFechar} className="grid h-11 w-11 place-items-center rounded-[10px] text-ink-soft" aria-label="Fechar">
            <Icone nome="fechar" />
          </button>
        </div>
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {itens.map((i) => (
            <li key={i.to}>
              {i.emBreve ? (
                <div className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-ink-soft opacity-60" aria-disabled="true">
                  <Icone nome={i.icone} />
                  {i.rotulo}
                  <span className="ml-auto rounded-full bg-paper-dim px-2 py-0.5 text-xs">em breve</span>
                </div>
              ) : (
                <Link
                  to={i.to}
                  aria-current={ativo(i.to, pathname) ? 'page' : undefined}
                  className={`flex min-h-[52px] items-center gap-3 rounded-xl px-3 ${
                    ativo(i.to, pathname) ? 'bg-brand-soft font-semibold text-brand' : 'hover:bg-paper'
                  }`}
                >
                  <Icone nome={i.icone} />
                  {i.rotulo}
                </Link>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
          <BotaoTema className="justify-center border border-line" mostrarTexto />
          <button onClick={onSair} className="flex min-h-[48px] items-center justify-center gap-2 rounded-[10px] border border-alert/40 text-sm font-medium text-alert">
            <Icone nome="sair" tamanho={18} />
            Sair
          </button>
        </div>
      </div>
    </div>
  )
}

function BotaoTema({ className = '', mostrarTexto }: { className?: string; mostrarTexto?: boolean }) {
  const [escuro, setEscuro] = useState(() => document.documentElement.classList.contains('dark'))
  function alternar() {
    applyTheme(escuro ? 'light' : 'dark')
    setEscuro(!escuro)
  }
  return (
    <button
      onClick={alternar}
      title={escuro ? 'Modo claro' : 'Modo escuro'}
      className={`flex min-h-[44px] w-full items-center gap-3 rounded-[10px] px-2.5 text-sm ${mostrarTexto ? '' : 'justify-center px-0'} ${className}`}
    >
      <Icone nome={escuro ? 'sol' : 'lua'} tamanho={18} />
      {mostrarTexto && (escuro ? 'Modo claro' : 'Modo escuro')}
    </button>
  )
}
