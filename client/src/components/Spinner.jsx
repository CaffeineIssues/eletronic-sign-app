export default function Spinner({ large = false }) {
  return <span className={large ? 'spinner spinner-lg' : 'spinner'} />;
}

export function LoadingBlock({ label = 'Loading…' }) {
  return (
    <div className="loading-block">
      <Spinner large />
      <span>{label}</span>
    </div>
  );
}
