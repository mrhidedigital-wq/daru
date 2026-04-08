// src/components/studio/ShotList.jsx
import React, { useState } from 'react';
import ShotCard from './ShotCard';

export default function ShotList({
  shots = [],
  selectedShotId,
  onSelectShot,
  onEditShot,
  onDeleteShot,
  onGenerateShot,
  onAddShot,
  isGeneratingAll,
  onDragStart,
  onDragOver,
  onDrop,
}) {
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [draggingIdx, setDraggingIdx] = useState(null);

  const totalDuration = shots.reduce((s, sh) => s + (sh.duration_seconds || 4), 0);
  const completedCount = shots.filter(s => s.status === 'completed').length;
  const processingCount = shots.filter(s => s.status === 'processing').length;

  const handleDragStart = (index) => {
    setDraggingIdx(index);
    onDragStart?.(index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    onDragOver?.(e);
    if (index !== dragOverIdx) setDragOverIdx(index);
  };

  const handleDrop = (index) => {
    setDragOverIdx(null);
    setDraggingIdx(null);
    onDrop?.(index);
  };

  const handleDragEnd = () => {
    setDragOverIdx(null);
    setDraggingIdx(null);
  };

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>SHOT LIST</span>
          <span style={styles.count}>{shots.length} shots · {totalDuration}s</span>
        </div>
        <div style={styles.headerRight}>
          {processingCount > 0 && (
            <span style={styles.processingBadge}>
              ⟳ {processingCount} processing
            </span>
          )}
          {shots.length > 0 && (
            <span style={styles.progressBadge}>
              {completedCount}/{shots.length}
            </span>
          )}
        </div>
      </div>

      {/* Timeline bar */}
      {shots.length > 0 && (
        <div style={styles.timeline}>
          {shots.map((shot, i) => {
            const width = ((shot.duration_seconds || 4) / Math.max(totalDuration, 1)) * 100;
            const statusColors = {
              pending:    '#3A3A3A',
              processing: '#FFB800',
              completed:  '#00D084',
              error:      '#FF4757',
            };
            return (
              <div
                key={shot.id || i}
                onClick={() => onSelectShot?.(shot)}
                style={{
                  ...styles.timelineBlock,
                  width: `${width}%`,
                  background: selectedShotId === shot.id ? '#00A8E8' : statusColors[shot.status] || '#3A3A3A',
                  borderRight: i < shots.length - 1 ? '1px solid #2A2A2A' : 'none',
                }}
                title={`Shot ${i + 1} — ${shot.duration_seconds || 4}s`}
              >
                <span style={styles.timelineLabel}>{i + 1}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Shots */}
      <div style={styles.shotsList}>
        {shots.length === 0 ? (
          <div style={styles.empty}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
            <p style={styles.emptyText}>No shots yet</p>
            <p style={styles.emptySubtext}>Add a shot to start building your sequence</p>
          </div>
        ) : (
          shots.map((shot, index) => (
            <div
              key={shot.id || index}
              draggable={!!onDragStart}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              style={{
                cursor: onDragStart ? (draggingIdx === index ? 'grabbing' : 'grab') : 'default',
                opacity: draggingIdx === index ? 0.4 : 1,
                transition: 'opacity 0.15s, transform 0.15s',
                transform: dragOverIdx === index && draggingIdx !== index ? 'translateY(4px)' : 'none',
                position: 'relative',
              }}
            >
              {/* Drop indicator line — shows above the card when dragging over */}
              {dragOverIdx === index && draggingIdx !== index && (
                <div style={{
                  position: 'absolute',
                  top: -4,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: '#00A8E8',
                  borderRadius: 2,
                  boxShadow: '0 0 6px rgba(0,168,232,0.5)',
                  zIndex: 10,
                }} />
              )}
              <ShotCard
                shot={shot}
                index={index}
                isSelected={selectedShotId === shot.id}
                onSelect={onSelectShot}
                onEdit={onEditShot}
                onDelete={onDeleteShot}
                onGenerate={onGenerateShot}
              />
            </div>
          ))
        )}
      </div>

      {/* Add shot button */}
      <button style={styles.addBtn} onClick={onAddShot}>
        <span style={styles.addIcon}>+</span>
        <span style={styles.addLabel}>ADD SHOT</span>
      </button>
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    gap: 0,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    borderBottom: '1px solid #333',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: '#888',
    fontFamily: 'monospace',
  },
  count: {
    fontSize: 10,
    color: '#555',
    fontFamily: 'monospace',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  processingBadge: {
    fontSize: 9,
    color: '#FFB800',
    fontFamily: 'monospace',
    animation: 'pulse 1.5s infinite',
  },
  progressBadge: {
    fontSize: 9,
    color: '#00D084',
    fontFamily: 'monospace',
    background: 'rgba(0,208,132,0.1)',
    padding: '2px 7px',
    borderRadius: 3,
  },
  timeline: {
    display: 'flex',
    height: 24,
    background: '#222',
    flexShrink: 0,
    overflow: 'hidden',
    cursor: 'pointer',
  },
  timelineBlock: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s',
    minWidth: 20,
  },
  timelineLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'monospace',
    fontWeight: 700,
  },
  shotsList: {
    flex: 1,
    overflowY: 'auto',
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: '#555',
    fontWeight: 600,
    margin: 0,
  },
  emptySubtext: {
    fontSize: 11,
    color: '#444',
    margin: 0,
    textAlign: 'center',
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: 10,
    padding: '10px',
    background: 'transparent',
    border: '1px dashed #444',
    borderRadius: 5,
    color: '#666',
    cursor: 'pointer',
    transition: 'all 0.15s',
    flexShrink: 0,
  },
  addIcon: {
    fontSize: 16,
    color: '#00A8E8',
    lineHeight: 1,
  },
  addLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.1em',
    fontFamily: 'monospace',
  },
};