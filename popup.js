let scanData = null;

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

const SCAN_FN = async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  function isVisible(el) {
    if (!el) return false;
    try { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch { return false; }
  }

  function fireClick(el) {
    if (!el || !isVisible(el)) return;
    const rect = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    try { el.click(); } catch {}
  }

  function closeAll() {
    const esc = (type) => new KeyboardEvent(type, { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
    ['keydown', 'keyup'].forEach(t => {
      document.dispatchEvent(esc(t));
      document.querySelectorAll('.goog-menu, [role="menu"], [aria-expanded="true"], .goog-menu-button').forEach(el => el.dispatchEvent(esc(t)));
    });
  }

  function getVisibleDropdown() {
    for (const m of document.querySelectorAll('.goog-menu, [role="menu"]')) {
      if (isVisible(m)) return m;
    }
    return null;
  }

  // Scan items in a dropdown
  function scanDropdownItems(dd) {
    const items = [];
    for (const mi of dd.querySelectorAll('.goog-menuitem, [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]')) {
      const t = mi.textContent.trim();
      if (t) {
        const rect = mi.getBoundingClientRect();
        items.push({
          label: t,
          disabled: mi.classList.contains('goog-menuitem-disabled') || mi.getAttribute('aria-disabled') === 'true',
          hasSubmenu: !!mi.querySelector('.goog-menu, [role="menu"]'),
          visible: rect.width > 0 && rect.height > 0
        });
      }
    }
    return items;
  }

  // Scan a dialog in detail
  function scanDialog(dlg) {
    const info = { tag: dlg.tagName, id: dlg.id, class: (dlg.className || '').slice(0, 100) };
    const title = dlg.querySelector('h1,h2,h3,h4,[class*="title"],[class*="header"]');
    info.title = title ? title.textContent.trim() : '';
    info.buttons = [];
    info.radios = [];
    info.inputs = [];
    info.allText = dlg.textContent.trim().slice(0, 500);
    for (const el of dlg.querySelectorAll('*')) {
      const tag = el.tagName.toLowerCase();
      const text = el.textContent.trim();
      if (!text) continue;
      if (tag === 'button' || el.getAttribute('role') === 'button') {
        info.buttons.push({ text: text.slice(0, 80), visible: isVisible(el) });
      }
      if (tag === 'input' && el.type === 'radio') {
        const lbl = (el.parentElement?.textContent || '').trim();
        info.radios.push({ value: el.value, label: lbl.slice(0, 100), visible: isVisible(el.parentElement) });
      }
      if (el.getAttribute('role') === 'radio') {
        const lbl = (el.textContent || el.parentElement?.textContent || '').trim();
        info.radios.push({ role: true, label: lbl.slice(0, 100), visible: isVisible(el) });
      }
      if (tag === 'md-radio-button' || tag === 'mat-radio-button') {
        info.radios.push({ component: tag, label: text.slice(0, 100), visible: isVisible(el) });
      }
      if (tag === 'input' && (el.type === 'file' || el.type === 'text')) {
        info.inputs.push({ type: el.type, placeholder: el.placeholder || '' });
      }
    }
    return info;
  }

  const results = { topLevels: [], dialogs: [], deepDialogs: [], subSubMenus: [], errors: [] };

  try {
    closeAll(); await delay(500);
    const bar = document.querySelector('#top-menubar');
    if (!bar) { results.error = 'Menu bar not found'; return results; }

    // Phase 1: Scan all top-level menus
    for (const btn of bar.querySelectorAll(':scope > .goog-menu-button')) {
      try {
        const caption = btn.querySelector('.goog-menu-button-caption');
        const label = caption ? caption.textContent.trim() : '';
        if (!label || !btn.getBoundingClientRect().height) continue;
        const entry = { label, selector: '#' + btn.id, submenuItems: [] };
        closeAll(); await delay(300);

        fireClick(btn);
        await delay(600);

        const dd = getVisibleDropdown();
        if (dd) {
          entry.submenuItems = scanDropdownItems(dd);
        }

        closeAll(); await delay(300);
        results.topLevels.push(entry);
      } catch (e) {
        results.errors.push({ label: btn.textContent?.trim(), error: e.message });
        closeAll(); await delay(300);
      }
    }

    // Phase 2: Scan sub-submenus (items with ▶)
    closeAll(); await delay(300);
    for (const top of results.topLevels) {
      for (const item of top.submenuItems) {
        if (!item.hasSubmenu) continue;
        try {
          // Open the top menu again
          const topBtn = document.querySelector(top.selector);
          if (!topBtn) continue;
          fireClick(topBtn); await delay(500);

          // Find and open the submenu item
          const dd = getVisibleDropdown();
          if (!dd) continue;
          const subItems = dd.querySelectorAll('.goog-menuitem, [role="menuitem"]');
          let target = null;
          for (const si of subItems) {
            if (si.textContent.trim() === item.label) { target = si; break; }
          }
          if (!target) continue;
          fireClick(target); await delay(500);

          // Scan the new dropdown
          const dd2 = getVisibleDropdown();
          if (dd2 && dd2 !== dd) {
            const subItems2 = scanDropdownItems(dd2);
            if (subItems2.length > 0) {
              results.subSubMenus.push({ parent: top.label + ' > ' + item.label, items: subItems2 });
            }
          }

          closeAll(); await delay(300);
        } catch (e) {
          results.errors.push({ label: top.label + ' > ' + item.label, error: e.message });
          closeAll(); await delay(300);
        }
      }
    }

    // Phase 3: Open specific dialog-producing items and scan deeply
    closeAll(); await delay(500);

    // Items likely to open dialogs (from known Colab menu structure)
    const dialogCandidates = [
      { menuLabel: 'Среда выполнения', itemLabel: 'Отключиться от среды выполнения и удалить ее' },
      { menuLabel: 'Среда выполнения', itemLabel: 'Сменить среду выполнения' },
      { menuLabel: 'Файл', itemLabel: 'Открыть блокнотCtrl+O' },
      { menuLabel: 'Файл', itemLabel: 'Загрузить блокнот' },
      { menuLabel: 'Изменить', itemLabel: 'Настройки блокнота' }
    ];

    for (const candidate of dialogCandidates) {
      try {
        const topBtn = document.querySelector('[id$="-' + candidate.menuLabel.match(/[а-яё]+/i)?.[0]?.toLowerCase() + '-menu-button"], #' + candidate.menuLabel.replace(/ /g, '-').toLowerCase() + '-menu-button');
        // Better: find by iterating
        const allTopBtns = bar.querySelectorAll(':scope > .goog-menu-button');
        let foundBtn = null;
        for (const b of allTopBtns) {
          const c = b.querySelector('.goog-menu-button-caption');
          if ((c ? c.textContent.trim() : b.textContent.trim()) === candidate.menuLabel) { foundBtn = b; break; }
        }
        if (!foundBtn) { results.errors.push({ label: 'Top menu not found: ' + candidate.menuLabel, error: '' }); continue; }

        fireClick(foundBtn); await delay(500);

        const dd = getVisibleDropdown();
        if (!dd) continue;

        const menuItems = dd.querySelectorAll('.goog-menuitem, [role="menuitem"]');
        let targetItem = null;
        for (const mi of menuItems) {
          if (mi.textContent.trim() === candidate.itemLabel) { targetItem = mi; break; }
        }
        if (!targetItem) { closeAll(); await delay(300); continue; }

        fireClick(targetItem); await delay(1200);

        // Now scan any dialogs that appeared
        const dlg = document.querySelector('[role="dialog"], .goog-modalpopup');
        if (dlg && isVisible(dlg)) {
          const info = scanDialog(dlg);
          results.deepDialogs.push({ trigger: candidate.menuLabel + ' > ' + candidate.itemLabel, dialog: info });

          // Try to close the dialog (Escape)
          const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
          dlg.dispatchEvent(esc);
          document.dispatchEvent(esc);
          await delay(500);
          // Try clicking cancel/отмена if present
          for (const btn of dlg.querySelectorAll('button, [role="button"]')) {
            const txt = btn.textContent.trim().toLowerCase();
            if (txt === 'отмена' || txt === 'cancel' || txt === '×' || txt === '✕') {
              fireClick(btn); break;
            }
          }
          await delay(500);
        }

        closeAll(); await delay(300);
      } catch (e) {
        results.errors.push({ label: 'Dialog scan: ' + candidate.menuLabel + ' > ' + candidate.itemLabel, error: e.message });
        closeAll(); await delay(300);
      }
    }

    // Phase 4: Scan already-open dialogs
    for (const dlg of document.querySelectorAll('[role="dialog"], .goog-modalpopup')) {
      if (isVisible(dlg)) {
        results.dialogs.push(scanDialog(dlg));
      }
    }
  } catch (e) { results.error = e.message; }
  return results;
};

document.getElementById('scanBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('status');
  const scanBtn = document.getElementById('scanBtn');
  const resultsEl = document.getElementById('results');
  const downloadBtn = document.getElementById('downloadBtn');

  statusEl.textContent = '⏳ Сканирую меню Colab...';
  scanBtn.disabled = true;
  resultsEl.innerHTML = '';
  downloadBtn.disabled = true;

  try {
    const tab = await getActiveTab();
    if (!tab.url.includes('colab.research.google.com')) {
      statusEl.textContent = '❌ Откройте Colab';
      scanBtn.disabled = false;
      return;
    }

    // Inject and run scan directly - no message listeners needed
    const [execResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: SCAN_FN,
      world: 'MAIN'
    });

    const data = execResult.result;
    if (!data) { statusEl.textContent = '❌ No result from scan'; scanBtn.disabled = false; return; }

    scanData = data;

    if (data.error) {
      statusEl.textContent = '❌ ' + data.error;
      scanBtn.disabled = false;
      return;
    }

    const totalItems = data.topLevels.reduce((s, t) => s + t.submenuItems.length, 0);
    const totalDeep = (data.deepDialogs?.length || 0) + (data.subSubMenus?.length || 0);
    statusEl.innerHTML = `<span class="ok">✅ ${data.topLevels.length} меню, ${totalItems} пунктов, ${data.dialogs.length} диалогов, ${totalDeep} глубоких</span>`;

    let html = '<table><thead><tr><th>Пункт меню</th><th>Подпункты</th><th>ID</th></tr></thead><tbody>';
    for (const t of data.topLevels) {
      html += `<tr><td><strong>${t.label}</strong></td><td>${t.submenuItems.length}</td><td style="font-size:10px">${t.selector}</td></tr>`;
      for (const s of t.submenuItems) {
        html += `<tr class="sub"><td>↳ ${s.label}</td><td>${s.disabled ? '<span class="badge disabled">disabled</span>' : ''}${s.hasSubmenu ? '<span class="badge submenu">submenu</span>' : ''}</td><td></td></tr>`;
      }
    }
    html += '</tbody></table>';

    // Deep dialogs
    if (data.deepDialogs?.length) {
      html += '<h3 style="font-size:12px;margin:8px 0 4px">🔍 Глубокий скан диалогов:</h3>';
      for (const dd of data.deepDialogs) {
        html += `<div style="font-size:11px;margin:4px 0;padding:4px;background:#f8f9fa;border-radius:4px">
          <strong>${dd.trigger}</strong><br>`;
        if (dd.dialog.title) html += `Заголовок: ${dd.dialog.title}<br>`;
        if (dd.dialog.buttons?.length) {
          html += `Кнопки: ${dd.dialog.buttons.filter(b => b.visible).map(b => b.text).join(', ')}<br>`;
        }
        if (dd.dialog.radios?.length) {
          html += `Радио: ${dd.dialog.radios.filter(r => r.visible).map(r => r.label || r.value).join(' | ')}<br>`;
        }
        if (dd.dialog.inputs?.length) {
          html += `Инпуты: ${dd.dialog.inputs.map(i => i.type + (i.placeholder ? '(' + i.placeholder + ')' : '')).join(', ')}<br>`;
        }
        html += `</div>`;
      }
    }

    // Sub-sub menus
    if (data.subSubMenus?.length) {
      html += '<h3 style="font-size:12px;margin:8px 0 4px">📂 Подменю 2-го уровня:</h3><ul style="margin:0;padding-left:16px">';
      for (const sm of data.subSubMenus) {
        html += `<li style="font-size:11px"><strong>${sm.parent}</strong>: ${sm.items.map(i => i.label).join(', ')}</li>`;
      }
      html += '</ul>';
    }

    if (data.errors.length) {
      html += '<div class="error"><h3 style="font-size:12px;margin:8px 0 4px">⚠️ Ошибки:</h3><ul style="margin:0;padding-left:16px">';
      for (const e of data.errors) html += `<li style="font-size:11px">${e.label}: ${e.error}</li>`;
      html += '</ul></div>';
    }

    resultsEl.innerHTML = html;
    downloadBtn.disabled = false;
  } catch (e) {
    statusEl.textContent = '❌ Ошибка: ' + e.message;
  }

  scanBtn.disabled = false;
});

document.getElementById('downloadBtn').addEventListener('click', () => {
  if (!scanData) return;
  const blob = new Blob([JSON.stringify(scanData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename: 'colab-menu-structure.json' });
});

document.getElementById('closeMenusBtn').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab.url.includes('colab.research.google.com')) return;
  const statusEl = document.getElementById('status');
  // Try via message to content script first
  try {
    await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { action: 'closeMenus' }, (r) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(r);
      });
    });
    statusEl.textContent = '✅ Меню закрыты';
    return;
  } catch {}
  // Fallback: inject escape key directly via executeScript
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const esc = (type) => new KeyboardEvent(type, { key: 'Escape', bubbles: true });
        ['keydown', 'keyup'].forEach(t => {
          document.dispatchEvent(esc(t));
          document.querySelectorAll('.goog-menu, [role="menu"]').forEach(el => el.dispatchEvent(esc(t)));
        });
      },
      world: 'MAIN'
    });
    statusEl.textContent = '✅ Меню закрыты';
  } catch (e) {
    statusEl.textContent = '❌ ' + e.message;
  }
});

document.getElementById('toggleBtn').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab.url.includes('colab.research.google.com')) {
    document.getElementById('status').textContent = '❌ Откройте Colab';
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'injectButtons' });
    document.getElementById('status').textContent = '✅ Кнопки переключены';
  } catch (e) {
    document.getElementById('status').textContent = '❌ ' + e.message;
  }
});

document.getElementById('logBtn').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab.url.includes('colab.research.google.com')) {
    document.getElementById('status').textContent = '❌ Откройте Colab';
    return;
  }
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'getLogs' });
    if (!resp || !resp.logs) { document.getElementById('status').textContent = '❌ Логов нет'; return; }
    const logs = resp.logs;
    if (!logs.trim()) { document.getElementById('status').textContent = '⚠️ Логи пусты'; return; }
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: 'colab-auto-logs.txt' });
    document.getElementById('status').textContent = '✅ Логи скачаны';
  } catch (e) {
    document.getElementById('status').textContent = '❌ ' + e.message;
  }
});

document.getElementById('clearLogBtn').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab.url.includes('colab.research.google.com')) { return; }
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'clearLogs' });
    document.getElementById('status').textContent = '✅ Логи очищены';
  } catch {
    document.getElementById('status').textContent = '❌ Ошибка очистки';
  }
});

document.getElementById('domBtn').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab.url.includes('colab.research.google.com')) { return; }
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'getDOMSnapshot' });
    if (!resp || !resp.snapshot) { document.getElementById('status').textContent = '❌ Нет данных'; return; }
    const blob = new Blob([resp.snapshot], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: 'colab-dom-snapshot.txt' });
    document.getElementById('status').textContent = '✅ DOM слепок скачан';
  } catch (e) {
    document.getElementById('status').textContent = '❌ ' + e.message;
  }
});

function updateLogToggleBtn(enabled) {
  const btn = document.getElementById('logToggleBtn');
  if (enabled) {
    btn.textContent = '📝 Логи: Вкл';
    btn.className = 'on';
  } else {
    btn.textContent = '📝 Логи: Выкл';
    btn.className = 'off';
  }
}

document.getElementById('logToggleBtn').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab.url.includes('colab.research.google.com')) { return; }
  const btn = document.getElementById('logToggleBtn');
  const currentlyOn = btn.classList.contains('on');
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'setLogging', enabled: !currentlyOn });
    updateLogToggleBtn(resp.enabled);
    document.getElementById('status').textContent = resp.enabled ? '✅ Логи включены' : '✅ Логи выключены';
  } catch (e) {
    document.getElementById('status').textContent = '❌ ' + e.message;
  }
});

async function initLogToggle() {
  const tab = await getActiveTab();
  if (!tab || !tab.url?.includes('colab.research.google.com')) return;
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'getLogging' });
    updateLogToggleBtn(resp.enabled);
  } catch {}
}
initLogToggle();

// Theme management
function applyTheme(theme) {
  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

document.getElementById('themeSelect').addEventListener('change', (e) => {
  const theme = e.target.value;
  applyTheme(theme);
  chrome.storage.local.set({ theme });
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const select = document.getElementById('themeSelect');
  if (select.value === 'system') applyTheme('system');
});

chrome.storage.local.get('theme', (data) => {
  const theme = data.theme || 'system';
  document.getElementById('themeSelect').value = theme;
  applyTheme(theme);
});
