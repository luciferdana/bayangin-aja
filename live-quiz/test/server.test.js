import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatEvent, giftEvent, likeEvent } from '../server.js';

// Contoh bentuk data protokol v3 yang dipakai tiktok-live-connector 2.x.
const user = {
  id: '123', displayId: 'budi_99', nickname: 'Budi',
  avatarThumb: { urlList: ['https://p16.tiktokcdn.com/x~100x100.webp', 'https://p16.tiktokcdn.com/x.jpeg'] },
};

test('komentar v3: teks dari content, user dari displayId', () => {
  const m = chatEvent({ user, content: 'Bali' });
  assert.deepEqual(m, { type: 'comment', user: 'budi_99', name: 'Budi', avatar: 'https://p16.tiktokcdn.com/x~100x100.webp', text: 'Bali' });
});

test('komentar format lama tetap terbaca', () => {
  assert.equal(chatEvent({ user: { uniqueId: 'a' }, comment: 'Gitar' }).text, 'Gitar');
});

test('gift v3: nama, koin, gambar dari gift', () => {
  const m = giftEvent({ user, repeatCount: 3, repeatEnd: 1,
    gift: { name: 'Rose', diamondCount: 1, type: 1, image: { urlList: ['https://p16.tiktokcdn.com/rose.png'] } } });
  assert.equal(m.gift, 'Rose');
  assert.equal(m.count, 3);
  assert.equal(m.coins, 3);
  assert.equal(m.giftImage, 'https://p16.tiktokcdn.com/rose.png');
  assert.equal(m.user, 'budi_99');
});

test('gift beruntun belum selesai diabaikan, gift biasa langsung dihitung', () => {
  assert.equal(giftEvent({ user, repeatCount: 2, repeatEnd: 0, gift: { name: 'Rose', diamondCount: 1, type: 1 } }), null);
  const big = giftEvent({ user, repeatCount: 1, repeatEnd: 0, gift: { name: 'Galaxy', diamondCount: 1000, type: 2 } });
  assert.equal(big.coins, 1000);
});

test('gift format lama (giftDetails) tetap terbaca', () => {
  const m = giftEvent({ user: { uniqueId: 'a' }, repeatCount: 1, repeatEnd: true, giftDetails: { giftName: 'Donut', diamondCount: 30, giftType: 1 } });
  assert.equal(m.gift, 'Donut');
  assert.equal(m.coins, 30);
});

test('like v3: jumlah dari count', () => {
  assert.equal(likeEvent({ user, count: 15, total: '300' }).count, 15);
  assert.equal(likeEvent({ user: { uniqueId: 'a' }, likeCount: 7 }).count, 7);
});
