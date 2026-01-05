import fs from "fs";
import https from "https";
import http from "http";
import express from "express";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 4430;
const USE_HTTP = process.env.USE_HTTP === "true";

const app = express();

app.use(cors());
app.use(express.json());

// Serve static client files in production
const clientDistPath = path.join(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(clientDistPath)) {
  console.log("Serving static files from:", clientDistPath);
  app.use(express.static(clientDistPath));
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Enable trust proxy so Express recognizes ngrok headers ++++++++
app.set("trust proxy", true);

let server;
let protocol = "http";

// Try HTTPS first (needed for WebRTC on network), fall back to HTTP
if (!USE_HTTP) {
  try {
    const certPath = path.join(__dirname, "..", "..", "..", "server.cert");
    const keyPath = path.join(__dirname, "..", "..", "..", "server.key");
    
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      const serverOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      };
      server = https.createServer(serverOptions, app);
      protocol = "https";
    } else {
      throw new Error("Certificates not found");
    }
  } catch (e) {
    console.log("HTTPS not available:", e.message);
    console.log("Falling back to HTTP (WebRTC will only work on localhost)");
    server = http.createServer(app);
    protocol = "http";
  }
} else {
  server = http.createServer(app);
  protocol = "http";
}

const wss = new WebSocketServer({ server });

// Store active connections: socket → username
const activeConnections = new Map();

// Store all registered users (persistent - survives disconnections)
// In production, this would be a database
const registeredUsers = new Set();

// Message queue for offline users: username → [messages]
const messageQueue = new Map();

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  });
}

// Get list of online usernames
function getOnlineUsers() {
  return Array.from(new Set(activeConnections.values()));
}

// Get list of all registered users with their online status
function getAllUsersWithStatus() {
  const onlineUsers = getOnlineUsers();
  return Array.from(registeredUsers).map(username => ({
    username,
    isOnline: onlineUsers.includes(username)
  }));
}

// Queue a message for an offline user
function queueMessage(username, message) {
  if (!messageQueue.has(username)) {
    messageQueue.set(username, []);
  }
  messageQueue.get(username).push(message);
  console.log(`📬 Queued message for offline user: ${username}`);
}

// Deliver queued messages to a user who just came online
function deliverQueuedMessages(ws, username) {
  const queue = messageQueue.get(username);
  if (queue && queue.length > 0) {
    console.log(`📨 Delivering ${queue.length} queued messages to ${username}`);
    queue.forEach(message => {
      ws.send(JSON.stringify(message));
    });
    messageQueue.delete(username);
  }
}

wss.on("connection", (ws) => {
  console.log("🟢 New WebSocket Client Connected");
  console.log(`Total clients: ${wss.clients.size}`);

  ws.send(
    JSON.stringify({
      type: "welcome",
      message: "Welcome to the signaling server",
    })
  );

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("Received Message:", data);

      switch (data.type) {
        case "join":
          handleUserJoined(ws, data.username);
          break;

        case "offer":
        case "answer":
        case "reject":
        case "ice":
        case "hangup":
        case "typing":
        case "video-toggle":
        case "delivered":
        case "read":
        case "delete-message":
          // Forward real-time messages to the target user (only if online)
          forwardToUser(data, ws, false);
          break;

        case "chat":
        case "file-message":
          // Forward messages - queue if user is offline
          forwardToUser(data, ws, true);
          break;

        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;

        default:
          console.log("Unknown message type:", data.type);
          break;
      }
    } catch (e) {
      console.error("Invalid Message", e);
      ws.send(
        JSON.stringify({ type: "error", message: "Invalid message format" })
      );
    }
  });

  ws.on("close", () => {
    const user_name = activeConnections.get(ws) || "Unknown";
    activeConnections.delete(ws);
    const onlineUsers = getOnlineUsers();
    console.log(`🔴 User Disconnected: ${user_name}`);
    console.log(`Online users now: ${onlineUsers.join(', ') || 'none'}`);
    
    // Broadcast updated user list with status
    broadcast({
      type: "onlineUsers",
      users: onlineUsers,
    });
    broadcast({
      type: "allUsers",
      users: getAllUsersWithStatus(),
    });
  });
});

// Forward message to target user, optionally queue if offline
function forwardToUser(data, ws, shouldQueue = false) {
  const targetUserWs = Array.from(activeConnections.entries()).find(
    ([, username]) => username === data.to
  )?.[0];

  const from = activeConnections.get(ws);
  console.log("Forwarding", data.type, "to", data.to, "from", from);

  const payload = buildPayload(data, ws);

  if (targetUserWs && targetUserWs.readyState === targetUserWs.OPEN) {
    targetUserWs.send(JSON.stringify(payload));
  } else if (shouldQueue && registeredUsers.has(data.to)) {
    // User is offline but registered - queue the message
    queueMessage(data.to, payload);
    // Notify sender that message was queued (will be delivered when user comes online)
    ws.send(JSON.stringify({
      type: "message-queued",
      messageId: data.messageId,
      to: data.to,
    }));
  }
}

function buildPayload(data, ws) {
  const from = activeConnections.get(ws);
  
  switch (data.type) {
    case "offer":
      console.log('Forwarding offer from', from, 'to', data.to, 'type:', data.callType)
      return { type: "offer", offer: data.offer, from, callType: data.callType };
    case "answer":
      return { type: "answer", answer: data.answer, from };
    case "ice":
      return { type: "ice", ice: data.ice, from };
    case "hangup":
      return { type: "hangup", from };
    case "chat":
      return {
        type: "chat",
        text: data.text,
        from,
        messageId: data.messageId || null,
        timestamp: data.timestamp || Date.now(),
      };
    case "video-toggle":
      return { type: "video-toggle", enabled: data.enabled, from };
    case "file-message":
      return {
        type: "file-message",
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: data.fileSize,
        fileData: data.fileData,
        caption: data.caption || '',
        messageId: data.messageId,
        timestamp: data.timestamp || Date.now(),
        from,
      };
    case "typing":
      return { type: "typing", isTyping: data.isTyping, from };
    case "delivered":
      return { type: "delivered", messageId: data.messageId, from };
    case "read":
      return { type: "read", messageId: data.messageId, from };
    case "delete-message":
      return { type: "delete-message", messageId: data.messageId, from };
    case "reject":
    default:
      return { type: "reject", from };
  }
}

function handleUserJoined(ws, username) {
  console.log(`User joined: ${username}`);
  
  // Register the user (persistent)
  registeredUsers.add(username);
  
  // Check if this username already exists with a different socket (reconnection)
  for (const [existingWs, existingUsername] of activeConnections.entries()) {
    if (existingUsername === username && existingWs !== ws) {
      console.log(`Removing stale connection for: ${username}`);
      activeConnections.delete(existingWs);
    }
  }
  
  activeConnections.set(ws, username);
  
  const onlineUsers = getOnlineUsers();
  console.log(`Online users now: ${onlineUsers.join(', ')}`);
  console.log(`Registered users: ${Array.from(registeredUsers).join(', ')}`);
  
  // Send online users list
  broadcast({
    type: "onlineUsers",
    users: onlineUsers,
  });
  
  // Send all users with status
  broadcast({
    type: "allUsers",
    users: getAllUsersWithStatus(),
  });
  
  // Deliver any queued messages to this user
  deliverQueuedMessages(ws, username);
}

// Fallback route - serve index.html for SPA client-side routing
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) {
    return next();
  }
  const indexPath = path.join(clientDistPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    next();
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    `${protocol.toUpperCase()} server running at ${protocol}://${HOST}:${PORT}`
  );
  console.log(`WebSocket signaling server running`);
  if (fs.existsSync(clientDistPath)) {
    console.log(`Client app being served from this server`);
  }

  // Log network addresses
  import("os").then((os) => {
    const networkInterfaces = os.networkInterfaces();
    for (const interfaceDetails of Object.values(networkInterfaces)) {
      for (const details of interfaceDetails) {
        if (details.family === "IPv4" && !details.internal) {
          console.log(
            `Access the server at: ${protocol}://${details.address}:${PORT}`
          );
        }
      }
    }
  });
});
