export type WSMessageType = 'state_update' | 'conflict_alert' | 'recommendation_ready' | 'ping'

export interface WSMessage {
  type: WSMessageType
  payload: unknown
  timestamp: string
}

export type WSStatus = 'connected' | 'reconnecting' | 'disconnected'

export class TrackMindWebSocket {
  private ws: WebSocket | null = null
  private url: string
  private reconnectDelay = 2000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private listeners: Map<WSMessageType | '*', Set<(msg: WSMessage) => void>> = new Map()
  private statusListeners: Set<(status: WSStatus) => void> = new Set()
  private _intentionalClose = false

  public connected = false
  public status: WSStatus = 'disconnected'

  constructor(path = '/ws/live') {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    this.url = `${proto}://${window.location.host}${path}`
  }

  connect(): void {
    // Prevent duplicate connections — guard both OPEN and CONNECTING states
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      return
    }

    this._intentionalClose = false

    // Tear down any old socket before creating a new one
    this._teardownSocket()

    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      this.connected = true
      this._setStatus('connected')
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
      // Status will be set by onclose which always fires after onerror
    }

    this.ws.onclose = () => {
      this.connected = false

      // If we called disconnect() intentionally, don't reconnect
      if (this._intentionalClose) {
        this._setStatus('disconnected')
        return
      }

      this._setStatus('reconnecting')
      this._scheduleReconnect()
    }
  }

  disconnect(): void {
    // Mark as intentional so onclose doesn't trigger reconnect
    this._intentionalClose = true

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this._teardownSocket()
    this.connected = false
    this._setStatus('disconnected')
  }

  on(type: WSMessageType | '*', handler: (msg: WSMessage) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(handler)
    return () => this.listeners.get(type)?.delete(handler)
  }

  /** Subscribe to status changes (connected / reconnecting / disconnected) */
  onStatus(handler: (status: WSStatus) => void): () => void {
    this.statusListeners.add(handler)
    return () => this.statusListeners.delete(handler)
  }

  private emit(type: WSMessageType | '*', msg: WSMessage): void {
    this.listeners.get(type)?.forEach((h) => h(msg))
  }

  private _setStatus(status: WSStatus): void {
    this.status = status
    this.statusListeners.forEach((h) => h(status))
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.reconnectDelay)
  }

  /** Remove event handlers from the old socket and close it */
  private _teardownSocket(): void {
    if (this.ws) {
      // Remove handlers to prevent ghost callbacks from the old socket
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onclose = null

      // Close if not already closed
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close()
      }
      this.ws = null
    }
  }

  send(msg: WSMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }
}
