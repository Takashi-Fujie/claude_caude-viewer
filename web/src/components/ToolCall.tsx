/**
 * ツール呼び出しと実行結果の折りたたみ（SPEC-CHAT-020/021）。
 * 既定は閉。失敗（is_error）は開かなくても分かるよう summary に明示する。
 */
import { classifyTool } from '../lib/chips';
import { KindChip } from './KindChip';
import type { BodyBlock, MessageBody } from '../lib/types';

export interface ToolCallProps {
  toolUse: BodyBlock;
  /** 対応する tool_result レコードの本文（未取得・結果なしは undefined）。 */
  resultBody?: MessageBody | undefined;
  subagentType?: string | undefined;
  skill?: string | undefined;
}

/** input から summary 行に出す短い引数表現を作る。 */
function inputSummary(input: unknown): string {
  if (typeof input !== 'object' || input === null) return '';
  const obj = input as Record<string, unknown>;
  for (const key of ['command', 'file_path', 'skill', 'description', 'prompt', 'query', 'url']) {
    const value = obj[key];
    if (typeof value === 'string' && value.length > 0) {
      return value.length > 80 ? `${value.slice(0, 80)}…` : value;
    }
  }
  return '';
}

export function ToolCall({ toolUse, resultBody, subagentType, skill }: ToolCallProps) {
  const chip = classifyTool({
    id: toolUse.id ?? '',
    name: toolUse.name ?? '',
    subagentType,
    skill,
  });
  const result = resultBody?.blocks.find((b) => b.type === 'tool_result');
  const name =
    chip.kind === 'mcp' ? `${chip.server} · ${chip.tool}` : (toolUse.name ?? '(不明なツール)');

  return (
    <details className="tool">
      <summary>
        <KindChip kind={chip.kind} />
        <span className="toolname">{name}</span>
        <span className="toolarg">{inputSummary(toolUse.input)}</span>
        {result?.isError === true && <span className="err">失敗</span>}
      </summary>
      <div className="body">
        <pre>{JSON.stringify(toolUse.input, null, 1)}</pre>
        {result?.text !== undefined && result.text.length > 0 && (
          <pre className="result">{result.text}</pre>
        )}
      </div>
    </details>
  );
}
