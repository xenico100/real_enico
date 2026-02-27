import 'server-only';

import crypto from 'crypto';

function base64url(input: Buffer) {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function getAccessToken() {
  const CLIENT_ID = process.env.NAVER_COMMERCE_CLIENT_ID;
  const CLIENT_SECRET = process.env.NAVER_COMMERCE_CLIENT_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      'NAVER_COMMERCE_CLIENT_ID / NAVER_COMMERCE_CLIENT_SECRET 환경변수가 필요합니다.',
    );
  }

  const timestamp = Date.now().toString();

  const sign = base64url(
    crypto
      .createHmac('sha256', CLIENT_SECRET)
      .update(`${CLIENT_ID}_${timestamp}`)
      .digest(),
  );

  const res = await fetch(
    'https://api.commerce.naver.com/external/v1/oauth2/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        timestamp,
        client_secret_sign: sign,
        grant_type: 'client_credentials',
        type: 'SELF',
      }).toString(),
    },
  );

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json() as Promise<{
    access_token: string;
    token_type?: string;
    expires_in?: number;
  }>;
}
