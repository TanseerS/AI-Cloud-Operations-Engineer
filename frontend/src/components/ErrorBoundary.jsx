import { Component } from 'react';

import Card, { CardBody } from './ui/Card.jsx';
import EmptyState from './ui/EmptyState.jsx';
import Button from './ui/Button.jsx';

/** A render failure should degrade one panel, not blank the whole dashboard. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <Card>
        <CardBody>
          <EmptyState icon="issues" title="Something failed to render">
            {this.state.error.message}
          </EmptyState>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Button onClick={() => this.setState({ error: null })}>Try again</Button>
          </div>
        </CardBody>
      </Card>
    );
  }
}

export default ErrorBoundary;
