"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPut } from "@/lib/api";
import ProductForm, {
  buildInitialProductValues,
} from "@/components/ProductForm";
import { ErrorState, Loading, PageHeader } from "@/components/ui";

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/inventory/${id}`);
      setProduct(data?.data || data);
    } catch (err: any) {
      setError(err?.message || "Failed to load product.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmit(payload: any) {
    const res = await apiPut(`/inventory/${id}`, payload);
    if (res && res.success === false) {
      const msg =
        (Array.isArray(res.errors) && res.errors.join(", ")) ||
        res.message ||
        "Failed to update product.";
      throw new Error(msg);
    }
    router.push(`/inventory/${id}`);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Edit Product"
        description={product ? `Editing ${product.name}` : "Loading..."}
      />
      {loading ? (
        <Loading label="Loading product..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <ProductForm
          initialValues={buildInitialProductValues(product)}
          submitLabel="Save Changes"
          onSubmit={handleSubmit}
          onCancel={() => router.push(`/inventory/${id}`)}
        />
      )}
    </div>
  );
}
