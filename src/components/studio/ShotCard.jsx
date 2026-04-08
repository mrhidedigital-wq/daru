// src/components/studio/ShotCard.jsx
import React, { useState } from 'react';
import FramePreview from './FramePreview';

const STATUS_BORDER = {
  pending:    '#3A3A3A',
  processing: '#FFB800',
  completed:  '#00D084',
  error:      '#FF4757',
};

export default function ShotCard({ shot, index, isSelected, onSelect, onEdit, onDelete, onGenerate }) {
  const [isHovered, setIsHovered] = useState(false);

  const status      = shot.status || 'pending';
  const borderColor = STATUS_BORDER[status] || '#3A3A3A';
  const fs          = shot.frame_start || {};
  const fe          = shot.frame_end   || {};
  const tr          = shot.transition  || {};
  const duration    = shot.duration_seconds || 4;

  return (
    <div
      onClick={() => onSelect?.(shot)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...styles.card,
        borderColor: isSelected ? '#00A8E8' : isHovered ? '#555' : borderColor,
        boxShadow: isSelected ? '0 0 0 1px #00A8E8' : 'none',
        cursor: 'pointer',
      }}
    >
      {/* Header */}
      <div style={styles.cardHeader}>
        <div style={styles.shotNumber}>
          <span style={styles.shotIndex}>{String(index + 1).padStart(3, '0')}</span>
          <span style={styles.shotName}>{shot.name || `Shot ${index + 1}`}</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.duration}>{duration}s</span>
          <StatusDot status={status} />
        </div>
      </div>

      {/* Frames START → END */}
      <div style={styles.framesRow}>
        <FramePreview
          label="FRAME START"
          imageUrl={shot.result_preview_url || null}
          status={status === 'completed' ? 'completed' : 'pending'}
          shotParams={{
            shotSize:   fs.shot || fs.camera?.shotSize,
            angle:      fs.angle || fs.camera?.angle,
            cameraMove: null,
          }}
        />

        {/* Arrow */}
        <div style={styles.arrow}>
          <div style={styles.arrowLine} />
          <svg width="8" height="12" viewBox="0 0 8 12" fill="#555">
            <path d="M0 0L8 6L0 12V0Z" />
          </svg>
        </div>

        <FramePreview
          label="FRAME END"
          imageUrl={shot.result_video_url ? null : null}
          status={status}
          shotParams={{
            shotSize:   fe.shot || fe.camera?.shotSize,
            angle:      fe.angle || fe.camera?.angle,
            cameraMove: tr.cameraMove,
          }}
        />
      </div>

      {/* Transition info */}
      <div style={styles.transitionRow}>
        <TransitionTag icon="⟳" label={tr.cameraMove?.replace(/_/g, ' ') || 'static'} />
        <TransitionTag icon="⏱" label={`${duration}s`} />
        {tr.timing && <TransitionTag icon="◈" label={tr.timing} />}
      </div>

      {/* Actions */}
      <div style={{ ...styles.actions, opacity: isHovered || isSelected ? 1 : 0 }}>
        <ActionBtn
          label="EDIT"
          color="#00A8E8"
          onClick={e => { e.stopPropagation(); onEdit?.(shot); }}
        />
        <ActionBtn
          label="GENERATE"
          color="#00D084"
          onClick={e => { e.stopPropagation(); onGenerate?.(shot); }}
          disabled={status === 'processing'}
        />
        <ActionBtn
          label="DELETE"
          color="#FF4757"
          onClick={e => { e.stopPropagation(); onDelete?.(shot); }}
        />
      </div>
    </div>
  );
}

function StatusDot({ status }) {
  const colors = {
    pending:    '#555',
    processing: '#FFB800',
    completed:  '#00D084',
    error:      '#FF4757',
  };
  return (
    <div style={{
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: colors[status] || '#555',
      boxShadow: status === 'processing' ? `0 0 6px ${colors.processing}` : 'none',
    }} />
  );
}

function TransitionTag({ icon, label }) {
  return (
    <div style={styles.tag}>
      <span style={{ color: '#00A8E8', fontSize: 10 }}>{icon}</span>
      <span style={styles.tagLabel}>{label}</span>
    </div>
  );
}

function ActionBtn({ label, color, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles.actionBtn,
        borderColor: color,
        color: color,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}

const styles = {
  card: {
    background: '#3A3A3A',
    border: '1px solid #3A3A3A',
    borderRadius: 6,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    transition: 'border-color 0.15s, box-shadow 0.15s',
    userSelect: 'none',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shotNumber: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  shotIndex: {
    fontSize: 10,
    fontWeight: 700,
    color: '#00A8E8',
    fontFamily: 'monospace',
    letterSpacing: '0.1em',
  },
  shotName: {
    fontSize: 12,
    fontWeight: 600,
    color: '#DDD',
    letterSpacing: '0.04em',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  duration: {
    fontSize: 10,
    color: '#888',
    fontFamily: 'monospace',
  },
  framesRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  arrow: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  arrowLine: {
    width: 16,
    height: 1,
    background: '#444',
  },
  transitionRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  tag: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: '#2A2A2A',
    border: '1px solid #444',
    borderRadius: 3,
    padding: '2px 7px',
  },
  tagLabel: {
    fontSize: 9,
    color: '#888',
    fontFamily: 'monospace',
    textTransform: 'capitalize',
    letterSpacing: '0.06em',
  },
  actions: {
    display: 'flex',
    gap: 6,
    transition: 'opacity 0.15s',
  },
  actionBtn: {
    background: 'transparent',
    border: '1px solid',
    borderRadius: 3,
    padding: '3px 10px',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.1em',
    fontFamily: 'monospace',
    transition: 'background 0.1s',
  },
};