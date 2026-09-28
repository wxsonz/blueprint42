/*
** line_reader: read a file descriptor one line at a time.
**
** Each fd keeps one growable buffer (a t_reader) in a static table inside
** read_line(). A call makes sure the buffer holds a whole line, reading
** BUFFER_SIZE bytes at a time and doubling the buffer when it runs out of
** room, then hands back a copy of that line and moves the read position
** past it. When every byte has been handed out the buffer is emptied, not
** freed, so the next call reuses it; at end of file it is freed.
**
** The bytes after the text are always zero, at least LR_TAIL of them: a
** new buffer is zeroed, read() only writes past the text, and emptying the
** buffer zeroes what was there. So buf->data is always a C string.
*/

#ifndef LINE_READER_H
# define LINE_READER_H

# include <stddef.h>
# include <stdint.h>
# include <stdlib.h>
# include <unistd.h>

# ifndef BUFFER_SIZE
#  define BUFFER_SIZE 42
# endif

# ifndef LR_INIT_CAP
#  define LR_INIT_CAP 64
# endif

# define LR_MAX_FD 1024
# define LR_TAIL 8
# define LR_NONE SIZE_MAX

typedef struct s_reader
{
	char	*data;
	size_t	len;
	size_t	cap;
	size_t	pos;
}	t_reader;

typedef enum e_lr_status
{
	LR_READY,
	LR_EMPTY,
	LR_FAILED
}	t_lr_status;

char	*read_line(int fd);
size_t	lr_find_nl(t_reader *buf, size_t from);
int		lr_grow(t_reader *buf, size_t need);
char	*lr_take_line(t_reader *buf, size_t line_end);
void	lr_consume(t_reader *buf, size_t line_end);
void	lr_reset(t_reader *buf);

#endif
