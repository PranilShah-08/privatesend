import React from 'react';
import { MinimalHeader } from './components/MinimalHeader.js';
import { ModeSwitch } from './components/ModeSwitch.js';
import { ReceiverCard } from './components/ReceiverCard.js';
import { SenderCard } from './components/SenderCard.js';
import { TransferProgress } from './components/TransferProgress.js';
import { ChecksumBadge } from './components/ChecksumBadge.js';
import { useP2PTransfer } from './hooks/useP2PTransfer.js';

export const App: React.FC = () => {
  const {
    mode,
    setMode,
    roomCode,
    peerConnected,
    connectionMode,
    errorText,
    selectedFile,
    setSelectedFile,
    incomingManifest,
    isTransferring,
    transferStats,
    integrityReport,
    downloadUrl,
    joinRoom,
    createNewRoom,
    sendFile,
  } = useP2PTransfer();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col justify-between selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-zinc-900">
      <div className="max-w-md w-full mx-auto px-4 py-8 flex-1 flex flex-col justify-center">
        <MinimalHeader />

        <ModeSwitch
          mode={mode}
          onChange={(newMode) => setMode(newMode)}
          disabled={isTransferring}
        />

        <main className="mt-2">
          {mode === 'receiver' ? (
            <ReceiverCard
              roomCode={roomCode}
              peerConnected={peerConnected}
              connectionMode={connectionMode}
              onRefresh={createNewRoom}
            />
          ) : (
            <SenderCard
              peerConnected={peerConnected}
              onJoinRoom={joinRoom}
              selectedFile={selectedFile}
              onSelectFile={setSelectedFile}
              onSendFile={sendFile}
              isTransferring={isTransferring}
              errorText={errorText}
            />
          )}

          {/* Transfer Progress Telemetry */}
          {isTransferring && (
            <TransferProgress
              stats={transferStats}
              manifest={mode === 'receiver' ? incomingManifest : selectedFile ? {
                fileName: selectedFile.name,
                fileSize: selectedFile.size,
                fileType: selectedFile.type,
                type: 'MANIFEST',
                fileId: '',
                chunkSize: 65536,
                totalChunks: 1,
                sha256: '',
              } : null}
              isSender={mode === 'sender'}
            />
          )}

          {/* Cryptographic Lossless Proof */}
          {integrityReport && (
            <ChecksumBadge
              report={integrityReport}
              downloadUrl={downloadUrl}
            />
          )}
        </main>
      </div>

      <footer className="text-center py-6 text-xs text-zinc-400 dark:text-zinc-600">
        <p>LosslessDrop • Bit-for-bit direct browser-to-browser transmission</p>
      </footer>
    </div>
  );
};

export default App;
