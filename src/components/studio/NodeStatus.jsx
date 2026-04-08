import React from 'react';

export default function NodeStatus({ node }) {
  const colors = { pending: '#555', processing: '#FFB800', completed: '#00D084', error: '#FF4757' };
  const color  = colors[node.status] || '#555';
  return (
    <div style={{ ...styles.item, borderColor: color }}>
      <div style={{ ...styles.dot, background: color }} />
      <span style={styles.name}>{node.name || node.type}</span>
      {node.metrics?.costUsd > 0 && (
        <span style={styles.cost}>${node.metrics.costUsd.toFixed(4)}</span>
      )}
    </div>
  );
}

const styles = {
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    background: '#222',
    border: '1px solid',
    borderRadius: 3,
  },
  dot:  { width: 5, height: 5, borderRadius: '50%', flexShrink: 0 },
  name: { fontSize: 9, color: '#888', fontFamily: 'monospace', flex: 1, letterSpacing: '0.06em' },
  cost: { fontSize: 9, color: '#555', fontFamily: 'monospace' },
};
