// src/pages/ApiKeysSettings.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiKeysDB }   from '../lib/supabase/apiKeysDB';

const C = {
  bg:      '#2A2A2A',
  panel:   '#333333',
  card:    '#3A3A3A',
  border:  '#404040',
  accent:  '#00A8E8',
  success: '#00D084',
  warning: '#FFB800',
  error:   '#FF4757',
  text:    '#DDDDDD',
  muted:   '#888888',
  dim:     '#555555',
};

// ─── Campos estáticos (no el token de Vertex) ─────────────────
const STATIC_KEYS = [
  {
    group: 'VIDEO GENERATION',
    items: [
      {
        keyName:     'kling_api_key',
        label:       'KLING API KEY',
        description: 'Freepik API — generación de video con Kling 3.0 Pro',
        placeholder: 'sk-freepik-...',
        link:        'https://freepik.com/api',
      },
      {
        keyName:     'seeddance_api_key',
        label:       'SEEDDANCE API KEY',
        description: 'AIMLAPI — Seedance 2.0 / character consistency',
        placeholder: 'Bearer ...',
        link:        'https://aimlapi.com',
      },
      {
        keyName:     'google_cloud_project',
        label:       'GOOGLE CLOUD PROJECT ID',
        description: 'Project ID de GCP para Vertex AI / VEO 3.1 (ej: mi-proyecto-prod)',
        placeholder: 'my-gcp-project-id',
        link:        null,
        isSecret:    false,
      },
    ],
  },
  {
    group: 'LLM / AI',
    items: [
      {
        keyName:     'gemini_api_key',
        label:       'GEMINI API KEY',
        description: 'Google AI Studio — Gemini 2.5 Flash/Pro y fallback de VEO vía Gemini API',
        placeholder: 'AIzaSy...',
        link:        'https://aistudio.google.com/apikey',
      },
    ],
  },
];

// ─── Helper: tiempo restante formateado ──────────────────────
function fmtMins(mins) {
  if (mins === null) return null;
  if (mins <= 0)     return 'VENCIDO';
  if (mins >= 60)    return '60+ min';
  return `${Math.floor(mins)} min`;
}

function timerColor(mins) {
  if (mins === null || mins <= 0) return C.error;
  if (mins < 10)  return C.error;
  if (mins < 30)  return C.warning;
  return C.success;
}

// ─── Componente: fila de key estática ────────────────────────
function KeyRow({ keyName, label, description, placeholder, isSecret = true, value, onChange, onSave, status }) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 5, padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
            {label}
          </div>
          <div style={{ fontSize: 8, color: C.dim, fontFamily: 'monospace', marginTop: 2 }}>
            {description}
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type={isSecret && !visible ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1,
            background: '#1A1A1A',
            border:  `1px solid ${value ? C.border : C.dim + '60'}`,
            borderRadius: 4,
            color: C.text,
            padding: '7px 10px',
            fontSize: 10,
            fontFamily: 'monospace',
            outline: 'none',
          }}
        />
        {isSecret && (
          <button
            onClick={() => setVisible(v => !v)}
            style={S.iconBtn}
            title={visible ? 'Ocultar' : 'Mostrar'}
          >
            {visible ? '🙈' : '👁'}
          </button>
        )}
        <button
          onClick={onSave}
          disabled={status === 'saving'}
          style={{
            ...S.saveBtn,
            background: status === 'saving' ? C.dim : C.accent,
            cursor: status === 'saving' ? 'not-allowed' : 'pointer',
          }}
        >
          {status === 'saving' ? '...' : 'GUARDAR'}
        </button>
      </div>
    </div>
  );
}

// ─── Badge de estado ─────────────────────────────────────────
function StatusBadge({ status }) {
  if (!status || status === 'idle') return null;
  const map = {
    saving:  { label: '...',      color: C.muted },
    saved:   { label: '✓ SAVED',  color: C.success },
    error:   { label: '✕ ERROR',  color: C.error },
    loaded:  { label: '● DB',     color: C.accent },
    env:     { label: '● .ENV',   color: C.dim },
    empty:   { label: '○ VACÍO',  color: C.dim },
  };
  const info = map[status] || map.idle;
  return (
    <span style={{
      fontSize: 8, fontFamily: 'monospace', fontWeight: 700,
      color: info.color, letterSpacing: '0.08em', flexShrink: 0,
    }}>
      {info.label}
    </span>
  );
}

// ─── Componente principal ─────────────────────────────────────
export default function ApiKeysSettings() {
  const navigate = useNavigate();

  // Estado de valores
  const [values,   setValues]   = useState({
    kling_api_key:        '',
    seeddance_api_key:    '',
    gemini_api_key:       '',
    google_cloud_project: '',
    vertex_access_token:  '',
  });
  // Estado por key: 'idle' | 'saving' | 'saved' | 'error' | 'loaded' | 'env' | 'empty'
  const [statuses, setStatuses] = useState({});
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  // Estado Vertex token
  const [tokenMins,      setTokenMins]      = useState(null);   // minutos restantes
  const [tokenExpired,   setTokenExpired]   = useState(false);
  const [tokenUpdatedAt, setTokenUpdatedAt] = useState(null);

  // ── Cargar todas las keys desde Supabase al montar ──────────
  const loadKeys = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await apiKeysDB.getAll();

      const newValues   = { ...values };
      const newStatuses = {};

      for (const keyName of Object.keys(newValues)) {
        const row = rows[keyName];
        if (row?.key_value) {
          newValues[keyName]   = row.key_value;
          newStatuses[keyName] = 'loaded';
        } else {
          newStatuses[keyName] = 'empty';
        }
      }

      // Estado del token Vertex
      const vtRow = rows['vertex_access_token'];
      if (vtRow?.key_value && vtRow?.updated_at) {
        const ageMs    = Date.now() - new Date(vtRow.updated_at).getTime();
        const minsLeft = Math.max(0, 60 - ageMs / 60_000);
        setTokenMins(Math.floor(minsLeft));
        setTokenExpired(minsLeft <= 0);
        setTokenUpdatedAt(vtRow.updated_at);
      }

      setValues(newValues);
      setStatuses(newStatuses);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  // ── Timer: actualizar minutos restantes cada 30s ─────────────
  useEffect(() => {
    if (!tokenUpdatedAt) return;
    const tick = () => {
      const ageMs    = Date.now() - new Date(tokenUpdatedAt).getTime();
      const minsLeft = Math.max(0, 60 - ageMs / 60_000);
      setTokenMins(Math.floor(minsLeft));
      setTokenExpired(minsLeft <= 0);
    };
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [tokenUpdatedAt]);

  // ── Guardar key ──────────────────────────────────────────────
  const handleSave = async (keyName) => {
    setStatuses(prev => ({ ...prev, [keyName]: 'saving' }));
    try {
      await apiKeysDB.set(keyName, values[keyName]);
      setStatuses(prev => ({ ...prev, [keyName]: 'saved' }));
      // Si guardamos el vertex token, actualizamos el timer
      if (keyName === 'vertex_access_token') {
        const now = new Date().toISOString();
        setTokenUpdatedAt(now);
        setTokenMins(60);
        setTokenExpired(false);
      }
      // Volver a 'loaded' después de 2s
      setTimeout(() => setStatuses(prev => ({ ...prev, [keyName]: 'loaded' })), 2000);
    } catch (err) {
      setStatuses(prev => ({ ...prev, [keyName]: 'error' }));
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div style={{ ...S.root, justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ color: C.muted, fontFamily: 'monospace', fontSize: 11 }}>⟳ Cargando...</span>
      </div>
    );
  }

  return (
    <div style={S.root}>

      {/* ── TOP BAR ─────────────────────────────────────────── */}
      <div style={S.topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/')} style={S.backBtn}>← DASHBOARD</button>
          <div>
            <div style={S.appName}>DARU STUDIO</div>
            <div style={S.version}>API Keys · Settings</div>
          </div>
        </div>
        <div style={{ fontSize: 9, color: C.dim, fontFamily: 'monospace', textAlign: 'right', lineHeight: 1.5 }}>
          Las keys se guardan en Supabase.<br />
          Solo SUPABASE_URL y ANON_KEY van en Vercel.
        </div>
      </div>

      {/* ── MAIN ─────────────────────────────────────────────── */}
      <div style={S.main}>

        {/* Error global */}
        {error && (
          <div style={S.errorBox}>
            <span>⚠ {error}</span>
            <button onClick={() => setError(null)} style={S.iconBtnSmall}>✕</button>
          </div>
        )}

        {/* ── Secciones de keys estáticas ─────────────────── */}
        {STATIC_KEYS.map(section => (
          <div key={section.group} style={S.section}>
            <div style={S.sectionHeader}>
              <span style={S.sectionLabel}>{section.group}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {section.items.map(item => (
                <KeyRow
                  key={item.keyName}
                  keyName={item.keyName}
                  label={item.label}
                  description={item.description}
                  placeholder={item.placeholder}
                  isSecret={item.isSecret !== false}
                  value={values[item.keyName] || ''}
                  onChange={v => setValues(prev => ({ ...prev, [item.keyName]: v }))}
                  onSave={() => handleSave(item.keyName)}
                  status={statuses[item.keyName]}
                />
              ))}
            </div>
          </div>
        ))}

        {/* ── Vertex Access Token (especial) ──────────────── */}
        <div style={S.section}>
          <div style={S.sectionHeader}>
            <span style={S.sectionLabel}>VERTEX AI ACCESS TOKEN</span>
            <span style={{
              fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
              color: timerColor(tokenExpired ? 0 : tokenMins),
            }}>
              {tokenMins === null
                ? '○ NO CONFIGURADO'
                : tokenExpired
                  ? '⚠ VENCIDO — genera uno nuevo'
                  : `● ${fmtMins(tokenMins)} restantes`
              }
            </span>
          </div>

          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 5, padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>

            {/* Descripción */}
            <p style={{ margin: 0, fontSize: 9, color: C.muted, fontFamily: 'monospace', lineHeight: 1.6 }}>
              Token OAuth2 de corta duración para <span style={{ color: C.accent }}>VEO 3.1 via Vertex AI</span>.
              Vence a los <strong style={{ color: C.text }}>60 minutos</strong>. Debes regenerarlo periódicamente.
            </p>

            {/* Timer visual */}
            {tokenMins !== null && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#1A1A1A', border: `1px solid ${timerColor(tokenExpired ? 0 : tokenMins)}40`,
                borderRadius: 4, padding: '8px 12px',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: timerColor(tokenExpired ? 0 : tokenMins),
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  {tokenExpired ? (
                    <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: C.error }}>
                      TOKEN VENCIDO — genera uno nuevo con el comando de abajo
                    </span>
                  ) : (
                    <>
                      <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: timerColor(tokenMins) }}>
                        {fmtMins(tokenMins)} restantes
                      </div>
                      {tokenUpdatedAt && (
                        <div style={{ fontSize: 8, color: C.dim, fontFamily: 'monospace', marginTop: 2 }}>
                          Generado: {new Date(tokenUpdatedAt).toLocaleTimeString()}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Barra de progreso */}
                {!tokenExpired && tokenMins !== null && (
                  <div style={{ width: 80, height: 4, background: '#333', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width:  `${Math.min(100, (tokenMins / 60) * 100)}%`,
                      background: timerColor(tokenMins),
                      borderRadius: 2,
                      transition: 'width 1s linear',
                    }} />
                  </div>
                )}
              </div>
            )}

            {/* Comando a copiar */}
            <div>
              <div style={{ fontSize: 8, fontWeight: 700, color: C.muted, fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 4 }}>
                COMANDO — ejecuta esto en tu terminal:
              </div>
              <div style={{
                background: '#111', border: `1px solid ${C.border}`,
                borderRadius: 4, padding: '8px 12px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}>
                <code style={{ fontSize: 11, fontFamily: 'monospace', color: C.success, letterSpacing: '0.04em' }}>
                  gcloud auth print-access-token
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText('gcloud auth print-access-token')}
                  style={{ ...S.iconBtnSmall, fontSize: 9, padding: '3px 8px', color: C.muted }}
                >
                  COPIAR
                </button>
              </div>
            </div>

            {/* Textarea para pegar el token */}
            <div>
              <div style={{ fontSize: 8, fontWeight: 700, color: C.muted, fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 4 }}>
                PEGA EL TOKEN AQUÍ:
              </div>
              <textarea
                value={values.vertex_access_token}
                onChange={e => setValues(prev => ({ ...prev, vertex_access_token: e.target.value }))}
                placeholder="ya29.a0Aa7MYi..."
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'vertical',
                  background: '#1A1A1A', color: C.text,
                  border: `1px solid ${values.vertex_access_token ? C.accent + '80' : C.border}`,
                  borderRadius: 4, padding: '8px 10px',
                  fontSize: 10, fontFamily: 'monospace', lineHeight: 1.5, outline: 'none',
                }}
              />
            </div>

            {/* Botón guardar */}
            <button
              onClick={() => handleSave('vertex_access_token')}
              disabled={!values.vertex_access_token.trim() || statuses.vertex_access_token === 'saving'}
              style={{
                ...S.saveBtn,
                padding: '10px 0',
                background: !values.vertex_access_token.trim()
                  ? C.dim
                  : statuses.vertex_access_token === 'saving'
                    ? C.dim
                    : C.accent,
                cursor: !values.vertex_access_token.trim() ? 'not-allowed' : 'pointer',
                opacity: !values.vertex_access_token.trim() ? 0.4 : 1,
                width: '100%',
              }}
            >
              {statuses.vertex_access_token === 'saving'
                ? '⟳ GUARDANDO...'
                : statuses.vertex_access_token === 'saved'
                  ? '✓ GUARDADO — timer reiniciado'
                  : '▶ GUARDAR TOKEN Y REINICIAR TIMER'
              }
            </button>

            <div style={{ fontSize: 8, color: C.dim, fontFamily: 'monospace', lineHeight: 1.5 }}>
              ⚡ El token se almacena en Supabase con timestamp. Si han pasado más de 60 min, el sistema lo trata como inexistente y cae a las variables de entorno.
            </div>
          </div>
        </div>

        {/* ── Info Vercel ──────────────────────────────────── */}
        <div style={{
          background: 'rgba(0,168,232,0.05)',
          border: `1px solid rgba(0,168,232,0.2)`,
          borderRadius: 5, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.accent, fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 6 }}>
            ◈ DESPLIEGUE EN VERCEL
          </div>
          <div style={{ fontSize: 9, color: C.muted, fontFamily: 'monospace', lineHeight: 1.7 }}>
            Solo necesitas 2 variables de entorno en Vercel:<br />
            <code style={{ color: C.text }}>REACT_APP_SUPABASE_URL</code> y <code style={{ color: C.text }}>REACT_APP_SUPABASE_ANON_KEY</code><br /><br />
            Todas las demás keys (Kling, SeedDance, Gemini, Vertex) se leen desde esta página en runtime.
          </div>
        </div>

      </div>
    </div>
  );
}

const S = {
  root: {
    minHeight: '100vh',
    background: C.bg,
    display: 'flex',
    flexDirection: 'column',
  },
  topBar: {
    background: C.panel,
    borderBottom: `1px solid ${C.border}`,
    padding: '12px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: {
    background: 'transparent',
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    color: C.muted,
    padding: '4px 10px',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.08em',
    cursor: 'pointer',
    fontFamily: 'monospace',
  },
  appName: {
    fontSize: 12,
    fontWeight: 700,
    color: C.text,
    letterSpacing: '0.12em',
    fontFamily: 'monospace',
  },
  version: {
    fontSize: 8,
    color: C.dim,
    fontFamily: 'monospace',
    letterSpacing: '0.06em',
  },
  main: {
    flex: 1,
    maxWidth: 720,
    width: '100%',
    margin: '0 auto',
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 4,
    borderBottom: `1px solid ${C.border}`,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: C.muted,
    letterSpacing: '0.14em',
    fontFamily: 'monospace',
  },
  saveBtn: {
    border: 'none',
    borderRadius: 4,
    color: '#000',
    padding: '7px 14px',
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '0.1em',
    fontFamily: 'monospace',
    flexShrink: 0,
    transition: 'background 0.15s',
  },
  iconBtn: {
    background: '#1A1A1A',
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: 12,
    flexShrink: 0,
  },
  iconBtnSmall: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: C.muted,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  errorBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(255,71,87,0.1)',
    border: `1px solid ${C.error}`,
    borderRadius: 4,
    padding: '8px 12px',
    fontSize: 10,
    color: C.error,
    fontFamily: 'monospace',
  },
};
