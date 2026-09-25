import { describe, expect, it, vi } from 'vitest';
import { PanelHistory } from './panelHistory';

function initialHistory() {
  const history = new PanelHistory();
  history.write('panel.tab', 'chat');
  history.flush();
  return history;
}

describe('panel navigation history', () => {
  it('keeps mounted app state valid when an earlier visit has no value for it', () => {
    const history = initialHistory();
    history.write('panel.tab', 'phone');
    history.write('phone.ai.chats', {});
    history.flush();
    let chats: Record<string, string> = {};
    history.register('phone.ai.chats', (value) => { chats = value as typeof chats; });
    history.move(-1);
    expect(chats['player']).toBeUndefined();
    expect(chats).toEqual({});
    history.move(1);
    expect(chats).toEqual({});
  });

  it('still restores explicitly empty selections', () => {
    const history = initialHistory();
    history.write('phone.contact', undefined);
    history.flush();
    history.write('phone.contact', 'someone');
    history.flush();
    const restore = vi.fn();
    history.register('phone.contact', restore);
    history.move(-1);
    expect(restore).toHaveBeenCalledWith(undefined);
  });

  it('does not clear a mounted chat map when going back after a session reset', () => {
    const history = initialHistory();
    history.register('panel.tab', () => {});
    const restoreChats = vi.fn();
    history.register('phone.ai.chats', restoreChats);
    history.write('phone.ai.chats', {});
    history.flush();
    history.reset(true);
    history.write('panel.tab', 'phone');
    history.flush();
    history.move(-1);
    expect(history.values.get('panel.tab')).toBe('chat');
    expect(restoreChats).not.toHaveBeenCalled();
  });

  it('closes the image preview before navigating and preserves the forward branch', () => {
    const history = initialHistory();
    history.write('panel.tab', 'phone');
    history.flush();
    history.move(-1);
    const close = vi.fn();
    const unregister = history.registerOverlay(close);
    expect(history.move(1)).toBe(true);
    expect(close).not.toHaveBeenCalled();
    expect(history.values.get('panel.tab')).toBe('chat');
    expect(history.move(-1)).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    expect(history.values.get('panel.tab')).toBe('chat');
    unregister();
    history.move(1);
    expect(history.values.get('panel.tab')).toBe('phone');
  });

  it('dismisses only the topmost overlay, even with an empty history', () => {
    const history = initialHistory();
    const lower = vi.fn();
    const upper = vi.fn();
    const removeLower = history.registerOverlay(lower);
    const removeUpper = history.registerOverlay(upper);
    history.move(-1);
    expect(upper).toHaveBeenCalledOnce();
    expect(lower).not.toHaveBeenCalled();
    removeUpper();
    history.move(-1);
    expect(lower).toHaveBeenCalledOnce();
    removeLower();
    expect(history.move(-1)).toBe(false);
  });
  it('returns through apps, Phone and Chat, then goes forward again', () => {
    const history = initialHistory();
    history.write('panel.tab', 'phone');
    history.write('phone.screen', 'desktop');
    history.flush();
    history.write('phone.screen', 'fotogram');
    history.flush();
    history.write('panel.tab', 'events');
    history.flush();
    expect(history.move(-1)).toBe(true);
    expect(history.values.get('panel.tab')).toBe('phone');
    expect(history.values.get('phone.screen')).toBe('fotogram');
    history.move(-1);
    expect(history.values.get('phone.screen')).toBe('desktop');
    history.move(-1);
    expect(history.values.get('panel.tab')).toBe('chat');
    expect(history.move(-1)).toBe(false);
    history.move(1);
    history.move(1);
    expect(history.values.get('phone.screen')).toBe('fotogram');
    history.move(1);
    expect(history.values.get('panel.tab')).toBe('events');
    expect(history.move(1)).toBe(false);
  });

  it('groups a direct card link and its mounted app state into one visit', () => {
    const history = initialHistory();
    history.write('panel.tab', 'phone');
    history.write('panel.request', { postId: 'post-1' });
    history.write('phone.screen', 'fotogram');
    history.write('fotogram.comments', 'post-1');
    history.flush();
    history.move(-1);
    expect(history.values.get('panel.tab')).toBe('chat');
    history.move(1);
    expect(history.values.get('fotogram.comments')).toBe('post-1');
  });

  it('replaces the forward branch after a new destination', () => {
    const history = initialHistory();
    history.write('panel.tab', 'phone');
    history.flush();
    history.write('panel.tab', 'events');
    history.flush();
    history.move(-1);
    history.write('phone.screen', 'desktop');
    history.write('panel.tab', 'chat');
    history.flush();
    expect(history.move(1)).toBe(false);
  });

  it('does not record duplicate destinations or replay as new visits', () => {
    const history = initialHistory();
    history.register('panel.tab', (value) => history.write('panel.tab', value));
    history.write('panel.tab', 'phone');
    history.flush();
    history.write('panel.tab', 'phone');
    history.flush();
    history.move(-1);
    expect(history.values.get('panel.tab')).toBe('chat');
    expect(history.move(-1)).toBe(false);
    expect(history.move(1)).toBe(true);
  });

  it('does not add a visit for request bookkeeping without a screen change', () => {
    const history = initialHistory();
    history.write('panel.homeRequest', 0, false);
    history.flush();
    history.write('panel.homeRequest', 1, false);
    history.flush();
    expect(history.move(-1)).toBe(false);
  });

  it('retains unmounted app destinations and clears them for a new session', () => {
    const history = initialHistory();
    history.register('panel.tab', () => {});
    history.write('panel.tab', 'phone');
    history.write('phone.screen', 'fotogram');
    history.flush();
    history.write('panel.tab', 'events');
    history.flush();
    history.move(-1);
    expect(history.values.get('phone.screen')).toBe('fotogram');
    history.reset(true);
    expect(history.values.has('phone.screen')).toBe(false);
    expect(history.move(-1)).toBe(false);
    expect(history.move(1)).toBe(false);
  });
});
