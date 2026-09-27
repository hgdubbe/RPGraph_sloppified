import type { ConnectionPreset, ProviderConnectionHealth } from '../types';

export function isTextGenerationConnection(connection: ConnectionPreset, health?: ProviderConnectionHealth) {
  const capabilities = health?.capabilities;
  return connection.kind !== 'comfyui' && capabilities?.image !== true &&
    capabilities?.text !== false && !(capabilities?.voice === true && capabilities.text !== true);
}
