import { useEffect, useRef, useState } from 'react'
import { X, Download, Bookmark, ChevronLeft, ChevronRight } from 'lucide-react'

export default function MediaViewerModal({ media, onClose, onSave, mediaList = [], currentIndex = 0, onNavigate }) {
  if (!media) return null

  const isImage = media.fileType?.startsWith('image/')
  const isVideo = media.fileType?.startsWith('video/')
  
  const hasMultipleMedia = mediaList.length > 1
  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex < mediaList.length - 1

  // Touch swipe state
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const minSwipeDistance = 50

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchMove = (e) => {
    if (!touchStartX.current) return
    
    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const diffX = currentX - touchStartX.current
    const diffY = currentY - touchStartY.current
    
    // Only track horizontal swipes (ignore vertical scrolling)
    if (Math.abs(diffX) > Math.abs(diffY)) {
      e.preventDefault()
      // Limit swipe offset and add resistance at edges
      const maxOffset = 150
      let offset = diffX
      if ((diffX > 0 && !hasPrevious) || (diffX < 0 && !hasNext)) {
        offset = diffX * 0.3 // Add resistance at edges
      }
      setSwipeOffset(Math.max(-maxOffset, Math.min(maxOffset, offset)))
    }
  }

  const handleTouchEnd = () => {
    if (!touchStartX.current) return
    
    if (swipeOffset > minSwipeDistance && hasPrevious) {
      onNavigate?.(currentIndex - 1)
    } else if (swipeOffset < -minSwipeDistance && hasNext) {
      onNavigate?.(currentIndex + 1)
    }
    
    touchStartX.current = null
    touchStartY.current = null
    setSwipeOffset(0)
  }

  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = media.fileData
    link.download = media.fileName
    link.click()
  }

  const handleSave = () => {
    if (onSave) {
      onSave(media)
    }
  }

  const handlePrevious = (e) => {
    e.stopPropagation()
    if (hasPrevious && onNavigate) {
      onNavigate(currentIndex - 1)
    }
  }

  const handleNext = (e) => {
    e.stopPropagation()
    if (hasNext && onNavigate) {
      onNavigate(currentIndex + 1)
    }
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft' && hasPrevious) {
        onNavigate?.(currentIndex - 1)
      } else if (e.key === 'ArrowRight' && hasNext) {
        onNavigate?.(currentIndex + 1)
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, hasPrevious, hasNext, onNavigate, onClose])

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      onClick={onClose}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleSave()
          }}
          className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          title="Save to device"
        >
          <Bookmark className="w-5 h-5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleDownload()
          }}
          className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          title="Download"
        >
          <Download className="w-5 h-5" />
        </button>
        <button
          onClick={onClose}
          className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Previous button */}
      {hasMultipleMedia && (
        <button
          onClick={handlePrevious}
          disabled={!hasPrevious}
          className={`absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10 ${!hasPrevious ? 'opacity-30 cursor-not-allowed' : ''}`}
          title="Previous"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
      )}

      {/* Next button */}
      {hasMultipleMedia && (
        <button
          onClick={handleNext}
          disabled={!hasNext}
          className={`absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10 ${!hasNext ? 'opacity-30 cursor-not-allowed' : ''}`}
          title="Next"
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      )}

      {/* Media content with swipe support */}
      <div 
        className="max-w-[90vw] max-h-[90vh] flex items-center justify-center touch-pan-y"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: swipeOffset === 0 ? 'transform 0.3s ease-out' : 'none',
        }}
      >
        {isImage && (
          <img
            src={media.fileData}
            alt={media.fileName}
            className="max-w-full max-h-[90vh] object-contain rounded-lg select-none pointer-events-none"
            draggable={false}
          />
        )}
        {isVideo && (
          <video
            src={media.fileData}
            controls
            autoPlay
            className="max-w-full max-h-[90vh] rounded-lg"
          />
        )}
      </div>

      {/* File info */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 px-4 py-2 rounded-full flex items-center gap-2">
        <p className="text-sm text-white/80">{media.fileName}</p>
        {hasMultipleMedia && (
          <span className="text-xs text-white/50">({currentIndex + 1} / {mediaList.length})</span>
        )}
      </div>
    </div>
  )
}
