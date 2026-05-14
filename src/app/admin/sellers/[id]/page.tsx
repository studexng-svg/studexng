"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

// Redirect to the unified user detail page
export default function AdminSellerDetailRedirect() {
  const { id } = useParams();
  const router = useRouter();
  useEffect(() => { router.replace(`/admin/users/${id}`); }, [id, router]);
  return null;
}
