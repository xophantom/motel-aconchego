'use client'
import { usePathname } from 'next/navigation'

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname()
  return (
    <nav className="flex flex-wrap items-center gap-0.5">
      {links.map(({ href, label }) => {
        const active = pathname === href || (href !== '/quartos' && pathname.startsWith(href))
        return (
          <a
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
            }`}
          >
            {label}
          </a>
        )
      })}
    </nav>
  )
}
