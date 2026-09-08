const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
let browser, server, base;
const workers = [
  { id: 'h', name: '髙嶋 宏', icon: '宏', color: '#DC2626', starred: true },
  { id: 'r', name: '髙嶋 隆一', icon: '隆', color: '#7C3AED', starred: true },
  { id: 'n', name: '髙嶋 昇', icon: '昇', color: '#059669', starred: true },
];
function fixture() {
  return [
    { id: 'a', name: 'ROOMS 立川', generalContractor: '', gcManager: '', address: '東京都立川市', workers,
      events: [{ id: 'a-event', title: '内装工事', start: '2026-09-01', end: '2026-09-18', color: '#5085dc' }],
      dayLogs: {
        '2026-09-06': { planWorkers: { h: 'planned', r: 'half' }, planMemo: '日曜施工' },
        '2026-09-07': { planWorkers: { h: 'planned', r: 'planned' }, workerStatus: { h: 'half' }, memo: '元の実績' },
        '2026-09-08': { planWorkers: { h: 'planned', r: 'half' }, planMemo: '2階の壁紙' },
        '2026-09-13': { planState: 'rest' },
      } },
    { id: 'b', name: '日本橋 オフィス', generalContractor: '', gcManager: '', workers,
      events: [{ id: 'b-event', title: '壁紙張替え', start: '2026-09-08', end: '2026-09-11', color: '#5085dc' }],
      dayLogs: { '2026-09-08': { planWorkers: { n: 'planned' } } } },
  ];
}
before(async () => {
  server = http.createServer(async (req, res) => {
    const name = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!name.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const data = await fs.readFile(name);
      res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
      res.end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CALENDAR_BROWSER_PATH ? { executablePath: process.env.CALENDAR_BROWSER_PATH } : { channel: 'chrome' }) });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function app(t, data = fixture(), width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-09-07T12:00:00+09:00') });
  await page.route('https://www.jma.go.jp/**', route => route.abort());
  await page.goto(base + '/genba-kanri.html');
  await page.evaluate(sites => localStorage.setItem('genba_sites', JSON.stringify(sites)), data);
  await page.reload();
  await page.evaluate(() => fsJumpTo('2026-09-08'));
  t.after(async () => { assert.deepEqual(errors, [], 'no browser runtime errors'); await context.close(); });
  return page;
}
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('genba_sites')));
const openDay = (page, date, site = 'a') => page.locator(`.fs-slot[data-day="${date}"][data-site="${site}"]`).click();

test('legacy data survives initial rendering, navigation and reload', async t => {
  const data = fixture(), page = await app(t, data);
  await page.getByRole('button', { name: '前の月', exact: true }).click();
  await page.getByRole('button', { name: '次の月', exact: true }).click();
  await page.reload();
  assert.deepEqual(await stored(page), data);
  assert.equal(await page.locator('#view-calendar').isVisible(), true);
});

test('daily assignment changes persist without modifying attendance or other sites', async t => {
  const data = fixture(), page = await app(t, data);
  await openDay(page, '2026-09-07');
  await page.getByRole('combobox', { name: '髙嶋 昇の配置' }).selectOption('half');
  await page.getByRole('button', { name: '日別詳細を閉じる' }).click();
  await page.reload();
  const sites = await stored(page);
  assert.equal(sites[0].dayLogs['2026-09-07'].planWorkers.n, 'half');
  assert.deepEqual(sites[0].dayLogs['2026-09-07'].workerStatus, data[0].dayLogs['2026-09-07'].workerStatus);
  assert.deepEqual(sites[1], data[1]);
  await page.evaluate(() => fsJumpTo('2026-09-08'));
  await openDay(page, '2026-09-08');
  await page.getByRole('combobox', { name: '髙嶋 宏の配置' }).selectOption('');
  await page.getByRole('combobox', { name: '髙嶋 隆一の配置' }).selectOption('');
  assert.equal((await stored(page))[0].dayLogs['2026-09-08'].planState, 'unassigned');
});

test('Sunday starts unconfirmed; only explicit confirmation creates full/half attendance', async t => {
  const page = await app(t);
  await page.locator('[data-fs-mode="actual"]').click();
  assert.match(await page.locator('.fs-slot[data-site="a"][data-day="2026-09-06"]').innerText(), /未確認/);
  await openDay(page, '2026-09-06');
  await page.getByRole('button', { name: '予定どおりの出面を確定' }).click();
  assert.deepEqual((await stored(page))[0].dayLogs['2026-09-06'].workerStatus, { h: 'present', r: 'half' });
  const before = (await stored(page))[0].dayLogs['2026-09-06'].planWorkers;
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '休工を確認', exact: true }).click();
  const log = (await stored(page))[0].dayLogs['2026-09-06'];
  assert.equal(log.actualState, 'rest'); assert.deepEqual(log.workerStatus, {}); assert.deepEqual(log.planWorkers, before);
});

test('future attendance is disabled', async t => {
  const page = await app(t);
  await openDay(page, '2026-09-08');
  await page.locator('.dp-tab[data-tab="actual"]').click();
  assert.equal(await page.getByRole('combobox', { name: '髙嶋 宏の出面' }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '予定どおりの出面を確定' }).isDisabled(), true);
  assert.equal((await stored(page))[0].dayLogs['2026-09-08'].workerStatus, undefined);
});

test('event editor validates dates, bulk fills unassigned weekdays and preserves exceptions', async t => {
  const page = await app(t);
  await page.getByRole('button', { name: '予定・工程を追加', exact: true }).click();
  await page.locator('#em-name').fill('養生');
  await page.locator('#em-start').fill('2026-09-10');
  await page.locator('#em-end').fill('2026-09-01');
  await page.locator('#event-modal').getByRole('button', { name: '保存', exact: true }).click();
  assert.match(await page.locator('#em-error').textContent(), /終了日/);
  await page.locator('#em-start').fill('2026-09-01'); await page.locator('#em-end').fill('2026-09-14');
  await page.locator('#event-modal summary').click(); await page.locator('#em-crew input[value="n"]').check();
  await page.locator('#event-modal').getByRole('button', { name: '保存', exact: true }).click();
  const s = (await stored(page))[0];
  assert.equal(s.events.length, 2); assert.equal(s.dayLogs['2026-09-01'].planWorkers.n, 'planned');
  assert.deepEqual(s.dayLogs['2026-09-07'].workerStatus, { h: 'half' });
  assert.deepEqual(s.dayLogs['2026-09-07'].planWorkers, { h: 'planned', r: 'planned' });
  assert.equal(s.dayLogs['2026-09-13'].planState, 'rest'); assert.equal(s.dayLogs['2026-09-13'].planWorkers, undefined);
});

test('event edit, duplicate and delete preserve original daily records', async t => {
  const page = await app(t), before = (await stored(page))[0].dayLogs;
  await openDay(page, '2026-09-08'); await page.locator('[data-edit-event="a-event"]').click();
  await page.locator('#em-end').fill('2026-09-20');
  await page.locator('#event-modal').getByRole('button', { name: '保存', exact: true }).click();
  assert.equal((await stored(page))[0].events[0].id, 'a-event');
  await openDay(page, '2026-09-08'); await page.locator('[data-edit-event="a-event"]').click();
  await page.locator('#em-duplicate').click(); await page.locator('#em-start').fill('2026-10-01'); await page.locator('#em-end').fill('2026-10-02');
  await page.locator('#event-modal').getByRole('button', { name: '保存', exact: true }).click();
  const copied = (await stored(page))[0].events[1]; assert.notEqual(copied.id, 'a-event');
  await openDay(page, '2026-10-01'); await page.locator(`[data-edit-event="${copied.id}"]`).click();
  page.once('dialog', dialog => dialog.accept()); await page.locator('#em-del').click();
  assert.equal((await stored(page))[0].events.length, 1); assert.deepEqual((await stored(page))[0].dayLogs, before);
});

test('search, six-week month, day/week modes and month boundary navigation', async t => {
  const page = await app(t);
  await page.getByRole('button', { name: '現場・工程を検索' }).click(); await page.locator('#fs-search-input').fill('日本橋');
  await page.locator('[data-search-site="b"]').click(); assert.equal(await page.locator('#fs-site-filter').inputValue(), 'b');
  await page.locator('#fs-site-filter').selectOption('');
  await page.getByRole('button', { name: '日付へ移動', exact: true }).click(); await page.locator('#fs-jump-date').fill('2026-08-31');
  await page.locator('#fs-jump').getByRole('button', { name: '移動', exact: true }).click(); assert.equal(await page.locator('.fs-week').count(), 6);
  await page.locator('[data-fs-view="week"]').click(); assert.equal(await page.locator('.fs-agenda-day').count(), 7); assert.equal(await page.locator('#fs-weekdays').isVisible(), false);
  await page.locator('[data-fs-view="day"]').click(); assert.equal(await page.locator('.fs-agenda-day').count(), 1);
  await page.locator('[data-fs-view="month"]').click();
  await page.evaluate(() => fsJumpTo('2026-01-31')); await page.getByRole('button', { name: '次の月', exact: true }).click();
  assert.equal(await page.evaluate(() => fsState.date), '2026-02-28');
  assert.equal(await page.evaluate(() => fsDate('2026-02-30')), null);
  assert.equal(await page.evaluate(() => isHoliday('2026-09-22')), '国民の休日');
  assert.equal(await page.evaluate(() => isHoliday('2026-05-06')), '振替休日');
});

test('exported CSV contains actual attendance only; backup contains all records', async t => {
  const page = await app(t); await openDay(page, '2026-09-07'); await page.locator('#dp-content summary').click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '出面CSV', exact: true }).click();
  const csv = await fs.readFile(await (await download).path(), 'utf8');
  assert.match(csv, /髙嶋 宏/); assert.doesNotMatch(csv, /髙嶋 隆一/); assert.match(csv, /0.5/);
  await page.getByRole('button', { name: '日別詳細を閉じる' }).click();
  await page.getByRole('button', { name: 'カレンダー表示設定' }).click();
  const backup = page.waitForEvent('download'); await page.getByRole('button', { name: 'データをバックアップ' }).click();
  const data = JSON.parse(await fs.readFile(await (await backup).path(), 'utf8')); assert.deepEqual(data.sites, await stored(page));
});

test('fresh installation has no invented records; new sites contain the three company members', async t => {
  const page = await app(t, []); assert.deepEqual(await stored(page), []);
  await page.getByRole('button', { name: '＋ 新規現場', exact: true }).click();
  assert.deepEqual((await stored(page))[0].workers.map(w => w.name), workers.map(w => w.name));
  assert.deepEqual((await stored(page))[0].dayLogs, {});
  await page.locator('#site-form input').first().fill('新しい現場');
  assert.equal((await stored(page))[0].name, '新しい現場');
});

test('untrusted names render as text; dense overlapping sites remain accessible', async t => {
  const data = fixture(); data[0].name = '<img src=x onerror="window.injected=true">';
  for (let i = 0; i < 5; i++) data.push({ ...fixture()[1], id: 'extra' + i, name: '追加現場' + i });
  const page = await app(t, data, 320);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.ok(await page.locator('.fs-more').count() > 0);
  await page.locator('.fs-more[data-day="2026-09-08"]').click();
  assert.equal(await page.locator('#fs-calendar .fs-agenda-item').count(), 7);
  await page.locator('#fs-calendar [data-site="extra4"]').click();
  assert.equal(await page.locator('#dp-site').inputValue(), 'extra4');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
});

test('month swipe and desktop event drag preserve actual dates', async t => {
  const page = await app(t, fixture(), 1024);
  await page.locator('#fs-viewport').dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 280, clientY: 300 }] });
  await page.locator('#fs-viewport').dispatchEvent('touchend', { changedTouches: [{ identifier: 1, clientX: 50, clientY: 310 }] });
  assert.match(await page.locator('#fs-title').textContent(), /10月/);
  await page.evaluate(() => fsJumpTo('2026-09-08'));
  const before = (await stored(page))[0].dayLogs;
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.fs-bar[data-drag-event="a-event"]').first().dragTo(page.locator('.fs-day[data-day="2026-09-02"]'), { sourcePosition: { x: 8, y: 10 }, targetPosition: { x: 10, y: 10 } });
  assert.equal((await stored(page))[0].events[0].start, '2026-09-02');
  assert.equal((await stored(page))[0].events[0].end, '2026-09-19');
  assert.deepEqual((await stored(page))[0].dayLogs, before);
});

test('month selection previews all sites without opening an editor; keyboard and list navigation retain the date', async t => {
  const page = await app(t);
  await page.locator('.fs-day[data-day="2026-09-09"]').click({ position: { x: 12, y: 12 } });
  assert.equal(await page.locator('#day-panel-bg').isVisible(), false);
  assert.match(await page.locator('#fs-selection').innerText(), /9月9日/);
  assert.equal(await page.locator('#fs-selection .fs-agenda-item').count(), 2);
  await page.locator('.fs-day[data-day="2026-09-09"]').focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => fsState.date), '2026-09-10');
  await page.locator('#fs-selection [data-site="b"]').click();
  assert.equal(await page.locator('#dp-site').inputValue(), 'b');
  await page.getByRole('button', { name: '日別詳細を閉じる' }).click();
  await page.locator('[data-fs-view="list"]').click();
  assert.equal(await page.locator('#fs-selection').isVisible(), false);
  assert.ok(await page.locator('#fs-calendar [data-site="b"]').count() > 0);
  await page.getByRole('button', { name: '次の30日', exact: true }).click();
  assert.equal(await page.evaluate(() => fsState.date), '2026-10-10');
  assert.deepEqual(await stored(page), fixture());
});

test('home tomorrow edits plans only; today and cross-tab navigation share the selected date', async t => {
  const page = await app(t);
  await page.locator('#tab-today').click();
  assert.match(await page.locator('#home-title').innerText(), /今日の現場/);
  await page.getByRole('button', { name: '明日', exact: true }).click();
  assert.match(await page.locator('#home-title').innerText(), /明日の現場/);
  await page.locator('[data-home-site="b"]').click();
  assert.equal(await page.locator('.dp-tab[data-tab="plan"]').getAttribute('aria-pressed'), 'true');
  await page.getByRole('combobox', { name: '髙嶋 隆一の配置' }).selectOption('half');
  await page.getByRole('button', { name: '日別詳細を閉じる' }).click();
  assert.equal((await stored(page))[1].dayLogs['2026-09-08'].planWorkers.r, 'half');
  assert.equal((await stored(page))[1].dayLogs['2026-09-08'].workerStatus, undefined);
  assert.match(await page.locator('.home-site').nth(1).innerText(), /半日/);
  await page.evaluate(() => { toggleSiteStatus('b','h'); copySiteYesterday('b'); copySiteLastWeek('b'); saveSiteMemo('b','future'); });
  assert.equal((await stored(page))[1].dayLogs['2026-09-08'].workerStatus, undefined);
  assert.equal((await stored(page))[1].dayLogs['2026-09-08'].memo, undefined);
  await page.getByRole('button', { name: 'カレンダーへ' }).click();
  assert.equal(await page.evaluate(() => fsState.date), '2026-09-08');
  assert.equal(await page.locator('#fs-site-filter').inputValue(), '');
});

test('mobile layouts keep main controls visible and produce review screenshots', async t => {
  const page = await app(t);
  await fs.mkdir(path.join(root, 'artifacts/ui-review'), { recursive: true });
  for (const width of [320, 390, 430, 1024]) {
    await page.setViewportSize({ width, height: width === 320 ? 667 : 844 });
    await page.evaluate(() => { fsState.view='month'; fsJumpTo('2026-09-08'); switchTab('calendar'); });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const dock = await page.locator('.fs-dock').boundingBox(), tabs = await page.locator('.tab-bar-bottom').boundingBox();
    assert.ok(dock.y + dock.height <= tabs.y + 1, 'calendar controls do not overlap tabs');
    assert.ok((await page.locator('#fs-viewport').boundingBox()).height > 180, 'month remains usable on small phones');
    await page.screenshot({ path: path.join(root, `artifacts/ui-review/calendar-${width}.png`) });
    await page.locator('[data-fs-view="week"]').click();
    await page.screenshot({ path: path.join(root, `artifacts/ui-review/week-${width}.png`) });
    await page.locator('#tab-today').click(); await page.getByRole('button', { name: '明日', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(root, `artifacts/ui-review/home-${width}.png`) });
  }
});
