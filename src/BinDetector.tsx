import { useState, useEffect, useRef } from 'react';
import Webcam from 'react-webcam';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs-backend-webgl';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { captureAndStoreLocation, BinLocationData } from './binLocation';

interface Detection {
  class: string;
  score: number;
  bbox: [number, number, number, number];
}

interface TrashDetection {
  class: string;
  confidence: number;
  timestamp: Date;
}

const BinDetector = () => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [currentItem, setCurrentItem] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [binId] = useState('BIN001');
  const [modelError, setModelError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>('');
  const [binLocation, setBinLocation] = useState<BinLocationData | null>(null);

  // Enhanced detection - filter out person/hand detections when other objects present
  const ignoredClasses = ['person'];

  // Trash categories mapping
  const trashCategories = {
    recyclable: ['bottle', 'cup', 'wine glass', 'cell phone', 'laptop', 'keyboard', 'remote', 'scissors', 'knife', 'fork', 'spoon'],
    organic: ['banana', 'apple', 'orange', 'broccoli', 'carrot', 'pizza', 'donut', 'cake', 'sandwich', 'hot dog', 'bowl'],
    paper: ['book'],
    general: ['teddy bear', 'hair drier', 'toothbrush', 'vase', 'clock']
  };

  // Load Enhanced COCO-SSD model with better filtering
  useEffect(() => {
    const loadModel = async () => {
      try {
        setIsModelLoading(true);
        setModelError(null);
        
        console.log('Loading Enhanced Detection Model...');
        const loadedModel = await cocoSsd.load({
          base: 'lite_mobilenet_v2' // Faster, smaller backbone
        });
        
        setModel(loadedModel);
        setIsModelLoading(false);
        console.log('✅ Enhanced detection model loaded successfully!');
      } catch (error) {
        console.error('Error loading model:', error);
        setModelError('Failed to load detection model. Please refresh the page.');
        setIsModelLoading(false);
      }
    };
    loadModel();
  }, []);

  // Capture bin location once on mount
  useEffect(() => {
    const fetchLocation = async () => {
      setLocationStatus('Locating...');
      const loc = await captureAndStoreLocation(binId);
      if (loc) {
        setBinLocation(loc);
        setLocationStatus('Location saved');
      } else {
        setLocationStatus('Location unavailable');
      }
    };
    fetchLocation();
  }, [binId]);

  // Determine trash category
  const getTrashCategory = (className: string): string => {
    const lowerClass = className.toLowerCase();
    
    for (const [category, items] of Object.entries(trashCategories)) {
      if (items.some(item => lowerClass.includes(item) || item.includes(lowerClass))) {
        return category;
      }
    }
    return 'general';
  };

  // Save detection to Firebase
  const saveDetectionToFirebase = async (detection: TrashDetection) => {
    setIsSaving(true);
    try {
      const category = getTrashCategory(detection.class);
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const customDocId = `${binId}_${timestamp}_${detection.class.replace(/\s+/g, '-')}`;
      
      await addDoc(collection(db, 'detections'), {
        documentId: customDocId,
        binId: binId,
        itemClass: detection.class,
        category: category,
        confidence: detection.confidence,
        timestamp: serverTimestamp(),
        detectedAt: detection.timestamp
      });
      console.log('Detection saved to Firebase with ID:', customDocId);
    } catch (error) {
      console.error('Error saving to Firebase:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Enhanced detection - prioritize objects over persons
  const detectObjects = async () => {
    if (
      !model ||
      !webcamRef.current ||
      !webcamRef.current.video ||
      webcamRef.current.video.readyState !== 4
    ) {
      return;
    }

    try {
      const video = webcamRef.current.video;
      const predictions = await model.detect(video);
      
      // Filter and prioritize: if there are non-person objects, ignore person detections
      let filtered = predictions.map(pred => ({
        class: pred.class,
        score: pred.score,
        bbox: pred.bbox as [number, number, number, number]
      }));
      
      // Check if there are non-person objects
      const hasNonPersonObjects = filtered.some(det => !ignoredClasses.includes(det.class));
      
      // If non-person objects exist, remove person detections
      if (hasNonPersonObjects) {
        filtered = filtered.filter(det => !ignoredClasses.includes(det.class));
      }
      
      // Sort by confidence and keep top detections
      filtered.sort((a, b) => b.score - a.score);
      filtered = filtered.slice(0, 5);
      
      // Update current item pill and optionally save
      if (filtered.length > 0) {
        const highestConfidence = filtered[0];
        setCurrentItem(`${highestConfidence.class} • ${Math.round(highestConfidence.score * 100)}%`);

        const newDetection: TrashDetection = {
          class: highestConfidence.class,
          confidence: Math.round(highestConfidence.score * 100),
          timestamp: new Date()
        };

        // Only save if confidence is high and not a person
        if (!isSaving && highestConfidence.score > 0.7 && !ignoredClasses.includes(highestConfidence.class)) {
          saveDetectionToFirebase(newDetection);
        }
      } else {
        setCurrentItem('');
      }
      
      drawDetections(filtered);
    } catch (error) {
      console.error('Detection error:', error);
    }
  };

  // Draw bounding boxes
  const drawDetections = (predictions: Detection[]) => {
    if (!canvasRef.current || !webcamRef.current?.video) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = webcamRef.current.video;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    predictions.forEach(prediction => {
      const [x, y, width, height] = prediction.bbox;
      
      // Draw bounding box
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      // Draw label background
      ctx.fillStyle = '#10b981';
      const text = `${prediction.class} ${Math.round(prediction.score * 100)}%`;
      const textWidth = ctx.measureText(text).width;
      ctx.fillRect(x, y - 25, textWidth + 10, 25);

      // Draw label text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Inter';
      ctx.fillText(text, x + 5, y - 7);
    });
  };

  // Run detection loop
  useEffect(() => {
    if (model && !isModelLoading) {
      const interval = setInterval(() => {
        detectObjects();
      }, 500); // 2 FPS - balanced speed and accuracy

      return () => clearInterval(interval);
    }
  }, [model, isModelLoading, isSaving]);

  /* category color/icon helpers removed in single-screen minimal view */

  return (
    <div className="vh-fixed h-[100vh] bg-gradient-to-br from-eco-50 via-white to-recycle-50 p-3 sm:p-4 md:p-5 lg:p-6 overflow-hidden">
      <div className="max-w-7xl mx-auto h-full flex flex-col">
        {/* Header */}
        <header className="mb-3 sm:mb-4 md:mb-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 md:p-5 border-2 border-eco-200">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-eco-400 rounded-full blur-lg opacity-40 animate-pulse-slow"></div>
                <div className="relative w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-gradient-to-br from-eco-400 to-eco-600 rounded-full flex items-center justify-center shadow-lg">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M21.82 15.42l-2.5-4.33a1 1 0 00-.87-.5h-2.1l1.36-2.35a1 1 0 00-1.73-1l-2.5 4.33a1 1 0 00.87 1.5h2.1l-1.36 2.35a1 1 0 00.87 1.5 1 1 0 00.87-.5zM11 11.38l1.36-2.35a1 1 0 00-1.73-1l-2.5 4.33a1 1 0 00.87 1.5h2.1l-1.36 2.35a1 1 0 00.87 1.5 1 1 0 00.87-.5l2.5-4.33a1 1 0 00-.87-1.5zM7.45 16.07l-2.5-4.33a1 1 0 00-1.73 0l-2.5 4.33a1 1 0 00.87 1.5h5a1 1 0 00.86-1.5z"/>
                  </svg>
                </div>
              </div>
              <div className="text-center sm:text-left">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-eco-600 to-recycle-600 bg-clip-text text-transparent flex items-center gap-2">
                  Smart Recycle Bin
                  <span className="text-[10px] sm:text-xs bg-gradient-to-r from-purple-500 to-pink-500 text-white px-2 py-0.5 rounded-full font-bold">Enhanced AI</span>
                </h1>
                <p className="text-[11px] sm:text-xs text-slate-600 mt-1 flex items-center gap-1.5 justify-center sm:justify-start">
                  <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-eco-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
                  </svg>
                  <span className="font-medium text-eco-700">{binId}</span>
                </p>
                {binLocation && (
                  <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 justify-center sm:justify-start">
                    <svg className="w-3 h-3 text-eco-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
                    </svg>
                    <span>{binLocation.latitude.toFixed(5)}, {binLocation.longitude.toFixed(5)}</span>
                  </p>
                )}
                {!binLocation && locationStatus && (
                  <p className="text-[10px] sm:text-[11px] text-amber-600 mt-0.5">{locationStatus}</p>
                )}
              </div>
            </div>
            
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                {isModelLoading ? (
                  <div className="flex items-center gap-2 bg-amber-100 text-amber-700 px-4 py-2 rounded-full border-2 border-amber-300">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-sm font-semibold">Loading AI...</span>
                  </div>
                ) : modelError ? (
                  <div className="flex items-center gap-2 bg-red-100 text-red-700 px-4 py-2 rounded-full border-2 border-red-300">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-sm font-semibold">Model Error</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-eco-100 text-eco-700 px-4 py-2 rounded-full border-2 border-eco-300">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-eco-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-eco-500"></span>
                    </span>
                    <span className="text-sm font-bold">LIVE</span>
                  </div>
                )}
              </div>
              {/* Status hint removed per request */}
            </div>
          </div>
        </header>

        {/* Main Content - camera only for single-page view */}
        <div className="flex-1 min-h-0">
          <div className="space-y-3 min-h-0 order-1">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border-2 border-slate-200">
              <div className="bg-gradient-to-r from-eco-500 to-recycle-500 px-4 sm:px-5 py-3 sm:py-4 flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z"/>
                  </svg>
                  Camera Stream
                </h2>
                {!isModelLoading && !modelError && (
                  <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur px-3 py-1.5 rounded-full">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-white">LIVE</span>
                  </div>
                )}
              </div>
              
              <div className="relative bg-slate-900 w-full h-[68vh] sm:h-[70vh] lg:h-[72vh] rounded-2xl">
                <Webcam
                  ref={webcamRef}
                  muted
                  className="w-full h-full object-cover"
                  videoConstraints={{
                    width: 1280,
                    height: 720,
                    facingMode: 'user'
                  }}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full"
                />
                {/* Minimal detected item pill */}
                {currentItem && (
                  <div className="absolute top-3 right-3 bg-eco-500/90 text-white px-2.5 py-1 rounded-full text-[11px] shadow-md">
                    {currentItem}
                  </div>
                )}
                {binLocation && (
                  <div className="absolute bottom-3 left-3 bg-slate-800/70 text-white px-2.5 py-1 rounded-md text-[10px] tracking-tight shadow">
                    GPS: {binLocation.latitude.toFixed(5)}, {binLocation.longitude.toFixed(5)} • ±{Math.round(binLocation.accuracy)}m
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Right-side panels removed for single-view layout */}
        </div>

        {/* Footer removed for minimal single-screen layout */}
      </div>
    </div>
  );
};

export default BinDetector;
