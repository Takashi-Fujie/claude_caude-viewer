/**
 * ストリーム走査（byte offset 付き）のテスト。仕様は docs/spec/SPEC-CORE.md。
 *
 * offset は「何バイト目にその行があるか」なので、フィクスチャはバイト安定な
 * 静的ファイルを使う（テスト実行時に生成すると生成側のバグが検証を無効化する）。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { collectLines, readLineAt, readRecordAt, scanFile } from '../../../server/core/scan.js';
import { truncatePreview, PREVIEW_LIMIT } from '../../../server/core/normalize.js';
import { SAMPLE_FIXTURE, pick, withTempDir, writeJsonl } from '../../helpers/fixtures.js';

describe('iterateLines', () => {
  it('SPEC-CORE-001: 各行に byte offset と byte 長を付けて走査する', async () => {
    const lines = await collectLines(SAMPLE_FIXTURE);
    const raw = await readFile(SAMPLE_FIXTURE);

    expect(lines.length).toBe(19);

    let expectedOffset = 0;
    for (const line of lines) {
      expect(line.offset).toBe(expectedOffset);
      expect(line.length).toBe(Buffer.byteLength(line.text));
      // 改行そのものは length に含めず、次行はその 1 バイト後から始まる
      expect(raw[line.offset + line.length]).toBe(0x0a);
      expectedOffset = line.offset + line.length + 1;
    }
    expect(expectedOffset).toBe(raw.length);
  });

  it('SPEC-CORE-001: startOffset を指定すると途中の行から走査を再開する', async () => {
    const all = await collectLines(SAMPLE_FIXTURE);
    const third = all[2];
    expect(third).toBeDefined();

    const resumed = await collectLines(SAMPLE_FIXTURE, third?.offset ?? 0);

    expect(resumed.length).toBe(all.length - 2);
    expect(resumed[0]).toEqual(third);
  });

  it('SPEC-CORE-003: チャンク境界をまたぐ 50KB 超の巨大行も 1 レコードとして扱う', async () => {
    // チャンクサイズを極端に小さくし、巨大行が必ず複数チャンクにまたがる状況を作る
    const lines = await collectLines(SAMPLE_FIXTURE, 0, { chunkSize: 64 });
    const huge = lines.reduce((a, b) => (b.length > a.length ? b : a));

    expect(huge.length).toBeGreaterThan(50 * 1024);
    expect(() => JSON.parse(huge.text)).not.toThrow();

    // 既定チャンクサイズでの走査結果と完全に一致すること
    expect(lines).toEqual(await collectLines(SAMPLE_FIXTURE));
  });

  it('SPEC-CORE-005: 改行で終わっていない末尾行は走査結果に含めない', async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, 'partial.jsonl');
      await writeJsonl(path, [{ type: 'mode', mode: 'default' }]);
      const complete = await collectLines(path);

      // 書き込み途中の行を模して、改行なしで追記する
      const current = await readFile(path, 'utf8');
      await writeFile(path, current + '{"type":"assistant","message":{"mod', 'utf8');

      expect(await collectLines(path)).toEqual(complete);
    });
  });
});

describe('readRecordAt', () => {
  it('SPEC-CORE-002: 記録した offset / length で該当行だけを seek して読み出せる', async () => {
    const lines = await collectLines(SAMPLE_FIXTURE);
    const target = lines[3];
    expect(target).toBeDefined();

    const text = await readLineAt(SAMPLE_FIXTURE, target?.offset ?? 0, target?.length ?? 0);
    expect(text).toBe(target?.text);

    const record = (await readRecordAt(SAMPLE_FIXTURE, target?.offset ?? 0, target?.length ?? 0)) as {
      type: string;
      uuid: string;
    };
    expect(record.type).toBe('assistant');
    expect(record.uuid).toBe('a-0001');
  });

  it('SPEC-CORE-003: 巨大行も offset 指定で全体を欠損なく読み出せる', async () => {
    const lines = await collectLines(SAMPLE_FIXTURE);
    const huge = lines.reduce((a, b) => (b.length > a.length ? b : a));

    const text = await readLineAt(SAMPLE_FIXTURE, huge.offset, huge.length);

    expect(Buffer.byteLength(text)).toBe(huge.length);
    expect(text).toBe(huge.text);
  });
});

describe('scanFile', () => {
  it('SPEC-CORE-004: 壊れた JSON 行はスキップして走査を継続し skippedLineCount に数える', async () => {
    const result = await scanFile(SAMPLE_FIXTURE);

    expect(result.skippedLineCount).toBe(1);
    // 壊れた行の後ろにあるレコードもきちんと取れている（1 行の破損で全体を落とさない）
    expect(pick(result.records, (r) => r.uuid === 'a-0003', 'a-0003').model).toBe('claude-imaginary-9');
  });

  it('SPEC-CORE-005: lastOffset は最後の完全な行の直後を指す', async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, 'partial.jsonl');
      await writeJsonl(path, [{ type: 'mode', mode: 'default' }, { type: 'permission-mode', permissionMode: 'plan' }]);
      const complete = await scanFile(path);
      const size = Buffer.byteLength(await readFile(path, 'utf8'));
      expect(complete.lastOffset).toBe(size);

      const current = await readFile(path, 'utf8');
      await writeFile(path, current + '{"type":"assistant","message":{"mod', 'utf8');

      const withPartial = await scanFile(path);
      expect(withPartial.lastOffset).toBe(size);
      expect(withPartial.records).toEqual(complete.records);
    });
  });
});

describe('truncatePreview', () => {
  it('SPEC-CORE-006: 本文プレビューは 200 字までに切り詰める', async () => {
    expect(PREVIEW_LIMIT).toBe(200);
    expect(truncatePreview('あ'.repeat(199))).toBe('あ'.repeat(199));
    expect(truncatePreview('あ'.repeat(400))).toHaveLength(PREVIEW_LIMIT);

    // インデックス化された巨大行のプレビューも 200 字を超えない
    const result = await scanFile(SAMPLE_FIXTURE);
    for (const record of result.records) {
      expect((record.preview ?? '').length).toBeLessThanOrEqual(PREVIEW_LIMIT);
    }
    expect(pick(result.records, (r) => r.uuid === 'u-0002', 'u-0002').preview).toHaveLength(PREVIEW_LIMIT);
  });
});
