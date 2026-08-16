import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import StudentTabs from "@/components/StudentTabs";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("student");

  return (
    <>
      <PageHeader profile={profile} />
      <StudentTabs />
      {children}
    </>
  );
}
