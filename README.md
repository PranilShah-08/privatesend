# LosslessDrop ⚡

> **Simple, minimalist, private peer-to-peer file transfer with bit-for-bit quality preservation, zero server storage, and strict two-party room security.**

[![Tests](https://img.shields.io/badge/tests-32%20passed-emerald)](https://github.com/PranilShah-08/lossless-drop)
[![Coverage](https://img.shields.io/badge/coverage-95.9%25-brightgreen)](https://github.com/PranilShah-08/lossless-drop)
[![Zero-Persistence](https://img.shields.io/badge/privacy-zero%20disk%20storage-blue)](PRIVACY.md)
[![License](https://img.shields.io/badge/license-MIT-zinc)](LICENSE)

---

## Highlights

- 🔒 **Zero Data Retention**: The server never writes, caches, or persists file payloads. All Docker containers and Kubernetes Pods enforce `readOnlyRootFilesystem: true`.
- ⚡ **True Bit-for-Bit Lossless Quality**: Zero compression, zero downsampling. Multi-GB files, RAW images, 4K videos, and archives transfer with 100% cryptographic fidelity.
- 🔑 **Simple Room Codes**: The receiver screen displays a clean, readable 6-digit room code (`482-194`). The sender simply enters that code to begin direct sharing.
- 🛡️ **Strict Two-Party Exclusivity**: Rooms accommodate exactly 1 receiver and 1 sender. Once paired, the room automatically locks against all third parties and brute-force attempts.
- 🌐 **WebRTC P2P DataChannels**: Direct browser-to-browser encrypted transfer (DTLS-SRTP) with adaptive backpressure flow control (`bufferedAmountLowThreshold`).
- 🔄 **Ephemeral Fallback Relay**: Seamless in-memory WebSocket chunk streaming if symmetric NATs block direct P2P.
- 🦀 **Rust Core Engine**: Standalone high-performance streaming hasher and chunk processor (`crates/lossless-core`).
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

### 1. Local Development
```bash
# Clone the repository
git clone https://github.com/PranilShah-08/lossless-drop.git
cd lossless-drop

# Install dependencies
npm install

# Run test suite with coverage
npm run test:coverage

# Build and start the production server
npm run build
npm start
```

Visit `http://localhost:3000` in your browser.

---

### 2. Docker & Docker Compose
```bash
# Start the web app, Rust core, and Python LlamaIndex microservice
docker-compose up --build
```

All containers run with `read_only: true` and temporary in-memory `/tmp` mounts (`tmpfs: size=64M`). Zero volumes are attached.

---

### 3. Kubernetes Deployment
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
| **Web Client** | React 18, TypeScript, Tailwind CSS | Minimalist, distraction-free room UI |
| **P2P Transfer** | WebRTC DataChannels, Web Crypto API | E2E encrypted, 100% bit-for-bit lossless data transfer |
| **Signaling Server** | Node.js, Express, Socket.io | Ephemeral 1-to-1 room management & WebRTC coordination |
| **Native Engine** | Rust (`crates/lossless-core`) | High-throughput streaming SHA-256 verifier & chunker |
| **AI Indexer** | Python, LlamaIndex, FastAPI | Ephemeral in-memory document indexing with zero disk storage |
| **Infrastructure** | Docker, Docker Compose, Kubernetes | Containerization with read-only rootfs and zero persistent disks |

---

## License

MIT License. Designed with privacy, minimalism, and performance.
