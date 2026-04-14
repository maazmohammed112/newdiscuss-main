import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { HighlightsProvider } from '@/contexts/HighlightsContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Toaster } from '@/components/ui/sonner';
import LoadingScreen from '@/components/LoadingScreen';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import PageRouteSkeleton from '@/components/PageRouteSkeleton';
import '@/App.css';

const LandingPage = lazy(() => import('@/pages/LandingPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/RegisterPage'));
const FeedPage = lazy(() => import('@/pages/FeedPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const PostDetailPage = lazy(() => import('@/pages/PostDetailPage'));
const UserPostsPage = lazy(() => import('@/pages/UserPostsPage'));
const ChatPage = lazy(() => import('@/pages/ChatPage'));
const ChatConversationPage = lazy(() => import('@/pages/ChatConversationPage'));
const GroupConversationPage = lazy(() => import('@/pages/GroupConversationPage'));
const GroupInfoPage = lazy(() => import('@/pages/GroupInfoPage'));
const JoinRequestsPage = lazy(() => import('@/pages/JoinRequestsPage'));

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return <LoadingScreen message="Checking authentication..." />;
  }
  
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return children;
}

function AuthRedirect({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <LoadingScreen message="Loading..." />;
  }
  
  if (user) {
    return <Navigate to="/feed" replace />;
  }
  
  return children;
}

function AuthStateWatcher() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  useEffect(() => {
    const protectedPaths = ['/feed', '/profile'];
    if (!user && protectedPaths.includes(location.pathname)) {
      navigate('/login', { replace: true });
    }
  }, [user, location.pathname, navigate]);
  
  useEffect(() => {
    const handlePopState = () => {
      const protectedPaths = ['/feed', '/profile'];
      if (!user && protectedPaths.includes(window.location.pathname)) {
        navigate('/login', { replace: true });
      }
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user, navigate]);
  
  return null;
}

function AppRoutes() {
  return (
    <>
      <AuthStateWatcher />
      <Suspense fallback={<PageRouteSkeleton />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthRedirect><LoginPage /></AuthRedirect>} />
          <Route path="/register" element={<AuthRedirect><RegisterPage /></AuthRedirect>} />
          <Route path="/feed" element={<ProtectedRoute><FeedPage /></ProtectedRoute>} />
          <Route path="/post/:postId" element={<ProtectedRoute><PostDetailPage /></ProtectedRoute>} />
          <Route path="/user/:userId" element={<ProtectedRoute><UserPostsPage /></ProtectedRoute>} />
          <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
          <Route path="/chat/:otherUserId" element={<ProtectedRoute><ChatConversationPage /></ProtectedRoute>} />
          <Route path="/group/:groupId" element={<ProtectedRoute><GroupConversationPage /></ProtectedRoute>} />
          <Route path="/group/:groupId/info" element={<ProtectedRoute><GroupInfoPage /></ProtectedRoute>} />
          <Route path="/join-requests" element={<ProtectedRoute><JoinRequestsPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <HighlightsProvider>
              <AppRoutes />
              <Toaster position="top-right" />
            </HighlightsProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}

export default App;
