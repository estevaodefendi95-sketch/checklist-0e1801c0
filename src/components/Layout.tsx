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
import { AlertaImpressao } from './AlertaImpressao'
import { FaixaCaixa } from './FaixaCaixa'
import { MODO_KEY } from '../lib/modo'

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
  soCelular?: boolean // só aparece no celular (não no menu lateral do computador)
}

type Modo = 'atendimento' | 'gestao'
const MODO = MODO_KEY
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
  if (to === '/pdv') return pathname === '/pdv'
  if (to === '/atendimento') return pathname === '/atendimento' || pathname.startsWith('/pdv/comanda/')
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
  const todosItens: Item[] = [
    ...(pode('pdv_operar') ? [{ to: '/', rotulo: 'Início (salão agora)', curto: 'Início', icone: 'areas', grupo: 'atendimento' } as Item] : []),
    ...(pode('pdv_operar')
      ? [
          { to: '/atendimento', rotulo: 'Atendimento rápido', curto: 'Mesas', icone: 'pdv', grupo: 'atendimento', soCelular: true } as Item,
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
    ...(pode('pdv_caixa') ? [{ to: '/pdv/caixa', rotulo: 'Caixa', icone: 'caixa', grupo: 'atendimento' } as Item, { to: '/pdv/a-receber', rotulo: 'A receber (fiado)', curto: 'A receber', icone: 'nota', grupo: 'atendimento' } as Item] : []),
    ...(pode('pdv_operar')
      ? [{ to: '/pdv/relatorios', rotulo: 'Relatório de vendas', curto: 'Vendas', icone: 'vendas', grupo: 'atendimento' } as Item]
      : []),
    { to: '/checklists', rotulo: 'Checklists', curto: 'Checklist', icone: 'checklist', grupo: 'operacao' },
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
    ...(pode('pdv_gerir') ? [{ to: '/pdv/tablet', rotulo: 'Gestão do tablet', curto: 'Tablet', icone: 'pdv', grupo: 'admin' } as Item] : []),
    ...(pode('pdv_gerir') || pode('pdv_fiscal')
      ? [{ to: '/pdv/config', rotulo: 'Configurações do PDV', curto: 'Config.', icone: 'impressora', grupo: 'admin' } as Item]
      : []),
    ...(master ? [{ to: '/usuarios', rotulo: 'Usuários', icone: 'usuarios', grupo: 'admin' } as Item] : []),
    ...(admin
      ? [{ to: '/admin/templates', rotulo: 'Áreas e modelos', icone: 'modelos', grupo: 'admin' } as Item]
      : []),
  ]
  const VER: Record<string, Parameters<typeof pode>[0]> = {
    '/pdv/relatorios': 'pdv_ver_vendas', '/pdv/crm': 'pdv_ver_crm', '/pdv/reservas': 'pdv_ver_reservas', '/whatsapp': 'pdv_ver_whatsapp', '/pdv/consumo': 'pdv_ver_consumo',
  }
  const verGestao = pode('pdv_ver_gestao')
  // sem permissão de Gestão: só as telas de atendimento (cada uma ainda respeita as permissões próprias)
  const itens = todosItens.filter((i) => (!VER[i.to] || pode(VER[i.to])) && (verGestao || i.grupo === 'atendimento'))
  const temAtend = pode('pdv_operar')
  const [modoSalvo, setModoSalvo] = useState<Modo>(() => ler<Modo>(MODO, 'atendimento'))
  const modo: Modo = temAtend ? (verGestao ? modoSalvo : 'atendimento') : 'gestao'
  const podeTrocar = temAtend && verGestao
  const BARRA_MODO: Record<Modo, string[]> = {
    atendimento: ['/atendimento', '/pdv/comandas', '/pdv/reservas', '/pdv/caixa'],
    gestao: ['/', '/checklists', '/pdv/relatorios', '/estoque/alertas', '/fichas'],
  }
  const NA_BARRA = itens.filter((i) => BARRA_MODO[modo].includes(i.to)).map((i) => i.to)
  const ordem: Item['grupo'][] = modo === 'atendimento' ? ['atendimento', 'operacao', 'cardapio', 'admin'] : ['operacao', 'cardapio', 'admin', 'atendimento']
  const itensMais = itens
    .filter((i) => !NA_BARRA.includes(i.to))
    .sort((a, b) => ordem.indexOf(a.grupo) - ordem.indexOf(b.grupo))
  function trocarModo(m: Modo) {
    setModoSalvo(m)
    gravar(MODO, m)
    setMaisAberto(false)
    navigate(m === 'atendimento' ? '/atendimento' : '/')
  }

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

  // grupos do menu: o usuário abre/fecha cada um e a escolha fica gravada; o grupo da página atual nunca fica escondido
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('paggio-menu-grupos') || '{}') } catch { return {} }
  })
  function alternarGrupo(g: string, aberto: boolean) {
    setGruposAbertos((o) => {
      const n = { ...o, [g]: !aberto }
      try { localStorage.setItem('paggio-menu-grupos', JSON.stringify(n)) } catch { /* sem armazenamento */ }
      return n
    })
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
        <div className={`flex items-center px-5 pb-2 pt-4 ${recolhido ? 'justify-center px-0' : ''}`}>
          <Link to="/" className="leading-none" title="Paggio">
            <b className="font-display text-2xl font-semibold">{recolhido ? 'P' : 'Paggio'}</b>
            {!recolhido && <small className="mt-1 block text-[11px] uppercase tracking-[0.08em] opacity-75">Operação</small>}
          </Link>
          <span className={recolhido ? 'absolute left-1/2 top-2 -translate-x-1/2' : 'ml-auto'}><FaixaCaixa compacto={recolhido} /></span>
        </div>

        <div className="px-3.5"><Sino className="w-full hover:bg-brand-ink/10" rotulo={!recolhido} /></div>
        <nav className="flex-1 overflow-y-auto px-3.5">
          {(['atendimento', 'operacao', 'cardapio', 'admin'] as const).map((g) => {
            const doGrupo = itens.filter((i) => i.grupo === g && !i.soCelular)
            if (!doGrupo.length) return null
            const temAtivo = doGrupo.some((i) => ativo(i.to, pathname))
            const aberto = recolhido || temAtivo || (gruposAbertos[g] ?? g === itens[0]?.grupo)
            return (
              <div key={g} className="mb-1">
                {!recolhido && (
                  <button type="button" onClick={() => alternarGrupo(g, aberto)} aria-expanded={aberto}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 pb-1 pt-3 text-[11px] uppercase tracking-[0.08em] opacity-60 hover:opacity-100">
                    <span>{ROTULO_GRUPO[g]}</span>
                    <span aria-hidden className={`text-xs transition-transform ${aberto ? 'rotate-90' : ''}`}>›</span>
                  </button>
                )}
                {recolhido && g !== 'atendimento' && <hr className="mx-3 my-2 border-brand-ink/20" />}
                {aberto && doGrupo.map((i) => (
                  <ItemLateral key={i.to} item={i} recolhido={recolhido} ativo={ativo(i.to, pathname)} />
                ))}
              </div>
            )
          })}
        </nav>

        <div className="border-t border-brand-ink/15 px-3.5 py-2.5">
          {!recolhido && profile && (
            <div className="flex items-baseline justify-between gap-2 px-1 pb-1.5 leading-tight">
              <span className="truncate text-[13px] font-semibold">{profile.nome}</span>
              <span className="shrink-0 text-[11px] opacity-60">{roleLabel[profile.role]}</span>
            </div>
          )}
          <div className={`flex gap-1 ${recolhido ? 'flex-col items-center' : 'justify-between'}`}>
            <BotaoTema className="text-brand-ink hover:bg-brand-ink/10" mostrarTexto={false} />
            <button onClick={sair} title="Sair" aria-label="Sair"
              className="flex min-h-[40px] w-full items-center justify-center rounded-[10px] text-sm hover:bg-brand-ink/10">
              <Icone nome="sair" tamanho={18} />
            </button>
            <button onClick={alternarRecolhido} aria-expanded={!recolhido} aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'} title={recolhido ? 'Expandir menu' : 'Recolher menu'}
              className="flex min-h-[40px] w-full items-center justify-center rounded-[10px] text-sm hover:bg-brand-ink/10">
              <Icone nome={recolhido ? 'expandir' : 'recolher'} tamanho={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* ---------- conteúdo ---------- */}
      <div className={`transition-[padding] duration-200 ${recuo}`}>
        {/* celular/tablet retrato: só a marca; o título fica na própria página */}
        <div className="flex items-center justify-between px-4 pt-[calc(14px+env(safe-area-inset-top))] text-xs uppercase tracking-[0.08em] text-ink-soft md:px-6 lg:hidden">
          <span className="flex items-center gap-2">Paggio <FaixaCaixa /></span>
          {podeTrocar && <SeletorModo modo={modo} onModo={trocarModo} compacto />}
          <Sino className="text-brand" />
        </div>
        <main className="mx-auto max-w-6xl px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-3 md:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          <AlertaImpressao />
          {children}
          <LinhaVersao className="mt-12 text-center text-ink-soft" />
        </main>
      </div>

      <Assistente />
      {/* ---------- barra inferior (< 1024 px) ---------- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface px-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5 lg:hidden"
        aria-label="Menu inferior"
        style={{ gridTemplateColumns: `repeat(${NA_BARRA.length + 1}, minmax(0, 1fr))` }}
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
          itens={itensMais}
          modo={podeTrocar ? modo : undefined}
          onModo={trocarModo}
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
  modo,
  onModo,
  pathname,
  nome,
  papel,
  onFechar,
  onSair,
}: {
  itens: Item[]
  modo?: Modo
  onModo: (m: Modo) => void
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
        {modo && <SeletorModo modo={modo} onModo={onModo} />}
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
      className={`flex min-h-[40px] w-full items-center gap-3 rounded-[10px] px-2.5 text-sm ${mostrarTexto ? '' : 'justify-center px-0'} ${className}`}
    >
      <Icone nome={escuro ? 'sol' : 'lua'} tamanho={18} />
      {mostrarTexto && (escuro ? 'Modo claro' : 'Modo escuro')}
    </button>
  )
}

function SeletorModo({ modo, onModo, compacto }: { modo: Modo; onModo: (m: Modo) => void; compacto?: boolean }) {
  const op: { v: Modo; r: string }[] = [
    { v: 'atendimento', r: compacto ? 'Atendimento' : 'Atendimento e vendas' },
    { v: 'gestao', r: 'Gestão' },
  ]
  return (
    <div role="group" aria-label="Modo do app" className={`flex gap-1 rounded-full bg-paper-dim p-1 normal-case tracking-normal ${compacto ? 'text-xs' : 'mb-3 text-sm'}`}>
      {op.map((o) => (
        <button
          key={o.v}
          onClick={() => modo !== o.v && onModo(o.v)}
          aria-pressed={modo === o.v}
          className={`flex-1 rounded-full px-3 ${compacto ? 'min-h-[32px]' : 'min-h-[44px]'} ${modo === o.v ? 'bg-brand font-semibold text-brand-ink' : 'text-ink-soft'}`}
        >
          {o.r}
        </button>
      ))}
    </div>
  )
}
