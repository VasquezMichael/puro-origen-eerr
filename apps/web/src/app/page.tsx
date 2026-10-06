"use client";
import { Dashboard } from "./dashboard";
import { useSession } from "./session-context";
import { Suspense } from "react";
export default function Home() {
  const { user } = useSession();
  return <Suspense fallback={<p role="status">Cargando Dashboard…</p>}><Dashboard user={user} /></Suspense>;
}
