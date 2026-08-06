/**
 * ツール別ランキング（SPEC-CHAT-050）。呼び出し回数の降順の横棒。
 */
export function ToolRanking({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <div className="note">ツール呼び出しはありません</div>;
  const max = entries[0]?.[1] ?? 1;

  return (
    <div>
      {entries.map(([name, count]) => (
        <div key={name} className="hbar">
          <span className="lb" data-testid="tool-name">
            {name}
          </span>
          <span className="track">
            <i style={{ width: `${(count / max) * 100}%` }} />
          </span>
          <span className="val">{count.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
