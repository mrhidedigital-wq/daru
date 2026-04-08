// src/components/studio/FramePreview.jsx
import React from 'react';

const STATUS_COLORS = {
  pending:    '#555',
  processing: '#FFB800',
  completed:  '#00D084',
  error:      '#FF4757',
};

const STATUS_LABELS = {
  pending:    'PENDING',
  processing: 'PROCESSING',
  completed:  'DONE',
  error:      'ERROR',
};

export default function FramePreview({ label = 'FRAME', imageUrl = null, status = 'pending', shotParams = {} }) {
  const { shotSize, angle, cameraMove } = shotParams;

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.label}>{label}</span>
        <span style={{ ...styles.statusBadge, background: STATUS_COLORS[status] || '#555' }}>
          {STATUS_LABELS[status] || status.toUpperCase()}
        </span>
      </div>

      {/* Preview area */}
      <div style={styles.previewArea}>
        {imageUrl ? (
          <img src={imageUrl} alt={label} style={styles.image} />
        ) : (
          <div style={styles.placeholder}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
            <span style={styles.placeholderText}>No preview</span>
          </div>
        )}

        {/* Overlay grid lines (viewport feel) */}
        <div style={styles.gridOverlay} />

        {/* Corner marks */}
        <div style={{ ...styles.corner, top: 6, left: 6, borderTop: '2px solid #00A8E8', borderLeft: '2px solid #00A8E8' }} />
        <div style={{ ...styles.corner, top: 6, right: 6, borderTop: '2px solid #00A8E8', borderRight: '2px solid #00A8E8' }} />
        <div style={{ ...styles.corner, bottom: 6, left: 6, borderBottom: '2px solid #00A8E8', borderLeft: '2px solid #00A8E8' }} />
        <div style={{ ...styles.corner, bottom: 6, right: 6, borderBottom: '2px solid #00A8E8', borderRight: '2px solid #00A8E8' }} />
      </div>

      {/* Params */}
      <div style={styles.params}>
        {shotSize   && <Param icon="▣" value={shotSize.replace(/_/g, ' ')} />}
        {angle      && <Param icon="◎" value={angle.replace(/_/g, ' ')} />}
        {cameraMove && <Param icon="⟳" value={cameraMove.replace(/_/g, ' ')} />}
      </div>
    </div>
  );
}

function Param({ icon, value }) {
  return (
    <div style={styles.param}>
      <span style={styles.paramIcon}>{icon}</span>
      <span style={styles.paramValue}>{value}</span>
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flex: 1,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: '#888',
    fontFamily: 'monospace',
  },
  statusBadge: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#fff',
    padding: '2px 6px',
    borderRadius: 3,
    fontFamily: 'monospace',
  },
  previewArea: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16/9',
    background: '#1A1A1A',
    borderRadius: 4,
    overflow: 'hidden',
    border: '1px solid #3A3A3A',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  placeholderText: {
    fontSize: 10,
    color: '#444',
    fontFamily: 'monospace',
    letterSpacing: '0.08em',
  },
  gridOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
    backgroundSize: '20px 20px',
    pointerEvents: 'none',
  },
  corner: {
    position: 'absolute',
    width: 10,
    height: 10,
  },
  params: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  param: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  paramIcon: {
    fontSize: 9,
    color: '#00A8E8',
    width: 12,
    textAlign: 'center',
  },
  paramValue: {
    fontSize: 10,
    color: '#999',
    fontFamily: 'monospace',
    textTransform: 'capitalize',
  },
};