// public/js/sandbox.js
export const SANDBOX_TIMEOUT_MS = 2500;

export function buildSrcdoc(html) {
  const probe = `<script>
(function () {
  var sent = false;
  function report(ok, errors) {
    if (sent) return; sent = true;
    try { parent.postMessage({ source: 'doodle-sandbox', ok: ok, errors: errors || [] }, '*'); } catch (e) {}
  }
  window.addEventListener('error', function (e) {
    report(false, [String(e.message || 'unknown error') + (e.lineno ? ' @line' + e.lineno : '')]);
  });
  window.addEventListener('unhandledrejection', function (e) {
    report(false, ['unhandledrejection: ' + String(e.reason)]);
  });
  var origDraw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function () {
    origDraw.apply(this, arguments);
    setTimeout(function () { report(true, []); }, 0);
  };
  ['fillRect', 'clearRect'].forEach(function (name) {
    var orig = CanvasRenderingContext2D.prototype[name];
    CanvasRenderingContext2D.prototype[name] = function () {
      orig.apply(this, arguments);
      if (name === 'fillRect') setTimeout(function () { report(true, []); }, 0);
    };
  });
})();
</script>`;
  if (/<head>/i.test(html)) return html.replace(/<head>/i, '<head>' + probe);
  return probe + html; // 无 head 的兜底
}

export function createSandbox(container) {
  let iframe = null;
  let versions = [];      // [{label, html}]
  let current = -1;

  function freshIframe() {
    if (iframe) iframe.remove();
    iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:100%;border:0;border-radius:12px;background:#111;';
    iframe.setAttribute('sandbox', 'allow-scripts');
    container.appendChild(iframe);
    return iframe;
  }

  function load(html) {
    return new Promise((resolve) => {
      const f = freshIframe();
      const timer = setTimeout(
        () => {
          window.removeEventListener('message', onMsg); // 超时路径同样要摘监听器，否则泄漏
          resolve({ ok: false, errors: [`TIMEOUT: ${SANDBOX_TIMEOUT_MS}ms 内无首帧渲染`] });
        },
        SANDBOX_TIMEOUT_MS,
      );
      const onMsg = (ev) => {
        const d = ev.data;
        if (!d || d.source !== 'doodle-sandbox') return;
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        resolve({ ok: !!d.ok, errors: d.errors || [] });
      };
      window.addEventListener('message', onMsg);
      f.srcdoc = buildSrcdoc(html);
    });
  }

  function reset() {
    versions = [];
    current = -1;
    if (iframe) { iframe.remove(); iframe = null; }
  }

  async function show(i) {
    current = i;
    await load(versions[i].html);
  }

  function pushVersion(label, html) {
    versions.push({ label, html });
    return versions.length - 1;
  }

  return {
    load,
    pushVersion,
    show,
    reset,
    get versions() { return versions; },
    get current() { return current; },
  };
}
