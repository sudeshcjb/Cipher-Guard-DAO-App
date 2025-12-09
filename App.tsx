import React, { useState, useEffect } from 'react';
import { AppConfig, AuditLog, EncryptedFile, Share } from './types';
import { DEFAULT_CONFIG, MAX_SHARES, MIN_SHARES } from './constants';
import * as CryptoService from './services/cryptoService';
import { Card, Button, Input, Badge } from './components/SharedUI';
import { AuditLogView } from './components/AuditLogView';
import { TechnicalNote } from './components/TechnicalNote';

enum Tab {
  OWNER = 'OWNER',
  RECOVERY = 'RECOVERY',
  MANAGEMENT = 'MANAGEMENT',
  AUDIT = 'AUDIT'
}

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
      
      addLog('UPLOAD', `File encrypted. ${config.totalShares} key shares generated.`, 'Owner', hash);

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
        // Simple parse to validate format if needed, for now trusting raw input matches Share.data
        // We need to reconstruct Share object. 
        // Our Share.data is "x-y". The user inputs the whole string.
        return { id: 0, data: s.trim() }; 
      });

    if (sharesList.length < config.threshold) {
      setRecoveryError(`Need at least ${config.threshold} shares. Provided: ${sharesList.length}`);
      return;
    }

    setIsRecovering(true);
    setRecoveryError(null);
    addLog('RECOVERY_ATTEMPT', `Attempting reconstruction with ${sharesList.length} shares.`, 'ConsensusWrapper');

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
      
      addLog('RECOVERY_SUCCESS', 'Key reconstructed and file decrypted successfully.', 'ConsensusWrapper', encryptedFile.hash);

    } catch (err) {
      console.error(err);
      setRecoveryError("Decryption failed. Shares might be invalid or incorrect key reconstructed.");
      addLog('RECOVERY_ATTEMPT', 'Reconstruction failed: Invalid key derived.', 'System');
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
        {[Tab.OWNER, Tab.RECOVERY, Tab.MANAGEMENT, Tab.AUDIT].map((tab) => (
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

               {generatedShares.length > 0 && (
                 <Card title="Generated Key Shares (Distribute These)">
                   <div className="bg-yellow-900/20 border border-yellow-700/50 p-4 rounded mb-4 text-yellow-200 text-sm">
                     <strong>Warning:</strong> You must distribute these shares to different parties. Do not store them together. The original key is discarded after this step.
                   </div>
                   <div className="space-y-3">
                     {generatedShares.map((share) => (
                       <div key={share.id} className="flex items-center space-x-2">
                         <span className="bg-cyber-900 text-cyber-400 px-3 py-2 rounded border border-cyber-700 font-mono text-xs w-12 text-center">#{share.id}</span>
                         <input 
                            readOnly 
                            value={share.data} 
                            className="flex-1 bg-cyber-900 border border-cyber-700 rounded px-3 py-2 text-xs font-mono text-cyber-neon focus:outline-none"
                            onClick={(e) => e.currentTarget.select()}
                         />
                         <Button variant="ghost" onClick={() => navigator.clipboard.writeText(share.data)}>Copy</Button>
                         <Button 
                           variant="secondary" 
                           onClick={() => handleDownloadShare(share)} 
                           title="Download .share file"
                           className="px-3"
                         >
                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                         </Button>
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

        </div>

        {/* Right Column: Info & Tech Note */}
        <div className="lg:col-span-1 space-y-8">
           <TechnicalNote />
           
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
    </div>
  );
};

export default App;