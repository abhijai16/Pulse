import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.jsx';

// Combined auth page with three modes:
//   - login: email + password
//   - signup: name + email + password → moves to verifying on submit
//   - verifying: 6-digit OTP input + resend link
//
// Signup is a two-step flow because the backend won't issue a session
// until the user verifies the email. We keep the email/name/password
// in component state across the mode switch so the user can go back
// without retyping.
export default function Auth() {
  const { user, login, signup, verifyOtp, resendOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/ops';

  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'verifying'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState(null);
  const [resentNote, setResentNote] = useState(null);

  if (user) return <Navigate to={from} replace />;

  async function onLoginOrSignup(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await signup(name.trim(), email.trim(), password);
        // Backend returns { status: 'pending_verification', email } and
        // has already console-log'd the OTP. Switch UI to verifying mode.
        setMode('verifying');
        setCode('');
      } else {
        await login(email.trim(), password);
        navigate(from, { replace: true });
      }
    } catch (err) {
      const code = String(err?.message || '');
      // Login → email_not_verified → jump straight into the OTP panel.
      if (code === 'email_not_verified') {
        setMode('verifying');
        setError(null);
      } else {
        setError(humanize(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerify(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await verifyOtp(email.trim(), code.trim());
      navigate(from, { replace: true });
    } catch (err) {
      setError(humanize(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    setError(null);
    setResentNote(null);
    setResending(true);
    try {
      await resendOtp(email.trim());
      setResentNote('A fresh code is on its way. Check the server console for now.');
    } catch (err) {
      setError(humanize(err));
    } finally {
      setResending(false);
    }
  }

  function humanize(err) {
    const code = String(err?.message || '');
    switch (code) {
      case 'domain_not_allowed':
        return 'That email is not from an allowed college domain.';
      case 'email_taken':
        return 'An account with that email already exists. Try logging in.';
      case 'invalid_credentials':
        return 'Email or password is incorrect.';
      case 'weak_password':
        return 'Password must be at least 6 characters.';
      case 'invalid_email':
        return 'Enter a valid email address.';
      case 'invalid_name':
        return 'Name must be at least 2 characters.';
      case 'invalid_code':
        return 'That code didn’t match. Try again.';
      case 'code_expired':
        return 'Code expired — we just sent you a new one.';
      case 'email_not_verified':
        return 'Account exists but isn’t verified. Enter the code we sent you.';
      default:
        return code || 'Something went wrong. Please try again.';
    }
  }

  function switchMode(next) {
    setMode(next);
    setError(null);
    setResentNote(null);
    if (next === 'verifying') setCode('');
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-brand">
          <img src="/logo.png" alt="Pulse" className="auth-brand-mark" />
          <img src="/wordmark.png" alt="Pulse" className="auth-brand-wordmark" />
        </Link>

        {mode !== 'verifying' && (
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => switchMode('login')}
            >
              Log in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => switchMode('signup')}
            >
              Sign up
            </button>
          </div>
        )}

        {mode === 'login' && (
          <>
            <h1 className="auth-title">Welcome back.</h1>
            <p className="auth-sub">
              Sign in with your college email to access dispatch and admin tools.
            </p>
            <form className="auth-form" onSubmit={onLoginOrSignup}>
              <label className="auth-field">
                <span>College email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@college.edu.in"
                  required
                />
              </label>
              <label className="auth-field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                />
              </label>
              {error && <div className="auth-error" role="alert">{error}</div>}
              <button type="submit" className="auth-submit" disabled={submitting}>
                {submitting ? 'Please wait…' : 'Log in →'}
              </button>
            </form>
            <p className="auth-foot">
              New here?{' '}
              <button type="button" className="auth-link" onClick={() => switchMode('signup')}>
                Create an account
              </button>
            </p>
          </>
        )}

        {mode === 'signup' && (
          <>
            <h1 className="auth-title">Create your Pulse account.</h1>
            <p className="auth-sub">
              Sign up with your college email to access RespondOps and PulseBoard.
              We’ll send a 6-digit code to verify it’s really you.
            </p>
            <form className="auth-form" onSubmit={onLoginOrSignup}>
              <label className="auth-field">
                <span>Full name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Jane Doe"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
              <label className="auth-field">
                <span>College email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@college.edu.in"
                  required
                />
              </label>
              <label className="auth-field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                />
              </label>
              {error && <div className="auth-error" role="alert">{error}</div>}
              <button type="submit" className="auth-submit" disabled={submitting}>
                {submitting ? 'Sending code…' : 'Send verification code →'}
              </button>
            </form>
            <p className="auth-foot">
              Already have an account?{' '}
              <button type="button" className="auth-link" onClick={() => switchMode('login')}>
                Log in
              </button>
            </p>
          </>
        )}

        {mode === 'verifying' && (
          <>
            <h1 className="auth-title">Check your email.</h1>
            <p className="auth-sub">
              We sent a 6-digit code to <strong>{email}</strong>. Enter it below to finish
              creating your account. (For now the code is logged to the server console.)
            </p>
            <form className="auth-form" onSubmit={onVerify}>
              <label className="auth-field">
                <span>Verification code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  className="auth-otp-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  required
                />
              </label>
              {error && <div className="auth-error" role="alert">{error}</div>}
              {resentNote && <div className="auth-note-inline" role="status">{resentNote}</div>}
              <button type="submit" className="auth-submit" disabled={submitting || code.length !== 6}>
                {submitting ? 'Verifying…' : 'Verify and continue →'}
              </button>
            </form>
            <p className="auth-foot">
              Didn’t get a code?{' '}
              <button
                type="button"
                className="auth-link"
                onClick={onResend}
                disabled={resending}
              >
                {resending ? 'Resending…' : 'Resend code'}
              </button>
            </p>
            <p className="auth-foot">
              <button type="button" className="auth-link" onClick={() => switchMode('signup')}>
                ← Use a different email
              </button>
            </p>
          </>
        )}

        <p className="auth-note">
          Anonymous reporting (AlertNow) is always available — no login required.
        </p>
      </div>
    </div>
  );
}
