// src/pages/DaruDashboard.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate }   from 'react-router-dom';
import { useAuth }       from '../contexts/AuthContext';
import { projectsDB }    from '../lib/supabase/database';

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

const STATUS_COLORS = {
  draft:       C.dim,
  in_progress: C.warning,
  completed:   C.success,
  archived:    '#444',
};

const FORMATO_LABELS = {
  '16:9': '16:9',
  '9:16': '9:16',
  '1:1':  '1:1',
};

export default function DaruDashboard() {
  const { user, logout }     = useAuth();
  const navigate             = useNavigate();

  const [projects,    setProjects]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [creating,    setCreating]    = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [error,       setError]       = useState(null);
  const [newProject,  setNewProject]  = useState({
    name: '', description: '', duration_seconds: 15, format: '16:9',
  });

 useEffect(() => {
  if (user?.id) loadProjects();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [user?.id]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await projectsDB.getAll(user.id);
      setProjects(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newProject.name.trim()) return;
    try {
      setCreating(true);
      const created = await projectsDB.create(user.id, newProject);
      setProjects(prev => [created, ...prev]);
      setShowNewForm(false);
      setNewProject({ name: '', description: '', duration_seconds: 15, format: '16:9' });
      navigate(`/studio/${created.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (projectId, e) => {
    e.stopPropagation();
    if (!window.confirm('¿Eliminar este proyecto? Esta acción no se puede deshacer.')) return;
    try {
      await projectsDB.delete(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (err) {
      setError(err.message);
    }
  };

  const stats = {
    total:     projects.length,
    completed: projects.filter(p => p.status === 'completed').length,
    active:    projects.filter(p => p.status === 'in_progress').length,
  };

  return (
    <div style={styles.root}>

      {/* TOP BAR */}
      <div style={styles.topBar}>
        <div style={styles.topLeft}>
          <div style={styles.logo}>▶</div>
          <div>
            <div style={styles.appName}>DARU STUDIO</div>
            <div style={styles.version}>v2.2 — DAG System</div>
          </div>
        </div>
        <div style={styles.topNav}>
          <button
            style={styles.navBtn}
            onClick={() => {}}
          >
            🎬 STUDIO
          </button>
          <button
            style={{ ...styles.navBtn, ...styles.navBtnEditor }}
            onClick={() => navigate('/editor')}
          >
            ✨ EDITOR
          </button>
          <button
            style={{ ...styles.navBtn, ...styles.navBtnStoryboard }}
            onClick={() => navigate('/storyboard')}
          >
            🎞 STORYBOARD
          </button>
          <button
            style={{ ...styles.navBtn, color: C.dim, borderColor: C.border }}
            onClick={() => navigate('/settings')}
          >
            ⚙ API KEYS
          </button>
        </div>
        <div style={styles.topRight}>
          <span style={styles.userEmail}>{user?.email}</span>
          <button style={styles.btnLogout} onClick={logout}>SALIR</button>
        </div>
      </div>

      {/* MAIN */}
      <div style={styles.main}>

        {/* Stats */}
        <div style={styles.statsRow}>
          <StatCard label="PROYECTOS"  value={stats.total}     />
          <StatCard label="COMPLETADOS" value={stats.completed} color={C.success} />
          <StatCard label="ACTIVOS"    value={stats.active}    color={C.warning} />
        </div>

        {/* ── EDITOR ACCESS CARD ── */}
        <div
          onClick={() => navigate('/editor')}
          style={styles.editorCard}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#7C3AED'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = C.border}
        >
          <div style={styles.editorCardLeft}>
            <div style={styles.editorIcon}>✨</div>
            <div>
              <div style={styles.editorTitle}>DARU EDITOR</div>
              <div style={styles.editorSub}>
                Sube una imagen o video y edítalo con instrucciones en lenguaje natural.
                Cambia productos, colores, fondos — arrastra elementos de referencia para product swaps.
              </div>
            </div>
          </div>
          <div style={styles.editorCta}>ABRIR EDITOR →</div>
        </div>

        {/* ── STORYBOARD STUDIO ACCESS CARD ── */}
        <div
          onClick={() => navigate('/storyboard')}
          style={styles.storyboardCard}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#00A8E8'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = C.border}
        >
          <div style={styles.editorCardLeft}>
            <div style={{ ...styles.editorIcon, background: 'rgba(0,168,232,0.1)' }}>🎞</div>
            <div>
              <div style={{ ...styles.editorTitle, color: C.accent }}>STORYBOARD STUDIO</div>
              <div style={styles.editorSub}>
                Sube una imagen de referencia y genera frames de storyboard con Gemini.
                Modifica personajes, cambia planos, agrega props y descarga cada frame generado.
              </div>
            </div>
          </div>
          <div style={{ ...styles.editorCta, color: C.accent }}>ABRIR →</div>
        </div>

        {/* Section header */}
        <div style={styles.sectionHeader}>
          <div>
            <div style={styles.sectionTitle}>PROJECTS</div>
            <div style={styles.sectionSub}>
              {loading ? 'Cargando...' : `${projects.length} proyecto${projects.length !== 1 ? 's' : ''}`}
            </div>
          </div>
          <button style={styles.btnNew} onClick={() => setShowNewForm(true)}>
            + NUEVO PROYECTO
          </button>
        </div>

        {/* New project form */}
        {showNewForm && (
          <div style={styles.newForm}>
            <div style={styles.newFormHeader}>
              <span style={styles.newFormTitle}>NEW PROJECT</span>
              <button style={styles.btnFormClose} onClick={() => setShowNewForm(false)}>✕</button>
            </div>
            <div style={styles.formGrid}>
              <FormField label="NOMBRE DEL PROYECTO *">
                <input
                  autoFocus
                  value={newProject.name}
                  onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder="Ej: Comercial Delinudos 15s"
                  style={styles.input}
                />
              </FormField>
              <FormField label="DESCRIPCIÓN">
                <input
                  value={newProject.description}
                  onChange={e => setNewProject(p => ({ ...p, description: e.target.value }))}
                  placeholder="Opcional"
                  style={styles.input}
                />
              </FormField>
              <FormField label="FORMAT">
                <select
                  value={newProject.format}
                  onChange={e => setNewProject(p => ({ ...p, format: e.target.value }))}
                  style={styles.select}
                >
                  <option value="16:9">16:9 — Horizontal</option>
                  <option value="9:16">9:16 — Vertical / Reels</option>
                  <option value="1:1">1:1 — Cuadrado</option>
                </select>
              </FormField>
              <FormField label="DURACIÓN">
                <div style={styles.durationRow}>
                  {[15, 30, 60].map(d => (
                    <button
                      key={d}
                      onClick={() => setNewProject(p => ({ ...p, duration_seconds: d }))}
                      style={{ ...styles.durationBtn, ...(newProject.duration_seconds === d ? styles.durationBtnActive : {}) }}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </FormField>
            </div>
            <div style={styles.formActions}>
              <button
                style={{ ...styles.btnCreate, opacity: !newProject.name.trim() || creating ? 0.5 : 1 }}
                disabled={!newProject.name.trim() || creating}
                onClick={handleCreate}
              >
                {creating ? 'CREANDO...' : 'CREAR Y ABRIR STUDIO'}
              </button>
              <button style={styles.btnCancel} onClick={() => setShowNewForm(false)}>CANCELAR</button>
            </div>
          </div>
        )}

        {/* Projects grid */}
        {loading ? (
          <div style={styles.grid}>
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : projects.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>▶</div>
            <p style={styles.emptyTitle}>Sin proyectos aún</p>
            <p style={styles.emptySub}>Crea tu primer proyecto para empezar a construir secuencias cinematográficas</p>
            <button style={styles.btnNew} onClick={() => setShowNewForm(true)}>+ CREAR PRIMER PROYECTO</button>
          </div>
        ) : (
          <div style={styles.grid}>
            {projects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => navigate(`/studio/${project.id}`)}
                onDelete={e => handleDelete(project.id, e)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Error bar */}
      {error && (
        <div style={styles.errorBar}>
          <span>⚠ {error}</span>
          <button style={styles.errorClose} onClick={() => setError(null)}>✕</button>
        </div>
      )}
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: '0.1em', fontFamily: 'monospace' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ProjectCard({ project, onClick, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const statusColor = STATUS_COLORS[project.status] || C.dim;
  const updatedAt = new Date(project.updated_at).toLocaleDateString('es-CO', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.projectCard,
        borderColor: hovered ? C.accent : C.border,
        cursor: 'pointer',
      }}
    >
      <div style={styles.cardTopBar}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: statusColor, letterSpacing: '0.1em', fontFamily: 'monospace' }}>
          {({'draft':'BORRADOR','in_progress':'EN PROGRESO','completed':'COMPLETADO','archived':'ARCHIVADO'}[project.status] || project.status?.replace('_',' ').toUpperCase())}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: C.accent, fontFamily: 'monospace', background: 'rgba(0,168,232,0.1)', padding: '2px 6px', borderRadius: 3 }}>
          {FORMATO_LABELS[project.format] || project.format}
        </span>
        <button onClick={onDelete} style={{ background: 'transparent', border: 'none', color: C.error, cursor: 'pointer', fontSize: 11, opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}>✕</button>
      </div>

      <div style={styles.cardPreview}>
        <div style={{ display: 'flex', height: '100%', gap: 2, padding: 2 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ flex: 1, background: '#2A2A2A', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, color: '#333', fontFamily: 'monospace', fontWeight: 700 }}>{i}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>{project.name}</div>
        {project.description && (
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{project.description}</div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 9, color: C.dim, fontFamily: 'monospace' }}>⏱ {project.duration_seconds}s</span>
        <span style={{ fontSize: 9, color: C.dim, fontFamily: 'monospace', flex: 1 }}>{updatedAt}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.accent, fontFamily: 'monospace', opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}>
          OPEN →
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value, color = C.muted }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: '16px 20px' }}>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'monospace', color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.dim, letterSpacing: '0.12em', fontFamily: 'monospace' }}>{label}</div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{ ...styles.projectCard, opacity: 0.4 }}>
      <div style={{ height: 12, background: '#444', borderRadius: 3, width: '60%', marginBottom: 12 }} />
      <div style={{ ...styles.cardPreview, background: '#333' }} />
      <div style={{ height: 10, background: '#444', borderRadius: 3, width: '80%', marginTop: 12 }} />
    </div>
  );
}

const styles = {
  root: { minHeight: '100vh', background: C.bg, color: C.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex', flexDirection: 'column' },
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 48, background: '#222', borderBottom: `1px solid ${C.border}`, padding: '0 24px', flexShrink: 0 },
  topLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  logo: { width: 30, height: 30, background: C.accent, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#fff', fontWeight: 700 },
  appName: { fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: C.text, fontFamily: 'monospace', lineHeight: 1.2 },
  version: { fontSize: 9, color: C.dim, fontFamily: 'monospace', letterSpacing: '0.08em' },
  topRight: { display: 'flex', alignItems: 'center', gap: 14 },
  topNav: { display: 'flex', alignItems: 'center', gap: 6 },
  navBtn: { background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, padding: '5px 14px', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'monospace', transition: 'all 0.15s' },
  navBtnEditor: { borderColor: '#7C3AED', color: '#7C3AED', background: 'rgba(124,58,237,0.08)' },
  navBtnStoryboard: { borderColor: C.accent, color: C.accent, background: 'rgba(0,168,232,0.08)' },
  userEmail: { fontSize: 10, color: C.muted, fontFamily: 'monospace' },
  btnLogout: { background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, padding: '4px 12px', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'monospace' },
  main: { flex: 1, maxWidth: 1200, width: '100%', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
  sectionTitle: { fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: C.muted, fontFamily: 'monospace' },
  sectionSub: { fontSize: 10, color: C.dim, fontFamily: 'monospace', marginTop: 2 },
  btnNew: { background: C.accent, border: 'none', borderRadius: 4, color: '#fff', padding: '8px 18px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'monospace' },
  newForm: { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 },
  newFormHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  newFormTitle: { fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: C.accent, fontFamily: 'monospace' },
  btnFormClose: { background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14 },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  input: { background: '#2A2A2A', border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: '8px 12px', fontSize: 12, outline: 'none', fontFamily: 'inherit' },
  select: { background: '#2A2A2A', border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: '8px 12px', fontSize: 12, outline: 'none', cursor: 'pointer' },
  durationRow: { display: 'flex', gap: 8 },
  durationBtn: { background: '#2A2A2A', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, padding: '6px 16px', fontSize: 12, cursor: 'pointer', fontFamily: 'monospace', transition: 'all 0.1s' },
  durationBtnActive: { background: C.accent, borderColor: C.accent, color: '#fff' },
  formActions: { display: 'flex', gap: 10 },
  btnCreate: { background: C.accent, border: 'none', borderRadius: 4, color: '#fff', padding: '10px 24px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'monospace', transition: 'opacity 0.2s' },
  btnCancel: { background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, padding: '10px 20px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'monospace' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: 12 },
  emptyIcon: { fontSize: 36, color: C.border },
  emptyTitle: { fontSize: 16, fontWeight: 600, color: C.dim, margin: 0 },
  emptySub: { fontSize: 12, color: '#444', margin: 0, textAlign: 'center', maxWidth: 320 },
  projectCard: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, transition: 'border-color 0.15s' },
  cardTopBar: { display: 'flex', alignItems: 'center', gap: 6 },
  cardPreview: { height: 80, background: '#222', borderRadius: 4, overflow: 'hidden' },
  errorBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,71,87,0.15)', borderTop: `1px solid ${C.error}`, padding: '8px 24px', fontSize: 11, color: C.error, fontFamily: 'monospace' },
  errorClose: { background: 'transparent', border: 'none', color: C.error, cursor: 'pointer', fontSize: 14 },
  editorCard: { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'border-color 0.2s' },
  storyboardCard: { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'border-color 0.2s' },
  editorCardLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  editorIcon: { fontSize: 32, width: 52, height: 52, background: 'rgba(124,58,237,0.1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  editorTitle: { fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#7C3AED', fontFamily: 'monospace', marginBottom: 4 },
  editorSub: { fontSize: 11, color: C.muted, lineHeight: 1.5, maxWidth: 500 },
  editorCta: { fontSize: 10, fontWeight: 700, color: '#7C3AED', letterSpacing: '0.1em', fontFamily: 'monospace', flexShrink: 0 },
};