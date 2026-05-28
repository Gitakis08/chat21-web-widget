import { TestBed } from '@angular/core/testing';

import { MQTTTypingService } from './mqtt-typing.service';
import { AppStorageService } from '../abstract/app-storage.service';
import { TiledeskWsTypingClient } from '../tiledesk/tiledesk-ws-typing.client';

describe('MQTTTypingService', () => {
  let service: MQTTTypingService;
  let appStorage: jasmine.SpyObj<AppStorageService>;
  let wsClient: jasmine.SpyObj<TiledeskWsTypingClient>;

  const serverBaseUrl = 'http://localhost:3000/';
  const supportConversation = 'support-group-6013ec749b32000045be650e-4904aee91f8b487aad117bcda860549d';
  const typingTopic = '/6013ec749b32000045be650e/requests/' + supportConversation + '/typing';

  beforeEach(() => {
    appStorage = jasmine.createSpyObj('AppStorageService', ['getItem']);
    appStorage.getItem.and.returnValue('test-token');
    wsClient = jasmine.createSpyObj('TiledeskWsTypingClient', ['connect', 'subscribe', 'unsubscribe', 'disconnect']);

    TestBed.configureTestingModule({
      providers: [
        MQTTTypingService,
        { provide: AppStorageService, useValue: appStorage },
      ],
    });

    service = TestBed.inject(MQTTTypingService);
    (service as any).wsClient = wsClient;
    service.initialize('tenant', serverBaseUrl);
  });

  it('subscribes to typing topic for support-group conversations', () => {
    service.isTyping(supportConversation, 'guest-1', false);

    expect(wsClient.connect).toHaveBeenCalled();
    expect(wsClient.subscribe).toHaveBeenCalledWith(typingTopic);
  });

  it('does not subscribe for non support-group conversations', () => {
    service.isTyping('direct-user-1', 'guest-1', true);
    expect(wsClient.connect).not.toHaveBeenCalled();
  });

  it('disconnectTyping unsubscribes and clears BSIsTyping', () => {
    service.isTyping(supportConversation, 'guest-1', false);
    let latest: any;
    service.BSIsTyping.subscribe((v) => latest = v);

    service.disconnectTyping();

    expect(wsClient.unsubscribe).toHaveBeenCalledWith(typingTopic);
    expect(wsClient.disconnect).toHaveBeenCalled();
    expect(latest).toBeNull();
  });

  it('publishes BSIsTyping when agent typing is received on the active topic', () => {
    service.isTyping(supportConversation, 'guest-1', false);
    const emissions: any[] = [];
    service.BSIsTyping.subscribe((v) => emissions.push(v));

    (service as any).onTypingWsMessage(typingTopic, {
      uid: 'random-event-id',
      uidUserTypingNow: 'agent-1',
      nameUserTypingNow: 'Agent',
      waitTime: 3500,
    });

    expect(emissions[emissions.length - 1]).toEqual({
      uid: supportConversation,
      uidUserTypingNow: 'agent-1',
      nameUserTypingNow: 'Agent',
      waitTime: 3500,
    });
  });

  it('ignores typing from the current widget user', () => {
    service.isTyping(supportConversation, 'guest-1', false);
    const emissions: any[] = [];
    service.BSIsTyping.subscribe((v) => v && emissions.push(v));

    (service as any).onTypingWsMessage(typingTopic, {
      uidUserTypingNow: 'guest-1',
      nameUserTypingNow: 'Guest',
      waitTime: 3000,
    });

    expect(emissions.length).toBe(0);
  });
});
