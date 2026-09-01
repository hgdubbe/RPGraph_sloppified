import { describe, expect, it } from 'vitest';
import { roleplayWindowOpenHandlerResponse } from './windowOpenPolicy.cjs';

describe('window open policy', () => {
  it('allows the roleplay pop-out as an independent window', () => {
    expect(roleplayWindowOpenHandlerResponse({
      url: 'about:blank',
      frameName: 'rpgraph-roleplay-popout',
    })).toMatchObject({
      action: 'allow',
      outlivesOpener: true,
      overrideBrowserWindowOptions: {
        show: true,
        frame: true,
        backgroundColor: '#131b28',
      },
    });
  });

  it('denies ordinary window.open calls', () => {
    expect(roleplayWindowOpenHandlerResponse({
      url: 'https://example.com',
      frameName: 'anything',
    })).toEqual({ action: 'deny' });
  });
});
