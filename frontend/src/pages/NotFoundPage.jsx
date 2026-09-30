import { Link } from 'react-router-dom';

import PageHeader from '../components/layout/PageHeader.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" subtitle="That route does not exist in this workspace." />
      <Card>
        <CardBody>
          <EmptyState icon="issues" title="Nothing here">
            Head back to the <Link to="/">overview</Link>.
          </EmptyState>
        </CardBody>
      </Card>
    </>
  );
}

export default NotFoundPage;
