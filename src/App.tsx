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
  fillLevel?: number
  address?: string | null
  updatedAt?: Date | null
}

const emptyCategoryCounts: Record<string, number> = {
  recyclable: 0,
  organic: 0,
  paper: 0,
  general: 0,
}

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
          const bin = {
            id: doc.id,
            binId: data.binId || doc.id,
            latitude: data.latitude,
            longitude: data.longitude,
            fillLevel: data.fillLevel,
            address: data.address || null,
            updatedAt: data.updatedAt?.toDate?.() || null,
          } as BinDoc
          
          console.log(`[App] Processing bin ${bin.binId}:`, bin)
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

  const estimatedFill = useMemo(() => {
    // Prefer stored fillLevel if present, otherwise derive a soft estimate from recent activity
    if (selectedBinMeta?.fillLevel !== undefined) {
      return Math.round(selectedBinMeta.fillLevel)
    }
    const base = Math.min(100, Math.round((binDetections.length || 0) * 2.5))
    return base
  }, [selectedBinMeta, binDetections.length])

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
              <p className="text-xs sm:text-sm font-semibold text-eco-700">Smart Garbage Sorting</p>
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

          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
            <StatCard label="Detections (24h)" value={last24hDetections.length.toString()} accent="from-eco-400 to-eco-600" />
            <StatCard label="Bins monitored" value={binOptions.length.toString()} accent="from-recycle-400 to-recycle-600" />
            <StatCard
              label="Selected bin"
              value={selectedBin || 'Pick bin'}
              accent="from-amber-300 to-amber-500"
            />
            <StatCard label="Est. fill" value={formatPercent(estimatedFill)} accent="from-slate-400 to-slate-600" />
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-eco-200 bg-eco-50 p-3 sm:p-4 shadow-sm">
                  <p className="text-xs font-semibold text-eco-700">Fill estimate</p>
                  <div className="flex items-end justify-between mt-2">
                    <span className="text-xl sm:text-2xl font-bold text-eco-900">{formatPercent(estimatedFill)}</span>
                    <span className="text-[10px] text-eco-700">soft est.</span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-eco-100 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-eco-400 to-eco-600 transition-all duration-500"
                      style={{ width: formatPercent(estimatedFill) }}
                    />
                  </div>
                  {selectedBinMeta?.updatedAt && (
                    <p className="text-[10px] text-eco-800 mt-2">Updated {selectedBinMeta.updatedAt.toLocaleString()}</p>
                  )}
                </div>

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
                  label="Close lid"
                  description="Prevent overflow"
                  accent="from-eco-400 to-eco-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('close-lid')}
                />
                <ActionButton
                  label="Re-open"
                  description="Allow drop-off"
                  accent="from-recycle-400 to-recycle-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('open-lid')}
                />
                <ActionButton
                  label="Flag overflow"
                  description="Alert crew"
                  accent="from-amber-300 to-amber-500"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('flag-overflow')}
                />
                <ActionButton
                  label="Mark emptied"
                  description="Reset counter"
                  accent="from-slate-400 to-slate-600"
                  disabled={!selectedBin || isSendingCmd}
                  onClick={() => sendCommand('mark-emptied')}
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
    { key: 'recyclable', color: 'from-eco-300 to-eco-500', label: 'Recyclable' },
    { key: 'organic', color: 'from-amber-300 to-amber-500', label: 'Organic' },
    { key: 'paper', color: 'from-blue-300 to-blue-500', label: 'Paper' },
    { key: 'general', color: 'from-slate-300 to-slate-500', label: 'General' },
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
                <span className="font-semibold truncate">{entry.label}</span>
                <span className="text-[10px] font-semibold text-slate-600 whitespace-nowrap">{pct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${entry.color}`}
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
