import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/States";

export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="card">
        <EmptyState
          title="Coming up next"
          message="This screen is part of the admin build and will be wired up in an upcoming step."
        />
      </div>
    </>
  );
}
