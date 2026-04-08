import React from 'react';

export default function LoadingScreen() {
  return (
    <div style={{ background: '#2A2A2A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#555' }}>
        <div style={{ fontSize: 24, marginBottom: 12, color: '#00A8E8' }}>▶</div>
        <div style={{ fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.1em' }}>LOADING STUDIO...</div>
      </div>
    </div>
  );
}
