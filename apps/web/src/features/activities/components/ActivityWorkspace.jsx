import {
  IconActivity,
  IconCircleCheck,
  IconFile,
  IconFolder,
  IconLayoutDashboard,
} from '@tabler/icons-react';

const ICONS = {
  workspace: IconLayoutDashboard,
  project: IconFolder,
  task: IconCircleCheck,
  note: IconFile,
};

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
    <section className="dao-surface dao-activity-workspace">
      <header className="dao-surface-header">
        <div>
          <p className="dao-eyebrow">Local history</p>
          <h1>Activity</h1>
          <p>A quiet record of what has been created in this workspace.</p>
        </div>
      </header>
      <div className="dao-activity-list">
        {model.activities.map((activity) => {
          const Icon = ICONS[activity.entityType] ?? IconActivity;
          const metadata = parseMetadata(activity.metadataJson);
          return (
            <div key={activity.id} className="dao-activity-row">
              <span className="dao-activity-icon dao-corner">
                <Icon aria-hidden="true" />
              </span>
              <span>
                <strong>{metadata.title ?? metadata.name ?? activity.entityType}</strong>
                <small>Created {activity.entityType}</small>
              </span>
              <time>{relativeTime(activity.createdAt)}</time>
            </div>
          );
        })}
        {model.activities.length === 0 ? (
          <div className="dao-empty-state">
            <IconActivity aria-hidden="true" />
            <h2>No activity yet</h2>
            <p>New work will appear here as Dao records it locally.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
