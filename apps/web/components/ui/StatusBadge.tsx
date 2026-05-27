const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  active:           { label: 'Active',    cls: 'status-active' },
  expired:          { label: 'Expired',   cls: 'status-expired' },
  suspended:        { label: 'Suspended', cls: 'status-suspended' },
  pending:          { label: 'Pending',   cls: 'status-pending' },
  confirmed:        { label: 'Confirmed', cls: 'status-confirmed' },
  processing:       { label: 'Processing',cls: 'status-processing' },
  pending_payment:  { label: 'Pay Now',   cls: 'status-pending' },
  cancelled:        { label: 'Cancelled', cls: 'status-cancelled' },
  delivered:        { label: 'Delivered', cls: 'status-active' },
  churned:          { label: 'Churned',   cls: 'status-cancelled' },
  ending_soon:      { label: 'Ending Soon',cls: 'status-pending' },
};

export function StatusBadge({ status }: { status: string }) {
  const { label, cls } = STATUS_MAP[status] ?? { label: status, cls: '' };
  return (
    <span className={`tier-badge ${cls}`} style={{ padding: '3px 10px', borderRadius: 20 }}>
      {label}
    </span>
  );
}
