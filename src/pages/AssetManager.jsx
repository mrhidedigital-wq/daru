// AssetManager.jsx
// Orquestador principal del Asset Manager.
// Carga datos de Supabase y distribuye a las 3 pestañas.
//
// Arquitectura dividida en 4 archivos:
//   AssetManagerUtils.js     → constantes, Gemini, compresión, upload, prompts
//   AssetManagerSubjects.jsx → pestaña SUJETOS
//   AssetManagerScenes.jsx   → pestaña ESCENAS (4 vistas)
//   AssetManagerShots.jsx    → pestaña SHOTS (planograma TOP+LATERAL, eje H+V)
//
// CONTRATO ANTI-ALUCINACIÓN:
// Todas las imágenes generadas o subidas son SAGRADAS.
// El DAG las lee desde subject_assets y scene_assets.
// NUNCA inventa un sujeto, escena o frame desde cero en el DAG.

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate }      from 'react-router-dom';
import { useAuth }                     from '../contexts/AuthContext';
import { supabase }                    from '../lib/supabase/client';
import { C }                           from '../services/assetUtils';
import { SubjectsTab }                 from './AssetManagerSubjects';
import { ScenesTab }                   from './AssetManagerScenes';
import { ShotsTab }                    from './AssetManagerShots';

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function AssetManager() {
  const { projectId } = useParams();
  const navigate      = useNavigate();
  const { user }      = useAuth();

  const [project,  setProject]  = useState(null);
  const [tab,      setTab]      = useState('subjects');
  const [subjects, setSubjects] = useState([]);
  const [scenes,   setScenes]   = useState([]);
  const [shots,    setShots]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    if (!projectId) return;
    async function fetchAll() {
      setLoading(true);
      try {
        const { data: proj } = await supabase
          .from('projects').select('*').eq('id', projectId).single();
        setProject(proj);

        const { data: subs } = await supabase
          .from('subject_assets').select('*').eq('project_id', projectId)
          .order('created_at', { ascending: true });
        setSubjects(subs || []);

        const { data: scns } = await supabase
          .from('scene_assets').select('*').eq('project_id', projectId)
          .order('created_at', { ascending: true });
        setScenes(scns || []);

        const { data: shs } = await supabase
          .from('shots').select('*').eq('project_id', projectId)
          .order('shot_number', { ascending: true });
        setShots(shs || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (loading) return <LoadingScreen />;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'monospace' }}>

      <Header project={project} navigate={navigate} projectId={projectId} />

      <div style={{
        display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`,
        background: C.panel, padding: '0 24px',
      }}>
        {[
          { id: 'subjects', label: 'SUJETOS', count: subjects.length },
          { id: 'scenes',   label: 'ESCENAS', count: scenes.length   },
          { id: 'shots',    label: 'SHOTS',   count: shots.length    },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '14px 20px', fontSize: 10, letterSpacing: '0.12em',
            color: tab === t.id ? C.accent : C.muted,
            borderBottom: tab === t.id ? `2px solid ${C.accent}` : '2px solid transparent',
            fontFamily: 'monospace', fontWeight: 700, transition: 'all 0.15s',
          }}>
            {t.label}
            <span style={{
              marginLeft: 8, background: tab === t.id ? C.accent : C.dim,
              color: tab === t.id ? '#000' : C.muted,
              borderRadius: 10, padding: '1px 6px', fontSize: 9,
            }}>{t.count}</span>
          </button>
        ))}
      </div>

      <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
        {error && (
          <div style={{
            background: '#2A1A1A', border: `1px solid ${C.error}`,
            borderRadius: 6, padding: '10px 14px', marginBottom: 16,
            fontSize: 11, color: C.error,
          }}>⚠ {error}</div>
        )}

        {tab === 'subjects' && (
          <SubjectsTab
            subjects={subjects} setSubjects={setSubjects}
            projectId={projectId} userId={user?.id}
            ContractBanner={ContractBanner}
          />
        )}
        {tab === 'scenes' && (
          <ScenesTab
            scenes={scenes} setScenes={setScenes}
            projectId={projectId} userId={user?.id}
            ContractBanner={ContractBanner}
          />
        )}
        {tab === 'shots' && (
          <ShotsTab
            shots={shots} setShots={setShots}
            projectId={projectId} userId={user?.id}
            subjects={subjects} scenes={scenes}
            format={project?.format || '16:9'}
            ContractBanner={ContractBanner}
          />
        )}
      </div>
    </div>
  );
}

function Header({ project, navigate, projectId }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', height: 56,
      background: C.panel, borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => navigate(`/studio/${projectId}`)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: C.muted, fontSize: 11, letterSpacing: '0.08em', fontFamily: 'monospace',
        }}>← STUDIO</button>
        <span style={{ color: C.dim }}>·</span>
        <span style={{ fontSize: 11, color: C.accent, letterSpacing: '0.1em', fontWeight: 700 }}>
          ASSET MANAGER
        </span>
        {project && (
          <>
            <span style={{ color: C.dim }}>·</span>
            <span style={{ fontSize: 11, color: C.muted }}>{project.name}</span>
          </>
        )}
      </div>
      <div style={{ fontSize: 9, color: C.dim, letterSpacing: '0.08em' }}>
        REFERENCIAS SAGRADAS — EL DAG NO ALUCINA
      </div>
    </div>
  );
}

function ContractBanner({ icon, text }) {
  return (
    <div style={{
      background: `${C.accent}11`, border: `1px solid ${C.accent}33`,
      borderRadius: 6, padding: '10px 14px',
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 10, color: C.muted, lineHeight: 1.6, letterSpacing: '0.04em' }}>
        <strong style={{ color: C.accent }}>CONTRATO DAG: </strong>{text}
      </span>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 14,
    }}>
      <div style={{ fontSize: 11, color: C.accent, letterSpacing: '0.15em' }}>
        CARGANDO ASSETS...
      </div>
    </div>
  );
}