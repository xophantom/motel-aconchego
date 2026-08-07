'use client'
export function PrintButton() {
  return <button className="ticket-print-btn" onClick={() => window.print()}>Imprimir</button>
}
