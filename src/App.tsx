import { useEffect, useMemo, useState } from 'react'
import BinMap from './BinMap'
import { fetchDetections, fetchBins, sendCommand as apiSendCommand, updateBin } from './api'

type DetectionDoc = {
  id: string
  binId: string
  itemClass: string
  category: string
  confidence: number
  timestamp: Date | null
  address?: string | null
}

type BinDoc = {
  id: string
  binId: string
  latitude?: number
  longitude?: number
  fillLevels?: number[] // Array of 3 sensor readings (paper, plastic, aluminium)
  address?: string | null
  updatedAt?: Date | null
  temperature?: number
  humidity?: number
  smokeLevel?: number
  fireAlert?: boolean
  inFireCooldown?: boolean
  isActive?: boolean
}

const emptyCategoryCounts: Record<string, number> = {
  paper: 0,
  plastic: 0,
  aluminium: 0,
}

const formatPercent = (value: number) => `${Math.min(Math.max(value, 0), 100)}%`

const App = () => {
  const [detections, setDetections] = useState<DetectionDoc[]>([])
  const [bins, setBins] = useState<BinDoc[]>([])
  const [selectedBin, setSelectedBin] = useState<string>('')
  const [isSendingCmd, setIsSendingCmd] = useState(false)
  const [actionMessage, setActionMessage] = useState<string>('')
  const [dataError, setDataError] = useState<string>('')

  // Fetch detection data from MongoDB
  useEffect(() => {
    const loadDetections = async () => {
      try {
        const data = await fetchDetections(200)
        setDetections(data as DetectionDoc[])
        setDataError('')
      } catch (error) {
        console.error('Failed to fetch detections:', error)
        setDataError('Failed to load detections from database')
      }
    }
    
    loadDetections()
    
    // Poll for updates every 10 seconds
    const interval = setInterval(loadDetections, 10000)
    return () => clearInterval(interval)
  }, [])

  // Fetch bin metadata from MongoDB
  useEffect(() => {
    const loadBins = async () => {
      try {
        const data = await fetchBins()
        setBins(data as BinDoc[])
        setDataError('')
      } catch (error) {
        console.error('Failed to fetch bins:', error)
        setDataError('Failed to load bin data from database')
      }
    }
    
    loadBins()
    
    // Poll for updates every 5 seconds
    const interval = setInterval(loadBins, 5000)
    return () => clearInterval(interval)
  }, [])

  // Select a bin by default when data arrives
  useEffect(() => {
    if (selectedBin) return
    const firstBin = bins[0]?.binId || detections[0]?.binId
    if (firstBin) setSelectedBin(firstBin)
  }, [bins, detections, selectedBin])

  // Combine binIds from metadata and detections to keep selector populated
  const binOptions = useMemo(() => {
    const ids = new Set<string>()
    bins.forEach(b => ids.add(b.binId))
    detections.forEach(d => ids.add(d.binId))
    return Array.from(ids).sort()
  }, [bins, detections])

  const selectedBinMeta = useMemo(() => bins.find(b => b.binId === selectedBin), [bins, selectedBin])

  const binDetections = useMemo(
    () => detections.filter(d => d.binId === selectedBin),
    [detections, selectedBin],
  )

  const now = Date.now()
  const last24hDetections = useMemo(
    () => detections.filter(d => d.timestamp && now - d.timestamp.getTime() <= 24 * 60 * 60 * 1000),
    [detections, now],
  )

  const last24hBinDetections = useMemo(
    () => binDetections.filter(d => d.timestamp && now - d.timestamp.getTime() <= 24 * 60 * 60 * 1000),
    [binDetections, now],
  )

  const categoryCounts = useMemo(() => {
    const counts = { ...emptyCategoryCounts }
    binDetections.forEach(d => {
      const key = (d.category || 'general') as keyof typeof counts
      counts[key] = (counts[key] || 0) + 1
    })
    return counts
  }, [binDetections])

  const overallCategoryCounts = useMemo(() => {
    const counts = { ...emptyCategoryCounts }
    detections.forEach(d => {
      const key = (d.category || 'general') as keyof typeof counts
      counts[key] = (counts[key] || 0) + 1
    })
    return counts
  }, [detections])

  const topItems = useMemo(() => {
    const map = new Map<string, number>()
    binDetections.forEach(d => map.set(d.itemClass, (map.get(d.itemClass) || 0) + 1))
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [binDetections])

  const topBins = useMemo(() => {
    const map = new Map<string, number>()
    detections.forEach(d => map.set(d.binId, (map.get(d.binId) || 0) + 1))
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
  }, [detections])

  const fillLevels = useMemo(() => {
    // Get individual sensor readings or default to [0, 0, 0]
    return (selectedBinMeta?.fillLevels || [0, 0, 0]).slice(0, 3)
  }, [selectedBinMeta])

  const avgFillLevel = useMemo(() => {
    const levels = fillLevels.filter(level => typeof level === 'number')
    if (levels.length === 0) return 0
    return Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length)
  }, [fillLevels])

  const lastEvent = binDetections[0]

  const sendCommand = async (action: string) => {
    if (!selectedBin) return
    setIsSendingCmd(true)
    setActionMessage('')
    try {
      // Send command to MongoDB via API
      await apiSendCommand({ binId: selectedBin, action })
      
      // If resetting alarm, update fireAlert to false via API
      if (action === 'reset-alarm') {
        await updateBin(selectedBin, { fireAlert: false })
        // Update local state immediately for UI feedback
        setBins(prevBins =>
          prevBins.map(bin =>
            bin.binId === selectedBin ? { ...bin, fireAlert: false } : bin
          )
        )
      }
      
      // If marking emptied, update fill levels via API
      if (action === 'mark-emptied') {
        await updateBin(selectedBin, { fillLevels: [0, 0, 0] })
        // Update local state immediately for UI feedback
        setBins(prevBins =>
          prevBins.map(bin =>
            bin.binId === selectedBin ? { ...bin, fillLevels: [0, 0, 0] } : bin
          )
        )
      }
      
      setActionMessage(`${action} command queued for ${selectedBin}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send command'
      setActionMessage(message)
    } finally {
      setIsSendingCmd(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 text-slate-900">
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8 space-y-6 sm:space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-3xl">♻️</span>
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-blue-600">Smart Bin Management</p>
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
                    Dashboard
                  </h1>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full bg-blue-100 text-blue-700 px-4 py-2 border border-blue-300 whitespace-nowrap">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                </span>
                <span className="text-xs sm:text-sm font-semibold">Live</span>
              </div>
              <select
                className="rounded-lg border border-blue-300 px-3 py-2 text-sm shadow-sm focus:border-blue-600 focus:ring-2 focus:ring-blue-200 bg-white text-slate-900"
                value={selectedBin}
                onChange={e => setSelectedBin(e.target.value)}
              >
                <option value="" disabled>
                  Select a bin
                </option>
                {binOptions.map(id => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fire Alert Banner */}
          {selectedBinMeta?.fireAlert && (
            <div className="bg-red-600 border-2 border-red-700 rounded-xl px-4 py-3 animate-pulse shadow-lg">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🔥</span>
                <div className="flex-1">
                  <p className="text-white font-bold text-lg">FIRE ALERT DETECTED!</p>
                  <p className="text-red-100 text-sm">
                    Smoke/Heat detected in {selectedBin} - Temperature: 55°C
                  </p>
                </div>
                <button
                  onClick={() => sendCommand('reset-alarm')}
                  className="bg-white text-red-600 px-4 py-2 rounded-lg font-semibold hover:bg-red-50 transition text-sm"
                >
                  Reset Alarm
                </button>
              </div>
            </div>
          )}

          {dataError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs sm:text-sm text-red-700 font-semibold">{dataError}</div>}

          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
            <StatCard label="Detections (24h)" value={last24hDetections.length.toString()} accent="from-blue-400 to-blue-600" />
            <StatCard label="Bins monitored" value={binOptions.length.toString()} accent="from-cyan-400 to-cyan-600" />
            <StatCard
              label="Selected bin"
              value={selectedBin || 'Pick bin'}
              accent="from-blue-300 to-blue-500"
            />
            <StatCard label="Avg. fill" value={formatPercent(avgFillLevel)} accent="from-blue-500 to-blue-700" />
          </div>
        </header>

        {/* Map Section */}
        <section className="bg-white rounded-xl shadow-md border border-blue-200 overflow-hidden">
          <BinMap bins={bins} selectedBin={selectedBin} />
        </section>

        {/* Main content grid */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left column: bin details and detections */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            {/* Bin metrics */}
            <div className="bg-white rounded-xl shadow-md border border-blue-200 p-4 sm:p-5 space-y-4">
              <div className="border-b border-blue-100 pb-4">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">{selectedBin || 'No bin selected'}</h2>
                {selectedBinMeta?.address && (
                  <p className="text-xs text-slate-600 mt-1">📍 {selectedBinMeta.address}</p>
                )}
              </div>

              {/* 3 Individual Sensor Readings */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-blue-700">Fill Levels</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {fillLevels.map((level, index) => {
                    const recycleTypes = [
                      { name: 'Paper', icon: '📄' },
                      { name: 'Plastic', icon: '🪣' },
                      { name: 'Aluminium', icon: '🥫' }
                    ]
                    const recycleType = recycleTypes[index]
                    const fillValue = typeof level === 'number' ? Math.min(Math.max(level, 0), 100) : 0
                    const isFull = fillValue >= 50
                    const colorClass = isFull ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'
                    const textClass = isFull ? 'text-red-700' : 'text-blue-700'
                    const barClass = isFull ? 'from-red-400 to-red-600' : 'from-blue-400 to-blue-600'
                    
                    return (
                      <div key={index} className={`rounded-lg border ${colorClass} p-4 shadow-sm`}>
                        <p className={`text-xs font-semibold ${textClass}`}>{recycleType.icon} {recycleType.name}</p>
                        <div className="flex items-end justify-between mt-3">
                          <span className={`text-2xl font-bold ${textClass.replace('700', '900')}`}>{fillValue}%</span>
                          <span className="text-lg">{isFull ? '🔴' : '🟢'}</span>
                        </div>
                        <div className="mt-3 h-2 w-full rounded-full bg-white/50 overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${barClass} transition-all duration-500`}
                            style={{ width: `${fillValue}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Environmental Sensors */}
              <div className="space-y-3 border-t border-blue-100 pt-4">
                <p className="text-xs font-semibold text-blue-700">Environmental Data</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
                    <p className="text-xs font-semibold text-blue-700">🌡️ Temperature</p>
                    <div className="flex items-end justify-between mt-2">
                      <span className="text-2xl font-bold text-slate-900">
                        {selectedBinMeta?.temperature?.toFixed(1) || '--'}°C
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
                    <p className="text-xs font-semibold text-blue-700">💧 Humidity</p>
                    <div className="flex items-end justify-between mt-2">
                      <span className="text-2xl font-bold text-slate-900">
                        {selectedBinMeta?.humidity?.toFixed(1) || '--'}%
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
                    <p className="text-xs font-semibold text-blue-700">💨 Smoke</p>
                    <div className="flex items-end justify-between mt-2">
                      <span className="text-2xl font-bold text-slate-900">
                        {selectedBinMeta?.smokeLevel || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-blue-100 pt-4">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
                  <p className="text-xs font-semibold text-blue-700">Last Detection</p>
                  {lastEvent ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm sm:text-base font-semibold text-slate-900 truncate">
                        {lastEvent.itemClass}
                      </p>
                      <p className="text-xs text-blue-600 font-semibold">{lastEvent.confidence}% confidence</p>
                      <p className="text-[11px] sm:text-xs text-slate-600">{lastEvent.timestamp?.toLocaleString?.() || 'pending'}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-600">No events yet for this bin.</p>
                  )}
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
                  <p className="text-xs font-semibold text-blue-700">Bin Status</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${selectedBinMeta?.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {selectedBinMeta?.isActive ? '🟢 ACTIVE' : '⚪ IDLE'}
                    </span>
                  </div>
                  <p className="text-xs text-blue-600 font-semibold mt-2">{last24hBinDetections.length} detections today</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-blue-100 pt-4">
                <CategoryCard title="Category mix (bin)" counts={categoryCounts} />
                <CategoryCard title="Category mix (all bins)" counts={overallCategoryCounts} />
              </div>
            </div>

            {/* Recent detections */}
            <div className="bg-white rounded-xl shadow-md border border-blue-200 p-4 sm:p-5 space-y-3">
              <div>
                <p className="text-xs font-semibold text-blue-700">Activity Log</p>
                <h3 className="text-lg sm:text-base font-bold text-slate-900">Recent Detections</h3>
              </div>
              <div className="max-h-64 sm:max-h-80 overflow-y-auto border border-blue-200 rounded-lg divide-y divide-blue-100 bg-blue-50">
                {binDetections.slice(0, 50).map(d => (
                  <div key={d.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 px-3 py-3 hover:bg-blue-100 transition">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{d.itemClass}</p>
                      <p className="text-[10px] text-slate-600">{d.timestamp?.toLocaleString?.() || 'pending'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-200 px-2 py-1 rounded-full whitespace-nowrap">
                        {d.category || 'general'}
                      </span>
                      <span className="text-xs font-semibold text-blue-600">{d.confidence}%</span>
                    </div>
                  </div>
                ))}
                {!binDetections.length && (
                  <div className="px-3 py-4 text-xs text-slate-600">No detections yet for this bin.</div>
                )}
              </div>
            </div>
          </div>

          {/* Right column: controls and insights */}
          <div className="space-y-4 sm:space-y-6">
            {/* Remote controls */}
            <div className="bg-white rounded-xl shadow-md border border-blue-200 p-4 sm:p-5 space-y-4">
              <div>
                <p className="text-xs font-semibold text-blue-700">Actions</p>
                <h3 className="text-lg sm:text-base font-bold text-slate-900">Remote Control</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
                <ActionButton
                  label="Reset"
                  description="Reset alarm"
                  accent="from-red-400 to-red-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('reset-alarm')}
                />
                <ActionButton
                  label="Empty"
                  description="Mark emptied"
                  accent="from-green-400 to-green-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('mark-emptied')}
                />
                <ActionButton
                  label="Test Paper"
                  description="Paper servo"
                  accent="from-blue-400 to-blue-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('test-servo-paper')}
                />
                <ActionButton
                  label="Test Plastic"
                  description="Plastic servo"
                  accent="from-yellow-400 to-yellow-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('test-servo-plastic')}
                />
                <ActionButton
                  label="Test Metal"
                  description="Metal servo"
                  accent="from-gray-400 to-gray-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('test-servo-aluminium')}
                />
                <ActionButton
                  label="Maintain"
                  description="Maintenance"
                  accent="from-orange-400 to-orange-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('maintenance-mode')}
                />
              </div>
              {actionMessage && <p className="text-xs sm:text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg border border-green-200">{actionMessage}</p>}
            </div>

            {/* Top items */}
            <div className="bg-white rounded-xl shadow-md border border-blue-200 p-4 sm:p-5 space-y-3">
              <div>
                <p className="text-xs font-semibold text-blue-700">Insights</p>
                <h3 className="text-lg sm:text-base font-bold text-slate-900">Top Items</h3>
              </div>
              <div className="space-y-2">
                {topItems.length ? (
                  topItems.map(([item, count]) => (
                    <div key={item} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-blue-50">
                      <span className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{item}</span>
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-200 px-2 py-1 rounded-full whitespace-nowrap">{count}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-600">No items logged yet.</p>
                )}
              </div>
            </div>

            {/* Network overview */}
            <div className="bg-white rounded-xl shadow-md border border-blue-200 p-4 sm:p-5 space-y-3">
              <div>
                <p className="text-xs font-semibold text-blue-700">Network</p>
                <h3 className="text-lg sm:text-base font-bold text-slate-900">Active Bins</h3>
              </div>
              <div className="space-y-3">
                {topBins.length ? (
                  topBins.map(([binId, count]) => (
                    <div key={binId} className="space-y-1 p-2 rounded-lg hover:bg-blue-50">
                      <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-900 gap-2">
                        <span className="truncate">{binId}</span>
                        <span className="whitespace-nowrap text-blue-600">{count}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-blue-100 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-400 to-blue-600"
                          style={{ width: `${Math.min(100, (count / Math.max(...topBins.map(b => b[1]), 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-600">No data yet.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

const StatCard = ({ label, value, accent }: { label: string; value: string; accent: string }) => (
  <div className="rounded-lg sm:rounded-lg bg-white border border-blue-200 shadow-md p-3 sm:p-4">
    <p className="text-[10px] sm:text-xs font-semibold text-blue-600">{label}</p>
    <div className="mt-2 flex items-end justify-between gap-2">
      <span className="text-lg sm:text-2xl font-bold text-slate-900 truncate">{value}</span>
      <span className={`h-2 w-12 sm:w-16 rounded-full bg-gradient-to-r ${accent} flex-shrink-0`}></span>
    </div>
  </div>
)

const CategoryCard = ({ title, counts }: { title: string; counts: Record<string, number> }) => {
  const total = Object.values(counts).reduce((acc, v) => acc + v, 0)
  const entries = [
    { key: 'paper', color: 'from-blue-300 to-blue-500', label: 'Paper', icon: '📄' },
    { key: 'plastic', color: 'from-amber-300 to-amber-500', label: 'Plastic', icon: '🪣' },
    { key: 'aluminium', color: 'from-gray-300 to-gray-500', label: 'Aluminium', icon: '🥫' },
  ]

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 sm:p-4 shadow-sm">
      <p className="text-xs font-semibold text-blue-700">{title}</p>
      <div className="mt-3 space-y-2">
        {entries.map(entry => {
          const value = counts[entry.key] || 0
          const pct = total ? Math.round((value / total) * 100) : 0
          return (
            <div key={entry.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-800 gap-2">
                <span className="font-semibold truncate">{entry.icon} {entry.label}</span>
                <span className="text-[10px] font-semibold text-slate-600 whitespace-nowrap">{pct}% ({value})</span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/50 overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${entry.color} transition-all duration-300`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
        {!total && <p className="text-xs text-slate-600">No category data yet.</p>}
      </div>
    </div>
  )
}

const ActionButton = ({
  label,
  description,
  accent,
  disabled,
  onClick,
}: {
  label: string
  description: string
  accent: string
  disabled?: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`text-left rounded-lg sm:rounded-lg border border-blue-200 px-2 sm:px-4 py-2 sm:py-3 shadow-sm transition text-[11px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-300 ${
      disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white hover:-translate-y-0.5 hover:shadow-md'
    }`}
  >
    <span className={`inline-flex items-center rounded-full bg-gradient-to-r ${accent} text-white text-[9px] sm:text-xs font-semibold px-2 py-0.5 sm:px-2 sm:py-1`}>{label}</span>
    <p className="mt-1 sm:mt-2 text-[9px] sm:text-xs text-slate-700">{description}</p>
  </button>
)

export default App
