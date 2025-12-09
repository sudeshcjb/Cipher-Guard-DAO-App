
import React from 'react';
import { AuditLog } from '../types';
import { Badge } from './SharedUI';

interface Props {
  logs: AuditLog[];
}

export const AuditLogView: React.FC<Props> = ({ logs }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 mb-6">
        <h2 className="text-xl font-bold text-cyber-100">Immutable Ledger</h2>
        <span className="text-xs text-cyber-400 font-mono">({logs.length} Blocks)</span>
      </div>

      <div className="relative border-l-2 border-cyber-600 ml-3 space-y-8">
        {logs.slice().reverse().map((log, index) => (
          <div key={log.id} className="relative pl-8">
            {/* Timeline Dot */}
            <div className={`absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-cyber-900 ${
              log.action === 'UPLOAD' ? 'bg-cyber-neon' : 
              log.action === 'RECOVERY_SUCCESS' ? 'bg-cyber-info' : 
              log.action === 'RECOVERY_FAILED' ? 'bg-cyber-alert' :
              log.action === 'RECOVERY_ATTEMPT' ? 'bg-yellow-500' :
              'bg-cyber-400'
            }`}></div>
            
            <div className="bg-cyber-800 p-4 rounded border border-cyber-700 hover:border-cyber-500 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <span className="font-mono text-xs text-cyber-400">{new Date(log.timestamp).toLocaleString()}</span>
                <span className="font-mono text-xs text-cyber-500">Block #{logs.length - index}</span>
              </div>
              
              <div className="flex items-center space-x-3 mb-2">
                <span className={`font-bold text-sm ${
                   log.action === 'UPLOAD' ? 'text-cyber-neon' : 
                   log.action === 'RECOVERY_SUCCESS' ? 'text-cyber-info' : 
                   log.action === 'RECOVERY_FAILED' ? 'text-cyber-alert' :
                   'text-cyber-200'
                }`}>
                  {log.action}
                </span>
                <Badge color={
                  log.action === 'RECOVERY_FAILED' ? 'red' : 
                  log.action === 'RECOVERY_ATTEMPT' ? 'red' : 'blue'
                }>{log.actor}</Badge>
              </div>
              
              <p className="text-sm text-cyber-300 mb-2">{log.details}</p>
              
              {log.fileHash && (
                <div className="mt-2 p-2 bg-cyber-900 rounded border border-cyber-700 font-mono text-xs text-cyber-400 break-all">
                  <span className="text-cyber-500 select-none">SHA256: </span>{log.fileHash}
                </div>
              )}
            </div>
          </div>
        ))}

        {logs.length === 0 && (
          <div className="pl-8 text-cyber-500 italic">No transactions recorded yet.</div>
        )}
      </div>
    </div>
  );
};
