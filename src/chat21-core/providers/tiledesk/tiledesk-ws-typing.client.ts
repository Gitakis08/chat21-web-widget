/**
 * Minimal browser WebSocket client for Tiledesk typing topics.
 * Protocol matches tiledesk-server websocket/pubsub.js.
 */

export function buildTiledeskWebSocketBaseUrl(apiUrl: string, wsUrl?: string): string {
  if (wsUrl) {
    return wsUrl.endsWith('/') ? wsUrl : `${wsUrl}/`;
  }
  const trimmed = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
  if (trimmed.startsWith('https://')) {
    return `${trimmed.replace(/^https:/, 'wss:')}/`;
  }
  if (trimmed.startsWith('http://')) {
    return `${trimmed.replace(/^http:/, 'ws:')}/`;
  }
  return `${trimmed}/`;
}

export function buildTypingTopic(projectId: string, requestId: string): string {
  return `/${projectId}/requests/${requestId}/typing`;
}

export function parseTypingTopic(topic: string): { projectId: string; requestId: string } | null {
  if (!topic || !topic.endsWith('/typing')) {
    return null;
  }
  const parts = topic.split('/').filter(Boolean);
  // [projectId, 'requests', requestId, 'typing']
  if (parts.length < 4 || parts[1] !== 'requests' || parts[3] !== 'typing') {
    return null;
  }
  return { projectId: parts[0], requestId: parts[2] };
}

export function mapTypingPayloadToBS(requestId: string, message: any, defaultWaitTime: number): any | null {
  if (!message || !message.uidUserTypingNow) {
    return null;
  }
  const uidUserTypingNow = String(message.uidUserTypingNow);
  if (uidUserTypingNow === 'system' || uidUserTypingNow.startsWith('bot_')) {
    return null;
  }
  const waitTime = message.waitTime != null ? Number(message.waitTime) : defaultWaitTime;
  return {
    uid: requestId,
    uidUserTypingNow,
    nameUserTypingNow: message.nameUserTypingNow || '',
    waitTime: !isNaN(waitTime) && waitTime > 0 ? waitTime : defaultWaitTime,
  };
}

export type TiledeskWsTypingMessageHandler = (topic: string, message: any) => void;

export class TiledeskWsTypingClient {
  private ws: WebSocket | null = null;
  private wsBaseUrl: string | null = null;
  private token: string | null = null;
  private subscribedTopic: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private onMessageHandler: TiledeskWsTypingMessageHandler | null = null;

  connect(wsBaseUrl: string, token: string, onMessage: TiledeskWsTypingMessageHandler): void {
    this.wsBaseUrl = wsBaseUrl;
    this.token = token;
    this.onMessageHandler = onMessage;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.openSocket();
  }

  subscribe(topic: string): void {
    this.subscribedTopic = topic;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscribe(topic);
    }
  }

  unsubscribe(topic?: string): void {
    const topicToUnsub = topic || this.subscribedTopic;
    if (topicToUnsub && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendUnsubscribe(topicToUnsub);
    }
    if (!topic || topic === this.subscribedTopic) {
      this.subscribedTopic = null;
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.subscribedTopic = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private openSocket(): void {
    if (!this.wsBaseUrl || !this.token) {
      return;
    }
    const authToken = this.token.startsWith('JWT ') ? this.token : `JWT ${this.token}`;
    const url = `${this.wsBaseUrl}?token=${encodeURIComponent(authToken)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      if (this.subscribedTopic) {
        this.sendSubscribe(this.subscribedTopic);
      }
    };

    this.ws.onmessage = (event) => this.handleMessage(event.data);

    this.ws.onclose = () => {
      this.ws = null;
      if (this.subscribedTopic && this.wsBaseUrl && this.token) {
        this.reconnectTimer = setTimeout(() => this.openSocket(), 3000);
      }
    };

    this.ws.onerror = () => {
      // onclose handles reconnect
    };
  }

  private handleMessage(raw: string): void {
    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }

    if (json.action === 'heartbeat') {
      const text = json?.payload?.message?.text;
      if (text === 'ping' && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          action: 'heartbeat',
          payload: { message: { text: 'pong' } },
        }));
      }
      return;
    }

    if (json.action !== 'publish' || !json.payload) {
      return;
    }

    const topic = json.payload.topic;
    const message = json.payload.message;
    if (!topic || !this.onMessageHandler) {
      return;
    }

    if (Array.isArray(message)) {
      message.forEach((item) => this.onMessageHandler(topic, item));
    } else {
      this.onMessageHandler(topic, message);
    }
  }

  private sendSubscribe(topic: string): void {
    this.ws.send(JSON.stringify({
      action: 'subscribe',
      payload: { topic },
    }));
  }

  private sendUnsubscribe(topic: string): void {
    this.ws.send(JSON.stringify({
      action: 'unsubscribe',
      payload: { topic },
    }));
  }
}
