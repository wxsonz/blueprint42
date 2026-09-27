// Built-in sandbox samples, bundled at build time (no runtime fs access).
import gnlH from '../../samples/gnl_v3/get_next_line.h?raw';
import gnlC from '../../samples/gnl_v3/get_next_line.c?raw';
import gnlU from '../../samples/gnl_v3/get_next_line_utils.c?raw';

export interface Sample {
  key: string;
  title: string;
  blurb: string;
  file: string;
  src: string;
  stdin?: string; // fed to the program under gdb
  defines?: string[]; // -D flags for the trace server
  files?: Record<string, string>; // read-only support files (headers) next to the buffer
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

// The three GNL files shown as one buffer. The fixture itself is untouched;
// only the banners between files are added here.
const banner = (name: string) => `/* ======== ${name} ======== */\n`;
// A small sandbox main (not part of the fixture) so the real code can run
// under the trace server: read stdin line by line, print, free.
const gnlMain = `#include <stdio.h>

int	main(void)
{
	char	*line;
	int		n;

	n = 0;
	line = get_next_line(0);
	while (line)
	{
		n++;
		printf("%s", line);
		free(line);
		line = get_next_line(0);
	}
	return (n);
}
`;
const gnl = banner('get_next_line.h') + gnlH + '\n' + banner('get_next_line.c')
  + gnlC + '\n' + banner('get_next_line_utils.c') + gnlU + '\n' + banner('main.c (sandbox)') + gnlMain;

export const SAMPLES: Sample[] = [
  { key: 'pointer', title: 'pointer in, value out', file: 'pointer.c',
    blurb: 'a pointer goes in, bump() writes through it, step() returns *n + 2', src: pointer },
  { key: 'swap', title: 'swap', file: 'swap.c',
    blurb: 'two pointers, one temporary', src: swap },
  { key: 'counter', title: 'static counter', file: 'counter.c',
    blurb: 'a static local survives between calls (a chest)', src: counter },
  { key: 'recursion', title: 'recursion', file: 'fact.c',
    blurb: 'one machine, a stack of frames', src: recursion },
  { key: 'gnl', title: 'gnl_v3', file: 'get_next_line.c',
    blurb: 'your get_next_line, run for real under gdb on a 3-line input', src: gnl,
    stdin: 'hello\nworld of lines\n!\n',
    // GNL_INIT_CAP=8 (the fixture's own #ifndef knob) makes the doubling visible on short lines
    defines: ['BUFFER_SIZE=4', 'GNL_INIT_CAP=8'],
    files: { 'get_next_line.h': gnlH } },
];
