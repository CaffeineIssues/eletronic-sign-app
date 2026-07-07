const LABELS = {
  draft: 'Draft',
  pending_signature: 'Pending signature',
  completed: 'Completed',
  cancelled: 'Cancelled',
  pending: 'Pending',
  sent: 'Sent',
  viewed: 'Viewed',
  signed: 'Signed',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="dot" />
      {LABELS[status] || status}
    </span>
  );
}
