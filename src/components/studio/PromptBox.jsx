import React, { useState } from 'react';

export default function PromptBox({ label, text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={styles.box}>
      <div style={styles.header}>
        <span style={styles.label}>{label}</span>
        <button style={styles.copyBtn} onClick={copy}>
          {copied ? '✓ COPIED' : 'COPY'}
        </button>
      </div>
      <p style={styles.text}>{text}</p>
    </div>
  );
}

const styles = {
  box: {
    background: '#222',
    border: '1px solid #3A3A3A',
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontSize: 9,
    fontWeight: 700,
    color: '#00A8E8',
    fontFamily: 'monospace',
    letterSpacing: '0.1em',
  },
  copyBtn: {
    background: 'transparent',
    border: 'none',
    color: '#555',
    fontSize: 9,
    cursor: 'pointer',
    fontFamily: 'monospace',
    letterSpacing: '0.08em',
  },
  text: {
    fontSize: 11,
    color: '#888',
    margin: 0,
    lineHeight: 1.6,
    fontFamily: 'monospace',
  },
};
