import PageHeader from '../components/layout/PageHeader.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Badge from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';

/**
 * Pages whose visualisation is not built yet say so plainly rather than showing
 * invented data. The empty state names the visual that will replace it.
 */
export function PlaceholderPage({ title, subtitle, icon, emptyTitle, children }) {
  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        aside={<Badge tone="outline">Not built yet</Badge>}
      />
      <Card>
        <CardBody>
          <EmptyState icon={icon} title={emptyTitle}>
            {children}
          </EmptyState>
        </CardBody>
      </Card>
    </>
  );
}

export default PlaceholderPage;
