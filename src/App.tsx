import { useState, useEffect } from 'react';
import { LandingPage } from './components/LandingPage';
import { FormBuilder } from './components/FormBuilder';
import type { FormQuestion, VCThesis } from './components/FormBuilder';
import { PublishedForm } from './components/PublishedForm';
import { FormNotFound } from './components/FormNotFound';
import { AuthPage } from './components/AuthPage';
import { DashboardPage } from './components/DashboardPage';
import { FormResultsPage } from './components/FormResultsPage';
import { ApplicationDetailsPage } from './components/ApplicationDetailsPage';
import { EmailInboxPage } from './components/EmailInboxPage';
import { CallsPage } from './components/CallsPage';
import { DealIntelligencePage } from './components/DealIntelligencePage';
import { PortfolioPage } from './components/PortfolioPage';
import { AuthenticatedLayout } from './components/AuthenticatedLayout';
import { Toaster } from './components/ui/sonner';
import { getForm } from './utils/api';
import { supabase } from './utils/supabase/client';
import type { Session, User } from '@supabase/supabase-js';

interface PublishedFormData {
  formId: string;
  formName: string;
  questions: FormQuestion[];
  thesis: VCThesis;
}

interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  user: User | null;
}

type ViewType =
  | 'landing'
  | 'dashboard'
  | 'hub'
  | 'builder'
  | 'results'
  | 'application'
  | 'inbox'
  | 'calls'
  | 'intelligence'
  | 'portfolio'
  | 'published'
  | 'notfound'
  | 'auth'
  | 'loading';

const AUTHENTICATED_VIEWS = new Set<ViewType>([
  'dashboard',
  'hub',
  'builder',
  'results',
  'application',
  'inbox',
  'calls',
  'intelligence',
  'portfolio',
]);

export default function App() {
  const [view, setView] = useState<ViewType>('loading');

  const [currentForm, setCurrentForm] = useState<PublishedFormData | null>(null);
  const [notFoundId, setNotFoundId] = useState('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    accessToken: null,
    user: null,
  });
  const [authReady, setAuthReady] = useState(false);

  // --------------------------------
  // Restore Supabase session
  // --------------------------------
  useEffect(() => {
    let active = true;

    const applySession = (session: Session | null) => {
      if (!active) return;

      if (session?.user) {
        setAuthState({
          isAuthenticated: true,
          accessToken: session.access_token,
          user: session.user,
        });
      } else {
        setAuthState({
          isAuthenticated: false,
          accessToken: null,
          user: null,
        });
      }
      setAuthReady(true);
    };

    // If there's an OAuth code in the URL, wait for onAuthStateChange
    // to exchange it before marking auth as ready.
    const hasOAuthCode = new URLSearchParams(window.location.search).has('code');

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        applySession(session);
        return;
      }

      if (event === 'SIGNED_OUT') {
        applySession(null);
      }
    });

    if (!hasOAuthCode) {
      supabase.auth.getSession().then(({ data }) => {
        applySession(data.session ?? null);
      });
    }

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // --------------------------------
  // QUERY-BASED ROUTER (FIGMA SAFE)
  // --------------------------------
  useEffect(() => {
    if (!authReady) return;

    const route = async () => {
      setCurrentForm(null);

      // Clean up OAuth code param from URL after redirect
      const params = new URLSearchParams(window.location.search);
      if (params.has('code')) {
        params.delete('code');
        const clean = params.toString() ? `?${params.toString()}` : '/';
        window.history.replaceState({}, '', clean);
      }
      const formId = params.get('form');
      const viewParam = params.get('view');
      const submissionIdParam = params.get('submission');

      // 1️⃣ Public Form
      if (formId) {
        setView('loading');

        const result = await getForm(formId);

        if (!result.success || !result.form) {
          setNotFoundId(formId);
          setView('notfound');
          return;
        }

        setCurrentForm(result.form);
        setView('published');
        return;
      }

      // 2️⃣ Dashboard (auth required) — also redirect 'hub' to dashboard
      if (viewParam === 'dashboard' || viewParam === 'hub') {
        if (!authState.isAuthenticated) {
          setView('auth');
          return;
        }

        setView('dashboard');
        return;
      }

      // 3️⃣ Builder (auth required)
      if (viewParam === 'builder') {
        if (!authState.isAuthenticated) {
          setView('auth');
          return;
        }

        setView('builder');
        return;
      }

      // 4️⃣ Results
      if (viewParam === 'results') {
        if (!authState.isAuthenticated) {
          setView('auth');
          return;
        }

        setView('results');
        return;
      }

      // 5️⃣ Application details
      if (viewParam === 'application') {
        if (!authState.isAuthenticated) {
          setView('auth');
          return;
        }

        if (!submissionIdParam) {
          setView('results');
          return;
        }

        setSelectedSubmissionId(submissionIdParam);
        setView('application');
        return;
      }

      // 6️⃣ Email inbox
      if (viewParam === 'inbox') {
        if (!authState.isAuthenticated) {
          setView('auth');
          return;
        }

        setView('inbox');
        return;
      }

      // 7️⃣ Calls
      if (viewParam === 'calls') {
        if (!authState.isAuthenticated) {
          setView('auth');
          return;
        }

        setView('calls');
        return;
      }

      // 7.5 Deal Intelligence
      if (viewParam === 'intelligence') {
        if (!authState.isAuthenticated) {
          setView('auth');
          return;
        }

        const callParam = params.get('call');
        if (!callParam) {
          setView('calls');
          return;
        }

        setSelectedCallId(callParam);
        setView('intelligence');
        return;
      }

      // 8️⃣ Portfolio
      if (viewParam === 'portfolio') {
        if (!authState.isAuthenticated) {
          setView('auth');
          return;
        }

        setView('portfolio');
        return;
      }

      // 9️⃣ Default — if authenticated, go straight to dashboard
      if (authState.isAuthenticated) {
        setView('dashboard');
        return;
      }
      setView('landing');
    };

    route();

    window.addEventListener('popstate', route);

    return () => {
      window.removeEventListener('popstate', route);
    };
  }, [authReady, authState.isAuthenticated]);

  // --------------------------------
  // Auth Handlers
  // --------------------------------
  const navigate = (url: string) => {
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleNavigate = (targetView: string) => {
    navigate(`?view=${targetView}`);
  };

  const handleAuthSuccess = (accessToken: string, user: User) => {
    setAuthState({ isAuthenticated: true, accessToken, user });
    navigate('?view=dashboard');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthState({ isAuthenticated: false, accessToken: null, user: null });
    navigate('/');
  };

  const handlePublish = (
    formId: string,
    formName: string,
    questions: FormQuestion[],
    thesis: VCThesis
  ) => {
    console.log('[PUBLISH]', { formId, formName, questionCount: questions.length, thesis });
  };

  // --------------------------------
  // Loading screen
  // --------------------------------
  if (view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading form…</p>
      </div>
    );
  }

  // --------------------------------
  // Render authenticated views in sidebar layout
  // --------------------------------
  const renderAuthenticatedContent = () => {
    switch (view) {
      case 'dashboard':
        return (
          <DashboardPage
            userId={authState.user?.id}
            accessToken={authState.accessToken}
            onNavigate={handleNavigate}
          />
        );
      case 'builder':
        return (
          <FormBuilder
            onBack={() => navigate('?view=dashboard')}
            onPublish={handlePublish}
            authState={authState}
            onLogout={handleLogout}
          />
        );
      case 'results':
        return (
          <FormResultsPage
            userId={authState.user?.id ?? null}
            accessToken={authState.accessToken}
            onBackToHub={() => navigate('?view=dashboard')}
            onOpenBuilder={() => navigate('?view=builder')}
            onOpenApplication={(submissionId) =>
              navigate(`?view=application&submission=${encodeURIComponent(submissionId)}`)
            }
          />
        );
      case 'application':
        return selectedSubmissionId ? (
          <ApplicationDetailsPage
            userId={authState.user?.id ?? null}
            submissionId={selectedSubmissionId}
            accessToken={authState.accessToken}
            onBackToResults={() => navigate('?view=results')}
          />
        ) : null;
      case 'inbox':
        return (
          <EmailInboxPage
            accessToken={authState.accessToken}
            onBackToHub={() => navigate('?view=dashboard')}
            onOpenApplication={(submissionId) =>
              navigate(`?view=application&submission=${encodeURIComponent(submissionId)}`)
            }
          />
        );
      case 'calls':
        return (
          <CallsPage
            accessToken={authState.accessToken}
            onBackToHub={() => navigate('?view=dashboard')}
            onOpenApplication={(submissionId) =>
              navigate(`?view=application&submission=${encodeURIComponent(submissionId)}`)
            }
            onOpenIntelligence={(callId) =>
              navigate(`?view=intelligence&call=${encodeURIComponent(callId)}`)
            }
          />
        );
      case 'intelligence':
        return selectedCallId ? (
          <DealIntelligencePage
            callId={selectedCallId}
            accessToken={authState.accessToken}
            onBack={() => navigate('?view=calls')}
          />
        ) : null;
      case 'portfolio':
        return (
          <PortfolioPage
            accessToken={authState.accessToken}
            onBackToHub={() => navigate('?view=dashboard')}
          />
        );
      default:
        return null;
    }
  };

  // --------------------------------
  // Render
  // --------------------------------
  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      {view === 'landing' && (
        <LandingPage onGetStarted={() => navigate('?view=dashboard')} />
      )}

      {AUTHENTICATED_VIEWS.has(view) && (
        <AuthenticatedLayout
          currentView={view}
          userEmail={authState.user?.email}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
        >
          {renderAuthenticatedContent()}
        </AuthenticatedLayout>
      )}

      {view === 'published' && currentForm && (
        <PublishedForm
          {...currentForm}
          onBackToBuilder={() => navigate('?view=dashboard')}
          isPublicView
        />
      )}

      {view === 'notfound' && <FormNotFound formId={notFoundId} />}

      {view === 'auth' && <AuthPage onAuthSuccess={handleAuthSuccess} />}
    </div>
  );
}
