export async function POST() {
  return Response.json(
    {
      ok: false,
      error: 'deprecated',
      message:
        'Use POST /api/smartstore/import for one-time SmartStore migration (dev only).',
    },
    { status: 410 },
  );
}
