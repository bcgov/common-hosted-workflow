import { useQuery } from '@tanstack/react-query';
import { getUserProjects } from '../../services/backend/projects';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function UserProjectsView() {
  const projectsQuery = useQuery({
    queryKey: ['user-projects'],
    queryFn: ({ signal }) => getUserProjects(signal),
  });

  if (projectsQuery.isPending) {
    return <p className="text-sm text-[var(--bc-muted)]">Loading projects...</p>;
  }

  if (projectsQuery.isError) {
    const errorMessage = projectsQuery.error instanceof Error ? projectsQuery.error.message : 'Could not load projects';
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    );
  }

  const items = projectsQuery.data?.data ?? [];

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-[var(--bc-muted)]">
          You don't have any tenants or active projects in the workflow system.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <Card key={`${item.tenantId}-${item.projectId ?? 'none'}`}>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-lg">{item.tenantName}</CardTitle>
              <CardDescription className="font-mono text-xs break-all">{item.tenantId}</CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <ScrollArea className="w-full rounded-md border border-[var(--bc-border)]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[var(--bc-surface)] hover:bg-[var(--bc-surface)]">
                    <TableHead>Project ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-mono text-xs break-all">
                      {item.projectId ?? <span className="text-[var(--bc-muted)]">—</span>}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
