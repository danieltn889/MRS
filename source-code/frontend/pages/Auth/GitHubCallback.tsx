import { useEffect, useRef, useState } from 'react';
import { githubAuthService } from '../../services/githubAuth.service';

export const GitHubCallback = () => {
  const exchanged = useRef(false);
  const [statusMsg, setStatusMsg] = useState('Connecting to GitHub...');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error || !code) {
      setStatusMsg('Failed');
      setErrorMsg(`GitHub error: ${error || 'no code received'}`);
      window.opener?.postMessage({ type: 'github_oauth_error', error }, window.location.origin);
      setTimeout(() => window.close(), 3000);
      return;
    }

    setStatusMsg('Exchanging code for token...');

    // Call backend directly and show raw response
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1'}/github/auth/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        code, 
        redirect_uri: `${window.location.origin}/auth/github/callback` 
      }),
    })
    .then(res => {
      setStatusMsg(`Server responded: HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      // Show the raw response on screen so you can read it
      setStatusMsg(`Response: ${JSON.stringify(data)}`);

      if (data.success) {
        localStorage.setItem('github_token', data.token);
        localStorage.setItem('github_username', data.username);
        window.opener?.postMessage({
          type: 'github_oauth_success',
          username: data.username,
          avatarUrl: data.avatarUrl,
          token: data.token,
        }, window.location.origin);
        setStatusMsg(`✅ Connected as ${data.username} - closing...`);
      } else {
        setErrorMsg(`Error: ${data.error || data.message || JSON.stringify(data)}`);
        window.opener?.postMessage({ type: 'github_oauth_error' }, window.location.origin);
      }
      setTimeout(() => window.close(), 3000);
    })
    .catch(err => {
      setErrorMsg(`Network error: ${err.message}`);
      setStatusMsg('Failed to reach backend');
      window.opener?.postMessage({ type: 'github_oauth_error' }, window.location.origin);
      setTimeout(() => window.close(), 3000);
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center max-w-lg px-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
        <p className="text-gray-400 text-sm mb-2">{statusMsg}</p>
        {errorMsg && (
          <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded text-left">
            <p className="text-red-400 text-xs break-all">{errorMsg}</p>
          </div>
        )}
        <p className="text-gray-600 text-xs mt-4">Window closes in 3 seconds</p>
      </div>
    </div>
  );
};