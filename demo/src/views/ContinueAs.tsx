import { useState } from 'react';
import { signIn } from '../api/gis';
import type { GoogleProfile } from '../lib/types';

type Props = {
  profile: GoogleProfile;
  onSignedIn: (profile: GoogleProfile, accessToken: string) => void;
  onUseDifferent: () => void;
};

// Coin flip per page load — same icon for the whole session,
// reshuffled on refresh. Matches the SignIn / header draws.
const RELOGIN_ICON = Math.random() < 0.5 ? '/icon_1.png' : '/icon_2.png';

// Shown on reload when we have a cached profile but no live access token.
// The interactive sign-in popup is fast (often auto-dismisses if Google
// still has consent) and works in browsers that block third-party cookies
// for accounts.google.com (where the silent flow fails).
export function ContinueAs({ profile, onSignedIn, onUseDifferent }: Props) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setError(null);
    setWorking(true);
    try {
      const result = await signIn();
      onSignedIn(result.profile, result.accessToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
      setWorking(false);
    }
  };

  return (
    <div className="signin-wrap">
      <div className="signin-card continue-as">
        <img
          src={RELOGIN_ICON}
          alt=""
          className="signin-mark"
          aria-hidden="true"
        />
        <div className="signin-logo">
          <span className="signin-logo-text">budgie</span>
        </div>

        <button
          type="button"
          className="continue-as-btn"
          onClick={handleClick}
          disabled={working}
        >
          {profile.picture && (
            <img src={profile.picture} alt="" className="continue-as-avatar" />
          )}
          <div className="continue-as-text">
            <div className="continue-as-cta">{working ? 'Connecting…' : 'Continue as'}</div>
            <div className="continue-as-name">{profile.name}</div>
            <div className="continue-as-email">{profile.email}</div>
          </div>
        </button>

        {error && <div className="signin-error">{error}</div>}

        <button
          type="button"
          className="continue-as-other"
          onClick={onUseDifferent}
          disabled={working}
        >
          Use a different account
        </button>
      </div>
    </div>
  );
}
