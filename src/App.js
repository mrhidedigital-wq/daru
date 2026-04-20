import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider }  from './contexts/AuthContext';
import ProtectedRoute    from './components/auth/ProtectedRoute';
import Login             from './pages/Login';
import DaruDashboard     from './pages/DaruDashboard';
import DaruStudio        from './pages/DaruStudio';
import DaruEditor        from './pages/DaruEditor';
import AssetManager      from './pages/AssetManager';
import ApiKeysSettings   from './pages/ApiKeysSettings';
import StoryboardStudio  from './pages/StoryboardStudio';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={
            <ProtectedRoute><DaruDashboard /></ProtectedRoute>
          } />

          <Route path="/studio/:projectId" element={
            <ProtectedRoute><DaruStudio /></ProtectedRoute>
          } />

          {/* ── ASSET MANAGER ── */}
          <Route path="/studio/:projectId/assets" element={
            <ProtectedRoute><AssetManager /></ProtectedRoute>
          } />

          <Route path="/settings" element={
            <ProtectedRoute><ApiKeysSettings /></ProtectedRoute>
          } />

          <Route path="/editor" element={
            <ProtectedRoute><DaruEditor /></ProtectedRoute>
          } />
          <Route path="/editor/:sessionId" element={
            <ProtectedRoute><DaruEditor /></ProtectedRoute>
          } />

          <Route path="/storyboard" element={
            <ProtectedRoute><StoryboardStudio /></ProtectedRoute>
          } />
          <Route path="/storyboard/:projectId" element={
            <ProtectedRoute><StoryboardStudio /></ProtectedRoute>
          } />

          <Route path="*" element={
            <div style={{
              minHeight: '100vh', background: '#2A2A2A',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 16, color: '#555', fontFamily: 'monospace',
            }}>
              <div style={{ fontSize: 48, color: '#333' }}>404</div>
              <div style={{ fontSize: 11, letterSpacing: '0.1em' }}>PAGE NOT FOUND</div>
              <a href="/" style={{ fontSize: 10, color: '#00A8E8', letterSpacing: '0.1em' }}>
                ← BACK TO DASHBOARD
              </a>
            </div>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;