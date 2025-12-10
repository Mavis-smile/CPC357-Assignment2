import { GoogleMap, InfoWindow, LoadScript, Marker as GoogleMarker } from '@react-google-maps/api'
import { useState, useMemo } from 'react'

type BinDoc = {
  id: string
  binId: string
  latitude?: number
  longitude?: number
  fillLevel?: number
  address?: string | null
  updatedAt?: Date | null
}

type BinMapProps = {
  bins: BinDoc[]
  selectedBin: string
}

const BinMap = ({ bins, selectedBin }: BinMapProps) => {
  const apiKey = import.meta.env.VITE_MAPS_API_KEY
  const [activeMarker, setActiveMarker] = useState<string | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)

  // Get only the selected bin
  const selectedBinData = useMemo(() => {
    const bin = bins.find(b => b.binId === selectedBin)
    if (!bin) return null
    
    const hasValidCoords = 
      typeof bin.latitude === 'number' && !isNaN(bin.latitude) &&
      typeof bin.longitude === 'number' && !isNaN(bin.longitude)
    
    return hasValidCoords ? bin : null
  }, [bins, selectedBin])

  // Calculate map center for selected bin only
  const mapCenter = useMemo(() => {
    if (!selectedBinData) {
      return { lat: 3.139, lng: 101.6869 }
    }
    return { lat: selectedBinData.latitude!, lng: selectedBinData.longitude! }
  }, [selectedBinData])

  // Create SVG icon for marker
  const createMarkerIcon = (isSelected: boolean) => {
    const color = isSelected ? '#22c55e' : '#fbbf24'
    const borderColor = isSelected ? '#16a34a' : '#f59e0b'
    
    const svg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="14" fill="${color}" stroke="${borderColor}" stroke-width="3"/><circle cx="16" cy="16" r="6" fill="white" opacity="0.8"/></svg>`
    
    const encoded = btoa(unescape(encodeURIComponent(svg)))
    
    return {
      url: `data:image/svg+xml;base64,${encoded}`,
      scaledSize: { width: 32, height: 32 },
      origin: { x: 0, y: 0 },
      anchor: { x: 16, y: 16 },
    }
  }

  const containerStyle = {
    width: '100%',
    height: '500px',
  }

  const mapOptions = {
    zoom: 14,
    mapTypeId: 'roadmap' as const,
    fullscreenControl: true,
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: true,
  }

  // Check API key
  if (!apiKey) {
    return (
      <div className="w-full h-96 bg-red-50 border-2 border-red-200 rounded-2xl flex flex-col items-center justify-center gap-2 p-4">
        <p className="text-red-700 font-semibold">⚠️ Google Maps API key not found</p>
        <p className="text-red-600 text-sm">Check VITE_MAPS_API_KEY in .env.local</p>
      </div>
    )
  }

  // Check if we have bin data
  if (bins.length === 0) {
    return (
      <div className="w-full h-96 bg-amber-50 border-2 border-amber-200 rounded-2xl flex flex-col items-center justify-center gap-2 p-4">
        <p className="text-amber-700 font-semibold">📍 No bins in database yet</p>
        <p className="text-amber-600 text-sm">Bins collection is empty. Run the camera app to record bin locations.</p>
      </div>
    )
  }

  // Check if selected bin has coordinates
  if (!selectedBinData) {
    return (
      <div className="w-full h-96 bg-amber-50 border-2 border-amber-200 rounded-2xl flex flex-col items-center justify-center gap-2 p-4">
        <p className="text-amber-700 font-semibold">📍 No location data for selected bin</p>
        <p className="text-amber-600 text-sm">Selected bin has no GPS coordinates yet.</p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-3">
      {/* Map Header */}
      <div className="flex items-center gap-3 px-4 pt-4">
        <span className="text-2xl">📍</span>
        <div>
          <h3 className="font-bold text-lg text-slate-900">{selectedBinData.binId}</h3>
          {selectedBinData.address && (
            <p className="text-sm text-slate-600">{selectedBinData.address}</p>
          )}
        </div>
      </div>

      {/* Map Container */}
      <div className="px-4 pb-4 rounded-2xl overflow-hidden shadow-sm border border-slate-200">
        {mapError && (
          <div className="bg-red-50 border-b border-red-200 p-3">
            <p className="text-red-700 text-sm font-semibold">{mapError}</p>
          </div>
        )}
        <LoadScript 
          googleMapsApiKey={apiKey}
          onLoad={() => console.log('[BinMap] GoogleMaps script loaded')}
          onError={() => {
            setMapError('Failed to load Google Maps API')
            console.error('[BinMap] GoogleMaps script error')
          }}
        >
          <GoogleMap 
            mapContainerStyle={containerStyle} 
            center={mapCenter} 
            zoom={17} 
            options={mapOptions}
            onLoad={() => {
              console.log('[BinMap] Map loaded')
            }}
          >
            {selectedBinData && (
              <GoogleMarker
                position={{ lat: selectedBinData.latitude!, lng: selectedBinData.longitude! }}
                title={selectedBinData.binId}
                icon={createMarkerIcon(true) as any}
                onClick={() => {
                  console.log('[BinMap] Selected bin marker clicked:', selectedBinData.binId)
                  setActiveMarker(selectedBinData.binId)
                }}
              >
                {activeMarker === selectedBinData.binId && (
                  <InfoWindow onCloseClick={() => setActiveMarker(null)}>
                    <div className="text-sm text-slate-900 space-y-1 p-2">
                      <p className="font-bold text-base">{selectedBinData.binId}</p>
                      {selectedBinData.address && <p className="text-xs text-slate-600">{selectedBinData.address}</p>}
                      <p className="text-xs text-slate-600">
                        {selectedBinData.latitude?.toFixed(5)}, {selectedBinData.longitude?.toFixed(5)}
                      </p>
                      {selectedBinData.fillLevel !== undefined && (
                        <p className="text-xs font-semibold text-eco-700">Fill: {Math.round(selectedBinData.fillLevel)}%</p>
                      )}
                      {selectedBinData.updatedAt && (
                        <p className="text-xs text-slate-500">Updated {selectedBinData.updatedAt.toLocaleString()}</p>
                      )}
                    </div>
                  </InfoWindow>
                )}
              </GoogleMarker>
            )}
          </GoogleMap>
        </LoadScript>
      </div>
    </div>
  )
}

export default BinMap
