import { StemSeparator } from '@/components/library/StemSeparator'

export default function SeparatePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-white">Separar Pistas com IA</h1>
        <p className="text-sm text-[#b3b3b3] mt-1">
          Envie uma música e a IA separa em Voz, Bateria, Baixo e Outros
        </p>
      </div>
      <StemSeparator />
    </div>
  )
}
