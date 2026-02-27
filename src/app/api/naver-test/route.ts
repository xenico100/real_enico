export async function GET() {
  return Response.json(
    {
      ok: false,
      error: 'deprecated',
      message:
        'Naver test endpoint is disabled. Use POST /api/smartstore/import in development only.',
    },
    { status: 410 },
  );
}
