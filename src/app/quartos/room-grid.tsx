'use client'
import { useEffect, useState } from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { checkInAction, checkOutAction, setRoomStatusAction, type ActionState } from './actions'

type Room = {
  number: string
  status: 'free' | 'occupied' | 'cleaning' | 'maintenance'
  maintenanceReason: string | null
  category: { code: string; description: string } | null
  currentStay: { checkIn: string; guests: number; day: 'normal' | 'special' } | null
}

const STATUS_LABEL: Record<Room['status'], string> = { free: 'LIVRE', occupied: 'OCUPADO', cleaning: 'LIMPEZA', maintenance: 'MANUT.' }
const STATUS_CLASS: Record<Room['status'], string> = {
  free: 'bg-emerald-600 text-white',
  occupied: 'bg-red-600 text-white',
  cleaning: 'bg-amber-500 text-black',
  maintenance: 'bg-stone-500 text-white',
}

export function RoomGrid({ rooms }: { rooms: Room[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
      {rooms.map((r) => <RoomCard key={r.number} room={r} />)}
    </div>
  )
}

function RoomCard({ room }: { room: Room }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className={`rounded-lg p-3 text-left ${STATUS_CLASS[room.status]}`}>
          <div className="text-lg font-bold">{room.number}</div>
          <div className="text-xs">{STATUS_LABEL[room.status]}</div>
          {room.category && <div className="text-[10px] opacity-90">{room.category.code}</div>}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Quarto {room.number} — {STATUS_LABEL[room.status]}</DialogTitle></DialogHeader>
        {room.status === 'free' && <FreeActions room={room} onDone={() => setOpen(false)} />}
        {room.status === 'occupied' && <CheckOutPanel room={room} onDone={() => setOpen(false)} />}
        {room.status === 'cleaning' && <SimpleStatus number={room.number} status="free" label="Liberar (limpo)" onDone={() => setOpen(false)} />}
        {room.status === 'maintenance' && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">Motivo: {room.maintenanceReason}</p>
            <SimpleStatus number={room.number} status="free" label="Voltar de manutenção" onDone={() => setOpen(false)} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return <Button disabled={pending}>{pending ? '…' : children}</Button>
}

function FreeActions({ room, onDone }: { room: Room; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(checkInAction, { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-3">
        <input type="hidden" name="roomNumber" value={room.number} />
        <div className="grid gap-1">
          <Label htmlFor="day">Tabela</Label>
          <NativeSelect id="day" name="day" defaultValue="normal">
            <NativeSelectOption value="normal">Semana (normal)</NativeSelectOption>
            <NativeSelectOption value="special">Fim de semana (especial)</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="grid gap-1"><Label htmlFor="guests">Hóspedes</Label><Input id="guests" name="guests" type="number" min="1" defaultValue="2" /></div>
        <div className="grid gap-1"><Label htmlFor="prepaidAmount">Antecipado (R$)</Label><Input id="prepaidAmount" name="prepaidAmount" type="number" step="0.01" defaultValue="0" /></div>
        <Submit>Fazer entrada</Submit>
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      </form>
      <MaintenanceForm number={room.number} onDone={onDone} />
    </div>
  )
}

function CheckOutPanel({ room, onDone }: { room: Room; onDone: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t) }, [])
  const [state, formAction] = useActionState<ActionState, FormData>(
    async () => checkOutAction(room.number), { ok: false },
  )
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  const stay = room.currentStay!
  const elapsedMin = Math.max(0, Math.round((now - new Date(stay.checkIn).getTime()) / 60000))
  return (
    <div className="grid gap-3">
      <p className="text-sm">Decorrido: <strong>{Math.floor(elapsedMin / 60)}h{String(elapsedMin % 60).padStart(2, '0')}m</strong> · {stay.guests} hósp. · {stay.day === 'special' ? 'fim de semana' : 'semana'}</p>
      <p className="text-xs text-muted-foreground">O valor final é calculado no servidor ao confirmar a saída.</p>
      <form action={formAction}>
        <Submit>Confirmar saída</Submit>
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      </form>
    </div>
  )
}

function SimpleStatus({ number, status, label, onDone }: { number: string; status: 'free' | 'cleaning'; label: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(setRoomStatusAction, { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  return (
    <form action={action}>
      <input type="hidden" name="number" value={number} />
      <input type="hidden" name="status" value={status} />
      <Submit>{label}</Submit>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
    </form>
  )
}

function MaintenanceForm({ number, onDone }: { number: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(setRoomStatusAction, { ok: false })
  useEffect(() => { if (state.ok) onDone() }, [state.ok, onDone])
  return (
    <form action={action} className="grid gap-2 border-t pt-3">
      <input type="hidden" name="number" value={number} />
      <input type="hidden" name="status" value="maintenance" />
      <Label htmlFor="reason" className="text-xs">Pôr em manutenção (motivo)</Label>
      <div className="flex gap-2">
        <Input id="reason" name="reason" placeholder="motivo" />
        <Button variant="outline" type="submit">Manutenção</Button>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
    </form>
  )
}
