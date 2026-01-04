import { useState } from 'react'
import { X, Send, Paperclip } from 'lucide-react'
import clsx from 'clsx'

export default function FilePreviewModal({ file, onSend, onClose }) {
  const [caption, setCaption] = useState('')

  if (!file) return null

  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')
  const previewUrl = URL.createObjectURL(file)

  const handleSend = () => {
    onSend(file, caption)
    onClose()
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1e1e1e] rounded-2xl max-w-lg w-full mx-4 overflow-hidden shadow-2xl border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Paperclip className="w-5 h-5 text-primary" />
            <span className="font-semibold">Send File</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview */}
        <div className="p-4">
          {isImage ? (
            <img
              src={previewUrl}
              alt={file.name}
              className="max-h-64 w-full object-contain rounded-lg bg-black"
            />
          ) : isVideo ? (
            <video
              src={previewUrl}
              controls
              className="max-h-64 w-full rounded-lg bg-black"
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-8 bg-surface-light rounded-lg">
              <Paperclip className="w-12 h-12 text-gray-400 mb-3" />
              <p className="font-medium text-white">{file.name}</p>
              <p className="text-sm text-gray-400 mt-1">{formatFileSize(file.size)}</p>
            </div>
          )}

          {/* File info for media */}
          {(isImage || isVideo) && (
            <div className="mt-3 text-center">
              <p className="text-sm text-gray-400">{file.name}</p>
              <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
            </div>
          )}
        </div>

        {/* Caption input */}
        <div className="px-4 pb-4">
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a caption..."
            className="w-full p-3 bg-surface-light rounded-xl text-white outline-none text-base border border-white/10 focus:border-primary/50 transition-colors"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSend()
              }
            }}
          />
        </div>

        {/* Send button */}
        <div className="p-4 pt-0 flex justify-end">
          <button
            onClick={handleSend}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-hover rounded-full font-semibold transition-colors"
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
