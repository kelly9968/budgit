import { useState } from 'react';
import { signIn } from '../api/gis';
import type { GoogleProfile } from '../lib/types';

type Props = {
  onSignedIn: (profile: GoogleProfile, accessToken: string) => void;
};

// Coin flip per page load — same icon for the whole sign-in session,
// reshuffled on refresh. Matches the header's draw on the post-auth side.
const SIGNIN_ICON = Math.random() < 0.5 ? '/icon_1.png' : '/icon_2.png';

export function SignIn({ onSignedIn }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const handleClick = async () => {
    setError(null);
    setWorking(true);
    try {
      const { profile, accessToken } = await signIn();
      onSignedIn(profile, accessToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
      setWorking(false);
    }
  };

  return (
    <div className="signin-wrap">
      <div className="signin-card">
        <img
          src={SIGNIN_ICON}
          alt=""
          className="signin-mark"
          aria-hidden="true"
        />
        <div className="signin-logo">
          <span className="signin-logo-text">Budgie</span>
          <span className="signin-logo-line" />
        </div>
        <h1 className="signin-h1">Budgie helps.</h1>
        <p className="signin-p">
          <strong>Budgie</strong> is a free, browser-only budgeting app that
          keeps your transactions in <em>your own</em> Google Sheet. Track
          variable spending, see daily and end-of-month forecasts, and catch
          overspend early &mdash; without sending your data to anyone but
          you and Google.
        </p>
        <button
          type="button"
          className="signin-google"
          onClick={handleClick}
          disabled={working}
        >
          <GoogleGlyph />
          <span>{working ? 'Connecting…' : 'Continue with Google'}</span>
        </button>
        {error && <div className="signin-error">{error}</div>}

        <div className="signin-how">
          <div className="signin-how-h">How it works</div>
          <ol className="signin-how-list">
            <li>Sign in with Google.</li>
            <li>Create a fresh tracking sheet, or pick an existing one. Budgie only sees the sheet you choose.</li>
            <li>Add transactions on the go &mdash; they sync straight to your sheet, which stays under your control in Drive.</li>
          </ol>
        </div>

        <ul className="signin-perms">
          <li>Read &amp; write only the sheet you choose or we create</li>
          <li>No backend &mdash; the app runs entirely in your browser</li>
          <li>No analytics, no third-party trackers, no data sharing</li>
        </ul>
        <div className="signin-legal">
          By continuing you agree to our{' '}
          <a href="/terms.html" target="_blank" rel="noreferrer">Terms</a>
          {' '}and{' '}
          <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a>.
        </div>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.71-1.57 2.68-3.88 2.68-6.61z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A8.99 8.99 0 0 0 9 18z"
      />
      <path
        fill="#FBBC04"
        d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.97H.96A8.99 8.99 0 0 0 0 9c0 1.45.35 2.82.96 4.03l3.01-2.32z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.43 1.35l2.58-2.58A8.99 8.99 0 0 0 9 0 8.99 8.99 0 0 0 .96 4.97l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
