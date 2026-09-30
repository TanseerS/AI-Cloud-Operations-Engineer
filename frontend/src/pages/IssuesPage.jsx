import PlaceholderPage from './PlaceholderPage.jsx';

export function IssuesPage() {
  return (
    <PlaceholderPage
      title="Issues"
      subtitle="Findings the engineer has detected in the AWS environment, ranked by severity."
      icon="issues"
      emptyTitle="Findings pending"
    >
      This page will list each detected issue as a severity card carrying the evidence
      that proves it, the resource it affects, and the fix that resolves it.
    </PlaceholderPage>
  );
}

export default IssuesPage;
