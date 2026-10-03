'use strict';
function registerStationConfigTools(registry, config) {
  const run = action => async (args, ctx) => {
    try {
      const result = await config.execute({ ...args, action }, { runId: ctx?.runId });
      return { content: JSON.stringify(result), summary: result.applied ? 'configuration applied; backup saved' : 'station configuration' };
    } catch (error) { return { content: 'REFUSED: ' + error.message + ' Do not report the change as done.', summary: 'configuration refused' }; }
  };
  registry.register({ name: 'station.config.read', capability: 'orchestrator', scope: 'read', requiresConsent: false,
    description: 'Read an open station viewer’s editable JSON: appearance, notifications and complete floor layout (rooms, props, belts, routing). Returns viewerId and revision required for an edit. Never returns provider credentials. Requires an open StarNet viewer.',
    schema: { type: 'object', properties: { viewerId: { type: 'string' } } }, run: run('get') });
  registry.register({ name: 'station.config.apply', capability: 'orchestrator', scope: 'write', requiresConsent: true,
    description: 'Apply an authorized station configuration edit. Read station.config.read first and pass its viewerId and revision. config is {starnetConfig:1,settings?:{...},layout?:completeLayout}. Settings merge; a layout replaces the floor. Placed props change tool access: explain requested capability changes before asking for consent. Requires an idle, open station, rejects stale edits, saves a recovery snapshot, and confirms persistence. Never edits credentials or approval rules.',
    schema: { type: 'object', required: ['viewerId', 'revision', 'config'], properties: {
      viewerId: { type: 'string' }, clientId: { type: 'string' }, revision: { type: 'string' }, config: { type: 'object' }, label: { type: 'string' }
    } }, run: run('apply') });
}
module.exports = { registerStationConfigTools };
