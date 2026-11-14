# Privacy & Zero-Retention Architecture

LosslessDrop is built with privacy as an immutable constraint:

## 1. Zero Disk Persistence
- **No File Storage**: Neither the signaling server nor any backend component ever writes, caches, or stores file payload bytes on disk.
- **Read-Only Container Filesystems**: All Docker containers and Kubernetes Pods run with `readOnlyRootFilesystem: true`. The underlying OS physically prohibits writing files to disk.
- **Volatile Ephemeral RAM Mounts**: The only writable directory is `/tmp`, which is mounted as an in-memory `tmpfs` / `emptyDir: { medium: "Memory" }` capped at 64MB. All memory is instantly flushed upon container termination.
- **No Persistent Volumes (Zero PVCs)**: The Kubernetes manifests deliberately define **zero** PersistentVolumeClaims, guaranteeing no cloud storage, volumes, or disks are attached.

## 2. End-to-End Encrypted Peer-to-Peer (WebRTC)
- Files flow directly between Browser A and Browser B via WebRTC DataChannels.
- All data in transit is encrypted using **DTLS-SRTP** (Datagram Transport Layer Security).
- The signaling server acts only as an initial transient handshake broker for WebRTC SDP offers/answers and ICE candidates. Payload bytes do not traverse the server in P2P mode.

## 3. Strict Two-Party Room Exclusivity
- Room codes are strictly 1-to-1: 1 Receiver (Host) and 1 Sender (Peer).
- As soon as the sender enters the room code and connects, the room status transitions to `LOCKED`.
- Any third party attempting to join or guess the code is immediately blocked (`ROOM_LOCKED`).
- Brute-force rate limiting enforces lockouts after 5 consecutive failed code attempts.
- Upon disconnection or transfer completion, the room and its code self-destruct from volatile memory.

## 4. Ephemeral In-Memory LlamaIndex Service
- The Python AI Indexer processes documents purely in volatile RAM (`VectorStoreIndex` with ephemeral storage).
- Extracted insights/summaries are returned immediately over the session, and the in-memory index is purged without persistent traces.

## 5. Lossless SHA-256 Bit-for-Bit Verification
- Both sender and receiver compute hardware-accelerated SHA-256 cryptographic checksums.
- Receiver verifies that the incoming digest matches the sender's manifest bit-for-bit before permitting file save, guaranteeing zero compression, zero downsampling, and zero tampering.
