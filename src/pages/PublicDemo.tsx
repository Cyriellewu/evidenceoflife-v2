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
        <>
          {/* Phone: thin in-flow strip above the app so it never covers the
              header switcher or the date. */}
          <div className="flex items-center gap-2 border-b border-border/40 bg-background px-4 py-1.5 pt-[calc(env(safe-area-inset-top)+0.375rem)] md:hidden">
            <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Public demo</span>
              <span className="mx-1.5 text-muted-foreground/40">·</span>
              Sample data, not saved
            </p>
            <Button size="sm" className="h-7 shrink-0 rounded-full px-3 text-xs" onClick={handleAuth}>
              Sign in
            </Button>
          </div>
          {/* Desktop: compact pill centered in the top margin, clear of
              per-page header actions on both sides. */}
          <div className="fixed left-1/2 top-3 z-[135] hidden -translate-x-1/2 items-center gap-2 rounded-full border border-primary/15 bg-background/90 py-1 pl-3 pr-1 shadow-[0_14px_40px_-24px_rgba(74,46,29,0.42)] backdrop-blur-md md:flex">
            <p className="text-[11px] text-muted-foreground" title="Sample data only, not saved to any account.">
              <span className="font-medium text-foreground">Public demo</span>
              <span className="hidden xl:inline"><span className="mx-1.5 text-muted-foreground/40">·</span>Sample data, not saved</span>
            </p>
            <Button size="sm" className="h-7 shrink-0 rounded-full px-3 text-xs" onClick={handleAuth}>
              Sign in
            </Button>
          </div>
        </>
      )}

      <Index publicDemo />
    </div>
  );
}
