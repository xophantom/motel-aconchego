import { auth } from '@/server/auth'

// Next 16: middleware -> proxy. Gate everything except login + auth API + assets.
export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth
  const isLogin = nextUrl.pathname.startsWith('/login')

  if (!isLoggedIn && !isLogin) {
    return Response.redirect(new URL('/login', nextUrl))
  }
  if (isLoggedIn && isLogin) {
    return Response.redirect(new URL('/', nextUrl))
  }
})

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
