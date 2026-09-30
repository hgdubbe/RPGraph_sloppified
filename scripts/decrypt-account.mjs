#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { decryptAccountArchive } from '../electron/accounts/accountArchive.cjs';

async function passwordFromStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 1026) throw new Error('Password input exceeds limit.');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  try { return bytes.toString('utf8').replace(/\r?\n$/, ''); }
  finally { bytes.fill(0); for (const chunk of chunks) chunk.fill(0); }
}

async function passwordFromTerminal() {
  if (!process.stdin.isTTY) throw new Error('Use --password-stdin for noninteractive input.');
  // Readline handles editing/paste; its output sink suppresses typed characters.
  const muted = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const input = createInterface({ input: process.stdin, output: muted, terminal: true });
  process.stderr.write('Account archive password: ');
  try {
    return await new Promise((resolve, reject) => {
      input.once('SIGINT', () => reject(new Error('Cancelled.')));
      input.once('close', () => reject(new Error('Password input closed.')));
      input.question('', resolve);
    });
  } finally { input.close(); process.stderr.write('\n'); }
}

async function main() {
  const args = process.argv.slice(2);
  const stdin = args[0] === '--password-stdin';
  if (stdin) args.shift();
  if (args.length !== 2 || args.some((arg) => arg.startsWith('--'))) {
    throw new Error('Usage: node scripts/decrypt-account.mjs [--password-stdin] SOURCE.zip DESTINATION.zip');
  }
  process.stderr.write('Decrypted output contains all account content and any saved credentials. The encrypted source is preserved.\n');
  const credentials = { password: stdin ? await passwordFromStdin() : await passwordFromTerminal() };
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('Cancelled.'));
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    await decryptAccountArchive({ source: args[0], destination: args[1], password: credentials.password, signal: controller.signal });
    process.stdout.write('Decrypted account archive created.\n');
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
    credentials.password = '';
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Account decryption failed.'}\n`);
  process.exitCode = 1;
});
