import { useEffect, useState } from 'react'
import { db, supabase } from '../lib/supabase'
import { Area, Profile, UserRole } from '../lib/types'

export function AdminUsuarios() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [areas, setAreas] = useState<Area[]>([])

  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [novoRole, setNovoRole] = useState<UserRole>('visualizador')
  const [novasAreas, setNovasAreas] = useState<string[]>([])
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [{ data: profs }, { data: ars }] = await Promise.all([
      db.from('profiles').select('*').order('nome'),
      db.from('areas').select('*').order('nome'),
    ])
    setProfiles(profs ?? [])
    setAreas(ars ?? [])
  }

  async function atualizarRole(id: string, role: UserRole) {
    await db.from('profiles').update({ role }).eq('id', id)
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, role } : p)))
  }

  async function alternarArea(id: string, areaId: string) {
    const profile = profiles.find((p) => p.id === id)
    if (!profile) return
    const atualizadas = profile.areas_permitidas.includes(areaId)
      ? profile.areas_permitidas.filter((a) => a !== areaId)
      : [...profile.areas_permitidas, areaId]

    await db.from('profiles').update({ areas_permitidas: atualizadas }).eq('id', id)
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, areas_permitidas: atualizadas } : p))
    )
  }

  function alternarNovaArea(areaId: string) {
    setNovasAreas((prev) =>
      prev.includes(areaId) ? prev.filter((a) => a !== areaId) : [...prev, areaId]
    )
  }

  async function criarUsuario() {
    setErro(null)
    setSucesso(null)
    if (!novoNome || !novoEmail || !novaSenha) {
      setErro('Preencha nome, e-mail e senha.')
      return
    }
    if (novaSenha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.')
      return
    }

    setCriando(true)
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        email: novoEmail,
        password: novaSenha,
        nome: novoNome,
        role: novoRole,
        areas_permitidas: novasAreas,
      },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })

    setCriando(false)

    if (error || (data as { error?: string })?.error) {
      setErro((data as { error?: string })?.error ?? error?.message ?? 'Falha ao criar usuário.')
      return
    }

    setSucesso(`Usuário ${novoNome} criado com sucesso.`)
    setNovoNome('')
    setNovoEmail('')
    setNovaSenha('')
    setNovoRole('visualizador')
    setNovasAreas([])
    load()
  }

  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <div>
        <h1 className="display mb-1 text-xl font-medium">usuários</h1>
        <p className="mb-6 text-sm text-ink-soft">
          Apenas administradores podem criar novos usuários. Defina o papel e quais
          áreas cada pessoa enxerga.
        </p>

        <div className="divide-y divide-line rounded border border-line">
          {profiles.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm font-medium">{p.nome}</span>

              <select
                value={p.role}
                onChange={(e) => atualizarRole(p.id, e.target.value as UserRole)}
                className="rounded border border-line bg-paper px-2 py-1 text-xs outline-none focus:border-ink"
              >
                <option value="admin">administrador</option>
                <option value="editor">editor</option>
                <option value="visualizador">visualizador</option>
              </select>

              {p.role === 'admin' ? (
                <span className="text-xs text-ink-soft">acesso a todas as áreas</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {areas.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => alternarArea(p.id, a.id)}
                      className={`rounded border px-2 py-1 text-xs ${
                        p.areas_permitidas.includes(a.id)
                          ? 'border-ok bg-ok-soft text-ok'
                          : 'border-line text-ink-soft'
                      }`}
                    >
                      {a.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="display mb-4 text-xl font-medium">novo usuário</h2>

        <div className="space-y-2 rounded border border-line bg-paper-dim/40 p-3">
          <input
            placeholder="nome"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
          />
          <input
            placeholder="e-mail"
            type="email"
            value={novoEmail}
            onChange={(e) => setNovoEmail(e.target.value)}
            className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
          />
          <input
            placeholder="senha provisória (mín. 6 caracteres)"
            type="text"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
          />
          <select
            value={novoRole}
            onChange={(e) => setNovoRole(e.target.value as UserRole)}
            className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
          >
            <option value="visualizador">visualizador</option>
            <option value="editor">editor</option>
            <option value="admin">administrador</option>
          </select>

          {novoRole !== 'admin' && (
            <div className="flex flex-wrap gap-1">
              {areas.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => alternarNovaArea(a.id)}
                  className={`rounded border px-2 py-1 text-xs ${
                    novasAreas.includes(a.id)
                      ? 'border-ok bg-ok-soft text-ok'
                      : 'border-line text-ink-soft'
                  }`}
                >
                  {a.nome}
                </button>
              ))}
            </div>
          )}

          {erro && (
            <p className="rounded border border-alert-soft bg-alert-soft px-2 py-1.5 text-xs text-alert">
              {erro}
            </p>
          )}
          {sucesso && (
            <p className="rounded border border-ok-soft bg-ok-soft px-2 py-1.5 text-xs text-ok">
              {sucesso}
            </p>
          )}

          <button
            onClick={criarUsuario}
            disabled={criando}
            className="w-full rounded bg-ink py-1.5 text-sm font-medium text-paper disabled:opacity-50"
          >
            {criando ? 'criando…' : 'criar usuário'}
          </button>
        </div>
      </div>
    </div>
  )
}
