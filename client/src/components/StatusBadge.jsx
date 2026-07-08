const LABELS = {
  draft: 'Rascunho',
  pending_signature: 'Aguardando assinatura',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  pending: 'Pendente',
  sent: 'Enviado',
  viewed: 'Visualizado',
  signed: 'Assinado',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="dot" />
      {LABELS[status] || status}
    </span>
  );
}
