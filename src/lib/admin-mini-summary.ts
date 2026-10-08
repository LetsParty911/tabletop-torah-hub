export type AdminMiniActivity = {
  sessions: number;
  openPdfClicks: number;
  downloadActions: number;
  newSubscriberCount: number;
  newContactCount: number;
};

/** Whether the owner summary has any audience, PDF, subscriber, or contact activity. */
export function hasAdminMiniActivity(activity: AdminMiniActivity): boolean {
  return (
    activity.sessions > 0 ||
    activity.openPdfClicks > 0 ||
    activity.downloadActions > 0 ||
    activity.newSubscriberCount > 0 ||
    activity.newContactCount > 0
  );
}