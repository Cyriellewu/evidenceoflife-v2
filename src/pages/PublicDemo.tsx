import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { trackEvent } from '@/lib/analytics';
import Index from './Index';

export default function PublicDemo() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isDemo, enterDemo, signOut, authReady, loading } = useAuth();
  const { lang, setLang } = useLanguage();
  const isEmbedded = searchParams.get('embed') === '1';
  const isDemoUserReady = isDemo && user?.id === 'demo-user-000';

  useEffect(() => {
    if (!authReady || loading) return;

    if (!isDemoUserReady) {
      enterDemo();
      trackEvent('landing_page_view', {
        page: isEmbedded ? '/demo-app?embed=1' : '/demo-app',
        mode: 'public_demo',
      });
    }
  }, [authReady, loading, isDemoUserReady, enterDemo, isEmbedded]);

  useEffect(() => {
    if (!authReady || loading) return;
    if (lang !== 'en') {
      setLang('en');
    }
  }, [authReady, loading, lang, setLang]);

  const isReady = useMemo(() => authReady && !loading && isDemoUserReady, [authReady, loading, isDemoUserReady]);

  const handleAuth = async () => {
    trackEvent('landing_cta_clicked', {
      cta: 'sign_in_from_demo_banner',
    });

    if (isDemo) {
      await signOut();
    }

    navigate('/auth');
  };

  if (!isReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="text-muted-foreground">Preparing demo...</span>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background">
      {!isEmbedded && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[120] flex justify-center px-3">
          <div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-full border border-primary/15 bg-background/95 px-4 py-2 shadow-[0_14px_40px_-24px_rgba(74,46,29,0.42)] backdrop-blur-md">
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Public demo</span>
              <span className="mx-1.5 text-muted-foreground/40">·</span>
              Sample data only, not saved to any account.
            </p>
            <Button size="sm" className="shrink-0 rounded-full px-4" onClick={handleAuth}>
              Sign in
            </Button>
          </div>
        </div>
      )}

      {/* Reserve space under the fixed demo banner so city titles / chips are not clipped. */}
      <div className={isEmbedded ? undefined : 'pt-[3.75rem]'}>
        <Index publicDemo />
      </div>
    </div>
  );
}
