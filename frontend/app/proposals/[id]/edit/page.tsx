"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPut } from "@/lib/api";
import DocumentForm, {
  buildInitialDocumentValues,
} from "@/components/DocumentForm";
import { ErrorState, Loading, PageHeader } from "@/components/ui";

export default function EditProposalPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [proposal, setProposal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/proposals/${id}`);
      setProposal(data?.data || data);
    } catch (err: any) {
      setError(err?.message || "Failed to load proposal.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmit(payload: any) {
    const res = await apiPut(`/proposals/${id}`, payload);
    if (res && res.success === false) {
      const msg =
        (Array.isArray(res.errors) && res.errors.join(", ")) ||
        res.message ||
        "Failed to update proposal.";
      throw new Error(msg);
    }
    router.push(`/proposals/${id}`);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Edit Proposal"
        description={
          proposal ? `Editing ${proposal.proposal_number}` : "Loading..."
        }
      />
      {loading ? (
        <Loading label="Loading proposal..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <DocumentForm
          kind="proposal"
          initialValues={buildInitialDocumentValues("proposal", proposal)}
          submitLabel="Save Changes"
          onSubmit={handleSubmit}
          onCancel={() => router.push(`/proposals/${id}`)}
        />
      )}
    </div>
  );
}
