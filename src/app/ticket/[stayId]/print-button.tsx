'use client'
import { logTicketReprintAction } from '../actions'

export function PrintButton({ stayId, logReprint }: { stayId: string; logReprint: boolean }) {
  return (
    <button
      type="button"
      className="ticket-print-btn"
      onClick={async () => { if (logReprint) await logTicketReprintAction(stayId); window.print() }}
    >
      Imprimir
    </button>
  )
}
