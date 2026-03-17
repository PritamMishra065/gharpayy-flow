import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Pipeline from "./pages/Pipeline";
import Visits from "./pages/Visits";
import Conversations from "./pages/Conversations";
import Analytics from "./pages/Analytics";
import Historical from "./pages/Historical";
import SettingsPage from "./pages/SettingsPage";
import LeadCapture from "./pages/LeadCapture";
import Owners from "./pages/Owners";
import Inventory from "./pages/Inventory";
import EffortDashboard from "./pages/EffortDashboard";
import Availability from "./pages/Availability";
import Matching from "./pages/Matching";
import Bookings from "./pages/Bookings";
import ZoneManagement from "./pages/ZoneManagement";
import Explore from "./pages/Explore";
import PropertyDetail from "./pages/PropertyDetail";
import LandingPage from "./pages/LandingPage";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import OwnerPortal from "./pages/OwnerPortal";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <AppErrorBoundary>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public customer-facing routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/property/:propertyId" element={<PropertyDetail />} />
              <Route path="/capture" element={<LeadCapture />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Owner-facing portal */}
              <Route path="/owner-portal" element={<OwnerPortal />} />

              {/* Internal CRM routes */}
              <Route path="/dashboard" element={<ProtectedRoute required="crm"><Dashboard /></ProtectedRoute>} />
              <Route path="/leads" element={<ProtectedRoute required="crm"><Leads /></ProtectedRoute>} />
              <Route path="/pipeline" element={<ProtectedRoute required="crm"><Pipeline /></ProtectedRoute>} />
              <Route path="/visits" element={<ProtectedRoute required="crm"><Visits /></ProtectedRoute>} />
              <Route path="/conversations" element={<ProtectedRoute required="crm"><Conversations /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute required="crm"><Analytics /></ProtectedRoute>} />
              <Route path="/historical" element={<ProtectedRoute required="crm"><Historical /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute required="crm"><SettingsPage /></ProtectedRoute>} />
              <Route path="/owners" element={<ProtectedRoute required="crm"><Owners /></ProtectedRoute>} />
              <Route path="/inventory" element={<ProtectedRoute required="crm"><Inventory /></ProtectedRoute>} />
              <Route path="/effort" element={<ProtectedRoute required="crm"><EffortDashboard /></ProtectedRoute>} />
              <Route path="/availability" element={<ProtectedRoute required="crm"><Availability /></ProtectedRoute>} />
              <Route path="/matching" element={<ProtectedRoute required="crm"><Matching /></ProtectedRoute>} />
              <Route path="/bookings" element={<ProtectedRoute required="crm"><Bookings /></ProtectedRoute>} />
              <Route path="/zones" element={<ProtectedRoute required="crm"><ZoneManagement /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AppErrorBoundary>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
