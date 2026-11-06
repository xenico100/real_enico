if (window.parent === window) location.replace('/');
(() => {
  let timer;
  const boot = window.enicoBoot = {
    state: 'loading',
    render() {
      const veil = document.getElementById('veil');
      if (!veil) return;
      const title = document.getElementById('loadTitle');
      const message = document.getElementById('loadMessage');
      const retry = document.getElementById('loadRetry');
      veil.classList.toggle('gone', this.state === 'ready');
      veil.setAttribute('aria-hidden', String(this.state === 'ready'));
      if (this.state === 'ready') return;
      const failed = this.state === 'failed', slow = this.state === 'slow';
      title.textContent = failed ? '전시를 열 수 없습니다' : slow ? '전시 준비 중' : 'ENICO VECK';
      message.textContent = failed || slow ? '상품 목록에서 쇼핑을 계속할 수 있습니다.' : '전시를 불러오는 중입니다.';
      retry.hidden = !(failed || slow);
    },
    ready() {
      if (this.state === 'failed') return;
      this.state = 'ready';
      clearTimeout(timer);
      this.render();
    },
    fail() {
      this.state = 'failed';
      window.parent.postMessage({ channel: 'enico-corridor-v1', type: 'scene-failed' }, location.origin);
      clearTimeout(timer);
      this.render();
    },
    retry() {
      const url = new URL(location.href);
      url.searchParams.set('reload', String(Date.now()));
      location.replace(url.href);
    }
  };
  timer = setTimeout(() => { if (boot.state === 'loading') { boot.state = 'slow'; boot.render(); } }, 8000);
  addEventListener('error', event => {
    if (boot.state !== 'ready' && (event.error || event.target?.tagName === 'SCRIPT')) boot.fail();
  }, true);
  document.addEventListener('webglcontextlost', () => boot.fail(), true);
  addEventListener('unhandledrejection', () => { if (boot.state !== 'ready') boot.fail(); });
})();
