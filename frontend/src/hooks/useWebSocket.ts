import { useEffect, useRef, useState, useCallback } from 'react'
import { TrackMindWebSocket, WSMessage, WSMessageType, WSStatus } from '../services/websocket'

export function useWebSocket(path = '/ws/live') {
  const wsRef = useRef<TrackMindWebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState<WSStatus>('disconnected')
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null)

  useEffect(() => {
    const ws = new TrackMindWebSocket(path)
    wsRef.current = ws

    // React to every incoming message
    const offMsg = ws.on('*', (msg) => {
      setLastMessage(msg)
      setConnected(ws.connected)
    })

    // React to status changes (connected / reconnecting / disconnected)
    const offStatus = ws.onStatus((newStatus) => {
      setStatus(newStatus)
      setConnected(newStatus === 'connected')
    })

    ws.connect()

    return () => {
      offMsg()
      offStatus()
      ws.disconnect()
    }
  }, [path])

  const subscribe = useCallback(
    (type: WSMessageType | '*', handler: (msg: WSMessage) => void) => {
      return wsRef.current?.on(type, handler) ?? (() => {})
    },
    []
  )

  const send = useCallback((msg: WSMessage) => {
    wsRef.current?.send(msg)
  }, [])

  return { connected, status, lastMessage, subscribe, send }
}
