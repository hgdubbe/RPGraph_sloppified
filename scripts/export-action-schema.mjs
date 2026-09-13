import { writeFile } from 'node:fs/promises';
import { actionReplyProviderSchema } from '../src/actions/schema.ts';

// Electron consumes plain JSON; schema.ts remains the authoritative definition.
await writeFile(new URL('../electron/providers/actionReply.schema.json', import.meta.url), `${JSON.stringify(actionReplyProviderSchema, null, 2)}\n`);
