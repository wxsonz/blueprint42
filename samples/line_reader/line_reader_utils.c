#include "line_reader.h"

static void	lr_copy(char *dst, const char *src, size_t n)
{
	size_t	i;

	i = 0;
	while (i < n)
	{
		dst[i] = src[i];
		i++;
	}
}

int	lr_grow(t_reader *buf, size_t need)
{
	size_t	cap;
	size_t	i;
	char	*data;

	if (need <= buf->cap)
		return (1);
	cap = buf->cap;
	if (cap == 0)
		cap = LR_INIT_CAP;
	while (cap < need)
		cap *= 2;
	data = malloc(cap);
	if (!data)
		return (0);
	i = 0;
	while (i < cap)
		data[i++] = '\0';
	lr_copy(data, buf->data, buf->len);
	free(buf->data);
	buf->data = data;
	buf->cap = cap;
	return (1);
}

char	*lr_take_line(t_reader *buf, size_t line_end)
{
	char	*line;
	size_t	n;

	n = line_end - buf->pos;
	line = malloc(n + 1);
	if (!line)
		return (NULL);
	lr_copy(line, buf->data + buf->pos, n);
	line[n] = '\0';
	return (line);
}

void	lr_consume(t_reader *buf, size_t line_end)
{
	size_t	i;

	buf->pos = line_end;
	if (buf->pos == buf->len)
	{
		i = 0;
		while (i < buf->len)
			buf->data[i++] = '\0';
		buf->pos = 0;
		buf->len = 0;
	}
}

void	lr_reset(t_reader *buf)
{
	free(buf->data);
	buf->data = NULL;
	buf->len = 0;
	buf->cap = 0;
	buf->pos = 0;
}
