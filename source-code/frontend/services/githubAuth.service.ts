const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
// Always use the same GitHub OAuth App the backend holds the client secret for
// (a second "production" client ID previously used here had no matching backend
// secret, so the token exchange always failed with a redirect_uri mismatch).
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
const REDIRECT_URI = `${window.location.origin}/auth/github/callback`;
const API_BASE_URL = isProduction
  ? `${window.location.origin}/api/v1`
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1');

export const githubAuthService = {
  loginWithGitHubPopup: (): Promise<{ success: boolean; username?: string; avatarUrl?: string; token?: string }> => {
    return new Promise((resolve) => {
      if (!GITHUB_CLIENT_ID) {
        resolve({ success: false });
        return;
      }

      const scope = 'repo user read:org';
      const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${scope}`;

      const width = 600, height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        authUrl,
        'github-oauth',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
      );

      if (!popup) {
        alert('Popup was blocked. Please allow popups for this site and try again.');
        resolve({ success: false });
        return;
      }

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;

        console.log('📨 Message from popup:', event.data); // ADD THIS

        if (event.data?.type === 'github_oauth_error') {
          window.removeEventListener('message', handleMessage);
          clearInterval(pollClosed);
          resolve({ success: false });
          return;
        }

        if (event.data?.type !== 'github_oauth_success') return;

        window.removeEventListener('message', handleMessage);
        clearInterval(pollClosed);

        console.log('✅ GitHub connected:', event.data.username); // ADD THIS

        resolve({
          success: true,
          username: event.data.username,
          avatarUrl: event.data.avatarUrl,
          token: event.data.token,
        });
      };

      window.addEventListener('message', handleMessage);

      // Fallback if user closes popup manually
      const pollClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollClosed);
          window.removeEventListener('message', handleMessage);
          resolve({ success: false });
        }
      }, 500);
    });
  },

 exchangeCode: async (code: string) => {
  try {
    console.log('🔄 exchangeCode called with code:', code);
    console.log('🔄 API_BASE_URL:', API_BASE_URL);
    console.log('🔄 REDIRECT_URI:', REDIRECT_URI);

    const response = await fetch(`${API_BASE_URL}/github/auth/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: REDIRECT_URI }),
    });

    console.log('🔄 Response status:', response.status);

    const data = await response.json();
    console.log('🔄 Response data:', data); // <-- THIS WILL SHOW THE EXACT ERROR

    if (data.success) {
      localStorage.setItem('github_token', data.token);
      localStorage.setItem('github_username', data.username);
      return { 
        success: true, 
        username: data.username, 
        token: data.token, 
        avatarUrl: data.avatarUrl 
      };
    }

    console.error('❌ Exchange failed:', data.error || data.message || data);
    return { success: false };

  } catch (error) {
    console.error('❌ Exchange threw:', error);
    return { success: false };
  }
},
  getCurrentUser: async () => {
    const token = localStorage.getItem('github_token');
    if (!token) return null;
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        return { username: data.login, avatarUrl: data.avatar_url };
      }
      return null;
    } catch {
      return null;
    }
  },

  logout: () => {
    localStorage.removeItem('github_token');
    localStorage.removeItem('github_username');
  },

  isLoggedIn: () => !!localStorage.getItem('github_token'),
};