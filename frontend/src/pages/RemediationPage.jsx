import PlaceholderPage from './PlaceholderPage.jsx';

export function RemediationPage() {
  return (
    <PlaceholderPage
      title="Remediation"
      subtitle="Approve a fix, watch it apply, and confirm the resource reached the intended state."
      icon="remediation"
      emptyTitle="Remediation flow pending"
    >
      This page will show each fix as a reviewable change with a before and after
      comparison, the verification result, and a control to reset the lab afterwards.
    </PlaceholderPage>
  );
}

export default RemediationPage;
