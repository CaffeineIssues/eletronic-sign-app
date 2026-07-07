export default function Modal({ title, onClose, children, large = false }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`card modal${large ? ' modal-lg' : ''}`}>
        <div className="card-header">
          <h2>{title}</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="card-body">{children}</div>
      </div>
    </div>
  );
}
