# Peers App

A real-time peer-to-peer communication application with video/audio calling and chat functionality built with WebRTC.

## Project Structure

This is an npm workspace monorepo with the following packages:

```
peers-app/
├── packages/
│   ├── client/          # React frontend (Vite + Tailwind CSS)
│   └── server/          # Express.js backend + WebSocket signaling
├── package.json         # Root workspace configuration
└── README.md
```

## Tech Stack

### Frontend (`@peers/client`)
- **React 18** - UI library
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Icon library

### Backend (`@peers/server`)
- **Express.js 5** - Web framework
- **ws** - WebSocket library for signaling
- **CORS** - Cross-origin resource sharing

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm 7+ (for workspace support)

### Installation

```bash
# Install all dependencies (from root)
npm install
```

### Development

```bash
# Run both client and server in development mode
npm run dev

# Or run them separately:
npm run dev:server    # Start backend on port 4430
npm run dev:client    # Start frontend on port 5173
```

### Production Build

```bash
# Build the client
npm run build

# Start the production server
npm run start
```

## Features

- 🎥 Video calling with WebRTC
- 📞 Audio calling
- 💬 Real-time chat messaging
- 👥 Online user presence
- 📱 Responsive design (mobile-friendly)
- 🔒 HTTPS/WSS support (with certificates)

## SSL Certificates

For HTTPS support, place your SSL certificates in the root directory:
- `server.cert` - SSL certificate
- `server.key` - SSL private key

If certificates are not found, the server will fall back to HTTP.

## Environment Variables

### Server
- `HOST` - Server host (default: `0.0.0.0`)
- `PORT` - Server port (default: `4430`)

## License

MIT
