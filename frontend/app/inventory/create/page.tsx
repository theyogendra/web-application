"use client";

import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api";
import ProductForm, {
  buildInitialProductValues,
} from "@/components/ProductForm";
import { PageHeader } from "@/components/ui";

export default function CreateProductPage() {
  const router = useRouter();

  async function handleSubmit(payload: any) {
    const res = await apiPost("/inventory", payload);
    if (res && res.success === false) {
      const msg =
        (Array.isArray(res.errors) && res.errors.join(", ")) ||
        res.message ||
        "Failed to create product.";
      throw new Error(msg);
    }
    const created = res?.data || res;
    const id = created?.id;
    if (id) {
      router.push(`/inventory/${id}`);
    } else {
      router.push("/inventory");
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New Product"
        description="Add a product or service to your inventory."
      />
      <ProductForm
        initialValues={buildInitialProductValues()}
        submitLabel="Create Product"
        onSubmit={handleSubmit}
        onCancel={() => router.push("/inventory")}
      />
    </div>
  );
}
