// IndexedDB Service for saving chats and files

const DB_NAME = 'WebRTCChatDB'
const DB_VERSION = 1
const CHATS_STORE = 'chats'
const FILES_STORE = 'files'

let db = null

export async function initDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db)
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = event.target.result

      // Chats store - stores chat messages per user
      if (!database.objectStoreNames.contains(CHATS_STORE)) {
        const chatsStore = database.createObjectStore(CHATS_STORE, { keyPath: 'id', autoIncrement: true })
        chatsStore.createIndex('username', 'username', { unique: false })
        chatsStore.createIndex('timestamp', 'timestamp', { unique: false })
      }

      // Files store - stores saved files
      if (!database.objectStoreNames.contains(FILES_STORE)) {
        const filesStore = database.createObjectStore(FILES_STORE, { keyPath: 'id', autoIncrement: true })
        filesStore.createIndex('timestamp', 'timestamp', { unique: false })
        filesStore.createIndex('type', 'type', { unique: false })
      }
    }
  })
}

// Chat functions
export async function saveChat(username, messages) {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([CHATS_STORE], 'readwrite')
    const store = transaction.objectStore(CHATS_STORE)

    const chatData = {
      username,
      messages,
      timestamp: Date.now(),
    }

    const request = store.add(chatData)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getChats(username) {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([CHATS_STORE], 'readonly')
    const store = transaction.objectStore(CHATS_STORE)
    const index = store.index('username')
    const request = index.getAll(username)

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getAllChats() {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([CHATS_STORE], 'readonly')
    const store = transaction.objectStore(CHATS_STORE)
    const request = store.getAll()

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function deleteChat(id) {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([CHATS_STORE], 'readwrite')
    const store = transaction.objectStore(CHATS_STORE)
    const request = store.delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// File functions
export async function saveFile(fileData) {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([FILES_STORE], 'readwrite')
    const store = transaction.objectStore(FILES_STORE)

    const fileRecord = {
      fileName: fileData.fileName,
      fileType: fileData.fileType,
      fileSize: fileData.fileSize,
      fileData: fileData.fileData,
      from: fileData.from,
      timestamp: fileData.timestamp || Date.now(),
    }

    const request = store.add(fileRecord)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getAllFiles() {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([FILES_STORE], 'readonly')
    const store = transaction.objectStore(FILES_STORE)
    const request = store.getAll()

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function deleteFile(id) {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([FILES_STORE], 'readwrite')
    const store = transaction.objectStore(FILES_STORE)
    const request = store.delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function clearAllFiles() {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([FILES_STORE], 'readwrite')
    const store = transaction.objectStore(FILES_STORE)
    const request = store.clear()

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Initialize DB on import
initDB().catch(console.error)
