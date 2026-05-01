import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';

const PUBLIC_ROUTES = ['/', '/login', '/signup'];
const AUTH_ROUTES = ['/login', '/signup'];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  if (isLoggedIn && AUTH_ROUTES.includes(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
});

export const config = {
  // Run middleware in Node.js so the auth config (which transitively imports
  // the postgres-js driver) can initialize. The Edge runtime doesn't support
  // postgres-js — without this the middleware silently fails at request time
  // and Vercel's edge returns a generic 404 with no function logs.
  runtime: 'nodejs',
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|logo.svg|logo-icon.svg).*)'],
};
