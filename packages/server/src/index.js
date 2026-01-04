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

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

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

// Store users: socket → username
const users = new Map();

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  });
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
        case "chat":
        case "typing":
        case "video-toggle":
        case "file-message":
        case "delivered":
        case "read":
          // Forward the message to the target user
          const targetUserWs = Array.from(users.entries()).find(
            ([, username]) => username === data.to
          )?.[0];

          console.log("Forwarding", data.type, "to", data.to, "from", users.get(ws));

          if (targetUserWs && targetUserWs.readyState === targetUserWs.OPEN) {
            const payload = buildPayload(data, ws);
            targetUserWs.send(JSON.stringify(payload));
          }
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
    const user_name = users.get(ws) || "Unknown";
    users.delete(ws);
    const onlineUsers = Array.from(new Set(users.values()));
    console.log(`🔴 User Disconnected: ${user_name}`);
    console.log(`Online users now: ${onlineUsers.join(', ') || 'none'}`);
    broadcast({
      type: "onlineUsers",
      users: onlineUsers,
    });
  });
});

function buildPayload(data, ws) {
  const from = users.get(ws);
  
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
    case "reject":
    default:
      return { type: "reject", from };
  }
}

function handleUserJoined(ws, username) {
  console.log(`User joined: ${username}`);
  
  // Check if this username already exists with a different socket (reconnection)
  for (const [existingWs, existingUsername] of users.entries()) {
    if (existingUsername === username && existingWs !== ws) {
      console.log(`Removing stale connection for: ${username}`);
      users.delete(existingWs);
    }
  }
  
  users.set(ws, username);
  
  const onlineUsers = Array.from(new Set(users.values()));
  console.log(`Online users now: ${onlineUsers.join(', ')}`);
  
  broadcast({
    type: "onlineUsers",
    users: onlineUsers,
  });
}

server.listen(PORT, HOST, () => {
  console.log(
    `${protocol.toUpperCase()} server running at ${protocol}://${HOST}:${PORT}`
  );
  console.log(`WebSocket signaling server running`);

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
