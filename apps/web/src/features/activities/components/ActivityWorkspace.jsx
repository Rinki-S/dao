import { IconActivity } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge.jsx';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty.jsx';
import { ScrollArea } from '@/components/ui/scroll-area.jsx';

function relativeTime(value) {
  const date = new Date(value);
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function parseMetadata(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function ActivityWorkspace({ model }) {
  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="border-b p-4">
        <div>
          <h1 className="font-heading text-xl font-semibold">Activity</h1>
          <p className="text-muted-foreground text-sm">
            A quiet record of what has been created in this workspace.
          </p>
        </div>
      </header>
      <ScrollArea className="min-h-0 flex-1" overscrollContain>
        <div className="flex flex-col gap-4 p-4">
          {model.activities.map((activity) => {
            const metadata = parseMetadata(activity.metadataJson);
            return (
              <Card key={activity.id}>
                <CardHeader>
                  <CardTitle>{metadata.title ?? metadata.name ?? activity.entityType}</CardTitle>
                  <CardDescription>Created {activity.entityType}</CardDescription>
                  <CardAction>
                    <Badge variant="secondary">{relativeTime(activity.createdAt)}</Badge>
                  </CardAction>
                </CardHeader>
              </Card>
            );
          })}
          {model.activities.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconActivity aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No activity yet</EmptyTitle>
                <EmptyDescription>
                  New work will appear here as Dao records it locally.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </div>
      </ScrollArea>
    </section>
  );
}
