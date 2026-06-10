import { useEffect, useRef, useState, useCallback } from 'react'
import { TrackMindWebSocket, WSMessage, WSMessageType } from '../services/websocket'

export function useWebSocket(path = '/ws/live') {
  const wsRef = useRef<TrackMindWebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null)

  useEffect(() => {
    const ws = new TrackMindWebSocket(path)
    wsRef.current = ws

    const off = ws.on('*', (msg) => {
      setLastMessage(msg)
      setConnected(ws.connected)
    })

    ws.connect()

    const pollConnected = setInterval(() => {
      setConnected(ws.connected)
    }, 1000)

    return () => {
      off()
      clearInterval(pollConnected)
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

  return { connected, lastMessage, subscribe, send }
}
