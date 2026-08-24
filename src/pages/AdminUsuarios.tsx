import { useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { Area, Profile, UserRole } from '../lib/types'

export function AdminUsuarios() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [areas, setAreas] = useState<Area[]>([])

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
    const novasAreas = profile.areas_permitidas.includes(areaId)
      ? profile.areas_permitidas.filter((a) => a !== areaId)
      : [...profile.areas_permitidas, areaId]

    await db.from('profiles').update({ areas_permitidas: novasAreas }).eq('id', id)
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, areas_permitidas: novasAreas } : p))
    )
  }

  return (
    <div>
      <h1 className="display mb-1 text-xl font-medium">usuários</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Contas são criadas pelo Supabase Auth (convite por e-mail). Aqui você define o
        papel e quais áreas cada pessoa enxerga.
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
              <div className="flex gap-1">
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
  )
}
