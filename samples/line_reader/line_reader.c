#include "line_reader.h"

static size_t	lr_scan(const char *s, size_t from, size_t len)
{
	while (from < len)
	{
		if (s[from] == '\n')
			return (from);
		from++;
	}
	return (LR_NONE);
}

size_t	lr_find_nl(t_reader *buf, size_t from)
{
	if (!buf->data || from >= buf->len)
		return (LR_NONE);
	return (lr_scan(buf->data, from, buf->len));
}

static ssize_t	lr_append(int fd, t_reader *buf, size_t *nl)
{
	ssize_t	n_read;
	size_t	from;

	if (!lr_grow(buf, buf->len + BUFFER_SIZE + LR_TAIL))
		return (-1);
	n_read = read(fd, buf->data + buf->len, BUFFER_SIZE);
	if (n_read <= 0)
		return (n_read);
	from = buf->len;
	buf->len += n_read;
	*nl = lr_find_nl(buf, from);
	return (n_read);
}

static t_lr_status	lr_fill(int fd, t_reader *buf,
		size_t *line_end)
{
	size_t	nl;
	ssize_t	n_read;

	nl = lr_find_nl(buf, buf->pos);
	n_read = 1;
	while (nl == LR_NONE && n_read > 0)
		n_read = lr_append(fd, buf, &nl);
	if (n_read < 0)
		return (LR_FAILED);
	if (nl == LR_NONE)
		*line_end = buf->len;
	else
		*line_end = nl + 1;
	if (*line_end == buf->pos)
		return (LR_EMPTY);
	return (LR_READY);
}

char	*read_line(int fd)
{
	static t_reader	bufs[LR_MAX_FD];
	t_reader		*buf;
	size_t			line_end;
	char			*line;

	if (fd < 0 || fd >= LR_MAX_FD || BUFFER_SIZE <= 0)
		return (NULL);
	buf = &bufs[fd];
	if (lr_fill(fd, buf, &line_end) != LR_READY)
	{
		lr_reset(buf);
		return (NULL);
	}
	line = lr_take_line(buf, line_end);
	if (!line)
	{
		lr_reset(buf);
		return (NULL);
	}
	lr_consume(buf, line_end);
	return (line);
}
