// server.js
const fs = require("fs");
const https = require("https");
const http = require("http");
const express = require("express");
const { WebSocketServer } = require("ws");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 4430;

const app = express();
app.use(express.static("public"));

let server;
let protocol = "https";
try {
  const serverOptions = {
    key: fs.readFileSync("server.key"),
    cert: fs.readFileSync("server.cert"),
  };
  server = https.createServer(serverOptions, app);
  protocol = "https";
} catch (e) {
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
          // Forward the offer/answer/ice to the selected user's WebSocket
          const targetUserWs = Array.from(users.entries()).find(
            ([, username]) => username === data.to
          )?.[0];

          console.log("Forwarding", data.type, "to", data.to);

          if (targetUserWs && targetUserWs.readyState === targetUserWs.OPEN) {
            const payload =
              data.type === "offer"
                ? { type: "offer", offer: data.offer, from: users.get(ws) }
                : data.type === "answer"
                ? { type: "answer", answer: data.answer, from: users.get(ws) }
                : data.type === "ice"
                ? { type: "ice", ice: data.ice, from: users.get(ws) }
                : data.type === "hangup"
                ? { type: "hangup", from: users.get(ws) }
                : { type: "reject", from: users.get(ws) };

            targetUserWs.send(JSON.stringify(payload));
          }
          break;
        // Add more case handlers as needed
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
    console.log(`🔴 User Disconnected: ${user_name}`);
    //notify other users
    broadcast({
      type: "onlineUsers",
      users: Array.from(users.values()),
    });
  });
});

const handleUserJoined = (ws, username) => {
  console.log(`User joined: ${username}`);

  // add to users map
  users.set(ws, username);
  // Send the updated user list to all clients
  broadcast({
    type: "onlineUsers",
    users: Array.from(users.values()),
  });
};

server.listen(PORT, HOST, () => {
  console.log(
    `${protocol.toUpperCase()} server running at ${protocol}://${HOST}:${PORT}`
  );
  console.log(`WebSocket signaling server running`);
});
