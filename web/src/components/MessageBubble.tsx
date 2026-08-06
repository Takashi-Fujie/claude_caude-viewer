/**
 * 会話メッセージ 1 件の描画（SPEC-CHAT-022/041）。
 * 本文は遅延取得なので body が無い間はプレビュー（メタ）で代替する。
 */
import { formatTokens, formatUsd } from '../lib/format';
import { ModelChip } from './KindChip';
import { ToolCall } from './ToolCall';
import type { MessageBody, MessageMeta } from '../lib/types';

export interface MessageBubbleProps {
  record: MessageMeta;
  /** tool_use_id → tool_result レコード（thread.buildRows が対応付け済み）。 */
  toolResults: Record<string, MessageMeta>;
  body?: MessageBody | undefined;
  /** tool_result レコードの本文を引く（遅延取得のキャッシュから）。 */
  getBody?: ((index: number) => MessageBody | undefined) | undefined;
}

function formatTime(timestamp: string | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('ja-JP');
}

/** usage とメッセージ単位コストの表示行（SPEC-CHAT-041）。 */
function costLine(record: MessageMeta): string | undefined {
  const usage = record.usage;
  if (!usage) return undefined;

  const parts = [
    `in ${formatTokens(usage.input)}`,
    `out ${formatTokens(usage.output)}`,
    `cache read ${formatTokens(usage.cacheRead)}`,
    `cache write ${formatTokens(usage.cacheCreation)}（5m ${formatTokens(usage.cacheCreation5m)} / 1h ${formatTokens(usage.cacheCreation1h)}）`,
  ];
  if (record.cost) {
    parts.push(record.cost.unknownModel ? '単価未登録' : `${formatUsd(record.cost.total)} 推定`);
  }
  return parts.join(' · ');
}

export function MessageBubble({ record, toolResults, body, getBody }: MessageBubbleProps) {
  const isAssistant = record.kind === 'assistant';
  const cost = isAssistant ? costLine(record) : undefined;

  return (
    <div className={`msg ${isAssistant ? 'assistant' : 'user'}`}>
      <div className="who">
        <b>{isAssistant ? 'Assistant' : 'User'}</b>
        <span>{formatTime(record.timestamp)}</span>
        {isAssistant && record.model !== undefined && <ModelChip model={record.model} />}
        {record.hasThinking === true && <span className="badge">thinking</span>}
        {record.synthetic === true && <span className="badge warn">synthetic</span>}
      </div>
      <div className="bubble">
        {body ? (
          body.blocks.map((block, i) => {
            switch (block.type) {
              case 'text':
                return <div key={i} className="text">{block.text}</div>;
              case 'thinking':
                return (
                  <details key={i} className="tool thinking">
                    <summary>thinking</summary>
                    <div className="body">
                      <pre>{block.text}</pre>
                    </div>
                  </details>
                );
              case 'tool_use': {
                const resultMeta = block.id !== undefined ? toolResults[block.id] : undefined;
                const toolUse = record.toolUses?.find((t) => t.id === block.id);
                return (
                  <ToolCall
                    key={i}
                    toolUse={block}
                    resultBody={resultMeta ? getBody?.(resultMeta.index) : undefined}
                    subagentType={toolUse?.subagentType}
                    skill={toolUse?.skill}
                  />
                );
              }
              default:
                return null;
            }
          })
        ) : (
          <div className="text preview">{record.preview}</div>
        )}
      </div>
      {cost !== undefined && <div className="cost">{cost}</div>}
    </div>
  );
}
