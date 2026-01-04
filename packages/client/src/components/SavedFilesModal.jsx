import { useState, useEffect } from 'react'
import { X, Trash2, Download, Image, File, Film, Paperclip } from 'lucide-react'
import { getAllFiles, deleteFile } from '../services/storageService'
import clsx from 'clsx'

export default function SavedFilesModal({ onClose, onViewMedia }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTab, setSelectedTab] = useState('all')

  useEffect(() => {
    loadFiles()
  }, [])

  const loadFiles = async () => {
    try {
      const savedFiles = await getAllFiles()
      setFiles(savedFiles.sort((a, b) => b.timestamp - a.timestamp))
    } catch (error) {
      console.error('Failed to load files:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteFile(id)
      setFiles(files.filter(f => f.id !== id))
    } catch (error) {
      console.error('Failed to delete file:', error)
    }
  }

  const handleDownload = (file) => {
    const link = document.createElement('a')
    link.href = file.fileData
    link.download = file.fileName
    link.click()
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getFileIcon = (fileType) => {
    if (fileType?.startsWith('image/')) return <Image className="w-5 h-5" />
    if (fileType?.startsWith('video/')) return <Film className="w-5 h-5" />
    return <File className="w-5 h-5" />
  }

  const filteredFiles = files.filter(file => {
    if (selectedTab === 'all') return true
    if (selectedTab === 'images') return file.fileType?.startsWith('image/')
    if (selectedTab === 'videos') return file.fileType?.startsWith('video/')
    if (selectedTab === 'documents') return !file.fileType?.startsWith('image/') && !file.fileType?.startsWith('video/')
    return true
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1e1e1e] rounded-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col overflow-hidden shadow-2xl border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Paperclip className="w-5 h-5 text-primary" />
            <span className="font-semibold">Saved Files</span>
            <span className="text-sm text-gray-400">({files.length})</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-4 border-b border-white/10">
          {[
            { id: 'all', label: 'All' },
            { id: 'images', label: 'Images' },
            { id: 'videos', label: 'Videos' },
            { id: 'documents', label: 'Documents' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={clsx(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                selectedTab === tab.id
                  ? 'bg-primary text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Files list */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Paperclip className="w-12 h-12 mb-3" />
              <p>No saved files</p>
              <p className="text-sm mt-1">Files you save will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredFiles.map(file => (
                <div
                  key={file.id}
                  className="bg-surface-light rounded-xl p-3 flex gap-3 hover:bg-white/5 transition-colors group"
                >
                  {/* Thumbnail */}
                  <div 
                    className="w-16 h-16 rounded-lg bg-black/30 flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer"
                    onClick={() => {
                      if (file.fileType?.startsWith('image/') || file.fileType?.startsWith('video/')) {
                        onViewMedia(file)
                      }
                    }}
                  >
                    {file.fileType?.startsWith('image/') ? (
                      <img src={file.fileData} alt={file.fileName} className="w-full h-full object-cover" />
                    ) : file.fileType?.startsWith('video/') ? (
                      <Film className="w-6 h-6 text-gray-400" />
                    ) : (
                      <File className="w-6 h-6 text-gray-400" />
                    )}
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{file.fileName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatFileSize(file.fileSize)}</p>
                    <p className="text-xs text-gray-500">{formatDate(file.timestamp)}</p>
                    {file.from && (
                      <p className="text-xs text-gray-500">From: {file.from}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleDownload(file)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
