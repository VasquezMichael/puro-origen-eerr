"use client";
import { Dashboard } from "./dashboard";
import { useSession } from "./session-context";
export default function Home() {
  const { user } = useSession();
  return <Dashboard user={user} />;
}
