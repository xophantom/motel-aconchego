'use client'
import { useEffect } from 'react'

// Auto-fire the print dialog shortly after the ticket renders (used with ?auto=1).
export function AutoPrint() {
  useEffect(() => { const t = setTimeout(() => window.print(), 300); return () => clearTimeout(t) }, [])
  return null
}

export function PrintButton() {
  return <button className="ticket-print-btn" onClick={() => window.print()}>Imprimir</button>
}
