
import React, { useState, useEffect, useRef } from 'react';
import { AppConfig, AuditLog, EncryptedFile, Share } from './types';
import { DEFAULT_CONFIG, MAX_SHARES, MIN_SHARES } from './constants';
import * as CryptoService from './services/cryptoService';
import { Card, Button, Input, Badge, Modal } from './components/SharedUI';
import { AuditLogView } from './components/AuditLogView';
import { TechnicalNote } from './components/TechnicalNote';

enum Tab {
  OWNER = 'OWNER',
  RECOVERY = 'RECOVERY',
  MANAGEMENT = 'MANAGEMENT',
  AUDIT = 'AUDIT',
  TECHNICAL = 'TECHNICAL'
}

// Helper component for QR Generation using the window.QRious library
const QRCodeCanvas: React.FC<{ value: string }> = ({ value }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current && (window as any).QRious) {
      // @ts-ignore
      new window.QRious({
        element: canvasRef.current,
        value: value,
        size: 150,
        background: '#0a0a0f', // cyber-900
        foreground: '#00ff9d', // cyber-neon
        level: 'H'
      });
    }
  }, [value]);
  return <canvas ref={canvasRef} className="rounded border border-cyber-600" />;
};

const App: React.FC = () => {
  // State
  const [activeTab, setActiveTab] = useState<Tab>(Tab.OWNER);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  
  // Owner State
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [generatedShares, setGeneratedShares] = useState<Share[]>([]);
  const [encryptedFile, setEncryptedFile] = useState<EncryptedFile | null>(null);
  const [isDistributionModalOpen, setIsDistributionModalOpen] = useState(false);
  
  // Recovery State
  const [recoveryShares, setRecoveryShares] = useState<Record<number, string>>({});
  const [recoveredFileUrl, setRecoveredFileUrl] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  // Helper to add log
  const addLog = (action: AuditLog['action'], details: string, actor: string = 'System', fileHash?: string) => {
    const newLog: AuditLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      action,
      details,
      actor,
      fileHash
    };
    setLogs(prev => [...prev, newLog]);
  };

  // --- Handlers ---

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFileToUpload(e.target.files[0]);
      setGeneratedShares([]);
      setEncryptedFile(null);
    }
  };

  const handleDownloadShare = (share: Share) => {
    const blob = new Blob([share.data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `share-${share.id}.share`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addLog('DISTRIBUTE_SHARES', `Downloaded share #${share.id} locally.`, 'Owner');
  };

  const processEncryption = async () => {
    if (!fileToUpload) return;
    
    setIsEncrypting(true);
    try {
      // 1. Generate AES Key
      const key = await CryptoService.generateAESKey();
      
      // 2. Encrypt File
      const { encryptedData, iv, hash } = await CryptoService.encryptFile(fileToUpload, key);
      
      // 3. Export Key and Split (SSS)
      const keyHex = await CryptoService.exportKeyToHex(key);
      const shares = CryptoService.splitSecret(keyHex, config.totalShares, config.threshold);
      
      // 4. Update State
      const encryptedFileObj: EncryptedFile = {
        name: fileToUpload.name,
        type: fileToUpload.type,
        size: fileToUpload.size,
        data: CryptoService.bufferToBase64(encryptedData),
        iv: CryptoService.bufferToHex(iv.buffer as ArrayBuffer),
        hash: hash
      };

      setEncryptedFile(encryptedFileObj);
      setGeneratedShares(shares);
      
      addLog('UPLOAD', `File uploaded & encrypted. Original SHA-256 hash recorded on ledger. Generated ${config.totalShares} shares.`, 'Owner', hash);
      // Auto open distribution center on success
      setIsDistributionModalOpen(true);

    } catch (err) {
      console.error(err);
      alert("Encryption failed.");
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleShareInput = (index: number, value: string) => {
    setRecoveryShares(prev => ({ ...prev, [index]: value }));
  };

  const processRecovery = async () => {
    if (!encryptedFile) {
      setRecoveryError("No file is currently stored in the contract.");
      return;
    }

    const sharesList = (Object.values(recoveryShares) as string[])
      .filter(s => s.trim() !== "")
      .map(s => {
        return { id: 0, data: s.trim() }; 
      });

    if (sharesList.length < config.threshold) {
      setRecoveryError(`Need at least ${config.threshold} shares. Provided: ${sharesList.length}`);
      addLog('RECOVERY_FAILED', `Recovery rejected. Insufficient shares provided (${sharesList.length}/${config.threshold}).`, 'ConsensusWrapper');
      return;
    }

    setIsRecovering(true);
    setRecoveryError(null);
    addLog('RECOVERY_ATTEMPT', `Initiating reconstruction consensus with ${sharesList.length} shares.`, 'ConsensusWrapper');

    try {
      // 1. Reconstruct Key
      const keyHex = CryptoService.reconstructSecret(sharesList);
      
      // 2. Import Key
      const key = await CryptoService.importKeyFromHex(keyHex);
      
      // 3. Decrypt
      const encryptedData = CryptoService.base64ToBuffer(encryptedFile.data);
      const iv = CryptoService.hexToBuffer(encryptedFile.iv);
      
      const decryptedBuffer = await CryptoService.decryptFile(encryptedData, new Uint8Array(iv), key);
      
      // 4. Create Download Link
      const blob = new Blob([decryptedBuffer], { type: encryptedFile.type });
      const url = URL.createObjectURL(blob);
      setRecoveredFileUrl(url);
      
      addLog('RECOVERY_SUCCESS', `Consensus reached. File decrypted successfully using ${sharesList.length} shares.`, 'ConsensusWrapper', encryptedFile.hash);

    } catch (err) {
      console.error(err);
      setRecoveryError("Decryption failed. Shares might be invalid or incorrect key reconstructed.");
      addLog('RECOVERY_FAILED', `Recovery failed. The provided ${sharesList.length} shares produced an invalid key.`, 'System');
    } finally {
      setIsRecovering(false);
    }
  };

  // --- Render ---

  return (
    <div className="min-h-screen font-sans text-gray-200 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="mb-10 flex flex-col md:flex-row justify-between items-center border-b border-cyber-700 pb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyber-neon to-cyber-info tracking-tighter">
            CIPHERGUARD <span className="text-cyber-100 font-light">DAO</span>
          </h1>
          <p className="text-cyber-400 mt-2 font-mono text-sm">Decentralized Key Recovery Service // v1.0.0</p>
        </div>
        <div className="mt-4 md:mt-0 flex space-x-2">
           <Badge color="green">System: ONLINE</Badge>
           <Badge color="blue">AES-256-GCM</Badge>
        </div>
      </header>

      {/* Nav */}
      <nav className="flex space-x-1 bg-cyber-800 p-1 rounded-lg mb-8 w-fit overflow-x-auto">
        {[Tab.OWNER, Tab.RECOVERY, Tab.MANAGEMENT, Tab.AUDIT, Tab.TECHNICAL].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab 
                ? 'bg-cyber-600 text-cyber-neon shadow-lg' 
                : 'text-cyber-400 hover:text-cyber-200 hover:bg-cyber-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Main Action Area */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* OWNER TAB */}
          {activeTab === Tab.OWNER && (
            <div className="space-y-6 animate-fade-in">
               <Card title="Secure File Upload">
                  <div className="border-2 border-dashed border-cyber-600 rounded-lg p-8 text-center hover:border-cyber-400 transition-colors bg-cyber-900/50">
                    <input 
                      type="file" 
                      onChange={handleFileUpload} 
                      className="hidden" 
                      id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                      <svg className="w-12 h-12 text-cyber-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                      <span className="text-cyber-200 font-medium">Click to select a sensitive document</span>
                      <span className="text-cyber-500 text-xs mt-2">Max size: 5MB (Local processing)</span>
                    </label>
                  </div>

                  {fileToUpload && (
                    <div className="mt-6 flex items-center justify-between bg-cyber-900 p-4 rounded border border-cyber-600">
                       <div className="flex items-center space-x-3">
                         <div className="bg-cyber-700 p-2 rounded"><svg className="w-5 h-5 text-cyber-neon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
                         <div>
                            <p className="text-sm font-bold text-cyber-100">{fileToUpload.name}</p>
                            <p className="text-xs text-cyber-400">{(fileToUpload.size / 1024).toFixed(2)} KB</p>
                         </div>
                       </div>
                       <Button onClick={processEncryption} disabled={isEncrypting}>
                         {isEncrypting ? 'Encrypting...' : 'Encrypt & Fragment Key'}
                       </Button>
                    </div>
                  )}
               </Card>

               {encryptedFile && (
                <Card title="Encryption Manifest" className="border-t border-cyber-neon">
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="bg-cyber-900 p-3 rounded border border-cyber-700">
                         <span className="block text-xs text-cyber-500 uppercase tracking-widest mb-1">File Name</span>
                         <span className="text-cyber-100 text-sm font-medium truncate block" title={encryptedFile.name}>{encryptedFile.name}</span>
                      </div>
                      <div className="bg-cyber-900 p-3 rounded border border-cyber-700">
                         <span className="block text-xs text-cyber-500 uppercase tracking-widest mb-1">Type</span>
                         <span className="text-cyber-100 text-xs font-mono truncate block" title={encryptedFile.type}>{encryptedFile.type || 'N/A'}</span>
                      </div>
                      <div className="bg-cyber-900 p-3 rounded border border-cyber-700">
                         <span className="block text-xs text-cyber-500 uppercase tracking-widest mb-1">Size</span>
                         <span className="text-cyber-100 text-sm font-mono">{(encryptedFile.size / 1024).toFixed(2)} KB</span>
                      </div>
                      <div className="bg-cyber-900 p-3 rounded border border-cyber-700">
                         <span className="block text-xs text-cyber-500 uppercase tracking-widest mb-1">Scheme</span>
                         <span className="text-cyber-neon text-sm font-mono font-bold">N={config.totalShares}</span>
                         <span className="text-cyber-400 mx-1">/</span>
                         <span className="text-cyber-info text-sm font-mono font-bold">K={config.threshold}</span>
                      </div>
                   </div>
                   
                   <div className="bg-cyber-900 p-3 rounded border border-cyber-700">
                      <span className="block text-xs text-cyber-500 uppercase tracking-widest mb-1">SHA-256 Hash (Integrity Check)</span>
                      <span className="text-cyber-300 text-xs font-mono break-all">{encryptedFile.hash}</span>
                   </div>
                </Card>
               )}

               {generatedShares.length > 0 && (
                 <Card title="Key Distribution">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-cyber-300 text-sm">
                        <span className="text-cyber-neon font-bold">{generatedShares.length} shares</span> generated. Distribute these to trustees.
                      </p>
                      <Button variant="primary" onClick={() => setIsDistributionModalOpen(true)}>
                        Open Distribution Hub
                      </Button>
                    </div>
                   <div className="space-y-3 opacity-50 pointer-events-none filter blur-[1px]">
                     {/* Preview of shares (disabled state to encourage using the hub) */}
                     {generatedShares.slice(0, 3).map((share) => (
                       <div key={share.id} className="flex items-center space-x-2">
                         <span className="bg-cyber-900 text-cyber-400 px-3 py-2 rounded border border-cyber-700 font-mono text-xs w-12 text-center">#{share.id}</span>
                         <input readOnly value="************************" className="flex-1 bg-cyber-900 border border-cyber-700 rounded px-3 py-2 text-xs font-mono text-cyber-500" />
                       </div>
                     ))}
                   </div>
                 </Card>
               )}
            </div>
          )}

          {/* RECOVERY TAB */}
          {activeTab === Tab.RECOVERY && (
            <div className="space-y-6 animate-fade-in">
              <Card title="Consensus Recovery">
                <p className="text-cyber-300 text-sm mb-6">
                  Requires <strong>{config.threshold}</strong> out of <strong>{config.totalShares}</strong> shares to reconstruct the decryption key.
                </p>

                {!encryptedFile ? (
                  <div className="text-center py-12 text-cyber-500 border border-cyber-700 border-dashed rounded">
                    No encrypted file found in session memory. Upload one in the "Owner" tab first.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Array.from({ length: config.threshold }).map((_, idx) => (
                      <div key={idx} className="flex flex-col">
                         <label className="text-xs text-cyber-400 mb-1 font-mono uppercase">Share Input #{idx + 1}</label>
                         <input
                           type="text"
                           placeholder="Paste share string here (e.g. 1-2a3b...)"
                           className="w-full bg-cyber-900 border border-cyber-600 text-cyber-100 rounded px-3 py-3 font-mono text-sm focus:border-cyber-info focus:ring-1 focus:ring-cyber-info focus:outline-none"
                           onChange={(e) => handleShareInput(idx, e.target.value)}
                         />
                      </div>
                    ))}
                    
                    {recoveryError && (
                      <div className="bg-red-900/20 border border-red-500/50 text-red-300 p-3 rounded text-sm">
                        {recoveryError}
                      </div>
                    )}

                    <div className="pt-4">
                      <Button onClick={processRecovery} disabled={isRecovering} className="w-full h-12 text-lg">
                        {isRecovering ? 'Reconstructing...' : 'Reconstruct Key & Decrypt'}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>

              {recoveredFileUrl && (
                <Card title="Decrypted Asset" className="border-cyber-neon shadow-[0_0_20px_rgba(0,255,157,0.15)]">
                  <div className="flex flex-col items-center justify-center p-6 text-center">
                    <div className="h-16 w-16 bg-cyber-neon rounded-full flex items-center justify-center mb-4">
                      <svg className="w-8 h-8 text-cyber-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Decryption Successful</h3>
                    <p className="text-cyber-300 mb-6">The original file has been restored locally.</p>
                    <a 
                      href={recoveredFileUrl} 
                      download={encryptedFile?.name || "recovered_file"}
                      className="bg-cyber-neon text-cyber-900 px-8 py-3 rounded font-bold hover:bg-emerald-400 transition-colors uppercase tracking-wide shadow-lg"
                    >
                      Download File
                    </a>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* MANAGEMENT TAB */}
          {activeTab === Tab.MANAGEMENT && (
            <div className="animate-fade-in">
              <Card title="DAO Governance Parameters">
                <div className="space-y-8 p-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-cyber-200 font-medium">Total Shares (n)</label>
                      <span className="text-cyber-neon font-mono text-xl">{config.totalShares}</span>
                    </div>
                    <input 
                      type="range" 
                      min={MIN_SHARES} 
                      max={MAX_SHARES} 
                      value={config.totalShares} 
                      onChange={(e) => {
                        const n = parseInt(e.target.value);
                        const k = Math.min(config.threshold, n);
                        setConfig({ totalShares: n, threshold: k });
                        addLog('CONFIG_CHANGE', `Updated Total Shares (n) to ${n}`, 'Admin');
                      }}
                      className="w-full h-2 bg-cyber-700 rounded-lg appearance-none cursor-pointer accent-cyber-neon"
                    />
                    <p className="text-xs text-cyber-400 mt-2">The total number of keys to generate and distribute.</p>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-cyber-200 font-medium">Recovery Threshold (k)</label>
                      <span className="text-cyber-info font-mono text-xl">{config.threshold}</span>
                    </div>
                    <input 
                      type="range" 
                      min={2} 
                      max={config.totalShares} 
                      value={config.threshold} 
                      onChange={(e) => {
                         const k = parseInt(e.target.value);
                         setConfig(prev => ({ ...prev, threshold: k }));
                         addLog('CONFIG_CHANGE', `Updated Threshold (k) to ${k}`, 'Admin');
                      }}
                      className="w-full h-2 bg-cyber-700 rounded-lg appearance-none cursor-pointer accent-cyber-info"
                    />
                    <p className="text-xs text-cyber-400 mt-2">The minimum number of shares required to reconstruct the key.</p>
                  </div>

                  <div className="bg-cyber-900 p-4 rounded border border-cyber-700">
                    <h4 className="text-cyber-300 uppercase text-xs font-bold tracking-widest mb-2">Current Security Model</h4>
                    <p className="text-lg">
                      <span className="text-cyber-info">{config.threshold}</span> of <span className="text-cyber-neon">{config.totalShares}</span> Multi-Sig
                    </p>
                    <p className="text-cyber-400 text-sm mt-1">
                      This setup tolerates up to {config.totalShares - config.threshold} compromised or lost key shares without data loss or leakage.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* AUDIT TAB */}
          {activeTab === Tab.AUDIT && (
            <div className="animate-fade-in">
              <AuditLogView logs={logs} />
            </div>
          )}

          {/* TECHNICAL TAB */}
          {activeTab === Tab.TECHNICAL && (
            <div className="animate-fade-in">
              <TechnicalNote />
            </div>
          )}

        </div>

        {/* Right Column: Info & Tech Note */}
        <div className="lg:col-span-1 space-y-8">
           
           <Card title="System Status" className="border border-cyber-600">
              <div className="space-y-4 text-sm font-mono">
                <div className="flex justify-between">
                  <span className="text-cyber-400">Encryption</span>
                  <span className="text-cyber-neon">AES-GCM-256</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cyber-400">Secret Sharing</span>
                  <span className="text-cyber-info">Shamir (GF 2^521-1)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cyber-400">Client Side</span>
                  <span className="text-green-400">True</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cyber-400">Session ID</span>
                  <span className="text-cyber-200">{Math.random().toString(36).substr(2, 6).toUpperCase()}</span>
                </div>
              </div>
           </Card>
        </div>

      </main>

      {/* Distribution Modal */}
      <Modal 
        isOpen={isDistributionModalOpen} 
        onClose={() => setIsDistributionModalOpen(false)} 
        title="Share Distribution Hub"
      >
        <div className="space-y-8">
           <div className="bg-cyber-800 p-4 rounded border-l-4 border-cyber-info text-sm text-cyber-200">
             <p className="font-bold text-cyber-info mb-1">Security Protocol:</p>
             <p>Distribute each share to a unique trustee via a secure channel. 
             Do not send multiple shares to the same person. 
             The QR codes are generated locally in your browser.</p>
           </div>

           <div className="grid grid-cols-1 gap-8">
             {generatedShares.map((share, index) => (
               <div key={share.id} className="bg-cyber-900 border border-cyber-700 rounded-lg p-6 flex flex-col md:flex-row gap-6 hover:border-cyber-500 transition-colors">
                  
                  {/* Visual QR Side */}
                  <div className="flex flex-col items-center space-y-2 min-w-[150px]">
                    <div className="bg-white p-2 rounded">
                       <QRCodeCanvas value={share.data} />
                    </div>
                    <span className="text-xs text-cyber-500 font-mono uppercase tracking-widest">Trustee #{share.id}</span>
                  </div>

                  {/* Actions Side */}
                  <div className="flex-1 space-y-4">
                     <div className="flex items-center justify-between">
                        <h4 className="text-cyber-neon font-bold text-lg">Share #{share.id}</h4>
                        <Badge color="blue">UNCLAIMED</Badge>
                     </div>
                     
                     <div className="relative">
                        <label className="text-xs text-cyber-400 uppercase font-mono">Raw Share Data</label>
                        <div className="flex mt-1">
                          <input 
                            readOnly 
                            value={share.data} 
                            className="w-full bg-cyber-800 border border-cyber-600 rounded-l px-3 py-2 text-xs font-mono text-cyber-300 focus:outline-none"
                          />
                          <button 
                            onClick={() => navigator.clipboard.writeText(share.data)}
                            className="bg-cyber-700 hover:bg-cyber-600 border border-l-0 border-cyber-600 rounded-r px-3 text-cyber-200"
                            title="Copy to Clipboard"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          </button>
                        </div>
                     </div>

                     <div className="flex flex-wrap gap-2">
                        <Button 
                           variant="secondary" 
                           className="text-xs py-1"
                           onClick={() => handleDownloadShare(share)}
                        >
                           <span className="mr-2">⬇</span> Download .share
                        </Button>
                        <a 
                          href={`mailto:?subject=CipherGuard Key Share #${share.id}&body=Here is your key share for the DAO recovery process:%0D%0A%0D%0A${share.data}%0D%0A%0D%0APlease store this securely.`}
                          className="bg-cyber-600 text-cyber-100 hover:bg-cyber-500 border border-cyber-500 inline-flex items-center justify-center px-4 py-1 rounded font-medium text-xs uppercase tracking-wider transition-all"
                        >
                           <span className="mr-2">✉</span> Email Trustee
                        </a>
                     </div>
                  </div>
               </div>
             ))}
           </div>
           
           <div className="text-center pt-4">
             <Button variant="ghost" onClick={() => setIsDistributionModalOpen(false)}>Close Distribution Hub</Button>
           </div>
        </div>
      </Modal>
    </div>
  );
};

export default App;
