import { supabase } from './supabase';

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

export async function signUp(email: string, password: string, fullName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName || '',
      },
    },
  });
  return { data, error };
}

export async function verifyEmailOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  return { session: data.session, error };
}

export async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  return { user: data.user, error };
}

export async function resendOtp(email: string) {
  const { data, error } = await supabase.auth.resend({
    type: 'signup',
    email,
  });
  return { data, error };
}

export async function updatePassword(currentPassword: string, newPassword: string) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
    currentPassword: currentPassword,
  });
  return { data, error };
}

export async function updateProfileName(userId: string, fullName: string) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: fullName })
    .eq('id', userId);
  return { data, error };
}

