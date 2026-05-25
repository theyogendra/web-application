"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPut } from "@/lib/api";
import UserForm, {
  buildInitialUserValues,
  UserFormValues,
} from "@/components/UserForm";
import { ErrorState, Loading, PageHeader } from "@/components/ui";

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [initialValues, setInitialValues] = useState<UserFormValues | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/users/${id}`);
      const user = data?.data || data;
      setInitialValues(buildInitialUserValues(user));
    } catch (err: any) {
      setError(err?.message || "Failed to load user.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmit(payload: any) {
    const res = await apiPut(`/users/${id}`, payload);
    if (res && res.success === false) {
      const msg =
        (Array.isArray(res.errors) && res.errors.join(", ")) ||
        res.message ||
        "Failed to update user.";
      throw new Error(msg);
    }
    router.push(`/users/${id}`);
  }

  if (loading) {
    return <Loading label="Loading user..." />;
  }
  if (error) {
    return (
      <div>
        <PageHeader title="Edit User" />
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (!initialValues) {
    return (
      <div>
        <PageHeader title="Edit User" />
        <ErrorState message="User not found." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Edit User"
        description="Update account details, role and module access."
      />
      <UserForm
        initialValues={initialValues}
        submitLabel="Save Changes"
        isEdit
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/users/${id}`)}
      />
    </div>
  );
}
