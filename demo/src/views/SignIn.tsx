import { useState } from 'react';
import { signIn } from '../api/gis';
import type { GoogleProfile } from '../lib/types';

type Props = {
  onSignedIn: (profile: GoogleProfile, accessToken: string) => void;
};

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
        <div className="signin-logo">
          <span className="signin-logo-text">Budgit</span>
          <span className="signin-logo-line" />
        </div>
        <h1 className="signin-h1">Budget on top of your sheet.</h1>
        <p className="signin-p">
          Sign in with Google. We&rsquo;ll create a tracking sheet for you, or use one you already have.
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
        <ul className="signin-perms">
          <li>Read &amp; write only the sheet you choose or we create</li>
          <li>Your data never touches our servers &mdash; this app is static</li>
        </ul>
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
