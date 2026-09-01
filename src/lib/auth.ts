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

export async function requestPasswordReset(email: string, redirectToPath?: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const redirectUrl = `${origin}${redirectToPath || '/update-password'}`;
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl,
  });
  return { data, error };
}

export async function updatePasswordAfterReset(newPassword: string) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });
  return { data, error };
}

export async function checkIsAdmin(user?: any): Promise<boolean> {
  try {
    let currentUser = user;
    if (!currentUser) {
      const { user: fetchedUser } = await getUser();
      currentUser = fetchedUser;
    }
    if (!currentUser) return false;

    // 1. Check user metadata or role attributes
    if (
      currentUser.app_metadata?.role === 'admin' ||
      currentUser.user_metadata?.role === 'admin' ||
      currentUser.role === 'admin'
    ) {
      return true;
    }

    // 2. Check owner/admin email address
    const adminEmail = import.meta.env.PUBLIC_ADMIN_EMAIL || 'info@thijsraaijmakers.me';
    if (currentUser.email && currentUser.email.toLowerCase() === adminEmail.toLowerCase()) {
      return true;
    }

    // 3. Query profiles table
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', currentUser.id)
      .single();

    if (!error && profile && profile.role === 'admin') {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export async function registerPasskey() {
  const { data, error } = await (supabase.auth as any).registerPasskey();
  return { data, error };
}

export async function signInWithPasskey() {
  const { data, error } = await (supabase.auth as any).signInWithPasskey();
  return { data, error };
}
