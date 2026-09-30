import { Route, Routes } from 'react-router-dom';

import AppShell from './components/layout/AppShell.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { HealthProvider, useHealth } from './context/HealthContext.jsx';

import OverviewPage from './pages/OverviewPage.jsx';
import InfrastructurePage from './pages/InfrastructurePage.jsx';
import ArchitecturePage from './pages/ArchitecturePage.jsx';
import CostPage from './pages/CostPage.jsx';
import IssuesPage from './pages/IssuesPage.jsx';
import RemediationPage from './pages/RemediationPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

function Workspace() {
  const health = useHealth();

  return (
    <AppShell region={health.data?.region}>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/infrastructure" element={<InfrastructurePage />} />
          <Route path="/architecture" element={<ArchitecturePage />} />
          <Route path="/cost" element={<CostPage />} />
          <Route path="/issues" element={<IssuesPage />} />
          <Route path="/remediation" element={<RemediationPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </ErrorBoundary>
    </AppShell>
  );
}

export function App() {
  return (
    <HealthProvider>
      <Workspace />
    </HealthProvider>
  );
}

export default App;
