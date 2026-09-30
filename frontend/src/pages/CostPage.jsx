import PlaceholderPage from './PlaceholderPage.jsx';

export function CostPage() {
  return (
    <PlaceholderPage
      title="Cost"
      subtitle="Where the money goes, and what each recommended fix would save."
      icon="cost"
      emptyTitle="Cost charts pending"
    >
      This page will chart spend by resource against the waste attributable to each
      finding, with a before and after comparison for every proposed remediation.
    </PlaceholderPage>
  );
}

export default CostPage;
