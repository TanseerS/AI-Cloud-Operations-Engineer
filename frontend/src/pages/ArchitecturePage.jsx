import PlaceholderPage from './PlaceholderPage.jsx';

export function ArchitecturePage() {
  return (
    <PlaceholderPage
      title="Architecture"
      subtitle="How the discovered AWS resources connect, and where a misconfiguration sits in that path."
      icon="architecture"
      emptyTitle="Interactive diagram pending"
    >
      This page will render the discovered resources as connected nodes - API, functions,
      log groups and roles - with the affected edge highlighted when an issue is found.
    </PlaceholderPage>
  );
}

export default ArchitecturePage;
