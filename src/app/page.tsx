import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-primary">Recepção · gestão</p>
      <h1 className="mt-3 font-display text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
        Motel<span className="text-primary [text-shadow:0_0_28px_color-mix(in_oklab,var(--primary)_55%,transparent)]">Aconchego</span>
      </h1>
      <p className="mt-5 max-w-md text-base text-muted-foreground">
        O painel de quartos é o ponto de partida do dia a dia — entradas, consumo, caixa e saídas num só lugar.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg"><a href="/quartos">Abrir o painel</a></Button>
        <Button asChild size="lg" variant="outline"><a href="/caixa">Ir para o caixa</a></Button>
      </div>
    </main>
  )
}
