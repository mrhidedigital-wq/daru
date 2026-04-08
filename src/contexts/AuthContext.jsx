// src/contexts/AuthContext.jsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import { 
  signIn, 
  signUp, 
  signOut, 
  getCurrentUser, 
  onAuthStateChange 
} from '../lib/supabase/auth';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkUser();
    
    const authListener = onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      authListener?.data?.subscription?.unsubscribe();
    };
  }, []);

  const checkUser = async () => {
    try {
      const { success, user: currentUser } = await getCurrentUser();
      setUser(success ? currentUser : null);
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      setLoading(true);
      setError(null);
      
      const { success, user: loggedUser, error: loginError } = await signIn(email, password);
      
      if (!success) throw new Error(loginError);
      
      setUser(loggedUser);
      return loggedUser;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // LÍNEA 61 CORREGIDA - Sin default parameter
  const register = async (email, password, metadata = null) => {
    try {
      setLoading(true);
      setError(null);
      
      const { success, user: newUser, error: signUpError } = await signUp(
        email, 
        password, 
        metadata || {}
      );
      
      if (!success) throw new Error(signUpError);
      
      setUser(newUser);
      return newUser;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      const { success, error: logoutError } = await signOut();
      
      if (!success) throw new Error(logoutError);
      
      setUser(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export default AuthContext;