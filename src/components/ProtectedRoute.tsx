import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

type ProtectedRouteProps = {
  children: React.ReactNode;
  required: 'crm' | 'owner';
};

const ProtectedRoute = ({ children, required }: ProtectedRouteProps) => {
  const location = useLocation();
  const { loading, user, userContext } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Checking access...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/auth?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (required === 'crm' && !userContext.isCrmUser) {
    return <Navigate to={userContext.defaultPath || '/explore'} replace />;
  }

  if (required === 'owner' && !userContext.isOwner) {
    return <Navigate to={userContext.defaultPath || '/explore'} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
