/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

class OrderValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

let uploadCalls = 0;
const source = fs.readFileSync(path.resolve('src/app/api/orders/receipt-upload/route.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUnderTest = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, {
  filename: 'receipt-upload/route.ts',
})((name) => {
  if (name === 'node:crypto') return require('node:crypto');
  if (name === 'next/server') return { NextResponse: { json: (body, options) => Response.json(body, options) } };
  if (name === '@/lib/r2Storage') return { uploadToR2: async () => { uploadCalls += 1; return 'https://example.invalid/receipt'; } };
  if (name === '@/lib/security/requestBudget') return { requestBudget: async () => null };
  if (name === '@/lib/orders/serverOrderValidation') return {
    authenticateOrderRequest: async () => ({ user: { id: 'member-123' } }),
    getOrderErrorStatus: (error) => error.status || 500,
    normalizeTransactionId: (value) => value,
    OrderValidationError,
  };
  throw new Error(`Unexpected import: ${name}`);
}, moduleUnderTest, moduleUnderTest.exports);

test('receipt upload rejects declared and chunked oversized bodies before parsing or R2', async () => {
  const old = process.env.PAYMENT_RECEIPT_UPLOAD_ENABLED;
  process.env.PAYMENT_RECEIPT_UPLOAD_ENABLED = 'true';
  try {
    const declared = new Request('http://localhost/api/orders/receipt-upload', {
      method: 'POST',
      headers: { 'content-length': String(9 * 1024 * 1024 + 1) },
      body: 'small',
    });
    assert.equal((await moduleUnderTest.exports.POST(declared)).status, 413);

    const chunked = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(9 * 1024 * 1024 + 1));
        controller.close();
      },
    });
    const streamed = new Request('http://localhost/api/orders/receipt-upload', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=test' },
      body: chunked,
      duplex: 'half',
    });
    assert.equal((await moduleUnderTest.exports.POST(streamed)).status, 413);
    assert.equal(uploadCalls, 0);
  } finally {
    if (old === undefined) delete process.env.PAYMENT_RECEIPT_UPLOAD_ENABLED;
    else process.env.PAYMENT_RECEIPT_UPLOAD_ENABLED = old;
  }
});
