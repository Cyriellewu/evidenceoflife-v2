import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { markPendingSignup, trackEvent } from '@/lib/analytics';
import { getErrorMessage } from '@/lib/utils';
import { BrandLogo } from '@/components/BrandLogo';

export default function Auth() {
  // The URL is the single source of truth for the form mode: sign-up CTAs link
  // to `?mode=signup`, while plain /auth (expired sessions, "Sign in" links)
  // stays on sign-in. Toggling rewrites the URL so refresh/back keep the mode.
  const [searchParams, setSearchParams] = useSearchParams();
  const isLogin = searchParams.get('mode') !== 'signup';
  const setIsLogin = (login: boolean) => {
    setSearchParams(login ? {} : { mode: 'signup' }, { replace: true });
  };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { toast } = useToast();
  const navigate = useNavigate();

  const withTimeout = async <T,>(
    promise: Promise<T>,
    timeoutMs = 30000,
    timeoutMessage = 'Request timed out. Please try again.'
  ): Promise<T> => {
    let timer: number | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  };

  const waitForUserSession = async (maxAttempts = 20, delayMs = 300) => {
    for (let i = 0; i < maxAttempts; i += 1) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) return true;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return false;
  };

  const isTimeoutError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    return /timed out|timeout|context deadline|504/i.test(message);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      if (isLogin) {
        try {
          let { error } = await withTimeout(
            supabase.auth.signInWithPassword({ email, password }),
            30000,
            'Sign-in took too long. Please retry.'
          );

          if (error && isTimeoutError(error)) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            const retry = await withTimeout(
              supabase.auth.signInWithPassword({ email, password }),
              30000,
              'Sign-in took too long. Please retry.'
            );
            error = retry.error;
          }

          if (error) throw error;
        } catch (loginErr) {
          if (!isTimeoutError(loginErr)) throw loginErr;

          const recovered = await waitForUserSession(24, 400);
          if (!recovered) {
            throw new Error('Login request timed out. Please try again.');
          }
        }

        const hasUserSession = await waitForUserSession(16, 250);
        if (!hasUserSession) {
          throw new Error('Login succeeded but session sync is delayed. Please try again.');
        }

        navigate('/app');
        return;
      }

      trackEvent('sign_up_clicked', {
        method: 'email',
        page: '/auth',
      });
      markPendingSignup('email');

      try {
        const { data, error } = await withTimeout(
          supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          }),
          15000,
          'Sign-up took too long. Please retry.'
        );

        if (error) throw error;

        if (data.session?.user) {
          trackEvent('account_created', {
            method: 'email',
          });
          navigate('/app');
          return;
        }

        toast({
          title: 'Account created',
          description: 'Please check your email to confirm your account.',
        });

        setIsLogin(true);
        return;
      } catch (signupErr) {
        if (!isTimeoutError(signupErr)) throw signupErr;

        const { error: signInError } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          10000,
          'Sign-in check took too long. Please retry.'
        );

        if (!signInError) {
          const hasUserSession = await waitForUserSession(12, 250);
          if (hasUserSession) {
            navigate('/app');
            return;
          }
        }

        throw signupErr;
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Authentication failed. Please try again.');
      setErrorMsg(msg);
      toast({
        title: 'Error',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setErrorMsg('');

    try {
      const redirectTo = `${window.location.origin}/auth/callback`;

      trackEvent('sign_up_clicked', {
        method: 'google',
        page: '/auth',
      });
      markPendingSignup('google');

      const { error } = await withTimeout(
        supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            queryParams: {
              prompt: 'select_account',
            },
          },
        }),
        15000,
        'Google sign-in took too long. Please retry.'
      );

      if (error) throw error;
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Google sign-in failed. Please try again.');
      setErrorMsg(msg);
      toast({
        title: 'Error',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px] rounded-2xl border border-border bg-card px-7 py-8 shadow-soft">
        <div className="flex flex-col items-center gap-2 text-center">
          <BrandLogo alt="Logo" className="w-16 h-16" />
          <h1 className="font-brand text-[34px] text-foreground">Evidence of life</h1>
          <p className="text-sm text-muted-foreground">{isLogin ? 'Welcome back' : 'Create your free account'}</p>
        </div>

        <div className="mt-7">
          <Button
            variant="outline"
            className="w-full h-11 rounded-xl text-base gap-3"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            type="button"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {googleLoading ? 'Signing in...' : 'Continue with Google'}
          </Button>
        </div>

        <form onSubmit={handleEmailAuth} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="h-11 rounded-xl text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="h-11 rounded-xl text-base"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || googleLoading}
            className="mt-2 w-full h-11 rounded-xl text-base"
          >
            {loading ? '...' : isLogin ? 'Sign in' : 'Create account'}
          </Button>

          {errorMsg && <p className="text-sm text-destructive text-center">{errorMsg}</p>}
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-primary hover:underline font-medium"
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
