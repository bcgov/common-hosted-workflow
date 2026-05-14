import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { userManager } from '../auth/config';

export function Callback() {
  const navigate = useNavigate();

  useEffect(() => {
    userManager
      .signinRedirectCallback()
      .then(() => navigate('/', { replace: true }))
      .catch((err) => {
        console.error('OIDC callback error', err);
        navigate('/?error=login_failed', { replace: true });
      });
  }, [navigate]);

  return (
    <div className="min-h-svh flex items-center justify-center">
      <p className="text-gray-600">Completing sign in...</p>
    </div>
  );
}
