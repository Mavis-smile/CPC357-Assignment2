import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import BinMap from './BinMap'

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

const FIRE_SMOKE_THRESHOLD = 1300
const FIRE_TEMP_THRESHOLD = 55

const formatPercent = (value: number) => `${Math.min(Math.max(value, 0), 100)}%`

const App = () => {
  const [detections, setDetections] = useState<DetectionDoc[]>([])
  const [bins, setBins] = useState<BinDoc[]>([])
  const [selectedBin, setSelectedBin] = useState<string>('')
  const [isSendingCmd, setIsSendingCmd] = useState(false)
  const [actionMessage, setActionMessage] = useState<string>('')
  const [dataError, setDataError] = useState<string>('')

  // Subscribe to the latest detection events (global feed)
  useEffect(() => {
    const detectionsRef = collection(db, 'detections')
    const detectionsQuery = query(detectionsRef, orderBy('timestamp', 'desc'), limit(200))

    const unsub = onSnapshot(
      detectionsQuery,
      snapshot => {
        const rows = snapshot.docs.map(doc => {
          const data = doc.data()
          const ts: Date | null = data.timestamp?.toDate?.() || data.detectedAt?.toDate?.() || null
          return {
            id: doc.id,
            binId: data.binId || 'UNKNOWN',
            itemClass: data.itemClass || 'unknown',
            category: data.category || 'general',
            confidence: Math.round(data.confidence || 0),
            timestamp: ts,
            address: data.address || null,
          } as DetectionDoc
        })
        setDetections(rows)
      },
      err => setDataError(err.message),
    )

    return () => unsub()
  }, [])

  // Subscribe to bin metadata (location, fill estimates, etc.)
  useEffect(() => {
    const binsRef = collection(db, 'bins')
    const binsQuery = query(binsRef, orderBy('binId'))

    const unsub = onSnapshot(
      binsQuery,
      snapshot => {
        console.log('[App] Bins snapshot:', {
          docCount: snapshot.docs.length,
          docs: snapshot.docs.map(doc => ({
            id: doc.id,
            data: doc.data(),
          })),
        })
        
        const rows = snapshot.docs.map(doc => {
          const data = doc.data()
          const temperature = typeof data.temperature === 'number' ? data.temperature : undefined
          const humidity = typeof data.humidity === 'number' ? data.humidity : undefined
          const smokeLevel = typeof data.smokeLevel === 'number' ? data.smokeLevel : undefined
          const hasExplicitFire = typeof data.fireAlert === 'boolean'
          const inFireCooldown = Boolean(data.inFireCooldown)

          let fireAlert = false
          if (hasExplicitFire) {
            fireAlert = Boolean(data.fireAlert)
          } else if (smokeLevel !== undefined && temperature !== undefined) {
            fireAlert = smokeLevel >= FIRE_SMOKE_THRESHOLD && temperature >= FIRE_TEMP_THRESHOLD
          }

          if (inFireCooldown) {
            fireAlert = false
          }
          const bin = {
            id: doc.id,
            binId: data.binId || doc.id,
            latitude: typeof data.latitude === 'number' ? data.latitude : undefined,
            longitude: typeof data.longitude === 'number' ? data.longitude : undefined,
            fillLevels: Array.isArray(data.fillLevels) ? data.fillLevels.slice(0, 3) : [0, 0, 0],
            address: data.address || null,
            updatedAt: data.updatedAt?.toDate?.() || null,
            temperature,
            humidity,
            smokeLevel,
            fireAlert,
            inFireCooldown,
            isActive: Boolean(data.isActive),
          } as BinDoc
          
          console.log(`[App] Processing bin ${bin.binId}:`, {
            lat: bin.latitude,
            lng: bin.longitude,
            latType: typeof bin.latitude,
            lngType: typeof bin.longitude,
            rawLat: data.latitude,
            rawLng: data.longitude
          })
          return bin
        })
        
        console.log('[App] Final bins state:', rows)
        setBins(rows)
      },
      err => {
        console.error('[App] Firestore error:', err)
        setDataError(err.message)
      },
    )

    return () => unsub()
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
      await addDoc(collection(db, 'commands'), {
        binId: selectedBin,
        action,
        issuedAt: serverTimestamp(),
        status: 'pending',
      })
      // If resetting alarm, immediately update fireAlert to false in UI
      if (action === 'reset-alarm') {
        setBins(prevBins =>
          prevBins.map(bin =>
            bin.binId === selectedBin ? { ...bin, fireAlert: false } : bin
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
    <div className="min-h-screen bg-gradient-to-b from-eco-50 via-white to-recycle-50 text-slate-900">
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8 space-y-6 sm:space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <p className="text-xs sm:text-sm font-semibold text-eco-700">Smart Recycle Bin</p>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mt-1">
                Operations Dashboard
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-2">
                Monitor bin health, review detections, and dispatch remote controls before overflows occur.
              </p>
            </div>
            <div className="flex flex-col gap-4 items-start sm:items-end">
              <div className="flex items-center gap-2 sm:gap-3 rounded-full bg-eco-100 text-eco-800 px-3 py-2 border border-eco-200 whitespace-nowrap">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-eco-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-eco-500"></span>
                </span>
                <span className="text-xs sm:text-sm font-semibold">Live feed</span>
              </div>
              <select
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-eco-500 focus:ring-2 focus:ring-eco-200 bg-white"
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

          {dataError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs sm:text-sm text-red-700 font-semibold">{dataError}</div>}

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

          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
            <StatCard label="Detections (24h)" value={last24hDetections.length.toString()} accent="from-eco-400 to-eco-600" />
            <StatCard label="Bins monitored" value={binOptions.length.toString()} accent="from-recycle-400 to-recycle-600" />
            <StatCard
              label="Selected bin"
              value={selectedBin || 'Pick bin'}
              accent="from-amber-300 to-amber-500"
            />
            <StatCard label="Avg. fill" value={formatPercent(avgFillLevel)} accent="from-slate-400 to-slate-600" />
          </div>
        </header>

        {/* Map Section */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <BinMap bins={bins} selectedBin={selectedBin} />
        </section>

        {/* Main content grid */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left column: bin details and detections */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            {/* Bin metrics */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
              <div>
                <p className="text-xs font-semibold text-eco-700">Bin Status</p>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-1">{selectedBin || 'No bin selected'}</h2>
                {selectedBinMeta?.address && (
                  <p className="text-xs text-slate-600 mt-2">📍 {selectedBinMeta.address}</p>
                )}
              </div>

              {/* 3 Individual Sensor Readings */}
              <div className="col-span-full grid grid-cols-1 sm:grid-cols-3 gap-3">
                {fillLevels.map((level, index) => {
                  const recycleTypes = [
                    { name: 'Paper', icon: '📄' },
                    { name: 'Plastic', icon: '🪣' },
                    { name: 'Aluminium', icon: '🥫' }
                  ]
                  const recycleType = recycleTypes[index]
                  const fillValue = typeof level === 'number' ? Math.min(Math.max(level, 0), 100) : 0
                  const isFull = fillValue >= 50
                  const colorClass = isFull ? 'border-red-300 bg-red-50' : 'border-eco-200 bg-eco-50'
                  const textClass = isFull ? 'text-red-700' : 'text-eco-700'
                  const barClass = isFull ? 'from-red-400 to-red-600' : 'from-eco-400 to-eco-600'
                  
                  return (
                    <div key={index} className={`rounded-xl border ${colorClass} p-3 sm:p-4 shadow-sm`}>
                      <p className={`text-xs font-semibold ${textClass}`}>{recycleType.icon} {recycleType.name}</p>
                      <div className="flex items-end justify-between mt-2">
                        <span className={`text-xl sm:text-2xl font-bold ${textClass.replace('700', '900')}`}>{fillValue}%</span>
                        <span className="text-lg">{isFull ? '🔴' : '🟢'}</span>
                      </div>
                      <div className="mt-2 h-2 w-full rounded-full bg-white/50 overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${barClass} transition-all duration-500`}
                          style={{ width: `${fillValue}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Environmental Sensors */}
              <div className="col-span-full grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
                  <p className="text-xs font-semibold text-slate-700">🌡️ Temperature</p>
                  <div className="flex items-end justify-between mt-2">
                    <span className="text-xl sm:text-2xl font-bold text-slate-900">
                      {selectedBinMeta?.temperature?.toFixed(1) || '--'}°C
                    </span>
                    <span className="text-[10px] text-slate-600">DHT11</span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
                  <p className="text-xs font-semibold text-slate-700">💧 Humidity</p>
                  <div className="flex items-end justify-between mt-2">
                    <span className="text-xl sm:text-2xl font-bold text-slate-900">
                      {selectedBinMeta?.humidity?.toFixed(1) || '--'}%
                    </span>
                    <span className="text-[10px] text-slate-600">DHT11</span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
                  <p className="text-xs font-semibold text-slate-700">💨 Smoke Level</p>
                  <div className="flex items-end justify-between mt-2">
                    <span className="text-xl sm:text-2xl font-bold text-slate-900">
                      {selectedBinMeta?.smokeLevel || 0}
                    </span>
                    <span className="text-[10px] text-slate-600">Analog</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
                  <p className="text-xs font-semibold text-slate-700">Last detection</p>
                  {lastEvent ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm sm:text-base font-semibold text-slate-900 truncate">
                        {lastEvent.itemClass} • {lastEvent.confidence}%
                      </p>
                      <p className="text-[11px] sm:text-xs text-slate-600">{lastEvent.timestamp?.toLocaleString?.() || 'pending'}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-600">No events yet for this bin.</p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
                  <p className="text-xs font-semibold text-slate-700">Bin Activity</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${selectedBinMeta?.isActive ? 'bg-eco-100 text-eco-800' : 'bg-slate-100 text-slate-600'}`}>
                      {selectedBinMeta?.isActive ? '🟢 ACTIVE' : '⚪ IDLE'}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-600">PIR sensor status</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
                  <p className="text-xs font-semibold text-slate-700">Detections today</p>
                  <div className="mt-2 text-xl sm:text-2xl font-bold text-slate-900">{last24hBinDetections.length}</div>
                  <p className="text-[11px] sm:text-xs text-slate-600">{binDetections.length} total events</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CategoryCard title="Category mix (bin)" counts={categoryCounts} />
                <CategoryCard title="Category mix (all bins)" counts={overallCategoryCounts} />
              </div>
            </div>

            {/* Recent detections */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Recent detections</p>
                  <h3 className="text-lg sm:text-base font-bold text-slate-900">Latest from {selectedBin || 'bin'}</h3>
                </div>
                <span className="text-[11px] text-slate-500">Last 50 records</span>
              </div>
              <div className="max-h-64 sm:max-h-80 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100">
                {binDetections.slice(0, 50).map(d => (
                  <div key={d.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 px-3 py-2 hover:bg-slate-50">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{d.itemClass}</p>
                      <p className="text-[10px] text-slate-600">{d.timestamp?.toLocaleString?.() || 'pending'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-full whitespace-nowrap">
                        {d.category || 'general'}
                      </span>
                      <span className="text-xs font-semibold text-eco-800">{d.confidence}%</span>
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
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-700">Remote controls</p>
                <h3 className="text-lg sm:text-base font-bold text-slate-900">Act on this bin</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
                <ActionButton
                  label="Reset alarm"
                  description="Stop buzzer & LED"
                  accent="from-red-400 to-red-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('reset-alarm')}
                />
                <ActionButton
                  label="Mark emptied"
                  description="Reset fill levels"
                  accent="from-eco-400 to-eco-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('mark-emptied')}
                />
                <ActionButton
                  label="Test paper"
                  description="Right hole: R90° + Lid"
                  accent="from-recycle-400 to-recycle-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('test-servo-paper')}
                />
                <ActionButton
                  label="Test plastic"
                  description="Left hole: L90° + Lid"
                  accent="from-amber-400 to-amber-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('test-servo-plastic')}
                />
                <ActionButton
                  label="Test aluminium"
                  description="Middle hole: No rotate + Lid"
                  accent="from-blue-400 to-blue-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('test-servo-aluminium')}
                />
                <ActionButton
                  label="Maintenance"
                  description="Disable sensors"
                  accent="from-amber-400 to-amber-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('maintenance-mode')}
                />
              </div>
              {actionMessage && <p className="text-xs sm:text-sm text-eco-700 bg-eco-50 px-3 py-2 rounded-lg">{actionMessage}</p>}
            </div>

            {/* Top items */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">Bin insights</p>
                <h3 className="text-lg sm:text-base font-bold text-slate-900">Top items detected</h3>
              </div>
              <div className="space-y-2">
                {topItems.length ? (
                  topItems.map(([item, count]) => (
                    <div key={item} className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{item}</span>
                      <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-full whitespace-nowrap">{count}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-600">No items logged for this bin yet.</p>
                )}
              </div>
            </div>

            {/* Network overview */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">Network overview</p>
                <h3 className="text-lg sm:text-base font-bold text-slate-900">Most active bins</h3>
              </div>
              <div className="space-y-3">
                {topBins.length ? (
                  topBins.map(([binId, count]) => (
                    <div key={binId} className="space-y-1">
                      <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-900 gap-2">
                        <span className="truncate">{binId}</span>
                        <span className="whitespace-nowrap">{count}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-eco-400 to-recycle-500"
                          style={{ width: `${Math.min(100, count)}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-600">No detection data yet.</p>
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
  <div className="rounded-lg sm:rounded-2xl bg-white border border-slate-200 shadow-sm p-3 sm:p-4">
    <p className="text-[10px] sm:text-xs font-semibold text-slate-600">{label}</p>
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
    { key: 'plastic', color: 'from-red-300 to-red-500', label: 'Plastic', icon: '🪣' },
    { key: 'aluminium', color: 'from-gray-300 to-gray-500', label: 'Aluminium', icon: '🥫' },
  ]

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-700">{title}</p>
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
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
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
    className={`text-left rounded-lg sm:rounded-xl border border-slate-200 px-2 sm:px-4 py-2 sm:py-3 shadow-sm transition text-[11px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-eco-300 ${
      disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white hover:-translate-y-0.5 hover:shadow-md'
    }`}
  >
    <span className={`inline-flex items-center rounded-full bg-gradient-to-r ${accent} text-white text-[9px] sm:text-xs font-semibold px-2 py-0.5 sm:px-2 sm:py-1`}>{label}</span>
    <p className="mt-1 sm:mt-2 text-[9px] sm:text-xs text-slate-700">{description}</p>
  </button>
)

export default App
