/**
 * sidechain / subagent の分岐展開（SPEC-CHAT-031）。
 * 既定は閉。summary に使用モデルと分岐の推定コスト合算を出す。
 */
import { formatUsd } from '../lib/format';
import { KindChip, ModelChip } from './KindChip';
import { MessageBubble } from './MessageBubble';
import type { SidechainRow } from '../lib/thread';
import type { MessageBody } from '../lib/types';

export interface SidechainGroupProps {
  row: SidechainRow;
  getBody: (index: number) => MessageBody | undefined;
}

export function SidechainGroup({ row, getBody }: SidechainGroupProps) {
  const first = row.records[0];
  const model = row.records.find((r) => r.kind === 'assistant' && r.model !== undefined)?.model;
  const total = row.records.reduce((a, r) => a + (r.cost?.total ?? 0), 0);

  return (
    <div className="sidechain">
      <details>
        <summary>
          <KindChip kind="agent" />
          <span className="toolname">{first?.preview ?? '(sidechain)'}</span>
          {model !== undefined && <ModelChip model={model} />}
          <span className="meta">
            （sidechain · {row.records.length} msg · {formatUsd(total)} 推定）
          </span>
        </summary>
        <div className="inner">
          {row.records.map((record) => (
            <MessageBubble
              key={record.index}
              record={record}
              toolResults={{}}
              body={getBody(record.index)}
              getBody={getBody}
            />
          ))}
        </div>
      </details>
    </div>
  );
}
