/* eslint-disable @typescript-eslint/no-require-imports -- Node's isolated CommonJS test runner. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function loadModule(entry, overrides = {}, env = {}) {
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = { exports: {} };
    cache.set(absolute, mod);
    const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInThisContext(`(function(require,module,exports,process){${compiled}\n})`, { filename: absolute })(name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name === 'node:crypto') return require(name);
      if (name.startsWith('@/')) return load(path.join('src', name.slice(2)) + '.ts');
      throw new Error('Unexpected analytics import: ' + name);
    }, mod, mod.exports, { env });
    return mod.exports;
  }
  return load(entry);
}

const analytics = () => loadModule('src/lib/analytics/visitSource.ts');
const responseStub = {
  NextResponse: {
    json(body, options = {}) {
      return { body, status: options.status || 200, cookies: { set() {} } };
    },
  },
};

function visitDb(initial, hooks = {}) {
  const db = { row: clone(initial), updates: [], reads: 0, inserts: 0 };
  db.client = {
    from(table) {
      assert.equal(table, 'site_daily_visitors');
      const filters = [];
      let payload;
      const query = {
        select() { return query; },
        eq(key, value) { filters.push({ key, value }); return query; },
        is(key, value) { filters.push({ key, value }); return query; },
        update(value) { payload = clone(value); return query; },
        async insert(value) {
          db.inserts += 1;
          if (hooks.beforeInsert) await hooks.beforeInsert(db, value);
          if (db.row) return { error: { code: '23505' } };
          db.row = clone(value);
          return { error: null };
        },
        async maybeSingle() {
          if (!payload) {
            db.reads += 1;
            const snapshot = clone(db.row);
            if (hooks.afterRead) await hooks.afterRead(db, db.reads);
            return { data: snapshot, error: null };
          }
          const matched = Boolean(db.row) && filters.every(({ key, value }) => db.row[key] === value);
          db.updates.push({ payload: clone(payload), filters: clone(filters), matched });
          if (!matched) return { data: null, error: null };
          Object.assign(db.row, clone(payload));
          return { data: { visitor_id: db.row.visitor_id }, error: null };
        },
      };
      return query;
    },
  };
  return db;
}

function currentDateKst() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function row(meta, hitCount = 2) {
  return {
    visit_date: currentDateKst(), visitor_id: 'visitor_fixture_123',
    last_seen_at: '2026-01-01T00:00:00.000Z',
    hit_count: hitCount, last_path: typeof meta === 'string' ? meta : JSON.stringify(meta),
  };
}

function visitHandler(db) {
  return loadModule('src/app/api/analytics/visit/route.ts', {
    'next/server': responseStub,
    '@/lib/supabaseAdmin': { getSupabaseAdminClient: () => db.client },
    '@/lib/security/requestBudget': { requestBudget: async () => null },
    '@/lib/security/requestBody': { readJsonObject: async request => request.json() },
  }).POST;
}

function request(payload) {
  return {
    cookies: { get: () => ({ value: 'visitor_fixture_123' }) },
    json: async () => clone(payload),
  };
}

function googleAttribution() {
  return analytics().inferVisitAttribution({
    currentUrl: 'https://enicoveck.com/void', referrer: 'https://www.google.com/search?q=fixture',
  });
}

function dailyStatsHandler(tables, pageCap = Infinity, requests = []) {
  const service = {
    from(table) {
      const query = {
        select() { return query; }, gte() { return query; }, lte() { return query; },
        lt() { return query; }, order() { return query; },
        async range(from, to) {
          requests.push({ table, from, to });
          return { data: (tables[table] || []).slice(from, Math.min(to + 1, from + pageCap)), error: null };
        },
      };
      return query;
    },
  };
  return loadModule('src/app/api/admin/daily-stats/route.ts', {
    'next/server': responseStub,
    '@/lib/security/identity': { isPrimaryAdmin: () => true },
    '@/lib/supabase/projectGuard': { assertExpectedSupabaseProject: value => value },
    '@supabase/supabase-js': {
      createClient(_url, key) {
        return key === 'fixture-anon'
          ? { auth: { getUser: async () => ({ data: { user: { id: 'fixture-admin' } }, error: null }) } }
          : service;
      },
    },
  }, {
    NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
  }).GET;
}

const dailyStatsRequest = () => ({
  url: 'https://fixture.invalid/api/admin/daily-stats?days=1',
  headers: { get: () => 'Bearer fixture' },
});

test('new visits persist normalized attribution without changing the legacy source bucket', async () => {
  const db = visitDb(null);
  const attribution = googleAttribution();
  const response = await visitHandler(db)(request({ path: '/void', source: 'other', attribution }));
  assert.equal(response.status, 200);
  const meta = analytics().parseVisitMeta(db.row.last_path);
  assert.deepEqual(meta.attribution, attribution);
  assert.equal(meta.source, 'other');
  assert.equal(db.row.hit_count, 1);
});

test('later campaign and product events preserve the first identified acquisition', async () => {
  const original = googleAttribution();
  const db = visitDb(row({ path: '/void', source: 'other', attribution: original }));
  const incoming = analytics().inferVisitAttribution({
    currentUrl: 'https://enicoveck.com/?utm_source=instagram&utm_medium=paid_social&utm_campaign=fixture',
  });
  const response = await visitHandler(db)(request({
    path: '/product', source: 'instagram', attribution: incoming,
    event: { type: 'product_click', target: 'fixture-product' },
  }));
  assert.equal(response.status, 200);
  const meta = analytics().parseVisitMeta(db.row.last_path);
  assert.deepEqual(meta.attribution, original);
  assert.equal(meta.source, 'other');
  assert.equal(meta.events[0].type, 'product_click');
  assert.equal(db.row.hit_count, 2);
});

test('a legacy identified source never gains contradictory later attribution', async () => {
  const db = visitDb(row({ path: '/old-page', source: 'youtube' }));
  const response = await visitHandler(db)(request({
    path: '/void', source: 'other', attribution: googleAttribution(),
  }));
  assert.equal(response.status, 200);
  const meta = analytics().parseVisitMeta(db.row.last_path);
  assert.equal(meta.source, 'youtube');
  assert.equal(meta.attribution, undefined);
});

test('detailed acquisition controls the legacy bucket on inserts and later old-client events', async () => {
  const db = visitDb(null);
  const original = googleAttribution();
  const handler = visitHandler(db);
  const inserted = await handler(request({ path: '/void', source: 'youtube', attribution: original }));
  assert.equal(inserted.status, 200);
  assert.equal(analytics().parseVisitMeta(db.row.last_path).source, 'other');
  const updated = await handler(request({
    path: '/cart', source: 'youtube', event: { type: 'cart_open', target: 'cart' },
  }));
  assert.equal(updated.status, 200);
  const meta = analytics().parseVisitMeta(db.row.last_path);
  assert.equal(meta.source, 'other');
  assert.deepEqual(meta.attribution, original);
});

test('an old-client social acquisition replaces unknown direct detail consistently', async () => {
  const direct = analytics().inferVisitAttribution({ currentUrl: 'https://enicoveck.com/' });
  const db = visitDb(row({ path: '/', source: 'other', attribution: direct }));
  const response = await visitHandler(db)(request({ path: '/void', source: 'youtube' }));
  assert.equal(response.status, 200);
  const meta = analytics().parseVisitMeta(db.row.last_path);
  assert.equal(meta.source, 'youtube');
  assert.equal(meta.attribution, undefined);
});

test('an untagged revisit cannot relabel a legacy unknown visit as direct', async () => {
  const db = visitDb(row('/old-page'));
  const attribution = analytics().inferVisitAttribution({ currentUrl: 'https://enicoveck.com/new-page' });
  const response = await visitHandler(db)(request({ path: '/new-page', source: 'other', attribution }));
  assert.equal(response.status, 200);
  const meta = analytics().parseVisitMeta(db.row.last_path);
  assert.equal(meta.attribution, undefined);
  assert.equal(meta.source, 'other');
});

test('new external evidence can enrich a legacy unknown visit', async () => {
  const db = visitDb(row('/old-page'));
  const attribution = googleAttribution();
  await visitHandler(db)(request({ path: '/void', source: 'other', attribution }));
  assert.deepEqual(analytics().parseVisitMeta(db.row.last_path).attribution, attribution);
});

test('older event payloads retain attribution and safely advance a null legacy timestamp', async () => {
  const attribution = googleAttribution();
  const initial = row({ path: '/void', source: 'other', attribution });
  initial.last_seen_at = null;
  const db = visitDb(initial);
  const response = await visitHandler(db)(request({
    path: '/cart', source: 'other', event: { type: 'cart_open', target: 'cart' },
  }));
  assert.equal(response.status, 200);
  assert.ok(Number.isFinite(Date.parse(db.row.last_seen_at)));
  assert.deepEqual(analytics().parseVisitMeta(db.row.last_path).attribution, attribution);
  assert.ok(db.updates[0].filters.some(filter => filter.key === 'last_seen_at' && filter.value === null));
});

test('a concurrent acquisition survives a losing compare-and-swap and both page hits remain', async () => {
  const direct = analytics().inferVisitAttribution({ currentUrl: 'https://enicoveck.com/' });
  const committed = googleAttribution();
  const db = visitDb(row({ path: '/', source: 'other', attribution: direct }), {
    afterRead(state, count) {
      if (count === 1) {
        state.row.hit_count = 3;
        state.row.last_path = JSON.stringify({ path: '/void', source: 'other', attribution: committed });
      }
    },
  });
  const incoming = analytics().inferVisitAttribution({ currentUrl: 'https://enicoveck.com/?utm_source=naver' });
  const response = await visitHandler(db)(request({ path: '/product', source: 'other', attribution: incoming }));
  assert.equal(response.status, 200);
  assert.equal(db.updates[0].matched, false);
  assert.equal(db.row.hit_count, 4);
  assert.deepEqual(analytics().parseVisitMeta(db.row.last_path).attribution, committed);
});

test('metadata-only concurrent events advance the revision and avoid sending metadata in filters', async () => {
  const attribution = googleAttribution();
  const initial = row({ path: '/void', source: 'other', attribution }, 2);
  // This timestamp deliberately lies ahead of the handler clock to exercise
  // monotonic revisions even for same-millisecond event writes.
  initial.last_seen_at = '2099-01-01T00:00:00.000Z';
  const db = visitDb(initial, {
    afterRead(state, count) {
      if (count === 1) {
        state.row.last_seen_at = '2099-01-01T00:00:00.001Z';
        const meta = JSON.parse(state.row.last_path);
        meta.events = [{ type: 'cart_open', target: 'cart', at: '2026-01-01T00:00:00Z' }];
        state.row.last_path = JSON.stringify(meta);
      }
    },
  });
  const response = await visitHandler(db)(request({
    path: '/product', source: 'other', attribution,
    event: { type: 'product_click', target: 'fixture-product' },
  }));
  assert.equal(response.status, 200);
  assert.equal(db.updates[0].matched, false);
  assert.equal(db.row.last_seen_at, '2099-01-01T00:00:00.002Z');
  assert.equal(db.row.hit_count, 2);
  assert.deepEqual(analytics().parseVisitMeta(db.row.last_path).events.map(event => event.type), ['cart_open', 'product_click']);
  for (const update of db.updates) {
    assert.ok(update.filters.some(filter => filter.key === 'last_seen_at'));
    assert.ok(update.filters.every(filter => filter.key !== 'last_path'));
  }
});

test('an insert race rereads the existing visit instead of losing its acquisition', async () => {
  const original = googleAttribution();
  const db = visitDb(null, {
    beforeInsert(state) {
      state.row = row({ path: '/void', source: 'other', attribution: original }, 1);
    },
  });
  const direct = analytics().inferVisitAttribution({ currentUrl: 'https://enicoveck.com/' });
  const response = await visitHandler(db)(request({ path: '/', source: 'other', attribution: direct }));
  assert.equal(response.status, 200);
  assert.equal(db.row.hit_count, 2);
  assert.deepEqual(analytics().parseVisitMeta(db.row.last_path).attribution, original);
});

test('daily source detail totals reconcile with daily visitors including legacy records', async () => {
  const today = currentDateKst();
  const original = googleAttribution();
  const visitors = [
    { visit_date: today, visitor_id: 'a', hit_count: 2, last_path: JSON.stringify({ path: '/void', source: 'other', attribution: original }) },
    { visit_date: today, visitor_id: 'b', hit_count: 1, last_path: JSON.stringify({ path: '/void', source: 'other', attribution: original }) },
    { visit_date: today, visitor_id: 'c', hit_count: 3, last_path: '/old' },
    { visit_date: today, visitor_id: 'd', hit_count: 1, last_path: JSON.stringify({ path: '/', source: 'youtube' }) },
  ];
  const response = await dailyStatsHandler({ site_daily_visitors: visitors })(dailyStatsRequest());
  assert.equal(response.status, 200);
  const daily = response.body.rows[0];
  assert.equal(daily.visitorCount, 4);
  assert.equal(daily.pageHitCount, 7);
  assert.equal(daily.sourceDetails.reduce((sum, item) => sum + item.visitorCount, 0), 4);
  assert.equal(daily.sourceDetails[0].visitorCount, 2);
  assert.ok(daily.sourceDetails.some(item => item.source === '(legacy unknown)' && item.channel === 'legacy_unknown'));
  assert.ok(daily.sourceDetails.some(item => item.source === 'youtube' && item.channel === 'organic_social'));
  assert.deepEqual(response.body.summary.totalSourceDetails, daily.sourceDetails);
});

test('daily stats read all rows when the server caps pages below the requested range', async () => {
  const today = currentDateKst();
  const requests = [];
  const visitors = Array.from({ length: 7 }, (_, index) => ({
    visit_date: today, visitor_id: `fixture-${index}`, hit_count: 1, last_path: '/old',
  }));
  const createdAt = new Date().toISOString();
  const createdRows = count => Array.from({ length: count }, (_, id) => ({ id, created_at: createdAt }));
  const response = await dailyStatsHandler({
    site_daily_visitors: visitors,
    chat_rooms: createdRows(4),
    chat_room_messages: createdRows(5),
  }, 3, requests)(dailyStatsRequest());
  assert.equal(response.status, 200);
  const daily = response.body.rows[0];
  assert.equal(daily.visitorCount, 7);
  assert.equal(daily.sourceDetails.reduce((sum, item) => sum + item.visitorCount, 0), 7);
  assert.equal(daily.createdRoomCount, 4);
  assert.equal(daily.messageCount, 5);
  assert.deepEqual(requests.filter(item => item.table === 'site_daily_visitors').map(item => item.from), [0, 3, 6, 7]);
  assert.deepEqual(requests.filter(item => item.table === 'chat_rooms').map(item => item.from), [0, 3, 4]);
  assert.deepEqual(requests.filter(item => item.table === 'chat_room_messages').map(item => item.from), [0, 3, 5]);
});
