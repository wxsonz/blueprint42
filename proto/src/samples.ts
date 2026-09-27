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
const gnl = banner('get_next_line.h') + gnlH + '\n' + banner('get_next_line.c')
  + gnlC + '\n' + banner('get_next_line_utils.c') + gnlU;

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
    blurb: 'structure only: execution needs read()/malloc() (M3)', src: gnl },
];
