export type WSMessageType = 'state_update' | 'conflict_alert' | 'recommendation_ready' | 'ping'

export interface WSMessage {
  type: WSMessageType
  payload: unknown
  timestamp: string
}

export class TrackMindWebSocket {
  private ws: WebSocket | null = null
  private url: string
  private reconnectDelay = 3000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private listeners: Map<WSMessageType | '*', Set<(msg: WSMessage) => void>> = new Map()
  public connected = false

  constructor(path = '/ws/live') {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    this.url = `${proto}://${window.location.host}${path}`
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      this.connected = true
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
    }

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: WSMessage = JSON.parse(event.data as string)
        this.emit(msg.type, msg)
        this.emit('*', msg)
      } catch {
        // Non-JSON frame — ignore
      }
    }

    this.ws.onerror = () => {
      this.connected = false
    }

    this.ws.onclose = () => {
      this.connected = false
      this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay)
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    this.ws?.close()
    this.connected = false
  }

  on(type: WSMessageType | '*', handler: (msg: WSMessage) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(handler)
    return () => this.listeners.get(type)?.delete(handler)
  }

  private emit(type: WSMessageType | '*', msg: WSMessage): void {
    this.listeners.get(type)?.forEach((h) => h(msg))
  }

  send(msg: WSMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }
}
