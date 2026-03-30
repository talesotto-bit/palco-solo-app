import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center h-dvh gap-4">
      <p className="text-6xl font-black text-muted-foreground/20">404</p>
      <h1 className="text-xl font-bold text-foreground">Página não encontrada</h1>
      <Button variant="brand" onClick={() => navigate('/app/library')}>
        Ir para a biblioteca
      </Button>
    </div>
  )
}
