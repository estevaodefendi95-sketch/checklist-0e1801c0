/** Foto de prato inteira (sem cortar) sobre um fundo desfocado da própria foto. Serve para qualquer proporção. */
export function FotoPrato({ src, alt = '', className = '', altura = 'max-h-[42vh]', eager }: { src: string; alt?: string; className?: string; altura?: string; eager?: boolean }) {
  return (
    <div className={`relative flex w-full items-center justify-center overflow-hidden bg-black/80 ${className}`}>
      <img src={src} alt="" aria-hidden draggable={false} className="absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-2xl" />
      <img src={src} alt={alt} draggable={false} loading={eager ? 'eager' : 'lazy'} decoding="async" className={`relative block h-auto w-auto max-w-full object-contain ${altura}`} />
    </div>
  )
}
