import { useState, useEffect, useCallback, useRef } from 'react';
import { io as socketIO, Socket } from 'socket.io-client';
import { getFriendlyDeviceName } from '../services/wifiDiscoveryService.js';
import type {
  NearbyPeer,
  TransferConsentRequest,
  ServerToClientEvents,
  ClientToServerEvents,
} from '../../../shared/types.js';

export function useLocalDiscovery(peerId: string) {
  const [nearbyPeers, setNearbyPeers] = useState<NearbyPeer[]>([]);
  const [pendingRequest, setPendingRequest] = useState<TransferConsentRequest | null>(null);
  const [requestStatusText, setRequestStatusText] = useState<string | null>(null);

  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const requestResolversRef = useRef<Map<string, (receiverPeerId: string) => void>>(new Map());
  const requestRejectorsRef = useRef<Map<string, (reason: string) => void>>(new Map());
  const peerIdRef = useRef<string>(peerId);
  peerIdRef.current = peerId;

  // Initialize socket connection once on mount
  useEffect(() => {
    // If running on a static host without a backend (such as GitHub Pages), skip Socket.IO
    if (typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')) {
      return;
    }

    const socketUrl =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000';

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = socketIO(socketUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnectionAttempts: 3,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (peerIdRef.current) {
        socket.emit('local:announce', {
          deviceName: getFriendlyDeviceName(),
          peerId: peerIdRef.current,
        });
      }
    });

    socket.on('local:peers-updated', (peers) => {
      // Filter out self
      const others = peers.filter(
        (p) => p.socketId !== socket.id && (!peerIdRef.current || p.peerId !== peerIdRef.current)
      );
      setNearbyPeers(others);
    });

    socket.on('local:incoming-request', (req) => {
      setPendingRequest(req);
    });

    socket.on('local:request-accepted', ({ requestId, receiverPeerId }) => {
      setRequestStatusText('Request accepted! Connecting direct encrypted channel...');
      const resolver =
        requestResolversRef.current.get(requestId) ??
        requestResolversRef.current.get('latest') ??
        requestResolversRef.current.values().next().value;

      if (resolver) {
        resolver(receiverPeerId);
        requestResolversRef.current.delete(requestId);
        requestResolversRef.current.delete('latest');
      }
    });

    socket.on('local:request-declined', ({ requestId, reason }) => {
      setRequestStatusText(reason || 'Transfer request declined by peer.');
      setTimeout(() => setRequestStatusText(null), 5000);
      const rejector =
        (requestId ? requestRejectorsRef.current.get(requestId) : undefined) ??
        requestRejectorsRef.current.get('latest') ??
        requestRejectorsRef.current.values().next().value;

      if (rejector) {
        rejector(reason);
        if (requestId) {
          requestRejectorsRef.current.delete(requestId);
        }
        requestRejectorsRef.current.delete('latest');
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Whenever peerId changes (e.g. room code generated, refreshed, or cleared), announce/unannounce to cluster
  useEffect(() => {
    if (!socketRef.current?.connected) return;
    if (peerId) {
      socketRef.current.emit('local:announce', {
        deviceName: getFriendlyDeviceName(),
        peerId,
      });
    } else {
      socketRef.current.emit('local:announce', {
        deviceName: '',
        peerId: '',
      });
    }
  }, [peerId]);

  const requestTransfer = useCallback(
    (
      targetSocketId: string,
      details: {
        fileCount: number;
        totalBytes: number;
        firstFileName: string;
        isFolder?: boolean;
        folderName?: string;
      }
    ): Promise<string> => {
      return new Promise((resolve, reject) => {
        if (!socketRef.current) {
          reject(new Error('Signaling socket not connected.'));
          return;
        }

        setRequestStatusText('Waiting for peer to accept transfer request...');

        const timeout = setTimeout(() => {
          setRequestStatusText('Transfer request timed out.');
          setTimeout(() => setRequestStatusText(null), 4000);
          reject(new Error('Transfer request timed out.'));
        }, 30000);

        const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        socketRef.current.emit('local:request-transfer', {
          requestId,
          targetSocketId,
          senderDeviceName: getFriendlyDeviceName(),
          senderPeerId: peerId,
          ...details,
        });

        // Store resolver mapped to exact requestId and fallback 'latest'
        requestResolversRef.current.set(requestId, (peer) => {
          clearTimeout(timeout);
          resolve(peer);
        });
        requestResolversRef.current.set('latest', (peer) => {
          clearTimeout(timeout);
          resolve(peer);
        });

        requestRejectorsRef.current.set(requestId, (reason) => {
          clearTimeout(timeout);
          reject(new Error(reason));
        });
        requestRejectorsRef.current.set('latest', (reason) => {
          clearTimeout(timeout);
          reject(new Error(reason));
        });
      });
    },
    [peerId]
  );

  const acceptIncomingRequest = useCallback(() => {
    if (!pendingRequest || !socketRef.current) return;

    socketRef.current.emit('local:respond-transfer', {
      requestId: pendingRequest.requestId,
      senderSocketId: pendingRequest.senderSocketId,
      accepted: true,
      receiverPeerId: peerId,
    });

    setPendingRequest(null);
  }, [pendingRequest, peerId]);

  const declineIncomingRequest = useCallback(() => {
    if (!pendingRequest || !socketRef.current) return;

    socketRef.current.emit('local:respond-transfer', {
      requestId: pendingRequest.requestId,
      senderSocketId: pendingRequest.senderSocketId,
      accepted: false,
    });

    setPendingRequest(null);
  }, [pendingRequest]);

  return {
    nearbyPeers,
    pendingRequest,
    requestStatusText,
    requestTransfer,
    acceptIncomingRequest,
    declineIncomingRequest,
  };
}
