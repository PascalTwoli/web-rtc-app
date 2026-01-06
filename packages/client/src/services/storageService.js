// IndexedDB Service for saving chats and files

const DB_NAME = 'WebRTCChatDB'
const DB_VERSION = 2
const MESSAGES_STORE = 'messages'
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

      // Delete old stores if they exist
      if (database.objectStoreNames.contains('chats')) {
        database.deleteObjectStore('chats')
      }

      // Messages store - stores individual messages with conversation key
      if (!database.objectStoreNames.contains(MESSAGES_STORE)) {
        const messagesStore = database.createObjectStore(MESSAGES_STORE, { keyPath: 'messageId' })
        messagesStore.createIndex('conversationKey', 'conversationKey', { unique: false })
        messagesStore.createIndex('timestamp', 'timestamp', { unique: false })
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

// Message functions - save individual messages
export async function saveMessage(currentUser, otherUser, message) {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MESSAGES_STORE], 'readwrite')
    const store = transaction.objectStore(MESSAGES_STORE)

    // Create a consistent conversation key (sorted usernames)
    const conversationKey = [currentUser, otherUser].sort().join(':::')
    
    const messageData = {
      ...message,
      conversationKey,
      savedAt: Date.now(),
    }

    const request = store.put(messageData) // use put to update if exists
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Get messages for a conversation between current user and another user
export async function getConversationMessages(currentUser, otherUser) {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MESSAGES_STORE], 'readonly')
    const store = transaction.objectStore(MESSAGES_STORE)
    const index = store.index('conversationKey')
    const conversationKey = [currentUser, otherUser].sort().join(':::')
    const request = index.getAll(conversationKey)

    request.onsuccess = () => {
      const messages = request.result.sort((a, b) => a.timestamp - b.timestamp)
      resolve(messages)
    }
    request.onerror = () => reject(request.error)
  })
}

// Get all messages grouped by conversation partner
export async function getAllMessages(currentUser) {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MESSAGES_STORE], 'readonly')
    const store = transaction.objectStore(MESSAGES_STORE)
    const request = store.getAll()

    request.onsuccess = () => {
      const messages = request.result
      // Group messages by the other user in the conversation
      const grouped = {}
      messages.forEach(msg => {
        const [user1, user2] = msg.conversationKey.split(':::')
        const otherUser = user1 === currentUser ? user2 : user1
        if (!grouped[otherUser]) {
          grouped[otherUser] = []
        }
        grouped[otherUser].push(msg)
      })
      // Sort each conversation by timestamp
      Object.keys(grouped).forEach(user => {
        grouped[user].sort((a, b) => a.timestamp - b.timestamp)
      })
      resolve(grouped)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function deleteMessage(messageId) {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MESSAGES_STORE], 'readwrite')
    const store = transaction.objectStore(MESSAGES_STORE)
    const request = store.delete(messageId)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Status hierarchy: sent (0) < queued (1) < delivered (2) < read (3)
const STATUS_PRIORITY = {
  'sent': 0,
  'queued': 1,
  'delivered': 2,
  'read': 3,
}

// Update message status - only upgrades allowed, never downgrades
export async function updateMessageStatus(messageId, newStatus) {
  const database = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MESSAGES_STORE], 'readwrite')
    const store = transaction.objectStore(MESSAGES_STORE)
    
    // First get the message
    const getRequest = store.get(messageId)
    getRequest.onsuccess = () => {
      const message = getRequest.result
      if (message) {
        const currentPriority = STATUS_PRIORITY[message.status] ?? 0
        const newPriority = STATUS_PRIORITY[newStatus] ?? 0
        
        // Only update if new status is higher priority (upgrade only)
        if (newPriority > currentPriority) {
          message.status = newStatus
          const putRequest = store.put(message)
          putRequest.onsuccess = () => resolve(true)
          putRequest.onerror = () => reject(putRequest.error)
        } else {
          resolve(false) // Status not upgraded (already at higher status)
        }
      } else {
        resolve(false) // Message not found
      }
    }
    getRequest.onerror = () => reject(getRequest.error)
  })
}

export async function clearConversation(currentUser, otherUser) {
  const database = await initDB()
  const conversationKey = [currentUser, otherUser].sort().join(':::')
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MESSAGES_STORE], 'readwrite')
    const store = transaction.objectStore(MESSAGES_STORE)
    const index = store.index('conversationKey')
    const request = index.openCursor(IDBKeyRange.only(conversationKey))

    request.onsuccess = (event) => {
      const cursor = event.target.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      } else {
        resolve()
      }
    }
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
