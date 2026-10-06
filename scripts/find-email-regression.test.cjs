/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const deferred = [];
const delivered = [];
const pagesRead = [];
let users = [];
let blockAccountReminder = false;

const source = fs.readFileSync(path.resolve('src/app/api/auth/find-email/route.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUnderTest = { exports: {} };

vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, {
  filename: 'find-email/route.ts',
})((name) => {
  if (name === '@supabase/supabase-js') return {
    createClient: () => ({
      auth: { admin: {
        listUsers: async ({ page, perPage }) => {
          pagesRead.push(page);
          return { data: { users: users.slice((page - 1) * perPage, page * perPage) }, error: null };
        },
      } },
    }),
  };
  if (name === 'next/server') return {
    after: (callback) => { deferred.push(callback); },
    NextResponse: { json: (body, options) => Response.json(body, options) },
  };
  if (name === '@/lib/security/identity') return {
    isVerifiedMember: (user) => Boolean(user && !user.is_anonymous && user.email && user.email_confirmed_at),
  };
  if (name === '@/lib/security/requestBudget') return {
    requestBudget: async (_request, scope) => scope === 'find-email-account' && blockAccountReminder
      ? Response.json({ message: 'rate limited' }, { status: 429 })
      : null,
  };
  if (name === '@/lib/security/requestBody') return {
    readJsonObject: (request) => request.json(),
    RequestBodyError: class RequestBodyError extends Error {},
  };
  if (name === '@/lib/supabase/projectGuard') return {
    assertExpectedSupabaseProject: (url) => url,
  };
  throw new Error(`Unexpected import: ${name}`);
}, moduleUnderTest, moduleUnderTest.exports);

const matchingUser = {
  id: 'account-1',
  email: 'private@example.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  is_anonymous: false,
  user_metadata: { full_name: '홍길동', phone: '010-1234-5678' },
};

function request() {
  return new Request('http://localhost/api/auth/find-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: '홍길동', phone: '01012345678' }),
  });
}

async function flushDeferred() {
  while (deferred.length > 0) await deferred.shift()();
}

test('account lookup never exposes match state or email and sends only to the registered mailbox', async () => {
  const previousFetch = global.fetch;
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousResendKey = process.env.RESEND_API_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  process.env.RESEND_API_KEY = 'test-only';
  global.fetch = async (_url, options) => {
    delivered.push(JSON.parse(options.body));
    return Response.json({ id: 'fixture' });
  };

  try {
    users = [];
    const missing = await moduleUnderTest.exports.POST(request());
    const missingBody = await missing.text();
    assert.equal(missing.status, 200);
    await flushDeferred();
    assert.equal(delivered.length, 0);

    users = [matchingUser];
    const matched = await moduleUnderTest.exports.POST(request());
    const matchedBody = await matched.text();
    assert.equal(matched.status, missing.status);
    assert.equal(matchedBody, missingBody);
    assert.equal(matched.headers.get('cache-control'), 'private, no-store');
    assert.ok(!matchedBody.includes('private@example.com'));
    assert.ok(!matchedBody.includes('example.com'));
    await flushDeferred();
    assert.deepEqual(delivered[0].to, ['private@example.com']);

    delivered.length = 0;
    pagesRead.length = 0;
    users = Array.from({ length: 1000 }, (_, index) => ({
      id: `other-${index}`,
      email: `other-${index}@example.com`,
      email_confirmed_at: '2026-01-01T00:00:00Z',
      user_metadata: { full_name: '다른 사람', phone: '01099999999' },
    })).concat(matchingUser);
    const paginated = await moduleUnderTest.exports.POST(request());
    assert.equal(await paginated.text(), missingBody);
    await flushDeferred();
    assert.deepEqual(pagesRead, [1, 2]);
    assert.deepEqual(delivered[0].to, ['private@example.com']);

    delivered.length = 0;
    blockAccountReminder = true;
    const throttled = await moduleUnderTest.exports.POST(request());
    assert.equal(await throttled.text(), missingBody);
    await flushDeferred();
    assert.equal(delivered.length, 0);
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceKey;
    if (previousResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousResendKey;
  }
});
