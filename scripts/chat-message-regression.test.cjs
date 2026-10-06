/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

let authUser = null;
let membership = null;
let roomStatus = 'active';
let blocked = false;
let inserted = null;
const moduleCache = new Map();

function load(file) {
  const absolute = path.resolve(file);
  if (moduleCache.has(absolute)) return moduleCache.get(absolute).exports;
  const moduleUnderTest = { exports: {} };
  moduleCache.set(absolute, moduleUnderTest);
  const source = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mockedRequire = (name) => {
    if (name === '@supabase/supabase-js') return {
      createClient: () => ({ auth: { getUser: async () => ({ data: { user: authUser }, error: null }) } }),
    };
    if (name === 'next/server') return { NextResponse: { json: (body, options) => Response.json(body, options) } };
    if (name === '@/lib/security/requestBudget') return {
      requestBudget: async () => blocked ? Response.json({ message: 'rate limit' }, { status: 429 }) : null,
    };
    if (name === '@/lib/supabaseAdmin') return { getSupabaseAdminClient: () => ({
      from: (table) => {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({
            data: table === 'chat_room_members' ? membership : { status: roomStatus },
            error: null,
          }),
          insert: (row) => { inserted = row; return query; },
          single: async () => ({
            data: { id: 1, room_id: inserted.room_id, user_id: inserted.user_id, message: inserted.message, created_at: '2026-10-06T00:00:00Z' },
            error: null,
          }),
        };
        return query;
      },
    }) };
    if (name === '@/lib/supabase/projectGuard') return { assertExpectedSupabaseProject: (url) => url };
    if (name.startsWith('@/')) return load(path.resolve('src', name.slice(2)) + '.ts');
    throw new Error(`Unexpected import: ${name}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: absolute })(
    mockedRequire, moduleUnderTest, moduleUnderTest.exports,
  );
  return moduleUnderTest.exports;
}

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fixture-anon';
const route = load('src/app/api/chat/messages/route.ts');
const roomId = '123e4567-e89b-12d3-a456-426614174000';

function request(body, token = 'fixture-token') {
  return new Request('http://localhost/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

test('chat writes require a valid user and bounded message', async () => {
  authUser = null;
  inserted = null;
  assert.equal((await route.POST(request({ roomId, message: 'hello' }, ''))).status, 401);
  assert.equal((await route.POST(request({ roomId, message: 'hello' }))).status, 401);
  authUser = { id: 'user-1' };
  assert.equal((await route.POST(request({ roomId: 'bad', message: 'hello' }))).status, 400);
  assert.equal((await route.POST(request({ roomId, message: 'a'.repeat(501) }))).status, 400);
  assert.equal((await route.POST(request({ roomId, message: 'a'.repeat(3000) }))).status, 413);
  assert.equal(inserted, null);
});

test('chat writes require membership and an active room, then use the verified sender ID', async () => {
  authUser = { id: 'user-1' };
  membership = null;
  inserted = null;
  assert.equal((await route.POST(request({ roomId, message: 'hello' }))).status, 403);
  membership = { room_id: roomId };
  roomStatus = 'closed';
  assert.equal((await route.POST(request({ roomId, message: 'hello' }))).status, 409);
  roomStatus = 'active';
  const response = await route.POST(request({ roomId, message: '  hello  ', user_id: 'attacker' }));
  assert.equal(response.status, 201);
  assert.deepEqual(inserted, { room_id: roomId, user_id: 'user-1', message: 'hello' });
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('chat write budget fails closed before inserting', async () => {
  blocked = true;
  inserted = null;
  assert.equal((await route.POST(request({ roomId, message: 'hello' }))).status, 429);
  assert.equal(inserted, null);
  blocked = false;
});
