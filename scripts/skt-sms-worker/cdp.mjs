import { EventEmitter } from 'node:events';

const DEFAULT_TIMEOUT_MS = 15_000;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const METHOD_PATTERN = /^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/;

/** Errors deliberately omit protocol messages, expressions, and remote URLs. */
export class CdpError extends Error {
  constructor(message, { method, code } = {}) {
    super(message);
    this.name = 'CdpError';
    if (method) this.method = method;
    if (typeof code === 'number') this.code = code;
  }
}

export class CdpEvaluationError extends CdpError {
  constructor(details) {
    super('JavaScript evaluation failed.', { method: 'Runtime.evaluate' });
    this.name = 'CdpEvaluationError';
    if (Number.isInteger(details?.lineNumber)) this.lineNumber = details.lineNumber;
    if (Number.isInteger(details?.columnNumber)) this.columnNumber = details.columnNumber;
  }
}

function positiveTimeout(value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError('A positive timeout in milliseconds is required.');
  }
  return value;
}

function loopbackUrl(value, protocols) {
  let url;
  try { url = new URL(value); } catch {
    throw new TypeError('A valid loopback CDP endpoint is required.');
  }
  if (!protocols.includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)
      || url.username || url.password || url.search || url.hash) {
    throw new TypeError('Only loopback CDP endpoints without credentials or query strings are allowed.');
  }
  return url;
}

/**
 * Browser-level CDP transport with flattened target sessions.
 *
 * const cdp = await CdpClient.connect({ port: 9237 });
 * const pages = await cdp.listTargets();
 * const sessionId = await cdp.attachToTarget(pages[0].targetId);
 * await cdp.enableSession(sessionId, { page: true, runtime: true });
 * cdp.on('Page.javascriptDialogOpening', ({ params, sessionId }) => { ... });
 * const value = await cdp.evaluate(sessionId, 'document.title');
 * cdp.close();
 *
 * No automatic logging, navigation, dialog handling, or page mutation occurs.
 * Consumers must also avoid logging event payloads that can contain private data.
 */
export class CdpClient extends EventEmitter {
  #socket;
  #timeoutMs;
  #nextId = 0;
  #pending = new Map();
  #sessions = new Map();
  #attaching = new Map();
  #contexts = new Map();
  #closed = false;
  #connected = false;

  constructor(socket, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    super();
    this.#socket = socket;
    this.#timeoutMs = positiveTimeout(timeoutMs);
    socket.addEventListener('message', event => {
      this.#receive(event.data).catch(() => {
        this.#failTransport('CDP transport received an invalid message.');
      });
    });
    socket.addEventListener('close', () => {
      this.#failTransport('CDP connection closed.');
    });
    socket.addEventListener('error', () => {
      this.#failTransport('CDP connection failed.');
    });
  }

  static async connect({
    port = 9237,
    endpoint,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
    WebSocketImpl = globalThis.WebSocket,
  } = {}) {
    positiveTimeout(timeoutMs);
    if (!endpoint && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new TypeError('A valid CDP port is required.');
    }
    if (typeof fetchImpl !== 'function' || typeof WebSocketImpl !== 'function') {
      throw new TypeError('This runtime must provide fetch and WebSocket.');
    }
    const base = loopbackUrl(endpoint ?? `http://127.0.0.1:${port}`, ['http:', 'https:']);
    const discoveryUrl = new URL('/json/version', base);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let metadata;
    try {
      const response = await fetchImpl(discoveryUrl, { signal: controller.signal, redirect: 'error' });
      if (!response.ok) throw new Error();
      metadata = await response.json();
    } catch {
      throw new CdpError('Unable to discover the local CDP browser.');
    } finally {
      clearTimeout(timer);
    }
    const websocketUrl = loopbackUrl(metadata?.webSocketDebuggerUrl, ['ws:', 'wss:']);
    if (!websocketUrl.pathname.startsWith('/devtools/browser/')) {
      throw new CdpError('CDP discovery did not return a browser-level WebSocket.');
    }
    let socket;
    try { socket = new WebSocketImpl(websocketUrl.href); } catch {
      throw new CdpError('Unable to open the local CDP browser connection.');
    }
    const client = new CdpClient(socket, { timeoutMs });
    try {
      await client.#waitForOpen();
      return client;
    } catch (error) {
      client.close();
      throw error;
    }
  }

  #waitForOpen() {
    if (this.#closed) return Promise.reject(new CdpError('CDP connection closed before opening.'));
    if (this.#socket.readyState === 1) {
      this.#connected = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        this.#socket.removeEventListener('open', opened);
        this.#socket.removeEventListener('error', failed);
        this.#socket.removeEventListener('close', failed);
      };
      const opened = () => {
        cleanup();
        this.#connected = true;
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new CdpError('Unable to open the local CDP browser connection.'));
      };
      this.#socket.addEventListener('open', opened, { once: true });
      this.#socket.addEventListener('error', failed, { once: true });
      this.#socket.addEventListener('close', failed, { once: true });
      timer = setTimeout(() => {
        cleanup();
        reject(new CdpError('CDP browser connection timed out.'));
      }, this.#timeoutMs);
    });
  }

  async #receive(data) {
    if (this.#closed) return;
    let raw;
    if (typeof data === 'string') raw = data;
    else if (typeof data?.text === 'function') raw = await data.text();
    else if (data instanceof ArrayBuffer) raw = new TextDecoder().decode(data);
    else if (ArrayBuffer.isView(data)) raw = new TextDecoder().decode(data);
    else throw new Error();
    const message = JSON.parse(raw);
    if (!message || typeof message !== 'object') throw new Error();
    if (Number.isInteger(message.id)) {
      const request = this.#pending.get(message.id);
      if (!request) return; // A timed-out command can still receive a late reply.
      this.#pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) {
        request.reject(new CdpError(`CDP command failed: ${request.method}.`, {
          method: request.method,
          code: message.error.code,
        }));
      } else request.resolve(message.result ?? {});
      return;
    }
    if (typeof message.method !== 'string') return;
    const event = { params: message.params ?? {}, sessionId: message.sessionId };
    this.#trackContext(message.method, event);
    if (message.method === 'Target.detachedFromTarget') {
      this.#forgetSession(event.params.sessionId);
    }
    this.emit(message.method, event);
    this.emit('event', { method: message.method, ...event });
  }

  #trackContext(method, { params, sessionId }) {
    if (!sessionId) return;
    if (method === 'Runtime.executionContextCreated' && params.context) {
      if (!this.#contexts.has(sessionId)) this.#contexts.set(sessionId, new Map());
      this.#contexts.get(sessionId).set(params.context.id, params.context);
    } else if (method === 'Runtime.executionContextDestroyed') {
      this.#contexts.get(sessionId)?.delete(params.executionContextId);
    } else if (method === 'Runtime.executionContextsCleared') {
      this.#contexts.delete(sessionId);
    }
  }

  #forgetSession(sessionId) {
    if (!sessionId) return;
    this.#contexts.delete(sessionId);
    for (const [targetId, session] of this.#sessions) {
      if (session === sessionId) this.#sessions.delete(targetId);
    }
    for (const [id, request] of this.#pending) {
      if (request.sessionId !== sessionId) continue;
      this.#pending.delete(id);
      clearTimeout(request.timer);
      request.reject(new CdpError('CDP target session detached.', { method: request.method }));
    }
  }

  #failTransport(message) {
    if (this.#closed) return;
    this.#closed = true;
    this.#connected = false;
    for (const request of this.#pending.values()) {
      clearTimeout(request.timer);
      request.reject(new CdpError(message, { method: request.method }));
    }
    this.#pending.clear();
    this.#sessions.clear();
    this.#contexts.clear();
    try { this.#socket.close(); } catch { /* Release failed or malformed connections. */ }
    this.emit('disconnected', { message });
  }

  call(method, params = {}, sessionId, { timeoutMs = this.#timeoutMs } = {}) {
    if (!METHOD_PATTERN.test(method)) throw new TypeError('A valid CDP method name is required.');
    positiveTimeout(timeoutMs);
    if (this.#closed || !this.#connected || this.#socket.readyState !== 1) {
      return Promise.reject(new CdpError('CDP connection is not open.', { method }));
    }
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new CdpError(`CDP command timed out: ${method}.`, { method }));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer, method, sessionId });
      try {
        const message = { id, method, params };
        if (sessionId) message.sessionId = sessionId;
        this.#socket.send(JSON.stringify(message));
      } catch {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(new CdpError(`Unable to send CDP command: ${method}.`, { method }));
      }
    });
  }

  async listTargets({ types = ['page', 'iframe'] } = {}) {
    const { targetInfos = [] } = await this.call('Target.getTargets');
    return targetInfos.filter(target => types.includes(target.type));
  }

  async attachToTarget(targetId) {
    if (this.#sessions.has(targetId)) return this.#sessions.get(targetId);
    if (this.#attaching.has(targetId)) return this.#attaching.get(targetId);
    const request = this.call('Target.attachToTarget', { targetId, flatten: true })
      .then(({ sessionId }) => {
        if (!sessionId) throw new CdpError('CDP did not return a target session.');
        this.#sessions.set(targetId, sessionId);
        return sessionId;
      }).finally(() => this.#attaching.delete(targetId));
    this.#attaching.set(targetId, request);
    return request;
  }

  async enableSession(sessionId, { page = false, runtime = false } = {}) {
    const commands = [];
    if (page) commands.push(this.call('Page.enable', {}, sessionId));
    if (runtime) commands.push(this.call('Runtime.enable', {}, sessionId));
    await Promise.all(commands);
  }

  listContexts(sessionId) {
    return [...(this.#contexts.get(sessionId)?.values() ?? [])];
  }

  async evaluate(sessionId, expression, {
    awaitPromise = true,
    contextId,
    uniqueContextId,
    timeoutMs = this.#timeoutMs,
    userGesture = false,
  } = {}) {
    if (typeof expression !== 'string') throw new TypeError('A JavaScript expression is required.');
    if (contextId !== undefined && uniqueContextId !== undefined) {
      throw new TypeError('Choose either contextId or uniqueContextId.');
    }
    const params = { expression, returnByValue: true, awaitPromise, userGesture, timeout: timeoutMs };
    if (contextId !== undefined) params.contextId = contextId;
    if (uniqueContextId !== undefined) params.uniqueContextId = uniqueContextId;
    const response = await this.call('Runtime.evaluate', params, sessionId, { timeoutMs });
    if (response.exceptionDetails) throw new CdpEvaluationError(response.exceptionDetails);
    const result = response.result;
    if (!result || result.type === 'undefined') return undefined;
    if (Object.hasOwn(result, 'value')) return result.value;
    const literal = result.unserializableValue;
    if (literal === 'NaN') return NaN;
    if (literal === 'Infinity') return Infinity;
    if (literal === '-Infinity') return -Infinity;
    if (literal === '-0') return -0;
    if (typeof literal === 'string' && /^-?\d+n$/.test(literal)) return BigInt(literal.slice(0, -1));
    throw new CdpError('Evaluation result could not be returned by value.', { method: 'Runtime.evaluate' });
  }

  async detachFromTarget(sessionId) {
    await this.call('Target.detachFromTarget', { sessionId });
    this.#forgetSession(sessionId);
  }

  close() {
    this.#failTransport('CDP connection closed by client.');
    try { this.#socket.close(); } catch { /* Already closed or never opened. */ }
  }
}

export const connectCDP = options => CdpClient.connect(options);
