import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export function SignIn({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) setError('Sign in failed. Check your work email and password.');
    setBusy(false);
  }

  return (
    <main className="signin-page">
      <form className="signin-card" onSubmit={submit}>
        <img src="/hr-logo.png" alt="HydraRoll" />
        <span className="eyebrow">Staff access</span>
        <h1>Sign in to HydraRoll</h1>
        <p>Use the account provided by your app administrator.</p>
        <label>Work email<input autoComplete="username" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input autoComplete="current-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <small>Staff accounts are created by an administrator. Self-registration is turned off.</small>
      </form>
    </main>
  );
}
