import { useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { usePermissoes } from '../context/PermissoesContext'
import { Carregando, Vazio, Erro, inputCls, btnCls } from '../components/Estado'

interface Fornecedor { id: string; nome: string; telefone: string | null }

export function Fornecedores() {
  const { pode } = usePermissoes()
  const podeEditar = pode('editar_precos') || pode('lancar_estoque')
  const [lista, setLista] = useState<Fornecedor[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [tel, setTel] = useState('')

  async function load() {
    setCarregando(true)
    const { data, error } = await db.from('fornecedores').select('*').order('nome')
    setCarregando(false)
    if (error) return setErro(error.message)
    setLista(data ?? [])
  }
  useEffect(() => { load() }, [])

  async function criar() {
    if (!nome.trim()) return
    const { error } = await db.from('fornecedores').insert({ nome: nome.trim(), telefone: tel.trim() || null })
    if (error) return alert('Não foi possível salvar: ' + error.message)
    setNome(''); setTel(''); load()
  }
  async function excluir(f: Fornecedor) {
    if (!confirm(`Excluir o fornecedor ${f.nome}?`)) return
    const { error } = await db.from('fornecedores').delete().eq('id', f.id)
    if (error) return alert('Não foi possível excluir: ' + error.message)
    load()
  }

  return (
    <div className="max-w-xl">
      <h1 className="titulo mb-6">fornecedores</h1>
      {erro && <Erro texto={erro} />}
      {carregando ? <Carregando /> : lista.length === 0 ? <Vazio texto="Nenhum fornecedor cadastrado." /> : (
        <div className="divide-y divide-line rounded border border-line">
          {lista.map((f) => (
            <div key={f.id} className="flex min-h-[44px] items-center justify-between px-3 py-2 text-sm">
              <span><b className="font-medium">{f.nome}</b> <span className="text-ink-soft">{f.telefone}</span></span>
              {podeEditar && <button onClick={() => excluir(f)} className="text-xs text-alert underline">excluir</button>}
            </div>
          ))}
        </div>
      )}
      {podeEditar && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input placeholder="nome" value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} />
          <input placeholder="telefone" value={tel} onChange={(e) => setTel(e.target.value)} className={inputCls} />
          <button onClick={criar} className={btnCls}>adicionar</button>
        </div>
      )}
    </div>
  )
}
