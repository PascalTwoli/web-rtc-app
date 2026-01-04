import { X, Download, Bookmark } from 'lucide-react'

export default function MediaViewerModal({ media, onClose, onSave }) {
  if (!media) return null

  const isImage = media.fileType?.startsWith('image/')
  const isVideo = media.fileType?.startsWith('video/')

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

      {/* Media content */}
      <div 
        className="max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {isImage && (
          <img
            src={media.fileData}
            alt={media.fileName}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
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
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 px-4 py-2 rounded-full">
        <p className="text-sm text-white/80">{media.fileName}</p>
      </div>
    </div>
  )
}
