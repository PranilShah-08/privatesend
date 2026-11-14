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

  useEffect(() => {
    const socketUrl =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000';

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = socketIO(socketUrl, {
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (peerId) {
        socket.emit('local:announce', {
          deviceName: getFriendlyDeviceName(),
          peerId,
        });
      }
    });

    socket.on('local:peers-updated', (peers) => {
      // Filter out self
      const others = peers.filter(
        (p) => p.socketId !== socket.id && (!peerId || p.peerId !== peerId)
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
      }
      requestRejectorsRef.current.clear();
      requestResolversRef.current.clear();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
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

        socketRef.current.emit('local:request-transfer', {
          targetSocketId,
          senderDeviceName: getFriendlyDeviceName(),
          senderPeerId: peerId,
          ...details,
        });

        // Store resolver
        const requestId = 'latest';
        requestResolversRef.current.set(requestId, (peer) => {
          clearTimeout(timeout);
          resolve(peer);
        });
        requestRejectorsRef.current.set(requestId, (reason) => {
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
