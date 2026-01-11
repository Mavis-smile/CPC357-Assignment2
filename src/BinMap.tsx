import { GoogleMap, LoadScript } from '@react-google-maps/api'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'

// No libraries needed for standard Marker
const GOOGLE_MAPS_LIBRARIES: never[] = []

type BinDoc = {
  id: string
  binId: string
  latitude?: number
  longitude?: number
  fillLevels?: number[] // Array of 4 sensor readings (0-100%)
  address?: string | null
  updatedAt?: Date | null
}

type BinMapProps = {
  bins: BinDoc[]
  selectedBin: string
}

const BinMap = ({ bins, selectedBin }: BinMapProps) => {
  const apiKey = import.meta.env.VITE_MAPS_API_KEY
  const [mapError, setMapError] = useState<string | null>(null)
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const markerRef = useRef<google.maps.Marker | null>(null)

  // Get only the selected bin
  const selectedBinData = useMemo(() => {
    const bin = bins.find(b => b.binId === selectedBin)
    console.log('[BinMap] Looking for bin:', selectedBin, 'Found:', bin)
    
    if (!bin) return null
    
    const hasValidCoords = 
      typeof bin.latitude === 'number' && !isNaN(bin.latitude) &&
      typeof bin.longitude === 'number' && !isNaN(bin.longitude) &&
      bin.latitude !== 0 && bin.longitude !== 0
    
    console.log('[BinMap] Bin coords check:', {
      binId: bin.binId,
      lat: bin.latitude,
      lng: bin.longitude,
      latType: typeof bin.latitude,
      lngType: typeof bin.longitude,
      hasValidCoords
    })
    
    return hasValidCoords ? bin : null
  }, [bins, selectedBin])

  // Calculate map center for selected bin only
  const mapCenter = useMemo(() => {
    if (!selectedBinData) {
      // Default center (Kuala Lumpur)
      return { lat: 3.139, lng: 101.6869 }
    }
    const center = { lat: selectedBinData.latitude!, lng: selectedBinData.longitude! }
    console.log('[BinMap] Map center:', center)
    return center
  }, [selectedBinData])

  const onLoad = useCallback((mapInstance: google.maps.Map) => {
    console.log('[BinMap] Map instance loaded:', mapInstance)
    setMap(mapInstance)
  }, [])

  const onUnmount = useCallback(() => {
    console.log('[BinMap] Map unmounted')
    if (markerRef.current) {
      markerRef.current.setMap(null)
    }
    setMap(null)
  }, [])

  const containerStyle = {
    width: '100%',
    height: '500px',
  }

  const mapOptions: google.maps.MapOptions = {
    mapTypeId: 'roadmap',
    fullscreenControl: true,
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: true,
    clickableIcons: true,
    // AdvancedMarkerElement works with the vector map. If you have a real mapId,
    // set it here. Placeholder mapId can cause script errors.
  }

  // Handle marker click
  const handleMarkerClick = useCallback(() => {
    if (selectedBinData) {
      console.log('[BinMap] Marker clicked for bin:', selectedBinData.binId)
      const fillLevel = selectedBinData.fillLevels 
        ? `${Math.round(selectedBinData.fillLevels.reduce((a, b) => a + b, 0) / selectedBinData.fillLevels.length)}%`
        : 'N/A'
      alert(
        `📍 ${selectedBinData.binId}\n\n` +
        `📍 Address: ${selectedBinData.address || 'No address'}\n` +
        `🌍 Latitude: ${selectedBinData.latitude?.toFixed(6)}\n` +
        `🌍 Longitude: ${selectedBinData.longitude?.toFixed(6)}\n` +
        `📊 Fill Level: ${fillLevel}`
      )
    }
  }, [selectedBinData])

  // Create and manage standard Marker (fallback from AdvancedMarker which requires mapId)
  useEffect(() => {
    if (!map || !selectedBinData) {
      return
    }

    // Clean up existing marker
    if (markerRef.current) {
      markerRef.current.setMap(null)
      markerRef.current = null
    }

    try {
      const marker = new google.maps.Marker({
        map,
        position: {
          lat: Number(selectedBinData.latitude),
          lng: Number(selectedBinData.longitude)
        },
        title: `${selectedBinData.binId} - ${selectedBinData.address || 'No address'}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#22c55e',
          fillOpacity: 1,
          strokeColor: '#16a34a',
          strokeWeight: 2,
        },
        label: {
          text: '🗑️',
          fontSize: '18px',
        }
      })

      marker.addListener('click', handleMarkerClick)
      markerRef.current = marker as any

      console.log('[BinMap] Marker created at:', {
        lat: Number(selectedBinData.latitude),
        lng: Number(selectedBinData.longitude)
      })
    } catch (error) {
      console.error('[BinMap] Failed to create Marker:', error)
      setMapError('Failed to create map marker.')
    }

    return () => {
      if (markerRef.current) {
        markerRef.current.setMap(null)
        markerRef.current = null
      }
    }
  }, [map, selectedBinData, handleMarkerClick])

  // Log marker position when it changes
  useMemo(() => {
    if (selectedBinData) {
      console.log('[BinMap] Rendering marker at:', {
        lat: Number(selectedBinData.latitude),
        lng: Number(selectedBinData.longitude)
      })
    }
    return null
  }, [selectedBinData])

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
            onLoad={onLoad}
            onUnmount={onUnmount}
          >
            {/* Marker is created via AdvancedMarkerElement in useEffect */}
          </GoogleMap>
        </LoadScript>
      </div>
    </div>
  )
}

export default BinMap
