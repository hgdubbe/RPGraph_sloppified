function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object.`);
  }
  return value;
}

function assertString(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${label}: expected a string.`);
  }
  return value;
}

function assertOptionalString(value, label) {
  if (value === undefined || value === null) {
    return '';
  }
  return assertString(value, label);
}

function assertProviderConnection(value) {
  const connection = assertObject(value, 'provider connection');
  assertOptionalString(connection.id, 'provider connection id');
  assertOptionalString(connection.provider, 'provider connection provider');
  assertOptionalString(connection.baseUrl, 'provider connection baseUrl');
  assertOptionalString(connection.model, 'provider connection model');
  return connection;
}

function assertChatCompletionRequest(value) {
  const request = assertObject(value, 'chat completion request');
  if (!request.connection) {
    throw new Error('Invalid chat completion request: missing connection.');
  }
  assertProviderConnection(request.connection);
  assertString(request.prompt, 'chat completion prompt');
  return request;
}

function assertSettingsPayload(value) {
  const settings = assertObject(value, 'settings payload');
  if (settings.format !== 'rpgraph-settings' || settings.version !== 1) {
    throw new Error('Invalid settings payload: expected RPGraph settings v1.');
  }
  return settings;
}

module.exports = {
  assertObject,
  assertString,
  assertOptionalString,
  assertProviderConnection,
  assertChatCompletionRequest,
  assertSettingsPayload,
};
