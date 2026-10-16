import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, db } from '../lib/supabase'
import { usePermissoes } from '../context/PermissoesContext'
import { lerNumero, reais } from '../lib/formato'
import { Carregando, Erro, inputCls, btnCls, btnSecCls, btnPerigoCls, cartaoCls, chipCls } from '../components/Estado'
import { Cabecalho } from '../components/Cabecalho'
import { BarraSalvar, SeloAlteracoes, useAlteracoesPendentes } from '../components/Alteracoes'
import {
  Ficha,
  TIPO_LABEL,
  TipoFicha,
  UNIDADES_ITEM,
  UNIDADES_RENDIMENTO,
  Unidade,
  carregarCustoItens,
  carregarFicha,
} from '../lib/fichas'

interface Opcao {
  id: string
  nome: string
  tipo: 'insumo' | 'preparacao'
  unidade: Unidade
}

interface LinhaItem {
  chave: string
  id?: string // id em ficha_itens, quando já existe
  ref: Opcao
  quantidade: string
  unidade: Unidade
  grupo_escolha: string
  observacao: string
  perda_pct: string // em branco = sem perda
}

const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FOTO = 5 * 1024 * 1024
const LARGURA_FOTO = 1600

/** reduz para 1600 px de largura (JPEG) quando a imagem é maior; senão devolve o arquivo como está */
async function prepararFoto(arquivo: File): Promise<File> {
  const img = await createImageBitmap(arquivo)
  try {
    if (img.width <= LARGURA_FOTO) return arquivo
    const canvas = document.createElement('canvas')
    canvas.width = LARGURA_FOTO
    canvas.height = Math.round((img.height * LARGURA_FOTO) / img.width)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não foi possível reduzir a imagem.')
    // fundo branco para PNG/WEBP com transparência (JPEG não tem alfa)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85))
    if (!blob) throw new Error('Não foi possível reduzir a imagem.')
    return new File([blob], arquivo.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } finally {
    img.close()
  }
}

const txt = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))
let seq = 0
const novaChave = () => `n${++seq}`

/** unidade sugerida para um item: preparações e insumos em kg/L viram g/ml */
function unidadeSugerida(u: Unidade): Unidade {
  return u === 'kg' ? 'g' : u === 'l' ? 'ml' : u
}

export function FichaEditor() {
  const { id } = useParams()
  const nova = !id
  const navigate = useNavigate()
  const { pode, carregado } = usePermissoes()
  const verCusto = pode('ver_custos')

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [original, setOriginal] = useState<Ficha | null>(null)
  const [opcoes, setOpcoes] = useState<Opcao[]>([])
  const [cardapios, setCardapios] = useState<{ id: string; nome: string }[]>([])
  const [selCardapios, setSelCardapios] = useState<string[]>([])
  const [cardapiosOriginais, setCardapiosOriginais] = useState<string[]>([])
  const [itens, setItens] = useState<LinhaItem[]>([])
  const [idsOriginais, setIdsOriginais] = useState<string[]>([])
  // custo de cada linha como está gravado no banco (custo_itens_ficha); null = sem acesso ou sem a função
  const [custoItens, setCustoItens] = useState<Map<string, number | null> | null>(null)
  // a ficha já tinha alguma perda por linha gravada (para saber se perda_pct precisa ir no salvamento)
  const [tinhaPerdaLinha, setTinhaPerdaLinha] = useState(false)
  const [foto, setFoto] = useState<File | null>(null)
  const [removerFoto, setRemoverFoto] = useState(false)
  const [preparandoFoto, setPreparandoFoto] = useState(false)
  const [fotoErro, setFotoErro] = useState<string | null>(null)
  const previaFoto = useMemo(() => (foto ? URL.createObjectURL(foto) : null), [foto])
  useEffect(
    () => () => {
      if (previaFoto) URL.revokeObjectURL(previaFoto)
    },
    [previaFoto]
  )
  const [f, setF] = useState({
    tipo: 'prato' as TipoFicha,
    nome: '',
    rendimento: '1',
    rendimento_unidade: 'kg' as Unidade,
    porcoes: '1',
    perda_pct: '10',
    preco_venda: '',
    meta_cmv: '30',
    tempo_preparo_min: '',
    modo_preparo: '',
    montagem: '',
    conservacao: '',
    utensilios: '',
    ativo: true,
  })
  // estado salvo, para saber se há alterações e para "Descartar"
  const [base, setBase] = useState<{ f: typeof f; itens: LinhaItem[]; sel: string[] } | null>(null)
  const retrato = (x: { f: typeof f; itens: LinhaItem[]; sel: string[] }) =>
    JSON.stringify({ f: x.f, itens: x.itens.map(({ chave: _c, ...r }) => r), sel: [...x.sel].sort() })
  const sujo = !!base && (!!foto || removerFoto || retrato({ f, itens, sel: selCardapios }) !== retrato(base))
  const { liberar } = useAlteracoesPendentes(sujo)

  function descartar() {
    if (!base || !confirm('Descartar as alterações desta ficha?')) return
    setF(base.f)
    setItens(base.itens)
    setSelCardapios(base.sel)
    setFoto(null)
    setRemoverFoto(false)
    setFotoErro(null)
  }

  useEffect(() => {
    ;(async () => {
      setCarregando(true)
      const [ins, prep, card] = await Promise.all([
        db.from('insumos').select('id,nome,unidade').eq('ativo', true).order('nome'),
        db.from('fichas').select('id,nome,rendimento_unidade').eq('tipo', 'preparacao').eq('ativo', true).order('nome'),
        db.from('cardapios').select('id,nome').order('ordem'),
      ])
      const ops: Opcao[] = [
        ...(ins.data ?? []).map((i: { id: string; nome: string; unidade: Unidade }) => ({ ...i, tipo: 'insumo' as const })),
        ...(prep.data ?? []).map((p: { id: string; nome: string; rendimento_unidade: Unidade }) => ({
          id: p.id,
          nome: p.nome,
          unidade: p.rendimento_unidade,
          tipo: 'preparacao' as const,
        })),
      ]
      setOpcoes(ops)
      setCardapios(card.data ?? [])

      if (id) {
        try {
          const d = await carregarFicha(id)
          const x = d.ficha
          setOriginal(x)
          const fCarregado = {
            tipo: x.tipo,
            nome: x.nome,
            rendimento: txt(x.rendimento),
            rendimento_unidade: x.rendimento_unidade,
            porcoes: txt(x.porcoes),
            perda_pct: txt(x.perda_pct),
            preco_venda: txt(x.preco_venda),
            meta_cmv: txt(x.meta_cmv),
            tempo_preparo_min: x.tempo_preparo_min == null ? '' : String(x.tempo_preparo_min),
            modo_preparo: x.modo_preparo ?? '',
            montagem: x.montagem ?? '',
            conservacao: x.conservacao ?? '',
            utensilios: x.utensilios ?? '',
            ativo: x.ativo,
          }
          const itensCarregados: LinhaItem[] = d.itens.map((i) => ({
              chave: i.id,
              id: i.id,
              ref: ops.find((o) => o.id === (i.insumo_id ?? i.sub_ficha_id)) ?? {
                id: (i.insumo_id ?? i.sub_ficha_id)!,
                nome: i.nome,
                tipo: i.insumo_id ? 'insumo' : 'preparacao',
                unidade: i.unidade,
              },
              quantidade: txt(i.quantidade),
              unidade: i.unidade,
              grupo_escolha: i.grupo_escolha ?? '',
              observacao: i.observacao ?? '',
              perda_pct: txt(i.perda_pct),
            }))
          setIdsOriginais(d.itens.map((i) => i.id))
          setTinhaPerdaLinha(d.itens.some((i) => i.perda_pct != null))
          const sel = d.cardapios.map((c) => c.id)
          setCardapiosOriginais(sel)
          setF(fCarregado)
          setItens(itensCarregados)
          setSelCardapios(sel)
          setBase({ f: fCarregado, itens: itensCarregados, sel })
        } catch (e) {
          setErro((e as Error).message)
        }
      } else {
        setBase({ f, itens: [], sel: [] })
      }
      setCarregando(false)
    })()
  }, [id])

  // custo por linha vem sempre do banco; as permissões podem chegar depois da ficha
  useEffect(() => {
    if (id && verCusto) carregarCustoItens(id).then(setCustoItens)
  }, [id, verCusto])

  if (!carregado || carregando) return <Carregando />
  if (!pode('editar_fichas'))
    return <Erro texto="Você não tem permissão para editar fichas. Peça ao administrador." />

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))

  function addItem(o: Opcao) {
    setItens((p) => [
      ...p,
      { chave: novaChave(), ref: o, quantidade: '', unidade: unidadeSugerida(o.unidade), grupo_escolha: '', observacao: '', perda_pct: '' },
    ])
  }
  function mudarItem(chave: string, campos: Partial<LinhaItem>) {
    setItens((p) => p.map((i) => (i.chave === chave ? { ...i, ...campos } : i)))
  }
  function mover(n: number, d: -1 | 1) {
    setItens((p) => {
      const m = n + d
      if (m < 0 || m >= p.length) return p
      const c = [...p]
      ;[c[n], c[m]] = [c[m], c[n]]
      return c
    })
  }
  function tirar(i: LinhaItem) {
    if (!confirm(`Tirar ${i.ref.nome} da ficha?`)) return
    setItens((p) => p.filter((x) => x.chave !== i.chave))
  }

  // foto mostrada no bloco: a nova (prévia), a atual ou nenhuma
  const fotoAtual = previaFoto ?? (removerFoto ? null : (original?.foto_url ?? null))

  async function escolherFoto(arquivo?: File) {
    if (!arquivo) return
    setFotoErro(null)
    if (!TIPOS_FOTO.includes(arquivo.type)) return setFotoErro('Use uma imagem JPG, PNG ou WEBP.')
    if (arquivo.size > MAX_FOTO) return setFotoErro('A imagem passa de 5 MB. Escolha uma menor.')
    setPreparandoFoto(true)
    try {
      setFoto(await prepararFoto(arquivo))
      setRemoverFoto(false)
    } catch (e) {
      setFotoErro((e as Error).message || 'Não foi possível ler a imagem.')
    }
    setPreparandoFoto(false)
  }
  function tirarFoto() {
    setFoto(null)
    setFotoErro(null)
    // só marca para remover se a ficha já tinha foto gravada
    setRemoverFoto(!!original?.foto_url)
  }

  async function salvar() {
    const nome = f.nome.trim()
    if (!nome) return alert('Informe o nome da ficha.')
    const rendimento = lerNumero(f.rendimento)
    const porcoes = lerNumero(f.porcoes)
    if (f.tipo === 'preparacao' && !(rendimento && rendimento > 0)) return alert('Informe o rendimento.')
    if (f.tipo !== 'preparacao' && !(porcoes && porcoes > 0)) return alert('Informe quantas porções a ficha rende.')
    const ruins = itens.filter((i) => !((lerNumero(i.quantidade) ?? 0) > 0))
    if (ruins.length) return alert(`Informe a quantidade de: ${ruins.map((i) => i.ref.nome).join(', ')}`)
    if (id && itens.some((i) => i.ref.id === id)) return alert('Uma ficha não pode usar a si mesma.')
    if (verCusto) {
      const perdaRuim = itens.filter((i) => {
        if (!i.perda_pct.trim()) return false
        const p = lerNumero(i.perda_pct)
        return p == null || p < 0 || p > 99
      })
      if (perdaRuim.length)
        return alert(`A perda deve ficar entre 0 e 99%: ${perdaRuim.map((i) => i.ref.nome).join(', ')}`)
    }
    // perda por linha só vai no salvamento para quem vê custos; quem não vê não mexe na perda gravada.
    // Também fica de fora enquanto nenhuma linha usa perda (assim nada depende da coluna nova).
    const enviarPerda = verCusto && (tinhaPerdaLinha || itens.some((i) => i.perda_pct.trim() !== ''))

    const campos: Record<string, unknown> = {
      tipo: f.tipo,
      nome,
      perda_pct: lerNumero(f.perda_pct) ?? 0,
      tempo_preparo_min: f.tempo_preparo_min ? Number(f.tempo_preparo_min) : null,
      modo_preparo: f.modo_preparo.trim() || null,
      montagem: f.montagem.trim() || null,
      conservacao: f.conservacao.trim() || null,
      utensilios: f.utensilios.trim() || null,
      ativo: f.ativo,
    }
    if (f.tipo === 'preparacao') {
      campos.rendimento = rendimento
      campos.rendimento_unidade = f.rendimento_unidade
      if (nova) campos.porcoes = 1
    } else {
      campos.porcoes = porcoes
      if (nova) {
        campos.rendimento = porcoes
        campos.rendimento_unidade = 'un'
      }
    }
    // preço e meta de CMV só para quem vê custos (quem não vê nem enxerga os campos)
    if (verCusto) {
      campos.preco_venda = lerNumero(f.preco_venda)
      campos.meta_cmv = lerNumero(f.meta_cmv) ?? 30
    }

    setSalvando(true)
    setFotoErro(null)

    // 0. foto primeiro: se o envio falhar, nada é gravado e o formulário fica como está
    if (foto) {
      const ext = foto.type === 'image/png' ? 'png' : foto.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${id ?? 'nova-' + crypto.randomUUID()}/${Date.now()}.${ext}`
      const up = await supabase.storage.from('fichas').upload(path, foto, { contentType: foto.type })
      if (up.error) {
        setSalvando(false)
        setFotoErro('Não foi possível enviar a foto. Nada foi salvo. ' + up.error.message)
        return
      }
      campos.foto_url = supabase.storage.from('fichas').getPublicUrl(path).data.publicUrl
    } else if (removerFoto) {
      campos.foto_url = null
    }

    try {
      // 1. ficha (no update, o gatilho guarda a versão anterior com os itens antigos)
      let fichaId = id
      if (nova) {
        const r = await db.from('fichas').insert(campos).select('id').single()
        if (r.error) throw r.error
        fichaId = r.data.id as string
      } else {
        const r = await db.from('fichas').update(campos).eq('id', id)
        if (r.error) throw r.error
      }

      // 2. itens: apaga os removidos, atualiza os que ficaram, insere os novos
      const linha = (i: LinhaItem, ordem: number) => ({
        ficha_id: fichaId,
        insumo_id: i.ref.tipo === 'insumo' ? i.ref.id : null,
        sub_ficha_id: i.ref.tipo === 'preparacao' ? i.ref.id : null,
        quantidade: lerNumero(i.quantidade),
        unidade: i.unidade,
        grupo_escolha: i.grupo_escolha.trim() || null,
        observacao: i.observacao.trim() || null,
        ordem,
        // 0 ou em branco = sem perda (null)
        ...(enviarPerda ? { perda_pct: lerNumero(i.perda_pct) || null } : {}),
      })
      const removidos = idsOriginais.filter((x) => !itens.some((i) => i.id === x))
      if (removidos.length) {
        const r = await db.from('ficha_itens').delete().in('id', removidos)
        if (r.error) throw r.error
      }
      const existentes = itens.map((i, n) => ({ i, n })).filter(({ i }) => i.id)
      if (existentes.length) {
        const r = await db.from('ficha_itens').upsert(existentes.map(({ i, n }) => ({ id: i.id, ...linha(i, n) })))
        if (r.error) throw r.error
      }
      const novos = itens.map((i, n) => ({ i, n })).filter(({ i }) => !i.id)
      if (novos.length) {
        const r = await db.from('ficha_itens').insert(novos.map(({ i, n }) => linha(i, n)))
        if (r.error) throw r.error
      }

      // 3. cardápios
      const tirarCard = cardapiosOriginais.filter((c) => !selCardapios.includes(c))
      const porCard = selCardapios.filter((c) => !cardapiosOriginais.includes(c))
      if (tirarCard.length) {
        const r = await db.from('ficha_cardapios').delete().eq('ficha_id', fichaId).in('cardapio_id', tirarCard)
        if (r.error) throw r.error
      }
      if (porCard.length) {
        const r = await db.from('ficha_cardapios').insert(porCard.map((c) => ({ ficha_id: fichaId, cardapio_id: c })))
        if (r.error) throw r.error
      }

      liberar()
      navigate(`/fichas/${fichaId}`)
    } catch (e) {
      const msg = (e as { message?: string }).message ?? String(e)
      alert(
        msg.includes('fichas_tipo_nome_key') || msg.includes('duplicate key')
          ? 'Já existe uma ficha deste tipo com esse nome.'
          : msg.includes('perda_pct')
            ? 'A perda por ingrediente ainda não está ativa no banco. Deixe a perda em branco ou peça ao administrador para aplicar o arquivo 7_perda_por_ingrediente.sql.'
            : 'Não foi possível salvar: ' + msg
      )
    }
    setSalvando(false)
  }

  async function excluir() {
    if (!original) return
    if (!confirm(`Excluir a ficha ${original.nome}? Os ingredientes e o histórico dela também serão apagados.`)) return
    const { error } = await db.from('fichas').delete().eq('id', original.id)
    if (error) {
      return alert(
        error.message.includes('foreign key')
          ? 'Esta preparação é usada em outras fichas. Tire-a dessas fichas ou desmarque "ativa".'
          : 'Não foi possível excluir: ' + error.message
      )
    }
    liberar()
    navigate('/fichas')
  }

  const prep = f.tipo === 'preparacao'
  return (
    <div className="space-y-8">
      <Cabecalho
        voltar={{ para: id ? `/fichas/${id}` : '/fichas', rotulo: id ? 'ficha' : 'fichas técnicas' }}
        titulo={nova ? 'Nova ficha' : original?.nome ?? 'Editar ficha'}
        subtitulo={nova ? 'preencha e salve para criar' : `editando · versão ${original?.versao ?? ''}`}
        acoes={sujo && <SeloAlteracoes />}
      />
      {erro && <Erro texto={erro} />}

      <section className={`${cartaoCls} p-4 md:p-6`} aria-label="foto do prato">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="w-full sm:w-64 sm:shrink-0">
            {fotoAtual ? (
              <img src={fotoAtual} alt="prévia da foto" className="aspect-[4/3] w-full rounded-[14px] bg-paper-dim object-cover" />
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center rounded-[14px] bg-paper-dim px-4 text-center">
                <span className="display text-xl text-ink-soft">{f.nome.trim() || 'sem foto'}</span>
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <h2 className="subtitulo">foto</h2>
            <p className="apoio">
              {foto
                ? 'Nova foto: será enviada ao salvar.'
                : removerFoto
                  ? 'A foto será removida ao salvar.'
                  : fotoAtual
                    ? 'JPG, PNG ou WEBP, até 5 MB.'
                    : 'Sem foto. JPG, PNG ou WEBP, até 5 MB.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <label className={`${btnSecCls} cursor-pointer ${preparandoFoto || salvando ? 'pointer-events-none opacity-50' : ''}`}>
                {preparandoFoto ? 'Preparando…' : fotoAtual ? 'Trocar foto' : 'Adicionar foto'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={preparandoFoto || salvando}
                  onChange={(e) => {
                    escolherFoto(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </label>
              {fotoAtual && (
                <button type="button" onClick={tirarFoto} disabled={salvando} className={btnPerigoCls}>
                  Remover foto
                </button>
              )}
            </div>
            {fotoErro && <Erro texto={fotoErro} />}
          </div>
        </div>
      </section>

      <section className={`${cartaoCls} space-y-3 p-4 md:p-6`}>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TIPO_LABEL) as TipoFicha[]).map((t) => (
            <button key={t} onClick={() => set('tipo', t)} className={chipCls(f.tipo === t)} aria-pressed={f.tipo === t}>
              {TIPO_LABEL[t]}
            </button>
          ))}
        </div>
        <Campo label="nome">
          <input value={f.nome} onChange={(e) => set('nome', e.target.value)} className={inputCls} />
        </Campo>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {prep ? (
            <>
              <Campo label="rendimento">
                <input inputMode="decimal" value={f.rendimento} onChange={(e) => set('rendimento', e.target.value)} className={inputCls} />
              </Campo>
              <Campo label="unidade">
                <select value={f.rendimento_unidade} onChange={(e) => set('rendimento_unidade', e.target.value as Unidade)} className={inputCls}>
                  {UNIDADES_RENDIMENTO.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </Campo>
            </>
          ) : (
            <Campo label="rende (porções)">
              <input inputMode="decimal" value={f.porcoes} onChange={(e) => set('porcoes', e.target.value)} className={inputCls} />
            </Campo>
          )}
          <Campo label="perda %">
            <input inputMode="decimal" value={f.perda_pct} onChange={(e) => set('perda_pct', e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="tempo (min)">
            <input inputMode="numeric" value={f.tempo_preparo_min} onChange={(e) => set('tempo_preparo_min', e.target.value.replace(/\D/g, ''))} className={inputCls} />
          </Campo>
          {verCusto && !prep && (
            <>
              <Campo label="preço de venda (R$)">
                <input inputMode="decimal" value={f.preco_venda} onChange={(e) => set('preco_venda', e.target.value)} className={inputCls} />
              </Campo>
              <Campo label="meta de CMV %">
                <input inputMode="decimal" value={f.meta_cmv} onChange={(e) => set('meta_cmv', e.target.value)} className={inputCls} />
              </Campo>
            </>
          )}
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} className="h-5 w-5" />
          ficha ativa
        </label>
      </section>

      <section className={`${cartaoCls} p-4 md:p-6`}>
        <h2 className="subtitulo mb-3">cardápios</h2>
        <div className="flex flex-wrap gap-1">
          {cardapios.map((c) => {
            const on = selCardapios.includes(c.id)
            return (
              <button
                key={c.id}
                onClick={() => setSelCardapios((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                className={chipCls(on)} aria-pressed={on}
              >
                {c.nome}
              </button>
            )
          })}
        </div>
      </section>

      <section className={`${cartaoCls} p-4 md:p-6`}>
        <h2 className="subtitulo mb-3">ingredientes</h2>
        {itens.length === 0 && <p className="mb-2 text-sm text-ink-soft">Nenhum ingrediente ainda.</p>}
        <ul className="space-y-2">
          {itens.map((i, n) => (
            <li key={i.chave} className="rounded-xl bg-paper p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">
                  {i.ref.nome}
                  {i.ref.tipo === 'preparacao' && <span className="ml-1 text-xs text-ink-soft">(preparação)</span>}
                </span>
                <span className="flex gap-1">
                  <button onClick={() => mover(n, -1)} disabled={n === 0} className="min-h-[44px] min-w-[44px] rounded border border-line disabled:opacity-30" aria-label="subir">↑</button>
                  <button onClick={() => mover(n, 1)} disabled={n === itens.length - 1} className="min-h-[44px] min-w-[44px] rounded border border-line disabled:opacity-30" aria-label="descer">↓</button>
                  <button onClick={() => tirar(i)} className="min-h-[44px] min-w-[44px] rounded border border-alert text-alert" aria-label="tirar">×</button>
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className={`grid gap-2 ${verCusto ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <input inputMode="decimal" placeholder="quantidade" aria-label="quantidade" value={i.quantidade} onChange={(e) => mudarItem(i.chave, { quantidade: e.target.value })} className={inputCls} />
                  <select value={i.unidade} aria-label="unidade" onChange={(e) => mudarItem(i.chave, { unidade: e.target.value as Unidade })} className={inputCls}>
                    {UNIDADES_ITEM.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                  {verCusto && (
                    <label className="relative block">
                      <span className="sr-only">perda %</span>
                      <input
                        inputMode="decimal"
                        placeholder="0"
                        value={i.perda_pct}
                        onChange={(e) => mudarItem(i.chave, { perda_pct: e.target.value })}
                        className={`${inputCls} pr-16`}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-soft" aria-hidden>
                        % perda
                      </span>
                    </label>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="grupo de escolha (opcional)" aria-label="grupo de escolha" value={i.grupo_escolha} onChange={(e) => mudarItem(i.chave, { grupo_escolha: e.target.value })} className={inputCls} />
                  <input placeholder="observação" aria-label="observação" value={i.observacao} onChange={(e) => mudarItem(i.chave, { observacao: e.target.value })} className={inputCls} />
                </div>
              </div>
              {verCusto && (
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-ink-soft">
                  <span>Perda deste prato. Perda do produto fica no fator de correção do insumo.</span>
                  <CustoLinha item={i} base={base?.itens.find((b) => b.chave === i.chave)} custos={custoItens} />
                </div>
              )}
            </li>
          ))}
        </ul>
        <BuscaItem
          opcoes={opcoes.filter((o) => o.id !== id)}
          onEscolher={addItem}
          onCriado={(o) => {
            setOpcoes((p) => [...p, o])
            addItem(o)
          }}
        />
        <p className="mt-1 text-xs text-ink-soft">
          Itens com o mesmo grupo de escolha são alternativas: o cliente escolhe um deles.
        </p>
      </section>

      <section className={`${cartaoCls} space-y-3 p-4 md:p-6`}>
        <h2 className="subtitulo">textos</h2>
        <Campo label="modo de preparo (um passo por linha)">
          <textarea rows={8} value={f.modo_preparo} onChange={(e) => set('modo_preparo', e.target.value)} className={`${inputCls} py-2`} />
        </Campo>
        <Campo label="montagem (um passo por linha)">
          <textarea rows={4} value={f.montagem} onChange={(e) => set('montagem', e.target.value)} className={`${inputCls} py-2`} />
        </Campo>
        <Campo label="conservação">
          <textarea rows={2} value={f.conservacao} onChange={(e) => set('conservacao', e.target.value)} className={`${inputCls} py-2`} />
        </Campo>
        <Campo label="utensílios">
          <textarea rows={2} value={f.utensilios} onChange={(e) => set('utensilios', e.target.value)} className={`${inputCls} py-2`} />
        </Campo>
      </section>

      <BarraSalvar
        fixa
        sujo={sujo}
        salvando={salvando}
        onSalvar={salvar}
        onDescartar={nova ? undefined : descartar}
        rotulo={nova ? 'Criar ficha' : 'Salvar alterações'}
        extra={
          !nova && (
            <button onClick={excluir} disabled={salvando} className={btnPerigoCls}>
              Excluir ficha
            </button>
          )
        }
      />
    </div>
  )
}

/** custo da linha como está gravado (custo_itens_ficha, já com a perda); nada é calculado aqui */
function CustoLinha({
  item,
  base,
  custos,
}: {
  item: LinhaItem
  base?: LinhaItem
  custos: Map<string, number | null> | null
}) {
  if (!custos) return null // sem acesso ou função ainda não criada no banco
  if (!item.id || !custos.has(item.id)) return <span>custo aparece depois de salvar</span>
  const valor = reais(custos.get(item.id))
  const mudou = !base || JSON.stringify({ ...item, chave: '' }) !== JSON.stringify({ ...base, chave: '' })
  return mudou ? (
    <span>
      custo salvo: <b className="font-medium text-ink">{valor}</b> · atualiza ao salvar
    </span>
  ) : (
    <span>
      custo da linha: <b className="font-medium text-ink">{valor}</b>
    </span>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-ink-soft">
      {label}
      {children}
    </label>
  )
}

/** busca única em insumos e preparações-base, com atalho para criar insumo novo */
function BuscaItem({
  opcoes,
  onEscolher,
  onCriado,
}: {
  opcoes: Opcao[]
  onEscolher: (o: Opcao) => void
  onCriado: (o: Opcao) => void
}) {
  const [termo, setTermo] = useState('')
  const [criando, setCriando] = useState(false)
  const [unidade, setUnidade] = useState<Unidade>('kg')
  const [categoria, setCategoria] = useState('')
  const t = termo.trim().toLowerCase()
  const achados = useMemo(
    () => (t ? opcoes.filter((o) => o.nome.toLowerCase().includes(t)).slice(0, 12) : []),
    [t, opcoes]
  )
  const existe = opcoes.some((o) => o.tipo === 'insumo' && o.nome.toLowerCase() === t)

  async function criar() {
    const nome = termo.trim()
    // sem preço: quem tem editar_precos completa depois na tela de insumos
    const { data, error } = await db
      .from('insumos')
      .insert({ nome, unidade, categoria: categoria.trim() || null })
      .select('id,nome,unidade')
      .single()
    if (error) return alert('Não foi possível criar o insumo: ' + error.message)
    onCriado({ ...data, tipo: 'insumo' })
    setTermo('')
    setCriando(false)
    setCategoria('')
  }

  return (
    <div className="mt-3 rounded-xl border border-dashed border-line p-3">
      <input
        placeholder="+ adicionar insumo ou preparação"
        value={termo}
        onChange={(e) => {
          setTermo(e.target.value)
          setCriando(false)
        }}
        className={inputCls}
      />
      {achados.length > 0 && (
        <ul className="mt-1 divide-y divide-line rounded border border-line">
          {achados.map((o) => (
            <li key={o.tipo + o.id}>
              <button
                onClick={() => {
                  onEscolher(o)
                  setTermo('')
                }}
                className="flex min-h-[44px] w-full items-center justify-between px-3 text-left text-sm hover:bg-paper-dim"
              >
                <span>{o.nome}</span>
                <span className="text-xs text-ink-soft">{o.tipo === 'preparacao' ? 'preparação' : `insumo · ${o.unidade}`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {t && !existe && !criando && (
        <button onClick={() => setCriando(true)} className="mt-1 min-h-[44px] text-sm underline">
          criar insumo “{termo.trim()}”
        </button>
      )}
      {criando && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <select value={unidade} onChange={(e) => setUnidade(e.target.value as Unidade)} className={`${inputCls} sm:w-28`}>
            {UNIDADES_RENDIMENTO.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <input placeholder="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputCls} />
          <button onClick={criar} className={btnCls}>criar</button>
          <button onClick={() => setCriando(false)} className={btnSecCls}>cancelar</button>
        </div>
      )}
    </div>
  )
}
