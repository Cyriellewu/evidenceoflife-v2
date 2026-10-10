import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { consumePendingSignup, getAttribution, isFreshAccount, trackEvent } from '@/lib/analytics';
import { getErrorMessage } from '@/lib/utils';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Signing you in...');

  useEffect(() => {
    let mounted = true;

    const handleCallback = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (session?.user) {
          const signupMethod = consumePendingSignup();
          // The pending flag is set on every Google click and can go stale for
          // email, so only count it when this is the account's first sign-in.
          if (signupMethod && isFreshAccount(session.user.created_at, session.user.last_sign_in_at)) {
            trackEvent('account_created', {
              method: signupMethod,
              ...getAttribution(),
            });
          }
          navigate('/app', { replace: true });
          return;
        }

        setMessage('No active session found. Please sign in again.');
      } catch (error: unknown) {
        console.error('OAuth callback error:', error);
        setMessage(getErrorMessage(error, 'Authentication failed. Please try again.'));
      }
    };

    void handleCallback();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-3">
        <h1 className="text-2xl font-semibold">Authenticating...</h1>
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
