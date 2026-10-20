export function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') return new Response('Not Found', { status: 404 });
  const piece = new URL(request.url).searchParams.get('piece');
  const shape = piece === 'jacket'
    ? '<path d="M39 27 25 33 13 64 29 71 34 55 34 104 86 104 86 55 91 71 107 64 95 33 81 27 68 35 52 35Z" fill="#e5e7eb" stroke="#4b5563"/><path d="m48 29 12 17 12-17M60 46v58M37 68h16m14 0h16" stroke="#111827" fill="none"/>'
    : '<path d="M30 43 39 20 52 36 68 36 81 20 90 43 87 80 73 103 47 103 33 80Z" fill="#e5e7eb" stroke="#4b5563"/><path d="m43 57 9 3m16 0 9-3M54 73l6 4 6-4" fill="none" stroke="#111827"/>';
  return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140"><rect width="120" height="140" fill="#f3f4f6"/>${shape}<text x="60" y="128" text-anchor="middle" fill="#4b5563" font-family="monospace" font-size="7">SAMPLE / FIXTURE</text></svg>`, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' } });
}
