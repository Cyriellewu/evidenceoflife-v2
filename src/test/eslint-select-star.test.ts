import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const eslint = new ESLint({ overrideConfigFile: 'eslint.config.js' });

async function restrictedSyntaxErrors(code: string) {
  const [result] = await eslint.lintText(code, { filePath: 'src/__lint_fixture__.ts' });
  return result.messages.filter(m => m.ruleId === 'no-restricted-syntax');
}

describe("lint rule: no .select('*')", () => {
  it("flags .select('*') and .select(\"*\")", async () => {
    expect(await restrictedSyntaxErrors("declare const q: any;\nq.from('t').select('*');\n")).toHaveLength(1);
    expect(await restrictedSyntaxErrors('declare const q: any;\nq.from("t").select("*");\n')).toHaveLength(1);
  });

  it('flags a template-literal wildcard', async () => {
    expect(await restrictedSyntaxErrors("declare const q: any;\nq.from('t').select(`*`);\n")).toHaveLength(1);
  });

  it('reports on the .select line so a disable comment there works in a chain', async () => {
    const code = [
      'declare const q: any;',
      "q",
      "  .from('t')",
      '  // eslint-disable-next-line no-restricted-syntax -- fixture',
      "  .select('*');",
      '',
    ].join('\n');
    expect(await restrictedSyntaxErrors(code)).toHaveLength(0);
  });

  it('allows explicit column lists', async () => {
    expect(await restrictedSyntaxErrors("declare const q: any;\nq.from('t').select('id, title');\n")).toHaveLength(0);
  });
});
