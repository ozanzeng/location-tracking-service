import { diffPresence } from './presence-diff.js';

describe('diffPresence', () => {
  it('yeni alanları giriş olarak döner', () => {
    expect(diffPresence([], ['a', 'b'])).toEqual({
      entered: ['a', 'b'],
      exited: [],
    });
  });

  it('artık içinde olunmayan alanları çıkış olarak döner', () => {
    expect(diffPresence(['a', 'b'], [])).toEqual({
      entered: [],
      exited: ['a', 'b'],
    });
  });

  it('içeride kalınan alan olay üretmez', () => {
    expect(diffPresence(['a'], ['a'])).toEqual({ entered: [], exited: [] });
  });

  it('bir alandan diğerine geçişte hem çıkış hem giriş üretir', () => {
    expect(diffPresence(['a', 'shared'], ['shared', 'b'])).toEqual({
      entered: ['b'],
      exited: ['a'],
    });
  });

  it('tekrarlanan id’leri tekilleştirir', () => {
    expect(diffPresence(['a', 'a'], ['b', 'b'])).toEqual({
      entered: ['b'],
      exited: ['a'],
    });
  });
});
