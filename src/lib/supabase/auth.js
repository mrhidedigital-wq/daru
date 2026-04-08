// src/lib/supabase/auth.js
import { supabase } from './client';

export async function signUp(email, password, metadata = {}) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
    if (error) throw error;
    return { success: true, user: data.user, session: data.session };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function signIn(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return { success: true, user: data.user, session: data.session };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return { success: true, user };
  } catch (error) {
    return { success: false, error: error.message, user: null };
  }
}

export async function getSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return { success: true, session };
  } catch (error) {
    return { success: false, error: error.message, session: null };
  }
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

const authService = {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  getSession,
  onAuthStateChange,
};

export default authService;