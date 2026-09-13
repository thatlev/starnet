'use strict';
// Reuse the established Responses stream/tool decoder. Only the authenticated
// gateway's model catalogue differs from ChatGPT's account catalogue.
const { makeCodexProvider } = require('./codex');
function makeLevServerProvider(opts) {
  const base = String(opts.baseUrl || 'http://127.0.0.1:8781/v1').replace(/\/$/, '');
  const fetcher = opts.fetch || globalThis.fetch;
  const engine = makeCodexProvider({ fetch: fetcher, token: opts.key, baseUrl: base, reasoningEffort: opts.reasoningEffort,
    normalizeReasoningEffort: value => {
      const effort = String(value || 'medium').toLowerCase();
      if (!['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(effort)) throw new Error('Unsupported LevServer reasoning effort');
      return effort;
    }
  });
  let models = [];
  return {
    ...engine,
    async listModels() {
      const res = await fetcher(base + '/models', { headers: { Authorization: 'Bearer ' + opts.key }, signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!res.ok) throw new Error('LevServer model access failed (' + res.status + ')');
      const body = await res.json();
      models = (Array.isArray(body.data) ? body.data : []).filter(m => m.available !== false && typeof m.id === 'string').map(m => ({
        id: m.id, displayName: m.id, supportsTools: true, pricing: null,
        reasoningEfforts: m.allowed_reasoning_efforts || [], defaultReasoningLevel: m.default_reasoning_effort || 'medium',
        recommended: m.recommended === true
      }));
      return models;
    },
    // Conservative local prompt budget, not a claim about provider context size.
    contextLimit: () => 32000,
    reasoningEfforts: id => models.find(m => m.id === id)?.reasoningEfforts || ['medium'],
    supportsTools: () => true
  };
}
module.exports = { makeLevServerProvider };
