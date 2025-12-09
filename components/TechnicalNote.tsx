import React from 'react';
import { Card } from './SharedUI';

export const TechnicalNote: React.FC = () => {
  return (
    <Card title="Technical Specifications: Shamir's Secret Sharing" className="mb-8">
      <div className="prose prose-invert max-w-none text-cyber-200 text-sm">
        <p className="mb-4">
          This system uses <strong>Shamir's Secret Sharing (SSS)</strong> to split the AES-256 encryption key into <em className="text-cyber-neon">n</em> pieces. 
          The key can only be reconstructed if <em className="text-cyber-neon">k</em> shares are combined. This is achieved through polynomial interpolation over a finite field.
        </p>

        <div className="grid md:grid-cols-2 gap-8 mt-6">
          <div className="bg-cyber-900 p-4 rounded border border-cyber-700">
            <h4 className="text-cyber-neon font-mono mb-2 border-b border-cyber-700 pb-2">1. Share Generation</h4>
            <p className="mb-2">We construct a random polynomial $f(x)$ of degree $k-1$:</p>
            <div className="font-mono bg-cyber-800 p-3 rounded text-xs text-yellow-200 overflow-x-auto mb-3">
              f(x) = S + a₁x + a₂x² + ... + aₖ₋₁xᵏ⁻¹ (mod P)
            </div>
            <ul className="list-disc list-inside space-y-1 text-cyber-300 text-xs">
              <li>$S$: The secret (AES Key)</li>
              <li>$P$: A large Mersenne Prime ($2^{521}-1$)</li>
              <li>$a_i$: Random coefficients</li>
            </ul>
          </div>

          <div className="bg-cyber-900 p-4 rounded border border-cyber-700">
            <h4 className="text-cyber-neon font-mono mb-2 border-b border-cyber-700 pb-2">2. Key Reconstruction</h4>
            <p className="mb-2">Given $k$ points $(x_i, y_i)$, we calculate $f(0)$ using Lagrange Interpolation:</p>
            <div className="font-mono bg-cyber-800 p-3 rounded text-xs text-yellow-200 overflow-x-auto mb-3">
              L(0) = ∑ (yⱼ · ∏ (xₘ / (xₘ - xⱼ))) (mod P)
            </div>
            <p className="text-cyber-300 text-xs">
              Where the outer sum is for $j=0$ to $k-1$, and the inner product is for all $m \neq j$.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
};
