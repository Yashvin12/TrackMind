import { motion } from 'framer-motion'
import clsx from 'clsx'

interface Props {
  running: boolean
  onStart: () => void
  onReset: () => void
  isStarting: boolean
  isResetting: boolean
  simSpeed?: number
}

export function ControllerButtons({
  running,
  onStart,
  onReset,
  isStarting,
  isResetting,
  simSpeed = 10,
}: Props) {
  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-200 text-sm">Simulation Control</h2>
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'w-2 h-2 rounded-full',
              running ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
            )}
          />
          <span className="text-xs text-slate-400">{running ? 'Running' : 'Stopped'}</span>
        </div>
      </div>

      <div className="bg-slate-800/60 rounded-lg px-4 py-2 flex items-center justify-between text-xs">
        <span className="text-slate-400">Speed</span>
        <span className="font-mono font-bold text-indigo-400">{simSpeed}× real-time</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <motion.button
          className={clsx(
            'btn-primary flex items-center justify-center gap-2',
            running && 'opacity-50 cursor-not-allowed'
          )}
          disabled={running || isStarting}
          onClick={onStart}
          whileTap={{ scale: 0.97 }}
        >
          {isStarting ? (
            <>
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Starting…
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M3 3.732a1.5 1.5 0 0 1 2.305-1.265l6.706 4.268a1.5 1.5 0 0 1 0 2.53l-6.706 4.268A1.5 1.5 0 0 1 3 12.268V3.732z" />
              </svg>
              Start Sim
            </>
          )}
        </motion.button>

        <motion.button
          className="btn-secondary flex items-center justify-center gap-2"
          disabled={isResetting}
          onClick={onReset}
          whileTap={{ scale: 0.97 }}
        >
          {isResetting ? (
            <>
              <span className="w-4 h-4 border-2 border-slate-400/40 border-t-slate-200 rounded-full animate-spin" />
              Resetting…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M13.5 3.5C12 1.5 9.5 0.5 7 1A7 7 0 1 0 14 8" strokeLinecap="round" />
                <path d="M14 2v4h-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Reset
            </>
          )}
        </motion.button>
      </div>

      <button
        className="btn-danger flex items-center justify-center gap-2 text-sm"
        onClick={() => {
          // Demo: inject loco failure
        }}
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <path d="M7.938 2.016A.13.13 0 0 1 8.002 2a.13.13 0 0 1 .063.016.146.146 0 0 1 .054.057l6.857 11.667c.036.06.035.124.002.183a.163.163 0 0 1-.054.06.116.116 0 0 1-.066.017H1.146a.115.115 0 0 1-.066-.017.163.163 0 0 1-.054-.06.176.176 0 0 1 .002-.183L7.884 2.073a.147.147 0 0 1 .054-.057zm1.044-.45a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566z" />
          <path d="M7.002 12a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 5.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995z" />
        </svg>
        Inject Loco Failure
      </button>
    </div>
  )
}
