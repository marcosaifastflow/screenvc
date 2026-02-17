import { useState, useEffect } from 'react';
import { LandingPage } from './components/LandingPage';
import { FormBuilder } from './components/FormBuilder';
import type { FormQuestion, VCThesis } from './components/FormBuilder';
import { PublishedForm } from './components/PublishedForm';
import { FormNotFound } from './components/FormNotFound';
import { AuthPage } from './components/AuthPage';
import { VCHubPage } from './components/VCHubPage';
import { FormResultsPage } from './components/FormResultsPage';
import { ApplicationDetailsPage } from './components/ApplicationDetailsPage';
import { EmailInboxPage } from './components/EmailInboxPage';
import { CallsPage } from './components/CallsPage';
import { DealIntelligencePage } from './components/DealIntelligencePage';
import { PortfolioPage } from './components/PortfolioPage';
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

export default function App() {
  const [view, setView] = useState<
    | 'landing'
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
    | 'loading'
  >('loading');

  const [currentForm, setCurrentForm] = useState<PublishedFormData | null>(null);
  const [notFoundId, setNotFoundId] = useState('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    accessToken: null,
    user: null,
  });

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
        return;
      }

      setAuthState({
        isAuthenticated: false,
        accessToken: null,
        user: null,
      });
    };

    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session ?? null);
    });

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

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // --------------------------------
  // QUERY-BASED ROUTER (FIGMA SAFE)
  // --------------------------------
  useEffect(() => {
    const route = async () => {
      setCurrentForm(null);

      const params = new URLSearchParams(window.location.search);
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

      // 2️⃣ Hub (auth required)
      if (viewParam === 'hub') {
        if (!authState.isAuthenticated) {
          setView('auth');
          return;
        }

        setView('hub');
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

      // 9️⃣ Default
      setView('landing');
    };

    route();

    window.addEventListener('popstate', route);

    return () => {
      window.removeEventListener('popstate', route);
    };
  }, [authState.isAuthenticated]);

  // --------------------------------
  // Auth Handlers
  // --------------------------------
  const navigate = (url: string) => {
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleAuthSuccess = (accessToken: string, user: User) => {
    setAuthState({ isAuthenticated: true, accessToken, user });
    navigate('?view=hub');
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
  // Render
  // --------------------------------
  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      {view === 'landing' && (
        <LandingPage onGetStarted={() => navigate('?view=hub')} />
      )}

      {view === 'hub' && (
        <VCHubPage
          userEmail={authState.user?.email}
          accessToken={authState.accessToken}
          onOpenBuilder={() => navigate('?view=builder')}
          onOpenResults={() => navigate('?view=results')}
          onOpenInbox={() => navigate('?view=inbox')}
          onOpenCalls={() => navigate('?view=calls')}
          onOpenPortfolio={() => navigate('?view=portfolio')}
          onLogout={handleLogout}
        />
      )}

      {view === 'builder' && (
        <FormBuilder
          onBack={() => navigate('?view=hub')}
          onPublish={handlePublish}
          authState={authState}
          onLogout={handleLogout}
        />
      )}

      {view === 'published' && currentForm && (
        <PublishedForm
          {...currentForm}
          onBackToBuilder={() => navigate('?view=hub')}
          isPublicView
        />
      )}

      {view === 'notfound' && <FormNotFound formId={notFoundId} />}

      {view === 'results' && (
        <FormResultsPage
          userId={authState.user?.id ?? null}
          accessToken={authState.accessToken}
          onBackToHub={() => navigate('?view=hub')}
          onOpenBuilder={() => navigate('?view=builder')}
          onOpenApplication={(submissionId) =>
            navigate(`?view=application&submission=${encodeURIComponent(submissionId)}`)
          }
        />
      )}

      {view === 'application' && selectedSubmissionId && (
        <ApplicationDetailsPage
          userId={authState.user?.id ?? null}
          submissionId={selectedSubmissionId}
          accessToken={authState.accessToken}
          onBackToResults={() => navigate('?view=results')}
        />
      )}

      {view === 'inbox' && (
        <EmailInboxPage
          accessToken={authState.accessToken}
          onBackToHub={() => navigate('?view=hub')}
          onOpenApplication={(submissionId) =>
            navigate(`?view=application&submission=${encodeURIComponent(submissionId)}`)
          }
        />
      )}

      {view === 'calls' && (
        <CallsPage
          accessToken={authState.accessToken}
          onBackToHub={() => navigate('?view=hub')}
          onOpenApplication={(submissionId) =>
            navigate(`?view=application&submission=${encodeURIComponent(submissionId)}`)
          }
          onOpenIntelligence={(callId) =>
            navigate(`?view=intelligence&call=${encodeURIComponent(callId)}`)
          }
        />
      )}

      {view === 'intelligence' && selectedCallId && (
        <DealIntelligencePage
          callId={selectedCallId}
          accessToken={authState.accessToken}
          onBack={() => navigate('?view=calls')}
        />
      )}

      {view === 'portfolio' && (
        <PortfolioPage
          accessToken={authState.accessToken}
          onBackToHub={() => navigate('?view=hub')}
        />
      )}

      {view === 'auth' && <AuthPage onAuthSuccess={handleAuthSuccess} />}
    </div>
  );
}
