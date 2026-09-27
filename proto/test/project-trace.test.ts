// M5 integration: build whole projects (plain cc or their own Makefile) and
// trace them under gdb, with every stop mapped back to its file.
import { beforeAll, describe, expect, it } from 'vitest';
import { handleTrace } from '../server/trace.mjs';
import { convertGdb } from '../src/gdb';
import { parseProject } from '../src/parse';
import { SAMPLE_PROJECTS } from '../src/samples';
import { setupParser } from './helpers';

beforeAll(setupParser);

const sources = (files: Record<string, string>) => Object.entries(files).filter(([p]) => /\.[ch]$/.test(p)).map(([path, text]) => ({ path, text }));
const cnames = (files: Record<string, string>) => [...new Set(parseProject(sources(files)).fns.map((f) => f.cname))];

async function traceProject(files: Record<string, string>, extra: Record<string, unknown> = {}) {
  const m = parseProject(sources(files));
  const r = await handleTrace({ project: { files }, fns: cnames(files), maxSteps: 20000, ...extra });
  return { m, r };
}

const LIBFT = {
  'libft/Makefile': 'NAME = libft.a\nSRCS = ft_strlen.c\nOBJS = $(SRCS:.c=.o)\nCFLAGS = -Wall -Wextra -Werror\n\nall: $(NAME)\n\n$(NAME): $(OBJS)\n\tar rcs $(NAME) $(OBJS)\n\n%.o: %.c\n\t$(CC) $(CFLAGS) -c $< -o $@\n',
  'libft/libft.h': '#ifndef LIBFT_H\n# define LIBFT_H\n# include <stddef.h>\n\nsize_t\tft_strlen(const char *s);\n#endif\n',
  'libft/ft_strlen.c': '#include "libft.h"\n\nsize_t\tft_strlen(const char *s)\n{\n\tsize_t\ti;\n\n\ti = 0;\n\twhile (s[i])\n\t\ti++;\n\treturn (i);\n}\n',
};

describe('project trace (M5)', () => {
  it('runs gnl_v3 as a project with its driver main: stops in both files, same answer', async () => {
    const all = SAMPLE_PROJECTS[0].files;
    const files = Object.fromEntries(Object.entries(all).filter(([p]) => !p.endsWith('.json')));
    const run = JSON.parse(all['.ft_blueprint/run.json']);
    const { m, r } = await traceProject(files, { stdin: run.stdin, defines: run.defines });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    expect(r.exit).toBe(3);
    expect(r.stdout).toBe(run.stdin);
    const t = convertGdb(r, m, files);
    const stepFiles = new Set(t.evs.filter((e) => e.k === 'step').map((e) => e.file));
    expect(stepFiles).toEqual(new Set(['.ft_blueprint/main.c', 'get_next_line.c', 'get_next_line_utils.c']));
    // every call lands on a function the model knows, and in the right file
    const calls = t.evs.filter((e) => e.k === 'call');
    for (const c of calls) expect(m.byName.has(c.fn), c.fn).toBe(true);
    const copy = calls.find((c) => c.fn === 'gnl_copy')!;
    expect(copy.file).toBe('get_next_line_utils.c');
    const def = m.byName.get('gnl_copy')!;
    expect(copy.line).toBeGreaterThan(def.startLine); // gdb's first stop is the first statement inside
    expect(copy.line).toBeLessThanOrEqual(def.endLine);
  });

  it("builds with the project's Makefile (sub-make for libft) and tells colliding statics apart", async () => {
    const files = {
      ...LIBFT,
      Makefile: 'NAME = prog\nSRCS = main.c a.c b.c\nOBJS = $(SRCS:.c=.o)\nCFLAGS = -Wall -Wextra -Werror -Ilibft\n\nall: $(NAME)\n\n$(NAME): $(OBJS)\n\t$(MAKE) -C libft\n\t$(CC) $(CFLAGS) $(OBJS) -Llibft -lft -o $(NAME)\n\n%.o: %.c\n\t$(CC) $(CFLAGS) -c $< -o $@\n',
      'prog.h': 'int\tfa(void);\nint\tfb(void);\n',
      'a.c': 'static int\thelper(void)\n{\n\treturn (1);\n}\n\nint\tfa(void)\n{\n\treturn (helper());\n}\n',
      'b.c': 'static int\thelper(void)\n{\n\treturn (20);\n}\n\nint\tfb(void)\n{\n\treturn (helper());\n}\n',
      'main.c': '#include "prog.h"\n#include "libft.h"\n\nint\tmain(void)\n{\n\treturn (fa() + fb() + (int)ft_strlen("abc"));\n}\n',
    };
    const { m, r } = await traceProject(files);
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    expect(r.flags?.[0]).toBe('make');
    expect(r.exit).toBe(24);
    const t = convertGdb(r, m, files);
    const called = t.evs.filter((e) => e.k === 'call').map((e) => (e.k === 'call' ? `${e.fn}:${e.file}` : ''));
    expect(called).toContain('helper@a.c:a.c');
    expect(called).toContain('helper@b.c:b.c');
    expect(called).toContain('ft_strlen:libft/ft_strlen.c');
  });

  it('links a library NAME against the driver in .ft_blueprint/main.c', async () => {
    const lib = {
      Makefile: 'NAME = libx.a\nSRCS = x.c\nOBJS = $(SRCS:.c=.o)\nCFLAGS = -Wall -Wextra -Werror\n\nall: $(NAME)\n\n$(NAME): $(OBJS)\n\tar rcs $(NAME) $(OBJS)\n\n%.o: %.c\n\t$(CC) $(CFLAGS) -c $< -o $@\n',
      'x.h': 'int\tx_twice(int n);\n',
      'x.c': '#include "x.h"\n\nint\tx_twice(int n)\n{\n\treturn (n * 2);\n}\n',
    };
    const without = await traceProject(lib);
    expect(without.r.ok).toBe(false);
    expect(without.r.error).toMatch(/libx\.a is a library.*\.ft_blueprint\/main\.c/);
    const { r } = await traceProject({ ...lib, '.ft_blueprint/main.c': '#include "x.h"\n\nint\tmain(void)\n{\n\treturn (x_twice(21));\n}\n' });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    expect(r.exit).toBe(42);
  });

  it('maps compile errors back to the file that has them', async () => {
    const { r } = await traceProject({
      'main.c': 'int\tf(void);\n\nint\tmain(void)\n{\n\treturn (f());\n}\n',
      'src/f.c': 'int\tf(void)\n{\n\tint\tunused;\n\n\treturn (0);\n}\n',
    });
    expect(r.ok).toBe(false);
    const d = r.compile!.diagnostics.find((x) => x.severity === 'error')!;
    expect(d.file).toBe('src/f.c');
    expect(d.line).toBe(2);
  });

  it('says so when a Makefile drops the debug info', async () => {
    const { r } = await traceProject({
      Makefile: 'NAME = prog\n\nall:\n\tcc -Wall -Wextra -Werror main.c -o $(NAME)\n',
      'main.c': 'int\tmain(void)\n{\n\treturn (0);\n}\n',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/debug info/);
  });
});
