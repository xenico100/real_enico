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
      title.textContent = failed ? 'CONNECTION LOST' : slow ? 'SIGNAL DELAY' : 'ENTERING THE ARCHIVE';
      message.textContent = failed || slow ? '연결 상태를 확인한 뒤 다시 시도해 주세요.' : 'ENICO VECK / EXHIBITION';
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
  addEventListener('unhandledrejection', () => { if (boot.state !== 'ready') boot.fail(); });
})();
