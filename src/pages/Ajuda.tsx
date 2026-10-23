/** Central de ajuda: respostas rápidas para as dúvidas mais comuns e contato com o suporte */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Search, MessageCircle } from 'lucide-react'
import { SUPPORT_WHATSAPP } from '@/lib/support'
import { matchesSearch, cn } from '@/lib/utils'

const FAQ: { q: string; a: string; link?: [string, string] }[] = [
  { q: 'Como mudo o tom da música?', a: 'Abra a música e toque na aba "Tom". Cada toque em + ou − sobe ou desce ½ tom. A letra e a cifra acompanham, e o ajuste fica salvo nessa música.' },
  { q: 'Como tiro um instrumento (ex.: o violão que eu toco)?', a: 'Na aba "Mixer", toque em M para silenciar a pista. Em Configurações → "O que você toca ao vivo", marque seu instrumento: ele já abre desligado em todas as músicas.', link: ['Abrir configurações', '/app/settings'] },
  { q: 'Como monto meu show?', a: 'Vá em "Shows", toque em "Novo" e escolha as músicas (ou use um repertório pronto). Arraste para mudar a ordem e toque em "Iniciar show no palco".', link: ['Ir para Shows', '/app/shows'] },
  { q: 'Como uso no show sem internet?', a: 'Antes de sair de casa, abra o show e toque em "Preparar para tocar sem internet". As músicas, letras e cifras ficam guardadas no aparelho.' },
  { q: 'Estou sem som no iPhone', a: 'Confira o volume e se o celular não está no modo silencioso (iPhones antigos). Se usar caixa Bluetooth, conecte antes de abrir o app. Instale o app na tela inicial para funcionar melhor.' },
  { q: 'O som parou quando saí do app (iPhone)', a: 'O iPhone pausa o som de sites e apps instalados pela tela inicial quando você troca de app no meio da música. No show, deixe o Modo Palco aberto: a tela não apaga sozinha. Se pausar, toque em play que a música continua de onde parou.' },
  { q: 'Uma música toca mais alta que a outra', a: 'O app já iguala o volume entre as músicas. Confira em Configurações → "Volume igual entre as músicas". Se uma pista específica estiver alta, ajuste no Mixer: fica salvo nessa música.', link: ['Abrir configurações', '/app/settings'] },
  { q: 'A letra está fora do tempo', a: 'Na aba "Letra", use − e + para adiantar ou atrasar, ou toque em "Começou" quando o cantor começar. O ajuste fica salvo. Você também pode colar a letra e sincronizar tocando.' },
  { q: 'Não achei a letra ou a cifra', a: 'Toque em "Colar a letra" ou "Colar cifra": copie de qualquer site e cole. Ela fica salva e muda de tom junto com a música.' },
  { q: 'Como toco os meus próprios VS e músicas?', a: 'Na biblioteca, toque em "Adicionar minha música". Escolha as pistas, o .zip do VS ou um MP3 (pode ser o que chegou no WhatsApp). No computador dá para escolher uma pasta com vários VS de uma vez. Elas ficam guardadas só no seu aparelho.', link: ['Adicionar minha música', '/app/importar'] },
  { q: 'Como mudo o nome, a capa ou as pistas de uma música minha?', a: 'Abra a música e toque em "Editar música". Dá para trocar nome, artista, tom, BPM, colocar uma foto como capa, renomear ou tirar pistas e acrescentar pistas novas (click, guia, outro instrumento).' },
  { q: 'A música demora para carregar', a: 'Na primeira vez o app baixa as pistas; depois elas ficam no aparelho e abrem na hora. Use Wi-Fi para preparar seus shows antes.' },
  { q: 'Como afino o violão?', a: 'Na tela inicial, toque em "Afinador", ative o microfone e toque cada corda até ficar verde.', link: ['Abrir afinador', '/app/ferramentas?t=afinador'] },
  { q: 'Troquei de celular. Perco meus shows?', a: 'Não, se fizer backup: em Configurações → Backup, toque em "Salvar backup" e guarde o arquivo. No celular novo, toque em "Restaurar".', link: ['Fazer backup', '/app/settings'] },
  { q: 'Como passo o setlist para a minha banda?', a: 'Abra o show e toque em "Compartilhar com a banda". Eles recebem a lista com o tom de cada música, sem precisar do app.' },
  { q: 'Como instalo o app no celular?', a: 'Android: menu ⋮ do Chrome → "Instalar app". iPhone: no Safari, toque em Compartilhar → "Adicionar à Tela de Início".' },
]

export default function Ajuda() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const list = useMemo(() => FAQ.map((f, i) => ({ ...f, i })).filter(f => !q.trim() || matchesSearch(q, [f.q, f.a])), [q])

  return (
    <div className="max-w-xl mx-auto px-4 py-4 pb-16">
      <button onClick={() => navigate(-1)} className="h-10 -ml-2 px-2 flex items-center gap-2 text-[#b3b3b3]"><ArrowLeft className="h-5 w-5" /> Voltar</button>
      <h1 className="text-[28px] font-black">Como podemos ajudar?</h1>
      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ex.: tom, letra, sem internet" className="w-full h-12 rounded-2xl bg-white/[0.07] border border-white/10 pl-10 pr-3 outline-none placeholder:text-white/40" />
      </div>
      <div className="mt-4 space-y-2">
        {list.map(f => (
          <div key={f.i} className="rounded-2xl bg-white/[0.05] border border-white/[0.06] overflow-hidden">
            <button onClick={() => setOpen(open === f.i ? null : f.i)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
              <span className="flex-1 font-semibold">{f.q}</span>
              <ChevronDown className={cn('h-5 w-5 text-white/50 transition-transform', open === f.i && 'rotate-180')} />
            </button>
            {open === f.i && (
              <div className="px-4 pb-4 -mt-1 text-[15px] text-white/75 leading-relaxed">
                {f.a}
                {f.link && <button onClick={() => navigate(f.link![1])} className="mt-3 block h-10 px-4 rounded-full bg-white/10 text-sm font-bold">{f.link[0]}</button>}
              </div>
            )}
          </div>
        ))}
        {!list.length && <p className="py-6 text-center text-sm text-white/50">Nada encontrado. Fale com a gente abaixo.</p>}
      </div>
      {SUPPORT_WHATSAPP && (
        <a href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent('Olá! Preciso de ajuda com o app Power Tom.')}`} target="_blank" rel="noopener noreferrer"
          className="mt-6 flex items-center justify-center gap-2 h-14 rounded-full bg-[#25D366] text-black text-lg font-black">
          <MessageCircle className="h-5 w-5" /> Falar com o suporte no WhatsApp
        </a>
      )}
    </div>
  )
}
