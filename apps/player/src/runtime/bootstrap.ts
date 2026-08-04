export interface RuntimeBootstrapInput {
  readonly logicSource: string;
  readonly presentationSource: string;
}

function scriptString(value: string): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function buildRuntimeBootstrap(input: RuntimeBootstrapInput): string {
  const logic = scriptString(input.logicSource);
  const presentation = scriptString(input.presentationSource);
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline' blob:">
<style>html,body,#root{margin:0;min-height:100%;font-family:ui-rounded,Georgia,serif;background:#f4f0e6;color:#142d2a}button,input{font:inherit}</style></head>
<body><main id="root"></main><script>
const pending = new Map(); let sequence = 0;
const send = (type, payload) => new Promise((resolve, reject) => {
  const requestId = 'web-' + (++sequence); pending.set(requestId, { resolve, reject });
  window.ReactNativeWebView.postMessage(JSON.stringify({ version: 1, requestId, type, payload }));
});
window.__plotpointReceive = (message) => {
  const parsed = typeof message === 'string' ? JSON.parse(message) : message;
  const waiter = pending.get(parsed.requestId);
  if (waiter) { pending.delete(parsed.requestId); parsed.type === 'host.error' ? waiter.reject(parsed.payload) : waiter.resolve(parsed.payload); }
  window.dispatchEvent(new CustomEvent('plotpoint-host', { detail: parsed }));
};
(async () => {
  const logicUrl = URL.createObjectURL(new Blob([${logic}], { type: 'text/javascript' }));
  const presentationUrl = URL.createObjectURL(new Blob([${presentation}], { type: 'text/javascript' }));
  const [logicModule, presentationModule] = await Promise.all([import(logicUrl), import(presentationUrl)]);
  const bootstrap = await send('runtime.ready', {});
  const mount = presentationModule.default && presentationModule.default.mount;
  if (typeof mount !== 'function') throw new Error('presentation-mount-missing');
  await mount({ root: document.getElementById('root'), logic: logicModule.default, host: { send }, bootstrap });
})().catch((error) => { document.getElementById('root').textContent = 'Runtime failed: ' + String(error && error.message || error); });
</script></body></html>`;
}

export function allowRuntimeNavigation(url: string): boolean {
  return url === "about:blank" || url.startsWith("blob:");
}
