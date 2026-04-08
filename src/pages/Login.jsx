// src/pages/Login.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const C = {
  bg:     '#2A2A2A',
  panel:  '#333333',
  card:   '#3A3A3A',
  border: '#404040',
  accent: '#00A8E8',
  error:  '#FF4757',
  text:   '#DDDDDD',
  muted:  '#888888',
  dim:    '#555555',
};

export default function Login() {
  const { login, register } = useAuth();
  const navigate            = useNavigate();

  const [mode,     setMode]     = useState('login'); // 'login' | 'register'
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
      navigate('/');
    } catch (err) {
      setError(err.message || 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.root}>

      {/* Logo */}
      <div style={styles.logoArea}>
        <div style={styles.logoMark}>▶</div>
        <div>
          <div style={styles.appName}>DARU STUDIO</div>
          <div style={styles.appSub}>Cinematic DAG System</div>
        </div>
      </div>

      {/* Card */}
      <div style={styles.card}>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(mode === 'login' ? styles.tabActive : {}) }}
            onClick={() => { setMode('login'); setError(''); }}
          >
            LOGIN
          </button>
          <button
            style={{ ...styles.tab, ...(mode === 'register' ? styles.tabActive : {}) }}
            onClick={() => { setMode('register'); setError(''); }}
          >
            REGISTER
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form}>

          {/* Error */}
          {error && (
            <div style={styles.errorBox}>
              ⚠ {error}
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>EMAIL</label>
            <input
              type="email"
              autoFocus
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com"
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>PASSWORD</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Min. 6 characters' : '••••••••'}
              style={styles.input}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ ...styles.btnSubmit, opacity: loading ? 0.6 : 1 }}
          >
            {loading
              ? '...'
              : mode === 'login' ? 'ENTER STUDIO' : 'CREATE ACCOUNT'
            }
          </button>

        </form>
      </div>

      <div style={styles.footer}>
        Daru Studio v2.0 — DAG Cinematic System
      </div>
    </div>
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    background: C.bg,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  logoArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  logoMark: {
    width: 44,
    height: 44,
    background: C.accent,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    color: '#fff',
    fontWeight: 700,
  },
  appName: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '0.16em',
    color: C.text,
    fontFamily: 'monospace',
    lineHeight: 1.2,
  },
  appSub: {
    fontSize: 10,
    color: C.dim,
    fontFamily: 'monospace',
    letterSpacing: '0.1em',
  },
  card: {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    width: '100%',
    maxWidth: 380,
    overflow: 'hidden',
  },
  tabs: {
    display: 'flex',
    borderBottom: `1px solid ${C.border}`,
  },
  tab: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: C.dim,
    padding: '14px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    cursor: 'pointer',
    fontFamily: 'monospace',
    transition: 'color 0.15s',
  },
  tabActive: {
    color: C.accent,
    borderBottom: `2px solid ${C.accent}`,  // fix: no mezclar shorthand con longhand
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: 24,
  },
  errorBox: {
    background: 'rgba(255,71,87,0.12)',
    border: `1px solid ${C.error}`,
    borderRadius: 4,
    padding: '10px 14px',
    fontSize: 11,
    color: C.error,
    fontFamily: 'monospace',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 9,
    fontWeight: 700,
    color: C.muted,
    letterSpacing: '0.12em',
    fontFamily: 'monospace',
  },
  input: {
    background: '#2A2A2A',
    border: `1px solid ${C.border}`,
    borderRadius: 5,
    color: C.text,
    padding: '10px 14px',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  },
  btnSubmit: {
    background: C.accent,
    border: 'none',
    borderRadius: 5,
    color: '#fff',
    padding: '12px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    cursor: 'pointer',
    fontFamily: 'monospace',
    marginTop: 4,
    transition: 'opacity 0.2s',
  },
  footer: {
    fontSize: 10,
    color: C.dim,
    fontFamily: 'monospace',
    letterSpacing: '0.08em',
  },
};