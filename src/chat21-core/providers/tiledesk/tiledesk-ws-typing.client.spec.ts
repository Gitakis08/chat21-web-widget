import {
  buildTiledeskWebSocketBaseUrl,
  buildTypingTopic,
  mapTypingPayloadToBS,
  parseTypingTopic,
} from './tiledesk-ws-typing.client';
import { TIME_TYPING_MESSAGE } from '../../utils/constants';

describe('tiledesk-ws-typing.client helpers', () => {
  it('builds ws base url from http apiUrl without /api path', () => {
    expect(buildTiledeskWebSocketBaseUrl('http://localhost:3000/')).toBe('ws://localhost:3000/');
    expect(buildTiledeskWebSocketBaseUrl('https://api.example.com')).toBe('wss://api.example.com/');
  });

  it('maps relative /api apiUrl to /ws websocket base url', () => {
    expect(buildTiledeskWebSocketBaseUrl('/api')).toBe('/ws/');
    expect(buildTiledeskWebSocketBaseUrl('/api/')).toBe('/ws/');
  });

  it('maps absolute /api apiUrl to /ws websocket base url', () => {
    expect(buildTiledeskWebSocketBaseUrl('http://localhost:3000/api')).toBe('ws://localhost:3000/ws/');
    expect(buildTiledeskWebSocketBaseUrl('https://example.com/api/')).toBe('wss://example.com/ws/');
  });

  it('prefers explicit wsUrl over derived apiUrl', () => {
    expect(buildTiledeskWebSocketBaseUrl('http://localhost:3000/', 'wss://ws.example.com/ws')).toBe('wss://ws.example.com/ws/');
    expect(buildTiledeskWebSocketBaseUrl('/api', 'wss://ws.example.com/ws')).toBe('wss://ws.example.com/ws/');
  });

  it('builds and parses typing topics', () => {
    const topic = buildTypingTopic('6013ec749b32000045be650e', 'support-group-6013ec749b32000045be650e-abc');
    expect(topic).toBe('/6013ec749b32000045be650e/requests/support-group-6013ec749b32000045be650e-abc/typing');
    expect(parseTypingTopic(topic)).toEqual({
      projectId: '6013ec749b32000045be650e',
      requestId: 'support-group-6013ec749b32000045be650e-abc',
    });
  });

  it('maps server typing payload to BSIsTyping shape', () => {
    const mapped = mapTypingPayloadToBS('support-group-pid-rid', {
      uid: 'event-uuid',
      uidUserTypingNow: 'agent-1',
      nameUserTypingNow: 'Agent Name',
      waitTime: 4000,
    }, TIME_TYPING_MESSAGE);

    expect(mapped).toEqual({
      uid: 'support-group-pid-rid',
      uidUserTypingNow: 'agent-1',
      nameUserTypingNow: 'Agent Name',
      waitTime: 4000,
    });
  });

  it('filters bot and system typing writers', () => {
    expect(mapTypingPayloadToBS('rid', { uidUserTypingNow: 'bot_123' }, TIME_TYPING_MESSAGE)).toBeNull();
    expect(mapTypingPayloadToBS('rid', { uidUserTypingNow: 'system' }, TIME_TYPING_MESSAGE)).toBeNull();
  });
});
