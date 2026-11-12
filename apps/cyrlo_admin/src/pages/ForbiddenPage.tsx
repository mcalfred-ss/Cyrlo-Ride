import { Link } from 'react-router-dom';

import { Button, Muted, PageCard } from '../components/ui';

export function ForbiddenPage() {
  return (
    <PageCard title="Access denied">
      <Muted>Your role does not include this area. The backend remains the authorization authority.</Muted>
      <Link to="/">
        <Button className="w-full">Back to home</Button>
      </Link>
    </PageCard>
  );
}
