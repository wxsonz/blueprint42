import { beforeAll, describe, expect, it } from 'vitest';
import { bufferShapes, validateBindingExpr } from '../src/parse';
import { model, setupParser } from './helpers';

beforeAll(setupParser);

describe('M2 authoring expressions and suggestions', () => {
  it('finds the line reader’s typed byte buffer and size markers', () => {
    const shapes = bufferShapes(model('reader'));
    expect(shapes).toContainEqual({ type: 't_reader', data: 'data', markers: ['len', 'cap', 'pos'] });
  });

  it('accepts observation and rejects calls or writes', () => {
    expect(validateBindingExpr('buf->pos')).toBeNull();
    expect(validateBindingExpr('bufs[fd].data')).toBeNull();
    expect(validateBindingExpr('read(fd, buf, 4)')).not.toBeNull();
    expect(validateBindingExpr('buf->pos++')).not.toBeNull();
    expect(validateBindingExpr('buf->pos = 0')).not.toBeNull();
    expect(validateBindingExpr('buf->pos; free(buf)')).not.toBeNull();
  });
});
