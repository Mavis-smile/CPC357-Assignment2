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

  // Removed unused overallCategoryCounts

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

  // Removed unused lastEvent

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-pink-50 to-green-50 text-slate-900">
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8 space-y-6 sm:space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-blue-500 to-pink-500 rounded-2xl p-3 shadow-lg">
                  <span className="text-4xl">♻️</span>
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-pink-600">Smart Bin Management</p>
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 via-pink-600 to-green-600 bg-clip-text text-transparent">
                    Dashboard
                  </h1>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-green-100 to-green-200 text-green-700 px-4 py-2 border-2 border-green-300 whitespace-nowrap shadow-md">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-600"></span>
                </span>
                <span className="text-xs sm:text-sm font-bold">Live</span>
              </div>
              <select
                className="rounded-xl border-2 border-blue-300 px-4 py-2.5 text-sm shadow-lg focus:border-pink-500 focus:ring-2 focus:ring-pink-200 bg-white text-slate-900 font-semibold hover:shadow-xl transition-all"
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

          {dataError && <div className="bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-300 rounded-2xl px-4 py-3 text-xs sm:text-sm text-red-700 font-bold shadow-lg">{dataError}</div>}

          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="Detections (24h)" value={last24hDetections.length.toString()} accent="from-blue-400 via-blue-500 to-blue-600" icon="📊" />
            <StatCard label="Bins monitored" value={binOptions.length.toString()} accent="from-pink-400 via-pink-500 to-pink-600" icon="🗑️" />
            <StatCard
              label="Selected bin"
              value={selectedBin || 'Pick bin'}
              accent="from-green-400 via-green-500 to-green-600"
              icon="📍"
            />
            <StatCard label="Avg. fill" value={formatPercent(avgFillLevel)} accent="from-purple-400 via-purple-500 to-purple-600" icon="📈" />
          </div>
        </header>

        {/* Map Section */}
        <section className="bg-white rounded-2xl shadow-xl border-2 border-blue-200 overflow-hidden hover:shadow-2xl transition-shadow">
          <BinMap bins={bins} selectedBin={selectedBin} />
        </section>

        {/* Main content grid */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left column: bin details and detections */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            {/* Bin metrics */}
            <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl shadow-xl border-2 border-blue-300 p-5 sm:p-6 space-y-5 hover:shadow-2xl transition-shadow">
              <div className="border-b-2 border-pink-200 pb-4">
                <h2 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-pink-600 bg-clip-text text-transparent">{selectedBin || 'No bin selected'}</h2>
                {selectedBinMeta?.address && (
                  <p className="text-xs text-slate-700 mt-2 font-semibold">📍 {selectedBinMeta.address}</p>
                )}
              </div>

              {/* 3 Individual Sensor Readings */}
              <div className="space-y-4">
                <p className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-pink-600">📊 Fill Levels</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {fillLevels.map((level, index) => {
                    const recycleTypes = [
                      { name: 'Paper', icon: '📄', color: 'blue' },
                      { name: 'Plastic', icon: '🪣', color: 'pink' },
                      { name: 'Aluminium', icon: '🥫', color: 'green' }
                    ]
                    const recycleType = recycleTypes[index]
                    const fillValue = typeof level === 'number' ? Math.min(Math.max(level, 0), 100) : 0
                    const isFull = fillValue >= 50
                    const colorClass = isFull ? `border-red-300 bg-gradient-to-br from-red-50 to-red-100` : `border-${recycleType.color}-300 bg-gradient-to-br from-${recycleType.color}-50 to-${recycleType.color}-100`
                    const textClass = isFull ? 'text-red-700' : `text-${recycleType.color}-700`
                    const barClass = isFull ? 'from-red-400 via-red-500 to-red-600' : `from-${recycleType.color}-400 via-${recycleType.color}-500 to-${recycleType.color}-600`
                    
                    return (
                      <div key={index} className={`rounded-2xl border-2 ${colorClass} p-5 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1`}>
                        <p className={`text-sm font-bold ${textClass}`}>{recycleType.icon} {recycleType.name}</p>
                        <div className="flex items-end justify-between mt-4">
                          <span className={`text-3xl font-extrabold ${textClass.replace('700', '900')}`}>{fillValue}%</span>
                          <span className="text-2xl animate-pulse">{isFull ? '🔴' : '🟢'}</span>
                        </div>
                        <div className="mt-4 h-3 w-full rounded-full bg-white/70 overflow-hidden shadow-inner">
                          <div
                            className={`h-full bg-gradient-to-r ${barClass} transition-all duration-700 ease-out`}
                            style={{ width: `${fillValue}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Environmental Sensors */}
              <div className="space-y-4 border-t-2 border-green-200 pt-5">
                <p className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-blue-600">🌡️ Environmental Data</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-2xl border-2 border-pink-300 bg-gradient-to-br from-pink-50 to-pink-100 p-4 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-bold text-pink-700">🌡️ Temperature</p>
                    <div className="flex items-end justify-between mt-3">
                      <span className="text-3xl font-extrabold text-pink-900">
                        {selectedBinMeta?.temperature?.toFixed(1) || '--'}°C
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100 p-4 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-bold text-blue-700">💧 Humidity</p>
                    <div className="flex items-end justify-between mt-3">
                      <span className="text-3xl font-extrabold text-blue-900">
                        {selectedBinMeta?.humidity?.toFixed(1) || '--'}%
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border-2 border-green-300 bg-gradient-to-br from-green-50 to-green-100 p-4 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <p className="text-xs font-bold text-green-700">💨 Smoke</p>
                    <div className="flex items-end justify-between mt-3">
                      <span className="text-3xl font-extrabold text-green-900">
                        {selectedBinMeta?.smokeLevel || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bin Status */}
              <div className="border-t-2 border-pink-200 pt-5">
                <div className="rounded-2xl border-2 border-green-300 bg-gradient-to-br from-green-50 to-green-100 p-5 shadow-lg hover:shadow-xl transition-all">
                  <p className="text-sm font-bold text-green-700">🎯 Bin Status</p>
                  <div className="mt-4 flex items-center gap-3">
                    <span className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-bold shadow-md ${selectedBinMeta?.isActive ? 'bg-gradient-to-r from-green-400 to-green-500 text-white animate-pulse' : 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-700'}`}>
                      {selectedBinMeta?.isActive ? '🟢 ACTIVE' : '⚪ IDLE'}
                    </span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-green-200">
                    <p className="text-xs text-green-700 font-semibold">📊 Activity</p>
                    <p className="text-2xl font-bold text-green-900 mt-1">{last24hBinDetections.length} <span className="text-sm font-normal text-green-700">detections today</span></p>
                  </div>
                </div>
              </div>

              {/* Category Mix (bin only) */}
              <div className="border-t-2 border-blue-200 pt-5">
                <CategoryCard title="Category Distribution" counts={categoryCounts} />
              </div>
            </div>

            {/* Recent detections */}
            <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl shadow-xl border-2 border-blue-300 p-5 sm:p-6 space-y-4 hover:shadow-2xl transition-shadow">
              <div>
                <p className="text-xs font-bold text-blue-600">Activity Log</p>
                <h3 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">Recent Detections</h3>
              </div>
              <div className="max-h-64 sm:max-h-80 overflow-y-auto border-2 border-blue-200 rounded-2xl divide-y-2 divide-blue-100 bg-gradient-to-br from-blue-50 to-white shadow-inner">
                {binDetections.slice(0, 50).map(d => (
                  <div key={d.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-4 py-3 hover:bg-gradient-to-r hover:from-blue-100 hover:to-green-100 transition-all">
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="text-sm sm:text-base font-bold text-slate-900 truncate">{d.itemClass}</p>
                      <p className="text-[10px] text-slate-600 font-semibold">{d.timestamp?.toLocaleString?.() || 'pending'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-blue-700 bg-gradient-to-r from-blue-200 to-blue-300 px-3 py-1 rounded-full whitespace-nowrap shadow-sm">
                        {d.category || 'general'}
                      </span>
                      <span className="text-sm font-bold text-green-600 bg-green-100 px-2 py-1 rounded-lg">{d.confidence}%</span>
                    </div>
                  </div>
                ))}
                {!binDetections.length && (
                  <div className="px-4 py-6 text-sm text-slate-600 text-center font-semibold">No detections yet for this bin.</div>
                )}
              </div>
            </div>
          </div>

          {/* Right column: controls and insights */}
          <div className="space-y-4 sm:space-y-6">
            {/* Remote controls */}
            <div className="bg-gradient-to-br from-white to-green-50 rounded-2xl shadow-xl border-2 border-green-300 p-5 sm:p-6 space-y-4 hover:shadow-2xl transition-shadow">
              <div>
                <p className="text-xs font-bold text-green-600">Actions</p>
                <h3 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">Remote Control</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
                <ActionButton
                  label="Reset"
                  description="Reset alarm"
                  accent="from-red-400 via-red-500 to-red-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('reset-alarm')}
                />
                <ActionButton
                  label="Empty"
                  description="Mark emptied"
                  accent="from-green-400 via-green-500 to-green-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('mark-emptied')}
                />
                <ActionButton
                  label="Test Paper"
                  description="Paper servo"
                  accent="from-blue-400 via-blue-500 to-blue-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('test-servo-paper')}
                />
                <ActionButton
                  label="Test Plastic"
                  description="Plastic servo"
                  accent="from-pink-400 via-pink-500 to-pink-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('test-servo-plastic')}
                />
                <ActionButton
                  label="Test Metal"
                  description="Metal servo"
                  accent="from-gray-400 via-gray-500 to-gray-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('test-servo-aluminium')}
                />
                <ActionButton
                  label="Maintain"
                  description="Maintenance"
                  accent="from-orange-400 via-orange-500 to-orange-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('maintenance-mode')}
                />
              </div>
              {actionMessage && <p className="text-xs sm:text-sm text-green-700 bg-gradient-to-r from-green-50 to-green-100 px-4 py-3 rounded-2xl border-2 border-green-300 font-bold shadow-md">{actionMessage}</p>}
            </div>

            {/* Top items */}
            <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl shadow-xl border-2 border-blue-300 p-5 sm:p-6 space-y-4 hover:shadow-2xl transition-shadow">
              <div>
                <p className="text-xs font-bold text-blue-600">Insights</p>
                <h3 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-pink-600 bg-clip-text text-transparent">Top Items</h3>
              </div>
              <div className="space-y-2">
                {topItems.length ? (
                  topItems.map(([item, count]) => (
                    <div key={item} className="flex items-center justify-between gap-2 p-3 rounded-xl hover:bg-gradient-to-r hover:from-blue-100 hover:to-pink-100 transition-all hover:shadow-md">
                      <span className="text-sm sm:text-base font-bold text-slate-900 truncate">{item}</span>
                      <span className="text-xs font-bold text-blue-700 bg-gradient-to-r from-blue-200 to-blue-300 px-3 py-1 rounded-full whitespace-nowrap shadow-sm">{count}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-600 text-center py-4 font-semibold">No items logged yet.</p>
                )}
              </div>
            </div>

            {/* Network overview */}
            <div className="bg-gradient-to-br from-white to-green-50 rounded-2xl shadow-xl border-2 border-green-300 p-5 sm:p-6 space-y-4 hover:shadow-2xl transition-shadow">
              <div>
                <p className="text-xs font-bold text-green-600">Network</p>
                <h3 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">Active Bins</h3>
              </div>
              <div className="space-y-3">
                {topBins.length ? (
                  topBins.map(([binId, count]) => (
                    <div key={binId} className="space-y-2 p-3 rounded-xl hover:bg-gradient-to-r hover:from-green-100 hover:to-blue-100 transition-all hover:shadow-md">
                      <div className="flex items-center justify-between text-sm sm:text-base font-bold text-slate-900 gap-2">
                        <span className="truncate">{binId}</span>
                        <span className="whitespace-nowrap text-green-600 bg-green-100 px-2 py-1 rounded-lg text-sm">{count}</span>
                      </div>
                      <div className="h-3 w-full rounded-full bg-white/70 overflow-hidden shadow-inner">
                        <div
                          className="h-full bg-gradient-to-r from-green-400 via-green-500 to-green-600 transition-all duration-500"
                          style={{ width: `${Math.min(100, (count / Math.max(...topBins.map(b => b[1]), 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-600 text-center py-4 font-semibold">No data yet.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

const StatCard = ({ label, value, accent, icon }: { label: string; value: string; accent: string; icon?: string }) => (
  <div className="rounded-2xl bg-white border-2 border-blue-300 shadow-lg p-4 sm:p-5 hover:shadow-2xl hover:-translate-y-1 transition-all">
    <div className="flex items-center gap-2">
      {icon && <span className="text-lg">{icon}</span>}
      <p className="text-[10px] sm:text-xs font-bold text-blue-700">{label}</p>
    </div>
    <div className="mt-3 flex items-end justify-between gap-3">
      <span className="text-xl sm:text-3xl font-extrabold text-slate-900 truncate">{value}</span>
      <span className={`h-3 w-14 sm:w-20 rounded-full bg-gradient-to-r ${accent} flex-shrink-0 shadow-md`}></span>
    </div>
  </div>
)

const CategoryCard = ({ title, counts }: { title: string; counts: Record<string, number> }) => {
  const total = Object.values(counts).reduce((acc, v) => acc + v, 0)
  const entries = [
    { key: 'paper', color: 'from-blue-400 via-blue-500 to-blue-600', label: 'Paper', icon: '📄' },
    { key: 'plastic', color: 'from-pink-400 via-pink-500 to-pink-600', label: 'Plastic', icon: '🪣' },
    { key: 'aluminium', color: 'from-green-400 via-green-500 to-green-600', label: 'Aluminium', icon: '🥫' },
  ]

  return (
    <div className="rounded-2xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-pink-50 p-5 shadow-lg hover:shadow-xl transition-all">
      <p className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-pink-600">{title}</p>
      <div className="mt-4 space-y-3">
        {entries.map(entry => {
          const value = counts[entry.key] || 0
          const pct = total ? Math.round((value / total) * 100) : 0
          return (
            <div key={entry.key} className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-900 gap-2">
                <span className="font-bold truncate">{entry.icon} {entry.label}</span>
                <span className="text-xs font-bold text-slate-700 bg-white px-2 py-1 rounded-lg shadow-sm whitespace-nowrap">{pct}% ({value})</span>
              </div>
              <div className="h-3 w-full rounded-full bg-white/70 overflow-hidden shadow-inner">
                <div
                  className={`h-full bg-gradient-to-r ${entry.color} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
        {!total && <p className="text-sm text-slate-600 text-center py-4 font-semibold">No category data yet.</p>}
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
    className={`text-left rounded-2xl border-2 border-blue-300 px-3 sm:px-4 py-3 sm:py-4 shadow-lg transition-all text-[11px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-400 ${
      disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white hover:-translate-y-1 hover:shadow-2xl active:scale-95'
    }`}
  >
    <span className={`inline-flex items-center rounded-full bg-gradient-to-r ${accent} text-white text-[9px] sm:text-xs font-bold px-3 py-1 sm:px-3 sm:py-1.5 shadow-md`}>{label}</span>
    <p className="mt-2 sm:mt-3 text-[10px] sm:text-xs text-slate-700 font-semibold">{description}</p>
  </button>
)

export default App
