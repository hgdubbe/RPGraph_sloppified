const actionReplySchema = require('./actionReply.schema.json');

async function responseContractOptions(request, getUnslothStatus, abort) {
  if (request.responseContract !== 'actions-v1' || request.connection?.providerKind !== 'unsloth') return {};
  // Recheck after model loading. Provider names alone do not identify the engine.
  const status = await getUnslothStatus(request.connection, abort);
  if (!status.loaded.length || status.loading.length) throw new Error('Unsloth model residency changed during the response-contract check. Retry after loading finishes.');
  if (status.is_gguf !== true) return {};
  return {
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'rpgraph_actions_v1', strict: true, schema: actionReplySchema },
    },
  };
}

function assertResponseContractFinished(request, finishReason) {
  if (request.responseContract && finishReason === 'length') {
    throw new Error('The structured reply reached the output token limit before completion. No actions were executed. Increase the output budget or shorten the requested reply.');
  }
}

module.exports = { responseContractOptions, assertResponseContractFinished };
