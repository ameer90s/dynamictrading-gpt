// Local test ONLY: unresolved external providers fail closed. NEVER for production.
export async function resolve(specifier, context, nextResolve) {
  if (process.env.DT_OFFLINE_TEST_ONLY !== '1') return nextResolve(specifier,context);
  if (specifier === '@netlify/blobs') return {url:new URL('./netlify-blobs-unavailable.mjs',import.meta.url).href,shortCircuit:true};
  if (specifier === 'web-push') return {url:new URL('./webpush-unavailable.mjs',import.meta.url).href,shortCircuit:true};
  return nextResolve(specifier,context);
}
