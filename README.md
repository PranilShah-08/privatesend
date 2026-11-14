# PrivateSend ⚡

> **Simple, minimalist, private peer-to-peer file transfer with bit-for-bit quality preservation, zero server storage, and strict two-party room security.**

[![Live Web App](https://img.shields.io/badge/Live%20App-GitHub%20Pages-blue?style=for-the-badge&logo=github)](https://pranilshah-08.github.io/privatesend/)
[![Tests](https://img.shields.io/badge/tests-82%20passed-emerald?style=for-the-badge)](https://github.com/PranilShah-08/privatesend)
[![Zero-Persistence](https://img.shields.io/badge/privacy-zero%20disk%20storage-purple?style=for-the-badge)](PRIVACY.md)
[![License](https://img.shields.io/badge/license-MIT-zinc?style=for-the-badge)](LICENSE)

---

## 🌐 Live Web Application (Zero Domain Required)

Anyone anywhere can use PrivateSend instantly in their browser with zero install or server setup:

👉 **[https://pranilshah-08.github.io/privatesend/](https://pranilshah-08.github.io/privatesend/)**

- **Direct Browser-to-Browser**: File payloads transfer directly over WebRTC DataChannels (DTLS-SRTP).
- **Zero Server Storage**: Files never touch any server disk, cloud database, or third-party storage.
- **Works on All Devices**: Desktop, iOS Safari, Android Chrome, Firefox, and Edge.

---

## Highlights

- 🔒 **Zero Data Retention**: The server never writes, caches, or persists file payloads. All Docker containers and Kubernetes Pods enforce `readOnlyRootFilesystem: true`.
- ⚡ **True Bit-for-Bit Lossless Quality**: Zero compression, zero downsampling. Multi-GB files, RAW images, 4K videos, and archives transfer with 100% cryptographic fidelity.
- 🔑 **Simple Room Codes**: The receiver screen displays a clean, readable 6-digit room code (`482-194`). The sender simply enters that code to begin direct sharing.
- 🛡️ **Strict Two-Party Exclusivity**: Rooms accommodate exactly 1 receiver and 1 sender. Once paired, the room automatically locks against all third parties and brute-force attempts.
- 🌐 **WebRTC P2P DataChannels**: Direct browser-to-browser encrypted transfer (DTLS-SRTP) with adaptive backpressure flow control (`bufferedAmountLowThreshold`).
- 🔄 **Ephemeral Fallback Relay**: Seamless in-memory WebSocket chunk streaming if symmetric NATs block direct P2P.
- 🦀 **Rust Core Engine**: Standalone high-performance streaming hasher and zero-copy chunk processor (`crates/lossless-core`) with zeroized memory buffers.
- 🐍 **Python LlamaIndex Service**: Ephemeral in-memory AI semantic indexing microservice (`services/ai-indexer`) operating strictly in volatile RAM.
- 🐳 **Docker & Kubernetes Ready**: Production-grade multi-stage Dockerfiles, Docker Compose with read-only rootfs and tmpfs, and hardened K8s manifests.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Sender Browser                                │
│  ┌──────────────┐   ┌───────────────────┐   ┌───────────────────────┐  │
│  │ File Chunker │──>│ Web Crypto SHA256 │──>│ WebRTC RTCDataChannel │  │
│  │ (64KB Slices)│   │  Streaming Hash   │   │ (Backpressure Queue)  │  │
│  └──────────────┘   └───────────────────┘   └───────────┬───────────┘  │
└─────────────────────────────────────────────────────────┼──────────────┘
                    │ Signaling (SDP / ICE)               │
                    │ & Fallback Relay                    │ P2P Direct
                    ▼                                     │ DataChannel
┌─────────────────────────────────────────┐               │ (Lossless Chunks)
│     Node.js / Express Signaling Server  │               │
│  ┌───────────────────────────────────┐  │               │
│  │ Room Manager (1-to-1 Lock, TTL)   │  │               │
│  ├───────────────────────────────────┤  │               │
│  │ Sliding Rate Limiter (Brute-Force)│  │               │
│  ├───────────────────────────────────┤  │               │
│  │ Ephemeral Memory Chunk Forwarder  │  │               │
│  └───────────────────────────────────┘  │               │
└───────────────────┬─────────────────────┘               │
                    │ Signaling & Relay                   │
                    ▼                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Receiver Browser                               │
│  ┌───────────────────────┐   ┌───────────────────┐   ┌──────────────┐  │
│  │ WebRTC RTCDataChannel │──>│ Web Crypto SHA256 │──>│ Lossless     │  │
│  │ / WebSocket Fallback  │   │ Checksum Verify   │   │ File Save    │  │
│  └───────────────────────┘   └───────────────────┘   └──────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Web Application (Hosted on GitHub Pages)
Open [https://pranilshah-08.github.io/privatesend/](https://pranilshah-08.github.io/privatesend/) directly.

### 2. Local Development
```bash
# Clone the repository
git clone https://github.com/PranilShah-08/privatesend.git
cd privatesend

# Install dependencies
npm install

# Run test suite
npm test

# Build and start the production server
npm run build
npm start
```

Visit `http://localhost:3000` in your browser.

---

### 3. Docker & Docker Compose
```bash
# Start the web app, Rust core, and Python LlamaIndex microservice
docker-compose up --build
```

All containers run with `read_only: true` and temporary in-memory `/tmp` mounts (`tmpfs: size=64M`). Zero persistent volumes are attached.

---

### 4. Kubernetes Deployment
```bash
# Apply kustomization manifests
kubectl apply -k k8s/
```

Security configuration highlights in `k8s/deployment.yaml`:
```yaml
securityContext:
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  runAsNonRoot: true
volumes:
  - name: ephemeral-tmp
    emptyDir:
      medium: Memory
      sizeLimit: 64Mi
```

---

## Polyglot Stack

| Layer | Language / Technology | Purpose |
|---|---|---|
| **Web Client** | React 18, TypeScript, Tailwind CSS, PeerJS | Minimalist, distraction-free room UI |
| **P2P Transfer** | WebRTC DataChannels, Web Crypto API | E2E encrypted, 100% bit-for-bit lossless data transfer |
| **Signaling Server** | Node.js, Express, Socket.io | Ephemeral 1-to-1 room management & WebRTC coordination |
| **Native Engine** | Rust (`crates/lossless-core`) | High-throughput streaming SHA-256 verifier & chunker |
| **AI Indexer** | Python, LlamaIndex, FastAPI | Ephemeral in-memory document indexing with zero disk storage |
| **Infrastructure** | Docker, Docker Compose, Kubernetes | Containerization with read-only rootfs and zero persistent disks |

---

## License

MIT License. Designed with privacy, minimalism, and performance.
