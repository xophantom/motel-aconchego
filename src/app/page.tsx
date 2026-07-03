import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="mx-auto mt-10 max-w-2xl p-6">
      <h1 className="text-xl font-semibold">MotelAconchego</h1>
      <p className="mt-4 text-muted-foreground">
        Use o menu acima para navegar. O painel de quartos é o ponto de partida do dia a dia.
      </p>
      <div className="mt-4">
        <Button asChild><a href="/quartos">Ir para o Painel</a></Button>
      </div>
    </main>
  )
}
