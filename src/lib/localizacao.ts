export interface Posicao { lat: number; lng: number; precisao: number }

/** Lê a posição do aparelho (uma vez). Rejeita com mensagem em português. */
export function lerPosicao(altaPrecisao = true): Promise<Posicao> {
  return new Promise((ok, falha) => {
    if (!('geolocation' in navigator)) return falha(new Error('Este aparelho não tem localização.'))
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy }),
      (e) => falha(new Error(e.code === 1 ? 'Permita o acesso à localização do aparelho.' : e.code === 3 ? 'Não consegui obter a localização a tempo.' : 'Não consegui obter a localização.')),
      { enableHighAccuracy: altaPrecisao, maximumAge: 20000, timeout: 20000 },
    )
  })
}
