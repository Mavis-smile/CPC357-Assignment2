import { GoogleMap, LoadScript } from '@react-google-maps/api'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'

// Keep libraries array as a constant outside component to avoid reloading
const GOOGLE_MAPS_LIBRARIES: ("marker")[] = ['marker']

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
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)

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
      markerRef.current.map = null
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

  // Create and manage AdvancedMarkerElement
  useEffect(() => {
    if (!map || !selectedBinData) {
      return
    }

    const run = async () => {
      // Clean up existing marker
      if (markerRef.current) {
        markerRef.current.map = null
        markerRef.current = null
      }

      // Create custom marker content
      const markerContent = document.createElement('div')
      markerContent.style.cssText = `
        width: 50px;
        height: 65px;
        position: relative;
        cursor: pointer;
      `
      markerContent.innerHTML = `
        <svg width="50" height="65" viewBox="0 0 50 65" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow-${selectedBinData.binId}" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity="0.4"/>
            </filter>
          </defs>
          <path 
            d="M25 2 C13 2 3 12 3 24 C3 42 25 63 25 63 C25 63 47 42 47 24 C47 12 37 2 25 2 Z" 
            fill="#22c55e" 
            stroke="#16a34a" 
            stroke-width="2.5"
            filter="url(#shadow-${selectedBinData.binId})"
          />
          <circle cx="25" cy="22" r="11" fill="white" opacity="0.95"/>
          <text 
            x="25" 
            y="30" 
            font-family="Arial, sans-serif" 
            font-size="22" 
            text-anchor="middle" 
            dominant-baseline="middle"
          >🗑️</text>
        </svg>
        <div style="
          position: absolute;
          bottom: -22px;
          left: 50%;
          transform: translateX(-50%);
          background: white;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: bold;
          color: #16a34a;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
          border: 1px solid #e5e7eb;
        ">${selectedBinData.binId}</div>
      `

      try {
        // Ensure the 'marker' library is loaded before using AdvancedMarkerElement
        let AdvancedMarkerElementCtor: any
        if ((google.maps as any).importLibrary) {
          const markerLib = await (google.maps as any).importLibrary('marker')
          AdvancedMarkerElementCtor = (markerLib as any).AdvancedMarkerElement
        } else {
          AdvancedMarkerElementCtor = (google.maps as any).marker?.AdvancedMarkerElement
        }

        if (!AdvancedMarkerElementCtor) {
          throw new Error('AdvancedMarkerElement not available. Ensure v=beta and libraries=marker are loaded.')
        }

        const marker = new AdvancedMarkerElementCtor({
          map,
          position: {
            lat: Number(selectedBinData.latitude),
            lng: Number(selectedBinData.longitude)
          },
          content: markerContent,
          title: `${selectedBinData.binId} - ${selectedBinData.address || 'No address'}`
        })

        marker.addListener('click', handleMarkerClick)
        markerRef.current = marker

        console.log('[BinMap] AdvancedMarkerElement created at:', {
          lat: Number(selectedBinData.latitude),
          lng: Number(selectedBinData.longitude)
        })
      } catch (error) {
        console.error('[BinMap] Failed to create AdvancedMarkerElement:', error)
        setMapError('Failed to load Google Maps Advanced Markers. Check API key, v=beta, and libraries=marker.')
      }
    }

    run()

    return () => {
      if (markerRef.current) {
        markerRef.current.map = null
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
          version="beta"
          libraries={GOOGLE_MAPS_LIBRARIES}
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
