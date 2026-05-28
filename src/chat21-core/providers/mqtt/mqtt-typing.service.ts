import { Injectable } from '@angular/core';

import { TypingService } from '../abstract/typing.service';
import { LoggerService } from '../abstract/logger.service';
import { LoggerInstance } from '../logger/loggerInstance';
import { BehaviorSubject } from 'rxjs';
import { TIME_TYPING_MESSAGE } from '../../utils/constants';
import { getProjectIdSelectedConversation } from '../../utils/utils-message';
import { AppStorageService } from '../abstract/app-storage.service';
import {
  TiledeskWsTypingClient,
  buildTiledeskWebSocketBaseUrl,
  buildTypingTopic,
  mapTypingPayloadToBS,
  parseTypingTopic,
} from '../tiledesk/tiledesk-ws-typing.client';

// @Injectable({ providedIn: 'root' })
@Injectable()
export class MQTTTypingService extends TypingService {

  BSIsTyping: BehaviorSubject<any> = new BehaviorSubject<any>(null);
  BSSetTyping: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  private tenant: string;
  private serverBaseUrl: string;
  private wsUrl: string;
  private currentConversationId: string;
  private currentUserId: string;
  private subscribedTopic: string;
  private wsClient = new TiledeskWsTypingClient();
  private logger: LoggerService = LoggerInstance.getInstance();

  constructor(
    private appStorage: AppStorageService,
  ) {
    super();
  }

  initialize(tenant: string, serverBaseUrl?: string, wsUrl?: string) {
    this.tenant = tenant;
    this.serverBaseUrl = serverBaseUrl;
    this.wsUrl = wsUrl;
    this.logger.debug('[MQTT-TYPING] initialize tenant', this.tenant, 'serverBaseUrl', this.serverBaseUrl);
  }

  isTyping(idConversation: string, idCurrentUser: string, _isDirect?: boolean) {
    this.disconnectTyping();

    if (!idConversation || !idConversation.startsWith('support-group')) {
      return;
    }

    const projectId = getProjectIdSelectedConversation(idConversation) || this.getProjectIdFromStorage();
    if (!projectId || !this.serverBaseUrl) {
      this.logger.debug('[MQTT-TYPING] skip subscribe: missing projectId or serverBaseUrl');
      return;
    }

    const token = this.getTiledeskToken();
    if (!token) {
      this.logger.debug('[MQTT-TYPING] skip subscribe: missing tiledesk token');
      return;
    }

    this.currentConversationId = idConversation;
    this.currentUserId = idCurrentUser;
    this.subscribedTopic = buildTypingTopic(projectId, idConversation);

    const wsBaseUrl = buildTiledeskWebSocketBaseUrl(this.serverBaseUrl, this.wsUrl);
    this.wsClient.connect(wsBaseUrl, token, (topic, message) => this.onTypingWsMessage(topic, message));
    this.wsClient.subscribe(this.subscribedTopic);
    this.logger.debug('[MQTT-TYPING] subscribed to', this.subscribedTopic);
  }

  disconnectTyping(): void {
    if (this.subscribedTopic) {
      this.wsClient.unsubscribe(this.subscribedTopic);
    }
    this.wsClient.disconnect();
    this.subscribedTopic = null;
    this.currentConversationId = null;
    this.currentUserId = null;
    this.BSIsTyping.next(null);
  }

  setTyping(_idConversation: string, _message: string, _idUser: string, _userFullname: string) {
    // Outbound visitor typing is not handled on this MQTT typing service.
  }

  private onTypingWsMessage(topic: string, message: any): void {
    const parsed = parseTypingTopic(topic);
    if (!parsed || !this.currentConversationId) {
      return;
    }

    if (parsed.requestId !== this.currentConversationId) {
      return;
    }

    const payload = mapTypingPayloadToBS(parsed.requestId, message, TIME_TYPING_MESSAGE);
    if (!payload) {
      return;
    }

    if (this.currentUserId && payload.uidUserTypingNow === this.currentUserId) {
      return;
    }

    this.BSIsTyping.next(payload);
  }

  private getTiledeskToken(): string {
    return this.appStorage.getItem('tiledeskToken');
  }

  private getProjectIdFromStorage(): string {
    try {
      const attributes = this.appStorage.getItem('attributes');
      if (attributes) {
        const parsed = typeof attributes === 'string' ? JSON.parse(attributes) : attributes;
        return parsed?.projectId || parsed?.projectid || '';
      }
    } catch (e) {
      this.logger.error('[MQTT-TYPING] error reading projectId from storage', e);
    }
    return '';
  }
}
