/**
 * ControllerButtons — Simulation Control Panel
 * ============================================
 * Start / Pause / Resume / Reset controls with train-level Hold/Release actions.
 */

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { simulationAPI } from '../services/api'
import { Train } from '../types/train'
import { TRAIN_TYPE_COLORS } from '../types/train'
import { useStore } from '../store/index'

interface Props {
  trains: Record<string, Train>
  simulationRunning: boolean
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onReset: () => void
}

// ── Hold/Release row ───────────────────────────────────────────────────────────
function TrainControlRow({ train }: { train: Train }) {
  const addAuditLog = useStore((s) => s.addAuditLog)
  const color = TRAIN_TYPE_COLORS[train.type] ?? '#94a3b8'

  const holdMutation = useMutation({
    mutationFn: () => simulationAPI.holdTrain(train.id).then((r) => r.data),
    onSuccess: () => {
      addAuditLog({
        id: `al_${Date.now()}`,
        timestamp: new Date().toISOString(),
        event_type: 'train_held',
        train_ids: [train.id],
        section_id: train.current_location,
        controller_id: 'CTR-01',
        system_version: '2.0.0',
      })
    },
  })

  const releaseMutation = useMutation({
    mutationFn: () => simulationAPI.releaseTrain(train.id).then((r) => r.data),
    onSuccess: () => {
      addAuditLog({
        id: `al_${Date.now()}`,
        timestamp: new Date().toISOString(),
        event_type: 'train_released',
        train_ids: [train.id],
        section_id: train.current_location,
        controller_id: 'CTR-01',
        system_version: '2.0.0',
      })
    },
  })

  const isHeld = train.status === 'stopped' || train.status === 'dwelling'

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs"
      style={{ background: 'var(--surface-2)' }}
    >
      {/* Color strip */}
      <span className="w-1 h-6 rounded-full flex-shrink-0" style={{ background: color }} />

      {/* Train info */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {train.id}
        </div>
        <div className="truncate" style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
          {train.current_location} &bull; {train.speed_kmh.toFixed(0)}km/h
        </div>
      </div>

      {/* Delay badge */}
      {train.current_delay_min > 2 && (
        <span
          className="px-1.5 py-0.5 rounded flex-shrink-0"
          style={{
            background: 'var(--warning)18',
            color: 'var(--warning)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
          }}
        >
          +{train.current_delay_min.toFixed(0)}m
        </span>
      )}

      {/* Hold/Release */}
      <button
        onClick={() => isHeld ? releaseMutation.mutate() : holdMutation.mutate()}
        disabled={holdMutation.isPending || releaseMutation.isPending}
        className="px-2 py-1 rounded text-xs font-medium transition-all flex-shrink-0"
        style={{
          background: isHeld ? 'var(--success)18' : 'var(--warning)18',
          border: `1px solid ${isHeld ? 'var(--success)44' : 'var(--warning)44'}`,
          color: isHeld ? 'var(--success)' : 'var(--warning)',
          transitionDuration: 'var(--transition-hover)',
          opacity: (holdMutation.isPending || releaseMutation.isPending) ? 0.5 : 1,
        }}
      >
        {isHeld ? 'Release' : 'Hold'}
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ControllerButtons({
  trains,
  simulationRunning,
  onStart,
  onPause,
  onResume,
  onReset,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const trainList = Object.values(trains).slice(0, 10) // Show first 10

  return (
    <motion.div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <h2
            className="font-heading font-semibold text-sm"
            style={{ color: 'var(--text-primary)' }}
          >
            Control Panel
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Simulation & train controls
          </p>
        </div>
        {/* Sim status indicator */}
        <span
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded"
          style={{
            background: simulationRunning ? 'var(--success)18' : 'var(--surface-2)',
            border: `1px solid ${simulationRunning ? 'var(--success)44' : 'var(--border)'}`,
            color: simulationRunning ? 'var(--success)' : 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${simulationRunning ? 'animate-pulse' : ''}`}
            style={{ background: simulationRunning ? 'var(--success)' : 'var(--text-muted)' }}
          />
          {simulationRunning ? 'RUNNING' : 'PAUSED'}
        </span>
      </div>

      {/* Simulation controls */}
      <div
        className="grid grid-cols-2 gap-2 p-4 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        {!simulationRunning ? (
          <button
            id="ctrl-btn-start"
            onClick={onStart}
            className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              transitionDuration: 'var(--transition-hover)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M8 5v14l11-7z" />
            </svg>
            Start Simulation
          </button>
        ) : (
          <button
            id="ctrl-btn-pause"
            onClick={onPause}
            className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: 'var(--warning)18',
              border: '1px solid var(--warning)44',
              color: 'var(--warning)',
              transitionDuration: 'var(--transition-hover)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
            Pause
          </button>
        )}

        {simulationRunning && (
          <button
            id="ctrl-btn-resume"
            onClick={onResume}
            className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: 'var(--success)18',
              border: '1px solid var(--success)44',
              color: 'var(--success)',
              transitionDuration: 'var(--transition-hover)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M8 5v14l11-7z" />
            </svg>
            Resume
          </button>
        )}

        <button
          id="ctrl-btn-reset"
          onClick={onReset}
          className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs transition-all"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            transitionDuration: 'var(--transition-hover)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reset
        </button>
      </div>

      {/* Train controls */}
      {trainList.length > 0 && (
        <div className="flex flex-col">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-between px-4 py-2.5 text-xs w-full transition-all"
            style={{
              color: 'var(--text-muted)',
              borderBottom: expanded ? `1px solid var(--border)` : 'none',
              transitionDuration: 'var(--transition-hover)',
            }}
          >
            <span>Train Hold/Release ({trainList.length} active)</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="w-3.5 h-3.5 transition-transform"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transitionDuration: 'var(--transition-panel)' }}
            >
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-1.5 p-3 max-h-64 overflow-y-auto">
                {trainList.map((train) => (
                  <TrainControlRow key={train.id} train={train} />
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
  )
}
