import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

import AppShell from './components/layout/AppShell.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { HealthProvider, useHealth } from './context/HealthContext.jsx';
import { RefreshProvider } from './context/RefreshContext.jsx';

import OverviewPage from './pages/OverviewPage.jsx';
import InfrastructurePage from './pages/InfrastructurePage.jsx';
import CostPage from './pages/CostPage.jsx';
import IssuesPage from './pages/IssuesPage.jsx';
import AiAnalysisPage from './pages/AiAnalysisPage.jsx';
import RemediationPage from './pages/RemediationPage.jsx';
import LabControlPage from './pages/LabControlPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import { SkeletonCard } from './components/ui/Skeleton.jsx';

// The graph library is only needed on this route, so it is not in the initial bundle.
const ArchitecturePage = lazy(() => import('./pages/ArchitecturePage.jsx'));

function Workspace() {
  const health = useHealth();

  return (
    <AppShell region={health.data?.region}>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/infrastructure" element={<InfrastructurePage />} />
          <Route
            path="/architecture"
            element={
              <Suspense fallback={<SkeletonCard rows={8} />}>
                <ArchitecturePage />
              </Suspense>
            }
          />
          <Route path="/cost" element={<CostPage />} />
          <Route path="/issues" element={<IssuesPage />} />
          <Route path="/ai" element={<AiAnalysisPage />} />
          <Route path="/remediation" element={<RemediationPage />} />
          <Route path="/lab" element={<LabControlPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </ErrorBoundary>
    </AppShell>
  );
}

export function App() {
  return (
    <RefreshProvider>
      <HealthProvider>
        <Workspace />
      </HealthProvider>
    </RefreshProvider>
  );
}

export default App;
