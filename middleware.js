import { NextResponse } from 'next/server';

// Local dev is bound to 127.0.0.1. Anything built/deployed must be QE and must carry an access key.
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };

export default function middleware(req) {
  if (process.env.APP_ENV !== 'qe') return new NextResponse('QE only', { status: 403 });
  if (process.env.NODE_ENV !== 'production') return NextResponse.next();
  const key = process.env.DASHBOARD_ACCESS_KEY;
  const user = process.env.DASHBOARD_USER;
  if (!key || !user) return new NextResponse('DASHBOARD_USER / DASHBOARD_ACCESS_KEY not configured', { status: 503 });
  const [scheme, token] = (req.headers.get('authorization') || '').split(' ');
  let decoded = '';
  try { decoded = scheme === 'Basic' ? atob(token) : ''; } catch { decoded = ''; }
  if (decoded === `${user}:${key}`) return NextResponse.next();
  return new NextResponse('Sign in required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="QE attribution"' } });
}
