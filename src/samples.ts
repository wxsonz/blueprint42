// Built-in examples, bundled at build time (no runtime fs access). Each
// shows something the blueprint can do; the line reader is also the test
// fixture (samples/line_reader, read-only: its tests pin its behaviour).
import type { TestCase } from './cases';
import lrH from '../samples/line_reader/line_reader.h?raw';
import lrC from '../samples/line_reader/line_reader.c?raw';
import lrU from '../samples/line_reader/line_reader_utils.c?raw';

export interface Sample {
  key: string;
  title: string;
  group: 'basics' | 'memory' | 'io';
  blurb: string;
  file: string;
  src: string;
  stdin?: string; // fed to the program under gdb
  defines?: string[]; // -D flags for the trace server
  files?: Record<string, string>; // read-only support files (headers) next to the buffer
  cases?: TestCase[]; // test cases it comes with (src/cases.ts)
}

const pointer = `void	bump(int *n)
{
	*n = *n + 1;
}

int	step(int *n, int k)
{
	bump(n);
	return (*n + k);
}

int	main(void)
{
	int	a;
	int	r;

	a = 3;
	r = step(&a, 2);
	return (r);
}
`;

const swap = `void	swap(int *a, int *b)
{
	int	tmp;

	tmp = *a;
	*a = *b;
	*b = tmp;
}

int	main(void)
{
	int	x;
	int	y;

	x = 3;
	y = 5;
	swap(&x, &y);
	return (x - y);
}
`;

const counter = `int	next_id(void)
{
	static int	id = 0;

	id++;
	return (id);
}

int	main(void)
{
	int	a;
	int	b;

	a = next_id();
	b = next_id();
	return (a + b);
}
`;

const recursion = `int	fact(int n)
{
	if (n <= 1)
		return (1);
	return (n * fact(n - 1));
}

int	main(void)
{
	return (fact(4));
}
`;

const fib = `int	fib(int n)
{
	if (n < 2)
		return (n);
	return (fib(n - 1) + fib(n - 2));
}

int	main(void)
{
	return (fib(4));
}
`;

const gcd = `int	gcd(int a, int b)
{
	int	t;

	while (b != 0)
	{
		t = a % b;
		a = b;
		b = t;
	}
	return (a);
}

int	main(void)
{
	return (gcd(84, 36));
}
`;

const strings = `#include <stdlib.h>
#include <unistd.h>

size_t	ft_strlen(const char *s)
{
	size_t	i;

	i = 0;
	while (s[i])
		i++;
	return (i);
}

char	*ft_strdup(const char *s)
{
	char	*copy;
	size_t	len;
	size_t	i;

	len = ft_strlen(s);
	copy = malloc(len + 1);
	if (!copy)
		return (NULL);
	i = 0;
	while (i <= len)
	{
		copy[i] = s[i];
		i++;
	}
	return (copy);
}

int	main(void)
{
	char	*s;

	s = ft_strdup("blueprint");
	if (!s)
		return (1);
	write(1, s, ft_strlen(s));
	write(1, "\\n", 1);
	free(s);
	return (0);
}
`;

const sort = `#include <unistd.h>

void	swap_ints(int *a, int *b)
{
	int	tmp;

	tmp = *a;
	*a = *b;
	*b = tmp;
}

void	sort_ints(int *tab, int size)
{
	int	i;
	int	j;

	i = 0;
	while (i < size - 1)
	{
		j = 0;
		while (j < size - 1 - i)
		{
			if (tab[j] > tab[j + 1])
				swap_ints(&tab[j], &tab[j + 1]);
			j++;
		}
		i++;
	}
}

void	put_digit(int n)
{
	char	c;

	c = '0' + n;
	write(1, &c, 1);
}

int	main(void)
{
	int	tab[5];
	int	i;

	tab[0] = 4;
	tab[1] = 1;
	tab[2] = 3;
	tab[3] = 5;
	tab[4] = 2;
	sort_ints(tab, 5);
	i = 0;
	while (i < 5)
		put_digit(tab[i++]);
	write(1, "\\n", 1);
	return (tab[0]);
}
`;

const structs = `#include <unistd.h>

typedef struct s_point
{
	int	x;
	int	y;
}	t_point;

void	move_by(t_point *p, int dx, int dy)
{
	p->x += dx;
	p->y += dy;
}

t_point	mid_point(t_point a, t_point b)
{
	t_point	m;

	m.x = (a.x + b.x) / 2;
	m.y = (a.y + b.y) / 2;
	return (m);
}

int	main(void)
{
	t_point	a;
	t_point	b;
	t_point	m;

	a.x = 0;
	a.y = 0;
	b.x = 10;
	b.y = 4;
	move_by(&a, 2, 2);
	m = mid_point(a, b);
	write(1, "moved\\n", 6);
	return (m.x + m.y);
}
`;

const list = `#include <stdlib.h>

typedef struct s_node
{
	int				value;
	struct s_node	*next;
}	t_node;

t_node	*push(t_node *head, int value)
{
	t_node	*node;

	node = malloc(sizeof(t_node));
	if (!node)
		return (head);
	node->value = value;
	node->next = head;
	return (node);
}

int	sum(t_node *list)
{
	int	total;

	total = 0;
	while (list)
	{
		total += list->value;
		list = list->next;
	}
	return (total);
}

void	clear(t_node *list)
{
	t_node	*next;

	while (list)
	{
		next = list->next;
		free(list);
		list = next;
	}
}

int	main(void)
{
	t_node	*list;
	int		total;

	list = NULL;
	list = push(list, 3);
	list = push(list, 5);
	list = push(list, 7);
	total = sum(list);
	clear(list);
	return (total);
}
`;

const crash = `#include <unistd.h>

char	*find_char(char *s, char c)
{
	while (*s)
	{
		if (*s == c)
			return (s);
		s++;
	}
	return (NULL);
}

int	main(void)
{
	char	*at;

	write(1, "looking for z\\n", 14);
	at = find_char("blueprint", 'z');
	return (*at == 'z');
}
`;

const bytes = `#include <unistd.h>

int	copy_in(char *dst, const char *src)
{
	int	i;

	i = 0;
	while (src[i])
	{
		dst[i] = src[i];
		i++;
	}
	dst[i] = '\\0';
	return (i);
}

int	main(void)
{
	char		buf[16];
	const char	*msg;
	int			n;

	msg = "hi there";
	n = copy_in(buf, msg);
	buf[0] = 'H';
	write(1, buf, n);
	return (0);
}
`;

const lost = `#include <stdlib.h>

void	leaky(int n)
{
	int	*p;

	p = malloc(sizeof(int));
	if (!p)
		return ;
	*p = n;
}

int	*kept(int n)
{
	int	*q;

	q = malloc(sizeof(int));
	if (!q)
		return (NULL);
	*q = n;
	return (q);
}

int	main(void)
{
	int	*k;

	leaky(1);
	k = kept(2);
	free(k);
	return (0);
}
`;

const leak = `#include <stdlib.h>

int	*make_counter(int start)
{
	int	*c;

	c = malloc(sizeof(int));
	if (!c)
		return (NULL);
	*c = start;
	return (c);
}

int	main(void)
{
	int	*a;
	int	*b;

	a = make_counter(1);
	b = make_counter(2);
	if (!a || !b)
		return (1);
	*a += *b;
	free(b);
	return (*a);
}
`;

// The line reader's three files shown as one buffer. The files themselves
// are untouched; only the banners between them are added here.
const banner = (name: string) => `/* ======== ${name} ======== */\n`;
// A small sandbox main (not part of the fixture) so the real code can run
// under the trace server: read stdin line by line, print, free.
const readerMain = `#include <stdio.h>

int	main(void)
{
	char	*line;
	int		n;

	n = 0;
	line = read_line(0);
	while (line)
	{
		n++;
		printf("%s", line);
		free(line);
		line = read_line(0);
	}
	return (n);
}
`;
const reader = banner('line_reader.h') + lrH + '\n' + banner('line_reader.c')
  + lrC + '\n' + banner('line_reader_utils.c') + lrU + '\n' + banner('main.c (sandbox)') + readerMain;
const READER_STDIN = 'hello\nworld of lines\n!\n';
// BUFFER_SIZE=4 and a small first buffer make the reads and the doubling visible on short lines
const READER_DEFINES = ['BUFFER_SIZE=4', 'LR_INIT_CAP=8'];

export const SAMPLES: Sample[] = [
  { key: 'pointer', group: 'basics', title: 'pointer in, value out', file: 'pointer.c',
    blurb: 'a pointer goes in, bump() writes through it, step() returns *n + 2', src: pointer },
  { key: 'swap', group: 'basics', title: 'swap', file: 'swap.c',
    blurb: 'two pointers, one temporary: watch the writes land in main', src: swap },
  { key: 'counter', group: 'basics', title: 'static counter', file: 'counter.c',
    blurb: 'a static local survives between calls (a chest)', src: counter },
  { key: 'recursion', group: 'basics', title: 'factorial', file: 'fact.c',
    blurb: 'one machine, a stack of frames: each level gets its own copy', src: recursion },
  { key: 'fib', group: 'basics', title: 'fibonacci', file: 'fib.c',
    blurb: 'a tree of calls: two recursive calls per level, results flowing back', src: fib },
  { key: 'gcd', group: 'basics', title: 'gcd (loops)', file: 'gcd.c',
    blurb: 'a while loop and its condition, round by round, values changing in place', src: gcd },
  { key: 'strings', group: 'memory', title: 'strings & malloc', file: 'strdup.c',
    blurb: 'ft_strdup: a heap block filled byte by byte, written out, freed', src: strings },
  { key: 'sort', group: 'memory', title: 'arrays: bubble sort', file: 'sort.c',
    blurb: 'an int array sorted in place: nested loops, swaps through pointers into it', src: sort },
  { key: 'structs', group: 'memory', title: 'structs', file: 'point.c',
    blurb: 'a struct changed through a pointer, two passed by value, one returned', src: structs },
  { key: 'list', group: 'memory', title: 'linked list', file: 'list.c',
    blurb: 'nodes malloc’d and linked, walked, then freed one by one', src: list },
  { key: 'bytes', group: 'memory', title: 'stack & literal bytes', file: 'bytes.c',
    blurb: 'a string literal copied into a char array on main\'s stack: each byte where it lives', src: bytes },
  { key: 'lost', group: 'memory', title: 'a lost block', file: 'lost.c',
    blurb: 'leaky() returns without freeing its block or handing it on: nothing can free it from then on; kept() hands its block back', src: lost },
  { key: 'crash', group: 'memory', title: 'a crash', file: 'crash.c',
    blurb: 'a search comes back NULL and main dereferences it: see where it dies', src: crash },
  { key: 'leak', group: 'memory', title: 'a leak', file: 'leak.c',
    blurb: 'two blocks allocated, one freed: the other is reported as a leak', src: leak },
  { key: 'reader', group: 'io', title: 'line reader (stdin)', file: 'line_reader.c',
    blurb: 'a get_next_line-style reader run for real on a 3-line input: a static table, a growing buffer, read() in small chunks',
    src: reader, stdin: READER_STDIN, defines: READER_DEFINES, files: { 'line_reader.h': lrH },
    // it prints back what it reads: two cases that pass, one that fails on purpose
    cases: [
      { name: 'three lines', stdin: READER_STDIN, args: [], defines: READER_DEFINES, expect: READER_STDIN },
      { name: 'no newline at the end', stdin: 'last line', args: [], defines: READER_DEFINES, expect: 'last line' },
      { name: 'fails on purpose', stdin: 'a\nb\n', args: [], defines: READER_DEFINES, expect: 'a\nB\n' },
    ] },
];

// A sample *project*: files as they'd sit in a folder, plus what the tool
// keeps next to a project (a driver main, the run settings). Opens
// read-only (there is no folder to save to); `npm run dev -- <folder>`
// opens a real one.
export interface SampleProject {
  key: string;
  title: string;
  blurb: string;
  name: string;
  files: Record<string, string>;
}

const readerDriver = `#include <stdio.h>
#include <stdlib.h>
#include "line_reader.h"

int	main(void)
{
	char	*line;
	int		n;

	n = 0;
	line = read_line(0);
	while (line)
	{
		n++;
		printf("%s", line);
		free(line);
		line = read_line(0);
	}
	return (n);
}
`;

const MK_LIB = `NAME = libft.a
SRCS = ft_strlen.c ft_putstr_fd.c
OBJS = $(SRCS:.c=.o)
CFLAGS = -Wall -Wextra -Werror

all: $(NAME)

$(NAME): $(OBJS)
	ar rcs $(NAME) $(OBJS)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@
`;
const MK_APP = `NAME = hello
SRCS = main.c
OBJS = $(SRCS:.c=.o)
CFLAGS = -Wall -Wextra -Werror -Ilibft

all: $(NAME)

$(NAME): $(OBJS)
	$(MAKE) -C libft
	$(CC) $(CFLAGS) $(OBJS) -Llibft -lft -o $(NAME)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@
`;

export const SAMPLE_PROJECTS: SampleProject[] = [
  {
    key: 'reader-project', title: 'line reader project', name: 'line_reader',
    blurb: 'the line reader opened as a project: one module per file, calls crossing between them, a driver main in .blueprint42/',
    files: {
      'line_reader.c': lrC,
      'line_reader.h': lrH,
      'line_reader_utils.c': lrU,
      '.blueprint42/main.c': readerDriver,
      '.blueprint42/run.json': JSON.stringify({ stdin: READER_STDIN, args: [], defines: READER_DEFINES }, null, 2) + '\n',
    },
  },
  {
    key: 'libft-project', title: 'libft + Makefile', name: 'hello',
    blurb: 'built with its own Makefile, which builds libft first: a library module and the program that uses it',
    files: {
      Makefile: MK_APP,
      'main.c': '#include "libft.h"\n\nint\tmain(void)\n{\n\tft_putstr_fd("hello, blueprint42\\n", 1);\n\treturn ((int)ft_strlen("blueprint42"));\n}\n',
      'libft/Makefile': MK_LIB,
      'libft/libft.h': '#ifndef LIBFT_H\n# define LIBFT_H\n\n# include <stddef.h>\n\nsize_t\tft_strlen(const char *s);\nvoid\tft_putstr_fd(char *s, int fd);\n\n#endif\n',
      'libft/ft_strlen.c': '#include "libft.h"\n\nsize_t\tft_strlen(const char *s)\n{\n\tsize_t\ti;\n\n\ti = 0;\n\twhile (s[i])\n\t\ti++;\n\treturn (i);\n}\n',
      'libft/ft_putstr_fd.c': '#include <unistd.h>\n#include "libft.h"\n\nvoid\tft_putstr_fd(char *s, int fd)\n{\n\twrite(fd, s, ft_strlen(s));\n}\n',
      '.blueprint42/run.json': JSON.stringify({ stdin: '', args: [], defines: [] }, null, 2) + '\n',
    },
  },
];
