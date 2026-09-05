"use client";

import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api";
import UserForm, { buildInitialUserValues } from "@/components/UserForm";
import { PageHeader } from "@/components/ui";

export default function CreateUserPage() {
  const router = useRouter();

  async function handleSubmit(payload: any) {
    const res = await apiPost("/users", payload);
    if (res && res.success === false) {
      const msg =
        (Array.isArray(res.errors) && res.errors.join(", ")) ||
        res.message ||
        "Failed to create user.";
      throw new Error(msg);
    }
    const created = res?.data || res;
    const id = created?.id;
    if (id) {
      router.push(`/users/${id}`);
    } else {
      router.push("/users");
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New User"
        description="Create a staff account and assign a role."
      />
      <UserForm
        initialValues={buildInitialUserValues()}
        submitLabel="Create User"
        onSubmit={handleSubmit}
        onCancel={() => router.push("/users")}
      />
    </div>
  );
}
