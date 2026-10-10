import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { AccentColorProvider } from "@/hooks/useAccentColor";
import { ThemeProvider } from "@/hooks/useTheme";
import { Suspense, lazy, useEffect } from "react";
import { identifyUser, trackDayReturned } from "@/lib/analytics";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Landing = lazy(() => import("./pages/Landing"));
const PublicDemo = lazy(() => import("./pages/PublicDemo"));

const queryClient = new QueryClient();

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <span className="text-muted-foreground">Loading...</span>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, authReady } = useAuth();

  if (!authReady || loading) return <LoadingScreen />;

  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, isDemo, loading, authReady } = useAuth();

  if (!authReady || loading) return <LoadingScreen />;

  if (user && !isDemo) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function HomeRoute() {
  const { user, isDemo, loading, authReady } = useAuth();

  if (!authReady || loading) return <LoadingScreen />;

  if (user && !isDemo) return <Navigate to="/app" replace />;
  if (isDemo) return <Navigate to="/demo-app" replace />;
  return <Landing />;
}

function AnalyticsIdentity() {
  const { user, isDemo } = useAuth();
  // The public demo signs every visitor in as one shared demo user; don't let
  // that merge strangers into a single analytics identity.
  const realUserId = !isDemo ? user?.id ?? null : null;

  useEffect(() => {
    identifyUser(realUserId);
    if (realUserId) trackDayReturned(realUserId);
  }, [realUserId]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <LanguageProvider>
        <AccentColorProvider>
          <ThemeProvider>
            <TooltipProvider>
              <AnalyticsIdentity />
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Suspense fallback={<LoadingScreen />}>
                  <Routes>
                    <Route path="/" element={<HomeRoute />} />
                    <Route path="/demo-app" element={<PublicDemo />} />
                    <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    <Route path="/app" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </TooltipProvider>
          </ThemeProvider>
        </AccentColorProvider>
      </LanguageProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App; 
