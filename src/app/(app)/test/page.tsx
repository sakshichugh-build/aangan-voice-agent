import { PageHeader } from '@/components/ui';
import { TestCallForm } from './form';

export default function TestCallPage() {
  return (
    <>
      <PageHeader
        title="Test call"
        subtitle="Run a transcript through the real post-call pipeline — the end-to-end demo before Vaani voice is connected."
      />
      <TestCallForm />
    </>
  );
}
