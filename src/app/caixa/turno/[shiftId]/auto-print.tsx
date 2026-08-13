'use client'
import { useEffect } from 'react'
import { signOut } from 'next-auth/react'
export function AutoPrint({ logout = false }: { logout?: boolean }) {
  useEffect(() => {
    const t = setTimeout(() => {
      window.print()
      // after closing the shift, the operator is signed out so the next
      // person logs in fresh for their own turno.
      if (logout) setTimeout(() => signOut({ callbackUrl: '/login' }), 1200)
    }, 300)
    return () => clearTimeout(t)
  }, [logout])
  return null
}
