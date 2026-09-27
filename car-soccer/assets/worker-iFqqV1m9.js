const REMOTE_WORKER = "https://cdn.jsdelivr.net/gh/nawsif/host@main/car-soccer/assets/worker-iFqqV1m9.js";
const REMOTE_BASE = new URL(".", REMOTE_WORKER).href;

const resolveRelative = (specifier) => {
  try {
    return new URL(specifier, REMOTE_BASE).href;
  } catch {
    return specifier;
  }
};

const rewriteWorkerSource = (source) => {
  let out = source;

  // Rewrite ESM imports (static and dynamic) so a Blob module can still
  // resolve the worker's original sibling chunks from jsDelivr.
  out = out.replace(
    /(\bfrom\s*|\bimport\s*)((["']))((?:\.\/|\.\.\/)[^"']+)\3/g,
    (match, prefix, quote, q, spec) => `${prefix}${quote}${resolveRelative(spec)}${q}`
  );

  // Rewrite new URL("./...", import.meta.url) and related relative URLs.
  out = out.replace(
    /(new\s+URL\(\s*)(["'`])((?:\.\/|\.\.\/)[^"'`]+)\2/g,
    (match, prefix, quote, spec) => `${prefix}${quote}${resolveRelative(spec)}${quote}`
  );

  // Rewrite root-relative asset URLs to the actual jsDelivr asset directory.
  const assetBase = REMOTE_BASE;
  out = out.replace(/(["'`])\/assets\//g, `$1${assetBase}`);

  return out;
};

try {
  const response = await fetch(REMOTE_WORKER, { mode: "cors", cache: "no-cache" });
  if (!response.ok) throw new Error(`Unable to load bot worker: HTTP ${response.status}`);

  const source = rewriteWorkerSource(await response.text()) + `\n//# sourceURL=${REMOTE_WORKER}`;
  const blob = new Blob([source], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);

  try {
    await import(url);
  } finally {
    URL.revokeObjectURL(url);
  }
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  self.postMessage({ kind: "error", error: `Bot worker bootstrap failed: ${message}` });
  throw error;
}
