import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { db, supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PERMISSOES, Permissao, usePermissoes } from '../context/PermissoesContext'
import { Area, Profile, UserRole } from '../lib/types'
import { Carregando, Erro, Vazio, btnCls, btnPerigoCls, btnSecCls, cartaoCls, chipCls, inputCls } from '../components/Estado'

type Perms = Record<Permissao, boolean>
const SEM_PERMS: Perms = {
  ver_custos: false,
  editar_fichas: false,
  editar_precos: false,
  lancar_vendas: false,
  lancar_estoque: false,
  pdv_operar: false,
  pdv_caixa: false,
  pdv_gerir: false,
  pdv_fiscal: false,
  // telas: um usuário novo vê tudo por padrão; o administrador desmarca o que quiser esconder
  pdv_ver_vendas: true,
  pdv_ver_crm: true,
  pdv_ver_reservas: true,
  pdv_ver_whatsapp: true,
  pdv_ver_consumo: true,
}
const PAPEIS: { v: UserRole; rotulo: string }[] = [
  { v: 'admin', rotulo: 'Administrador' },
  { v: 'editor', rotulo: 'Editor' },
  { v: 'visualizador', rotulo: 'Visualizador' },
]
const rotuloPapel = (r: UserRole) => PAPEIS.find((p) => p.v === r)?.rotulo ?? r

/** linha de checklist.usuarios_admin() */
interface InfoAdmin {
  id: string
  email: string | null
  ultimo_acesso: string | null
  execucoes: number
  respostas: number
  aprovacoes: number
}
interface Usuario extends Profile {
  email: string | null
  ultimoAcesso: string | null
  historico: number
  perms: Perms
}

type Filtro = 'todos' | 'ativos' | 'desativados'
/** ação aguardando confirmação na linha do usuário */
type Pendente = { id: string; acao: 'desativar' | 'reativar' | 'excluir' } | null

const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
function dataHora(v: string | null) {
  if (!v) return 'nunca entrou'
  const d = new Date(v)
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}
function pickPerms(p: Partial<Perms> | null | undefined): Perms {
  return Object.fromEntries(PERMISSOES.map(({ key }) => [key, !!p?.[key]])) as Perms
}

/** mensagem legível de erro da Edge Function (o corpo traz { error }) */
async function erroDaFuncao(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const corpo = await error.context.json()
      if (corpo?.error) return String(corpo.error)
    } catch {
      /* corpo não é JSON */
    }
    if (error.context.status === 404) return 'A função admin-create-user ainda não está publicada no Supabase.'
  }
  const msg = (error as Error)?.message ?? String(error)
  if (/Failed to send|fetch/i.test(msg)) return 'A função admin-create-user não respondeu. Ela já foi publicada no Supabase?'
  return msg
}

export function Usuarios() {
  const { profile } = useAuth()
  const { master, carregado } = usePermissoes()

  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null)
  const [areas, setAreas] = useState<Area[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [filtro, setFiltro] = useState<Filtro>('ativos')
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [pendente, setPendente] = useState<Pendente>(null)
  const [ocupado, setOcupado] = useState(false)
  const [criando, setCriando] = useState(false)

  async function carregar() {
    setErro(null)
    const [p, info, a, perm] = await Promise.all([
      db.from('profiles').select('*').order('nome'),
      db.rpc('usuarios_admin'),
      db.from('areas').select('*').order('nome'),
      db.from('permissoes').select('*'),
    ])
    const falha = p.error ?? info.error ?? a.error ?? perm.error
    if (falha) {
      setErro('Não foi possível carregar os usuários: ' + falha.message)
      setUsuarios([])
      return
    }
    const infoPorId = new Map(((info.data ?? []) as InfoAdmin[]).map((x) => [x.id, x]))
    const permPorId = new Map(((perm.data ?? []) as (Perms & { user_id: string })[]).map((x) => [x.user_id, x]))
    setAreas((a.data ?? []) as Area[])
    setUsuarios(
      ((p.data ?? []) as Profile[]).map((u) => {
        const i = infoPorId.get(u.id)
        return {
          ...u,
          email: i?.email ?? null,
          ultimoAcesso: i?.ultimo_acesso ?? null,
          historico: i ? Number(i.execucoes) + Number(i.respostas) + Number(i.aprovacoes) : 0,
          perms: pickPerms(permPorId.get(u.id)),
        }
      })
    )
  }

  useEffect(() => {
    if (master) carregar()
  }, [master])

  const visiveis = useMemo(() => {
    const b = sem(busca.trim())
    return (usuarios ?? []).filter((u) => {
      const ativo = u.ativo !== false
      if (filtro === 'ativos' && !ativo) return false
      if (filtro === 'desativados' && ativo) return false
      return !b || sem(u.nome).includes(b) || sem(u.email ?? '').includes(b)
    })
  }, [usuarios, filtro, busca])

  if (!carregado) return <Carregando />
  if (!master) return <Navigate to="/" replace />

  const nomeArea = (id: string) => areas.find((a) => a.id === id)?.nome ?? '—'

  async function confirmar() {
    if (!pendente) return
    const u = usuarios?.find((x) => x.id === pendente.id)
    if (!u) return
    setOcupado(true)
    setErro(null)
    setAviso(null)
    let falha: string | null = null
    if (pendente.acao === 'excluir') {
      // só o perfil (as permissões caem junto); a conta de autenticação fica, o projeto é compartilhado
      const { data, error } = await db.from('profiles').delete().eq('id', u.id).select('id')
      if (error) falha = error.code === '23503' ? `${u.nome} tem histórico: desative em vez de excluir.` : error.message
      else if (!data?.length) falha = `Sem permissão para excluir ${u.nome}.`
    } else {
      const { error } = await db.rpc(pendente.acao === 'desativar' ? 'desativar_usuario' : 'reativar_usuario', {
        p_user: u.id,
      })
      if (error) falha = error.message
    }
    setOcupado(false)
    setPendente(null)
    if (falha) return setErro(falha)
    setAviso(
      pendente.acao === 'excluir'
        ? `${u.nome} foi excluído do sistema. A conta de login continua existindo no Supabase.`
        : pendente.acao === 'desativar'
          ? `${u.nome} foi desativado. O acesso anterior fica guardado para a reativação.`
          : `${u.nome} foi reativado com o acesso que tinha antes.`
    )
    carregar()
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo">usuários</h1>
          <p className="text-sm text-ink-soft">Papéis, áreas e permissões. Só o administrador master vê esta tela.</p>
        </div>
        {!criando && (
          <button onClick={() => setCriando(true)} className={btnCls}>
            novo usuário
          </button>
        )}
      </div>

      {criando && (
        <NovoUsuario
          areas={areas}
          onFechar={() => setCriando(false)}
          onCriado={(nome) => {
            setCriando(false)
            setAviso(`${nome} foi criado. Passe a senha temporária para a pessoa trocar no primeiro acesso.`)
            carregar()
          }}
        />
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {(['ativos', 'desativados', 'todos'] as Filtro[]).map((f) => (
          <button key={f} onClick={() => setFiltro(f)} className={chipCls(filtro === f)} aria-pressed={filtro === f}>
            {f}
          </button>
        ))}
      </div>
      <input
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="buscar por nome ou e-mail"
        aria-label="Buscar por nome ou e-mail"
        className={`${inputCls} mb-4`}
      />

      {erro && (
        <div className="mb-4">
          <Erro texto={erro} />
        </div>
      )}
      {aviso && (
        <p className="mb-4 rounded-xl bg-ok-soft px-4 py-3 text-sm text-ok" role="status">
          {aviso}
        </p>
      )}

      {usuarios == null ? (
        <Carregando />
      ) : visiveis.length === 0 ? (
        <Vazio texto="Nenhum usuário com esse filtro." />
      ) : (
        <ul className="space-y-3">
          {visiveis.map((u) => {
            const proprio = u.id === profile?.id
            const ativo = u.ativo !== false
            const confirmando = pendente?.id === u.id ? pendente.acao : null
            return (
              <li key={u.id} className={`${cartaoCls} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {u.nome}
                      {proprio && <span className="ml-1.5 text-xs font-normal text-ink-soft">(você)</span>}
                      {u.is_master && (
                        <span className="ml-1.5 rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-normal text-brand">master</span>
                      )}
                    </p>
                    <p className="truncate text-sm text-ink-soft">{u.email ?? 'e-mail indisponível'}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs ${ativo ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}
                  >
                    {ativo ? 'ativo' : 'desativado'}
                  </span>
                </div>

                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs sm:grid-cols-[auto_1fr_auto_1fr]">
                  <dt className="text-ink-soft">papel</dt>
                  <dd>{rotuloPapel(u.role)}</dd>
                  <dt className="text-ink-soft">áreas</dt>
                  <dd>
                    {u.role === 'admin'
                      ? 'todas'
                      : u.areas_permitidas.length
                        ? u.areas_permitidas.map(nomeArea).join(', ')
                        : 'nenhuma'}
                  </dd>
                  <dt className="text-ink-soft">último acesso</dt>
                  <dd>{dataHora(u.ultimoAcesso)}</dd>
                  <dt className="text-ink-soft">tem histórico</dt>
                  <dd>{u.historico > 0 ? `sim (${u.historico} registros)` : 'não'}</dd>
                </dl>

                {editando === u.id ? (
                  <EditarUsuario
                    usuario={u}
                    proprio={proprio}
                    areas={areas}
                    onFechar={() => setEditando(null)}
                    onSalvo={() => {
                      setEditando(null)
                      setAviso(`Acesso de ${u.nome} atualizado.`)
                      carregar()
                    }}
                  />
                ) : confirmando ? (
                  <div className="mt-3 rounded-[10px] border border-line bg-paper-dim/40 p-3 text-sm">
                    <p className="mb-2">
                      {confirmando === 'desativar' &&
                        `Desativar ${u.nome}? A pessoa perde o acesso; papel, áreas e permissões ficam guardados para reativar depois.`}
                      {confirmando === 'reativar' && `Reativar ${u.nome} com o acesso que tinha antes de ser desativado?`}
                      {confirmando === 'excluir' &&
                        `Excluir ${u.nome} do sistema? Apaga o perfil e as permissões. A conta de login não é apagada.`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={confirmar}
                        disabled={ocupado}
                        className={confirmando === 'reativar' ? btnSecCls : btnPerigoCls}
                      >
                        {ocupado ? 'aguarde…' : `confirmar: ${confirmando}`}
                      </button>
                      <button onClick={() => setPendente(null)} disabled={ocupado} className={btnSecCls}>
                        cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {ativo ? (
                      <button onClick={() => setEditando(u.id)} className={btnSecCls}>
                        editar
                      </button>
                    ) : (
                      <span className="text-xs text-ink-soft">reative para editar o acesso</span>
                    )}
                    {!proprio && (
                      <button
                        onClick={() => setPendente({ id: u.id, acao: ativo ? 'desativar' : 'reativar' })}
                        className={ativo ? btnPerigoCls : btnSecCls}
                      >
                        {ativo ? 'desativar' : 'reativar'}
                      </button>
                    )}
                    {!proprio &&
                      (u.historico === 0 ? (
                        <button onClick={() => setPendente({ id: u.id, acao: 'excluir' })} className={btnPerigoCls}>
                          excluir
                        </button>
                      ) : (
                        <span className="text-xs text-ink-soft">tem histórico: desative em vez de excluir</span>
                      ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ---------- campos compartilhados por editar e criar ----------

function CamposAcesso({
  role,
  setRole,
  areasSel,
  setAreasSel,
  perms,
  setPerms,
  areas,
  travarPapel,
}: {
  role: UserRole
  setRole: (r: UserRole) => void
  areasSel: string[]
  setAreasSel: (a: string[]) => void
  perms: Perms
  setPerms: (p: Perms) => void
  areas: Area[]
  travarPapel?: boolean
}) {
  const admin = role === 'admin'
  return (
    <>
      <label className="block text-xs text-ink-soft">
        papel
        <select
          value={role}
          disabled={travarPapel}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className={inputCls}
        >
          {PAPEIS.map((p) => (
            <option key={p.v} value={p.v}>
              {p.rotulo}
            </option>
          ))}
        </select>
        {travarPapel && <span className="mt-1 block">Você não pode tirar o próprio acesso de administrador master.</span>}
      </label>

      <fieldset>
        <legend className="mb-1 text-xs text-ink-soft">áreas permitidas</legend>
        {admin ? (
          <p className="text-xs text-ink-soft">Administrador acessa todas as áreas.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {areas.map((a) => {
              const on = areasSel.includes(a.id)
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAreasSel(on ? areasSel.filter((x) => x !== a.id) : [...areasSel, a.id])}
                  className={chipCls(on)}
                >
                  {a.nome}
                </button>
              )
            })}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-xs text-ink-soft">permissões</legend>
        {admin && <p className="mb-1 text-xs text-ink-soft">Administrador já tem todas as permissões.</p>}
        <div className="flex flex-wrap gap-2">
          {PERMISSOES.map(({ key, label }) => {
            const on = admin || perms[key]
            return (
              <button
                key={key}
                type="button"
                disabled={admin}
                aria-pressed={on}
                onClick={() => setPerms({ ...perms, [key]: !perms[key] })}
                className={`${chipCls(on)} disabled:opacity-70`}
              >
                {on ? '● ' : '○ '}
                {label}
              </button>
            )
          })}
        </div>
      </fieldset>
    </>
  )
}

function EditarUsuario({
  usuario,
  proprio,
  areas,
  onFechar,
  onSalvo,
}: {
  usuario: Usuario
  proprio: boolean
  areas: Area[]
  onFechar: () => void
  onSalvo: () => void
}) {
  const [role, setRole] = useState<UserRole>(usuario.role)
  const [areasSel, setAreasSel] = useState<string[]>(usuario.areas_permitidas)
  const [perms, setPerms] = useState<Perms>(usuario.perms)
  const [isMaster, setIsMaster] = useState(!!usuario.is_master)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // o master não tira o próprio acesso: papel e master ficam travados na própria linha
  const travar = proprio && !!usuario.is_master

  async function salvar() {
    setSalvando(true)
    setErro(null)
    const admin = role === 'admin'
    const { data, error } = await db
      .from('profiles')
      .update({ role, areas_permitidas: admin ? [] : areasSel, is_master: admin && isMaster })
      .eq('id', usuario.id)
      .select('id')
    if (error || !data?.length) {
      setSalvando(false)
      return setErro(error ? error.message : 'Sem permissão para alterar este usuário.')
    }
    // administrador já tem tudo: as permissões guardadas ficam como estão
    if (!admin) {
      const p = await db.from('permissoes').upsert({ user_id: usuario.id, ...perms }, { onConflict: 'user_id' })
      if (p.error) {
        setSalvando(false)
        return setErro('Papel e áreas salvos, mas as permissões não: ' + p.error.message)
      }
    }
    setSalvando(false)
    onSalvo()
  }

  return (
    <div className="mt-3 space-y-3 rounded-[10px] border border-line p-3">
      <CamposAcesso
        role={role}
        setRole={(r) => {
          setRole(r)
          if (r !== 'admin') setIsMaster(false)
        }}
        areasSel={areasSel}
        setAreasSel={setAreasSel}
        perms={perms}
        setPerms={setPerms}
        areas={areas}
        travarPapel={travar}
      />
      {role === 'admin' && (
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isMaster}
            disabled={travar}
            onChange={(e) => setIsMaster(e.target.checked)}
            className="h-4 w-4"
          />
          administrador master (gerencia usuários)
        </label>
      )}
      {erro && <Erro texto={erro} />}
      <div className="flex flex-wrap gap-2">
        <button onClick={salvar} disabled={salvando} className={btnCls}>
          {salvando ? 'salvando…' : 'salvar'}
        </button>
        <button onClick={onFechar} disabled={salvando} className={btnSecCls}>
          cancelar
        </button>
      </div>
    </div>
  )
}

function NovoUsuario({
  areas,
  onFechar,
  onCriado,
}: {
  areas: Area[]
  onFechar: () => void
  onCriado: (nome: string) => void
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [role, setRole] = useState<UserRole>('visualizador')
  const [areasSel, setAreasSel] = useState<string[]>([])
  const [perms, setPerms] = useState<Perms>(SEM_PERMS)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!nome.trim() || !email.trim() || !senha) return setErro('Preencha nome, e-mail e senha temporária.')
    if (senha.length < 6) return setErro('A senha temporária precisa ter pelo menos 6 caracteres.')
    setEnviando(true)
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { nome: nome.trim(), email: email.trim(), password: senha, role, areas_permitidas: role === 'admin' ? [] : areasSel },
    })
    if (error || (data as { error?: string })?.error) {
      setEnviando(false)
      return setErro((data as { error?: string })?.error ?? (await erroDaFuncao(error)))
    }
    // a função cria conta e perfil; as permissões são gravadas aqui (o master pode)
    const id = (data as { id?: string })?.id
    if (id && role !== 'admin' && Object.values(perms).some(Boolean)) {
      const p = await db.from('permissoes').upsert({ user_id: id, ...perms }, { onConflict: 'user_id' })
      if (p.error) {
        setEnviando(false)
        return setErro(`${nome} foi criado, mas as permissões não foram salvas: ${p.error.message}. Ajuste em "editar".`)
      }
    }
    setEnviando(false)
    onCriado(nome.trim())
  }

  return (
    <form onSubmit={criar} className={`${cartaoCls} mb-6 space-y-3 p-4`}>
      <h2 className="text-base font-semibold">novo usuário</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-ink-soft">
          nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} autoComplete="off" />
        </label>
        <label className="block text-xs text-ink-soft">
          e-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoComplete="off" />
        </label>
        <label className="block text-xs text-ink-soft sm:col-span-2">
          senha temporária (mín. 6 caracteres)
          <input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} className={inputCls} autoComplete="new-password" />
        </label>
      </div>
      <CamposAcesso
        role={role}
        setRole={setRole}
        areasSel={areasSel}
        setAreasSel={setAreasSel}
        perms={perms}
        setPerms={setPerms}
        areas={areas}
      />
      {erro && <Erro texto={erro} />}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={enviando} className={btnCls}>
          {enviando ? 'criando…' : 'criar usuário'}
        </button>
        <button type="button" onClick={onFechar} disabled={enviando} className={btnSecCls}>
          cancelar
        </button>
      </div>
    </form>
  )
}
