'use client'
import { useTheme } from 'next-themes'
import { Palette, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { THEME_OPTIONS } from '@/lib/themes'

export function ThemeMenu() {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" suppressHydrationWarning aria-label="Tema">
          <Palette className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEME_OPTIONS.map((opt) => (
          <DropdownMenuItem key={opt.value} onClick={() => setTheme(opt.value)} className="gap-2">
            <Check className={`size-4 ${theme === opt.value ? 'opacity-100' : 'opacity-0'}`} aria-hidden />
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
