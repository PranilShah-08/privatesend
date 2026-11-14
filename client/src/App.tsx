import React from 'react';
import { MinimalHeader } from './components/MinimalHeader.js';
import { ModeSwitch } from './components/ModeSwitch.js';
import { ReceiverCard } from './components/ReceiverCard.js';
import { SenderCard } from './components/SenderCard.js';
import { TransferProgress } from './components/TransferProgress.js';
import { ChecksumBadge } from './components/ChecksumBadge.js';
import { BatchItemCard, BatchItemState } from './components/BatchItemCard.js';
import { AIInspectorDrawer } from './components/AIInspectorDrawer.js';
import { ConsentModal } from './components/ConsentModal.js';
import { LocalDevicesList } from './components/LocalDevicesList.js';
import { FolderTreeViewer } from './components/FolderTreeViewer.js';
import { useP2PTransfer } from './hooks/useP2PTransfer.js';
import { useLocalDiscovery } from './hooks/useLocalDiscovery.js';
import type { NearbyPeer } from '../../shared/types.js';

export const App: React.FC = () => {
  const {
    mode,
    setMode,
    roomCode,
    peerConnected,
    connectionMode,
    errorText,
    selectedFiles,
    setSelectedFiles,
    batchItems,
    activeItemIndex,
    batchManifest,
    incomingManifest,
    isTransferring,
    transferStats,
    integrityReport,
    batchIntegrityReport,
    downloadUrl,
    inspectItem,
    setInspectItem,
    joinRoom,
    createNewRoom,
    sendFiles,
    panicWipeSession,
    // Version 2.1 extensions
    isBroadcastHost,
    connectedReceiversCount,
    connectedReceiverIds,
    initBroadcastSession,
    cancelBroadcastSession,
    isFolder,
    rootFolderName,
    setSelectedFolder,
  } = useP2PTransfer();

  const {
    nearbyPeers,
    pendingRequest,
    requestStatusText,
    requestTransfer,
    acceptIncomingRequest,
    declineIncomingRequest,
  } = useLocalDiscovery(roomCode);

  const handleInspectAI = (item: BatchItemState) => {
    setInspectItem(item);
  };

  const handleSelectNearbyPeer = async (peer: NearbyPeer) => {
    if (selectedFiles.length === 0) {
      return;
    }

    try {
      const receiverPeerId = await requestTransfer(peer.socketId, {
        fileCount: selectedFiles.length,
        totalBytes: selectedFiles.reduce((acc, f) => acc + f.size, 0),
        firstFileName: selectedFiles[0]?.name || (isFolder ? rootFolderName : 'file'),
        isFolder,
        folderName: isFolder ? rootFolderName : undefined,
      });

      if (receiverPeerId) {
        const connected = await joinRoom(receiverPeerId);
        if (connected) {
          // Automatically start transmitting files once peer consented and connected!
          await sendFiles(true);
        }
      }
    } catch (err) {
      console.error('Local peer transfer request rejected or failed', err);
    }
  };

  const currentFile =
    batchManifest?.files[activeItemIndex] ||
    (selectedFiles[activeItemIndex]
      ? {
          fileName: selectedFiles[activeItemIndex].name,
          fileSize: selectedFiles[activeItemIndex].size,
          fileType: selectedFiles[activeItemIndex].type,
          type: 'MANIFEST' as const,
          fileId: '',
          chunkSize: 65536,
          totalChunks: 1,
          sha256: '',
        }
      : incomingManifest);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col justify-between selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-zinc-900">
      <div className="max-w-md w-full mx-auto px-4 py-8 flex-1 flex flex-col justify-center">
        <MinimalHeader onPanicWipe={panicWipeSession} />

        <ModeSwitch
          mode={mode}
          onChange={(newMode) => setMode(newMode)}
          disabled={isTransferring}
        />

        <main className="mt-2 space-y-4">
          {mode === 'receiver' ? (
            <ReceiverCard
              roomCode={roomCode}
              peerConnected={peerConnected}
              connectionMode={connectionMode}
              onRefresh={createNewRoom}
              onJoinBroadcast={joinRoom}
            />
          ) : (
            <>
              <SenderCard
                peerConnected={peerConnected}
                onJoinRoom={joinRoom}
                selectedFiles={selectedFiles}
                onSelectFiles={setSelectedFiles}
                onSendFiles={sendFiles}
                isTransferring={isTransferring}
                errorText={errorText}
                isBroadcastHost={isBroadcastHost}
                broadcastRoomCode={roomCode}
                connectedReceiversCount={connectedReceiversCount}
                receiverIds={connectedReceiverIds}
                onInitBroadcast={initBroadcastSession}
                onCancelBroadcast={cancelBroadcastSession}
                isFolder={isFolder}
                folderName={rootFolderName}
                onSelectFolder={setSelectedFolder}
              />

              {/* Local Wi-Fi Nearby Devices Presence */}
              {!peerConnected && !isBroadcastHost && (
                <LocalDevicesList
                  peers={nearbyPeers}
                  onSelectPeer={handleSelectNearbyPeer}
                  statusText={requestStatusText}
                  isTransferring={isTransferring}
                  selectedCount={selectedFiles.length}
                />
              )}
            </>
          )}

          {/* Transfer Progress Telemetry */}
          {isTransferring && (
            <TransferProgress
              stats={transferStats}
              manifest={currentFile || null}
              isSender={mode === 'sender'}
              currentFileIndex={activeItemIndex}
              totalFiles={batchManifest?.totalFiles || selectedFiles.length || 1}
            />
          )}

          {/* Folder Hierarchy Preview & In-Memory Zip Download */}
          {isFolder && batchItems.length > 0 && (
            <FolderTreeViewer
              folderName={rootFolderName}
              files={batchItems.map((item) => ({
                fileName: item.fileName,
                fileSize: item.fileSize,
                relativePath: item.relativePath,
                rawBlob: item.rawBlob,
              }))}
              allVerified={batchIntegrityReport?.allMatched}
            />
          )}

          {/* Multi-File Batch Items List */}
          {batchItems.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Batch Queue ({batchItems.length} {batchItems.length === 1 ? 'file' : 'files'})
                </span>
                {batchManifest?.encrypted && (
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    AES-256-GCM
                  </span>
                )}
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                {batchItems.map((item) => (
                  <BatchItemCard
                    key={`${item.fileName}-${item.fileIndex}`}
                    item={item}
                    onInspectAI={handleInspectAI}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Single-File Cryptographic Proof fallback */}
          {integrityReport && batchItems.length === 0 && (
            <ChecksumBadge report={integrityReport} downloadUrl={downloadUrl} />
          )}
        </main>
      </div>

      {/* Local Wi-Fi Transfer Consent Prompt Modal */}
      <ConsentModal
        request={pendingRequest}
        onAccept={acceptIncomingRequest}
        onDecline={declineIncomingRequest}
      />

      {/* Ephemeral AI Document Inspector Drawer */}
      {inspectItem && inspectItem.rawBlob && (
        <AIInspectorDrawer
          isOpen={Boolean(inspectItem)}
          onClose={() => setInspectItem(null)}
          blob={inspectItem.rawBlob}
          fileName={inspectItem.fileName}
        />
      )}

      <footer className="text-center py-6 text-xs text-zinc-400 dark:text-zinc-600">
        <p>PrivateSend v2 • Bit-for-bit direct browser-to-browser transmission</p>
      </footer>
    </div>
  );
};

export default App;
