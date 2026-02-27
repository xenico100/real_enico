console.log('ID:', process.env.NAVER_COMMERCE_CLIENT_ID);
console.log('SECRET:', process.env.NAVER_COMMERCE_CLIENT_SECRET);

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
