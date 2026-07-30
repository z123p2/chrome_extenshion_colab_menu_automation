(function() {
  if (window.__colabLoaded) return;
  window.__colabLoaded = true;

  window.__colabLogs = [];
  window.__colabLogging = false;

  function log(...args) {
    if (!window.__colabLogging) return;
    const ts = new Date().toISOString().slice(11, 23);
    const msg = args.join(' ');
    window.__colabLogs.push(`[${ts}] ${msg}`);
    console.log('[ColabAuto]', ...args);
  }

  function getLogsText() {
    return window.__colabLogs.join('\n');
  }

  function clearLogs() {
    window.__colabLogs = [];
  }

  async function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function closeAllMenus() {
    const menus = document.querySelectorAll('.goog-menu, [role="menu"]');
    for (const m of menus) {
      m.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      m.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  }

  async function waitForVisible(selector, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = typeof selector === 'string' ? document.querySelector(selector) : selector();
      if (el) {
        try {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) return el;
        } catch {}
      }
      await delay(80);
    }
    return null;
  }

  function fireClick(el, desc) {
    if (!el) { log('fireClick: element is null'); return; }
    log(`fireClick: ${desc || el.tagName + (el.id ? '#' + el.id : '')} (${el.textContent?.trim()?.slice(0, 40) || ''})`);
    try {
      const r = el.getBoundingClientRect();
      const hasRect = r.width > 0 && r.height > 0;
      log(`  rect: ${hasRect ? `${r.width}x${r.height} at (${r.left},${r.top})` : 'zero/not visible'}`);
      const cx = hasRect ? r.left + r.width / 2 : 0;
      const cy = hasRect ? r.top + r.height / 2 : 0;
      const props = { bubbles: true, cancelable: true, composed: true, view: window, detail: 1, button: 0, buttons: 1, clientX: cx, clientY: cy, screenX: cx, screenY: cy, relatedTarget: null };

      if (hasRect) {
        el.dispatchEvent(new PointerEvent('pointerdown', { ...props, pointerType: 'mouse', isPrimary: true, width: 1, height: 1, pressure: 0.5, pointerId: 1 }));
        el.dispatchEvent(new PointerEvent('pointerup', { ...props, pointerType: 'mouse', isPrimary: true, width: 1, height: 1, pressure: 0, pointerId: 1 }));
        el.dispatchEvent(new MouseEvent('mousedown', props));
        el.dispatchEvent(new MouseEvent('mouseup', props));
      }
      el.dispatchEvent(new MouseEvent('click', props));
      el.click();
      log(`  native click OK`);
    } catch(e) {
      log(`  click error: ${e.message}`);
      try { el.click(); log(`  fallback click OK`); } catch(e2) { log(`  fallback click FAIL: ${e2.message}`); }
    }
  }

  function getVisibleDropdown() {
    for (const m of document.querySelectorAll('.goog-menu, [role="menu"]')) {
      try {
        const r = m.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          log(`  visible dropdown found: ${(r.width | 0)}x${(r.height | 0)} items:${m.children.length}`);
          return m;
        }
      } catch {}
    }
    log(`  NO visible dropdown found`);
    return null;
  }

  function findMenuItemText(item) {
    const caption = item.querySelector('.goog-menuitem-caption, .goog-menu-button-caption');
    return caption ? caption.textContent.trim() : item.textContent.trim();
  }

  async function findTopMenu(label) {
    const bar = document.querySelector('#top-menubar, [role="menubar"], .goog-menubar');
    if (!bar) { log(`findTopMenu: menubar not found`); throw new Error('Menu bar not found'); }
    log(`findTopMenu: searching for "${label}"`);
    for (const btn of bar.querySelectorAll(':scope > .goog-menu-button')) {
      const text = findMenuItemText(btn);
      log(`  found button: "${text}"`);
      if (text === label) { log(`  match! id=${btn.id}`); return btn; }
    }
    log(`findTopMenu: "${label}" NOT FOUND`);
    throw new Error(`Menu "${label}" not found`);
  }

  function dispatchKey(el, key) {
    const opts = { key, code: key, bubbles: true, cancelable: true, composed: true, which: key === 'Enter' ? 13 : 40, keyCode: key === 'Enter' ? 13 : 40, charCode: 0 };
    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    if (key === 'Enter') {
      el.dispatchEvent(new KeyboardEvent('keypress', opts));
      el.dispatchEvent(new KeyboardEvent('keyup', opts));
    }
    try {
      const old = document.createEvent('KeyboardEvent');
      old.initKeyboardEvent('keydown', true, true, window, key, 0, false, '', false);
      el.dispatchEvent(old);
    } catch {}
  }

  async function clickMenuItemKeyboard(label, itemLabel) {
    log(`clickMenuItemKeyboard: "${label}" > "${itemLabel}"`);
    const btn = await findTopMenu(label);
    fireClick(btn, 'top-menu:' + label);
    await delay(100);

    let dd = getVisibleDropdown();
    if (!dd) { log(`  no dropdown visible`); throw new Error('Dropdown not visible'); }

    log(`  dropdown element: ${dd.tagName}#${dd.id} class=${(dd.className+'').slice(0,80)}`);

    const items = dd.querySelectorAll('.goog-menuitem, [role="menuitem"]');
    let targetIdx = -1;
    for (let i = 0; i < items.length; i++) {
      const text = findMenuItemText(items[i]);
      const disabled = items[i].classList.contains('goog-menuitem-disabled');
      log(`  item[${i}]: "${text}" disabled=${disabled} rect=${items[i].getBoundingClientRect().width|0}x${items[i].getBoundingClientRect().height|0}`);
      if (text === itemLabel || text.startsWith(itemLabel)) {
        if (disabled) { log(`  DISABLED`); throw new Error('Item is disabled: ' + itemLabel); }
        targetIdx = i;
      }
    }
    if (targetIdx === -1) throw new Error(`Item "${itemLabel}" not found`);

    dd.focus();

    log(`  navigating to item ${targetIdx} via keyboard`);
    for (let i = 0; i <= targetIdx; i++) {
      dispatchKey(dd, 'ArrowDown');
      await delay(20);
    }

    await delay(50);
    log(`  pressing Enter on menu`);
    dispatchKey(dd, 'Enter');
    await delay(50);

    const targetEl = items[targetIdx];
    log(`  fireClick on target`);
    if (targetEl) fireClick(targetEl, 'menu-item:' + itemLabel);
    await delay(50);

    log(`clickMenuItemKeyboard: OK`);
    return true;
  }

  function getDOMSnapshot() {
    const parts = [];
    parts.push('=== BODY CHILDREN ===');
    for (const c of document.body.children) {
      const r = c.getBoundingClientRect();
      parts.push(`${c.tagName}#${c.id}.${(c.className+'').slice(0,40)} ${r.width|0}x${r.height|0} v=${r.width>0&&r.height>0}`);
    }
    parts.push('=== ALL [role] ===');
    for (const el of document.querySelectorAll('[role]')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0)
        parts.push(`role="${el.getAttribute('role')}" ${el.tagName}#${el.id} ${r.width|0}x${r.height|0} text="${el.textContent.trim().slice(0,60)}"`);
    }
    parts.push('=== ALL ARIA ===');
    for (const el of document.querySelectorAll('[aria-modal],[aria-hidden],[aria-label]')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0)
        parts.push(`${el.tagName}#${el.id} aria-modal=${el.getAttribute('aria-modal')} aria-hidden=${el.getAttribute('aria-hidden')} label="${(el.getAttribute('aria-label')||'').slice(0,40)}"`);
    }
    parts.push('=== GOOG-MENU VISIBLE ===');
    for (const m of document.querySelectorAll('.goog-menu')) {
      const r = m.getBoundingClientRect();
      parts.push(`#${m.id} ${r.width|0}x${r.height|0} children=${m.children.length} v=${r.width>0&&r.height>0}`);
      if (r.width > 0 && r.height > 0) {
        for (const c of m.children) {
          parts.push(`  ${c.tagName}.${(c.className+'').slice(0,30)} text="${c.textContent.trim().slice(0,50)}"`);
        }
      }
    }
    parts.push('=== NOTEBOOK-VERTICAL CHILDREN ===');
    const nv = document.querySelector('.notebook-vertical');
    if (nv) {
      for (const c of nv.children) {
        const r = c.getBoundingClientRect();
        parts.push(`${c.tagName}#${c.id}.${(c.className+'').slice(0,50)} ${r.width|0}x${r.height|0} v=${r.width>0&&r.height>0}`);
      }
    }
    return parts.join('\n');
  }

  async function findDialog(timeout = 5000) {
    const selectors = [
      'mwc-dialog', 'MWC-DIALOG',
      '[role="dialog"]', '[role="alertdialog"]',
      '.goog-modalpopup-dialog', '.goog-modalpopup',
      '[aria-modal="true"]', 'mat-dialog-container', '.cdk-overlay-pane',
      'colab-dialog', '.MuiDialog-root',
      '.goog-modalpopup-bg',
      '[data-dialog]', 'jp-dialog', '.jp-Dialog',
      'dialog'
    ];
    log(`findDialog: searching with ${selectors.length} selectors, timeout=${timeout}ms`);
    const start = Date.now();
    let iter = 0;
    while (Date.now() - start < timeout) {
      iter++;
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          try {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              log(`findDialog: FOUND via "${sel}" ${r.width|0}x${r.height|0} tag=${el.tagName} id=${el.id} class=${(el.className+'').slice(0,100)}`);
              log(`  dialog text: ${el.textContent.trim().slice(0, 500)}`);
              return el;
            }
            if (el.tagName === 'MWC-DIALOG' || el.tagName === 'DIALOG') {
              log(`findDialog: found ${el.tagName} via "${sel}" class="${el.className}"`);
              const sr = el.shadowRoot;
              const isOpenInShadow = sr && sr.querySelector('.mdc-dialog--open');
              const isOpen = el.open === true || isOpenInShadow;
              log(`  open=${el.open} shadowOpen=${!!isOpenInShadow}`);
              if (isOpen) {
                log(`  ACCEPTED as dialog!`);
                return el;
              }
            }
          } catch {}
        }
      }
      await delay(80);
    }
    log(`findDialog: NOT FOUND. Taking DOM snapshot...`);
    log(getDOMSnapshot());
    return null;
  }

  async function clickDialogButton(dialog, ...texts) {
    log(`clickDialogButton: searching for button matching [${texts.join(', ')}]`);
    const buttons = dialog.querySelectorAll('button, [role="button"], .goog-button, md-button, mat-button, md-text-button');
    log(`  found ${buttons.length} buttons`);
    for (const btn of buttons) {
      const t = btn.textContent.trim().toLowerCase();
      log(`  button: "${t.slice(0, 50)}"`);
      for (const text of texts) {
        if (t === text.toLowerCase() || t.includes(text.toLowerCase())) {
          log(`  match: "${text}"`);
          fireClick(btn, 'dialog-btn:' + text);
          await delay(50);
          log(`clickDialogButton: OK`);
          return true;
        }
      }
    }
    log(`clickDialogButton: FAIL - no buttons matched [${texts.join(', ')}]`);
    return false;
  }

  function findAllInShadow(root, sel) {
    const results = [];
    for (const el of root.querySelectorAll(sel)) results.push(el);
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) results.push(...findAllInShadow(el.shadowRoot, sel));
    }
    return results;
  }

  async function waitForButton(textPattern, timeout = 5000) {
    log(`waitForButton: waiting for button matching "${textPattern}" timeout=${timeout}ms`);
    return new Promise((resolve) => {
      let obs = null;
      let done = false;
      const timer = setTimeout(() => {
        if (obs) obs.disconnect();
        log(`  waitForButton TIMEOUT after ${timeout}ms`);
        resolve(null);
      }, timeout);
      const check = (source) => {
        if (done) return false;
        const all = document.querySelectorAll('button, [role="button"], label, md-text-button, md-filled-button, [class*="button"]');
        for (const btn of all) {
          if (new RegExp(textPattern, 'i').test(btn.textContent || '')) {
            log(`  waitForButton FOUND via ${source} text="${btn.textContent.trim().slice(0,30)}"`);
            clearTimeout(timer);
            if (obs) obs.disconnect();
            done = true;
            resolve(btn);
            return true;
          }
        }
        return false;
      };
      if (check('initial')) return;
      obs = new MutationObserver(() => { log('  waitForButton observer fired'); check('observer'); });
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }

  async function selectT4InDialog(dlg) {
    log('search for T4');
    let found = false;
    const allRadios = findAllInShadow(dlg, 'mwc-radio, [role="radio"], input[type="radio"]');
    log(`  found ${allRadios.length} radio elements total`);
    for (const r of allRadios) {
      const ctx = (r.getAttribute('value')||'') + ' ' + (r.getAttribute('aria-label')||'') + ' ' + (r.parentElement?.textContent||'');
      log(`  radio: value="${r.getAttribute('value')||''}" ctx="${ctx.trim().slice(0,80)}"`);
      if (/T4|t4|графический|GPU|gpu/i.test(ctx)) {
        log(`  FOUND T4 radio`);
        const nativeInput = r.shadowRoot?.querySelector('input[type="radio"]');
        if (nativeInput) {
          log(`  clicking native input inside MWC-RADIO shadow`);
          nativeInput.click();
          await delay(30);
          nativeInput.checked = true;
          nativeInput.dispatchEvent(new Event('change', { bubbles: true }));
          nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
          log(`  native input: checked=true, change+input dispatched`);
        } else {
          log(`  no native input, clicking MWC-RADIO directly`);
          r.click();
        }
        try {
          r.checked = true;
          r.dispatchEvent(new Event('change', { bubbles: true }));
        } catch {}
        await delay(80);
        found = true;
        break;
      }
    }
    if (!found) {
      log('  T4 not found in shadow, trying direct label search');
      const labels = dlg.querySelectorAll('label, span, div, md-radio, md-item');
      for (const lb of labels) {
        if (/T4|t4|графический|GPU|gpu/i.test(lb.textContent)) {
          log(`  clicking: "${lb.textContent.trim().slice(0, 60)}"`);
          fireClick(lb, 'T4-label');
          found = true;
          break;
        }
      }
    }
    if (!found) {
      log(`  T4 NOT FOUND. Full innerHTML:\n${dlg.innerHTML.slice(0, 2000)}`);
      throw new Error('T4 radio not found');
    }
    await delay(150);
    log('click Save button');
    await clickDialogButton(dlg, 'Сохранить', 'SAVE', 'Save', 'OK', 'Сохранить');
  }

  async function clickSubMenuItemKeyboard(topLabel, parentLabel, childLabel) {
    log(`clickSubMenuItemKeyboard: "${topLabel}" > "${parentLabel}" > "${childLabel}"`);
    const btn = await findTopMenu(topLabel);
    fireClick(btn, 'top-menu:' + topLabel);
    await delay(100);

    let dd = getVisibleDropdown();
    if (!dd) throw new Error('Dropdown not visible');

    const allItems = dd.querySelectorAll('.goog-menuitem, [role="menuitem"]');
    let parentEl = null;
    for (let i = 0; i < allItems.length; i++) {
      const text = findMenuItemText(allItems[i]);
      const cleanText = text.replace(/[\s\n►]+/g, ' ').trim();
      const disabled = allItems[i].classList.contains('goog-menuitem-disabled');
      log(`  item[${i}]: "${cleanText}" disabled=${disabled}`);
      if (cleanText.startsWith(parentLabel) || text.includes(parentLabel)) {
        if (disabled) throw new Error('Parent item is disabled');
        parentEl = allItems[i];
        break;
      }
    }
    if (!parentEl) throw new Error(`Parent item "${parentLabel}" not found`);

    fireClick(parentEl, 'menu-item:' + parentLabel + ' (open submenu)');
    await delay(300);

    const pattern = new RegExp(childLabel.replace(/\s+/g, '\\s*'), 'i');
    const start = Date.now();
    let childEl = null;
    while (Date.now() - start < 3000) {
      childEl = [...document.querySelectorAll('.goog-menuitem, [role="menuitem"]')]
        .find(el => pattern.test(el.textContent || ''));
      if (childEl && childEl.getBoundingClientRect().width > 0) break;
      childEl = null;
      await delay(80);
    }
    if (!childEl) throw new Error(`Child item "${childLabel}" not found in submenu`);
    log(`  found child: "${childEl.textContent.trim().slice(0, 40)}"`);
    fireClick(childEl, 'submenu-item:' + childLabel);
    await delay(50);
    log(`clickSubMenuItemKeyboard: OK`);
  }

  window.__colabAutomation = {
    async deleteRuntime() {
      log('=== deleteRuntime START ===');
      try {
        log('1. close all menus');
        closeAllMenus();
        await delay(100);
        log('2. click menu item via keyboard');
        await clickMenuItemKeyboard('Среда выполнения', 'Отключиться от среды выполнения и удалить ее');
        log('3. wait for dialog');
        const dlg = await findDialog(4000);
        if (!dlg) throw new Error('Delete dialog not found');
        log('4. click confirm button');
        const clicked = await clickDialogButton(dlg, 'Да', 'OK', 'Удалить', 'Подтвердить', 'да');
        if (!clicked) throw new Error('Confirm button not found');
        log('=== deleteRuntime DONE ===');
      } catch (e) {
        log(`=== deleteRuntime ERROR: ${e.message} ===`);
        throw e;
      }
    },

    async changeToT4() {
      log('=== changeToT4 START ===');
      try {
        log('1. close all menus');
        closeAllMenus();
        await delay(100);
        log('2. click "Сменить среду выполнения" via keyboard');
        await clickMenuItemKeyboard('Среда выполнения', 'Сменить среду выполнения');
        log('3. wait for dialog');
        const dlg = await findDialog(4000);
        if (!dlg) throw new Error('Runtime dialog not found');
        log('4. select T4 and save');
        await selectT4InDialog(dlg);
        log('=== changeToT4 DONE ===');
      } catch (e) {
        log(`=== changeToT4 ERROR: ${e.message} ===`);
        throw e;
      }
    },

    async openMatchingNotebook() {
      const cid = ++window.__openCallId || (window.__openCallId = 1);
      log(`=== openMatchingNotebook START [#${cid}] ===`);
      try {
        log(`[#${cid}] 1. close menus`);
        closeAllMenus();
        await delay(100);

        log(`[#${cid}] 2. open "Файл" menu`);
        const menuBtn = await findTopMenu('Файл');
        fireClick(menuBtn, 'top-menu:Файл');
        await delay(200);

        log(`[#${cid}] 3. find and click "Загрузить блокнот"`);
        const dd = getVisibleDropdown();
        if (!dd) throw new Error('Dropdown not visible after clicking Файл');

        const items = dd.querySelectorAll('.goog-menuitem, [role="menuitem"]');
        let clicked = false;
        for (const item of items) {
          const text = findMenuItemText(item);
          log(`[#${cid}]   item: "${text}"`);
          if (/^Загрузить блокнот$/i.test(text)) {
            log(`[#${cid}]   clicking "${text}"`);
            fireClick(item, 'menu-item:' + text);
            await delay(300);
            clicked = true;
            break;
          }
        }
        if (!clicked) {
          log(`[#${cid}]   "Загрузить блокнот" not found, trying "Открыть блокнот"`);
          for (const item of items) {
            const text = findMenuItemText(item);
            if (/^Открыть блокнот/i.test(text)) {
              log(`[#${cid}]   clicking "${text}"`);
              fireClick(item, 'menu-item:' + text);
              await delay(300);
              clicked = true;
              break;
            }
          }
        }
        if (!clicked) throw new Error('Neither "Загрузить блокнот" nor "Открыть блокнот" found');

        log(`[#${cid}] 4. wait for "Загрузить" or "Выберите файл" button in dialog`);
        const fileBtn = await waitForButton('Загрузить|Upload|Выберите файл|Choose file|Select file', 4000);
        if (fileBtn) {
          log(`[#${cid}]   found "${fileBtn.textContent.trim().slice(0, 30)}" button`);
          const fi = document.querySelector('input[type="file"]');
          if (fi) {
            fi.addEventListener('change', function ch(e) {
              log(`file input change: files=${this.files?.length||0}`);
            }, { once: true });
            fi.addEventListener('click', function fe(e) {
              log(`file input click: isTrusted=${e.isTrusted}`);
            }, { capture: true });
            fi.addEventListener('focus', function ff(e) {
              log(`file input focus`);
            });
          }
          log(`[#${cid}]   calling native .click() on file button (no synthetic events)`);
          fileBtn.click();
          log(`[#${cid}] === openMatchingNotebook DONE (system file dialog opened) ===`);
        } else {
          log(`[#${cid}]   dialog button not found`);
          log(`[#${cid}] === openMatchingNotebook DONE (manual) ===`);
        }
      } catch (e) {
        log(`[#${cid}] === openMatchingNotebook ERROR: ${e.message} ===`);
        throw e;
      }
    },

    async runAllOnT4() {
      log('=== runAllOnT4 START ===');
      try {
        closeAllMenus();
        await delay(100);
        await clickMenuItemKeyboard('Среда выполнения', 'Сменить среду выполнения');
        const dlg = await findDialog(4000);
        if (!dlg) throw new Error('Runtime dialog not found');
        await selectT4InDialog(dlg);
        closeAllMenus();
        await delay(100);
        await clickMenuItemKeyboard('Среда выполнения', 'Выполнить все');
        log('=== runAllOnT4 DONE ===');
      } catch (e) {
        log(`=== runAllOnT4 ERROR: ${e.message} ===`);
        throw e;
      }
    },

    async downloadIPYNB() {
      log('=== downloadIPYNB START ===');
      try {
        closeAllMenus();
        await delay(100);
        await clickSubMenuItemKeyboard('Файл', 'Скачать', 'Скачать IPYNB');
        log('=== downloadIPYNB DONE ===');
      } catch (e) {
        log(`=== downloadIPYNB ERROR: ${e.message} ===`);
        throw e;
      }
    },

    async openWithT4AndRun() {
      log('=== openWithT4AndRun START ===');
      try {
        await chrome.storage.local.set({
          pendingAction: { type: 'openT4Run', timestamp: Date.now() }
        });
        log('  pendingAction saved (openT4Run)');
        await this.openMatchingNotebook();
        log('=== openWithT4AndRun DONE (page will reload after file select) ===');
      } catch (e) {
        log(`=== openWithT4AndRun ERROR: ${e.message} ===`);
        throw e;
      }
    }
  };

  async function checkPendingAction() {
    try {
      const data = await chrome.storage.local.get('pendingAction');
      if (!data.pendingAction) return;
      const { type, timestamp } = data.pendingAction;
      if (Date.now() - timestamp > 60000) {
        await chrome.storage.local.remove('pendingAction');
        log('pendingAction expired');
        return;
      }
      await chrome.storage.local.remove('pendingAction');
      log(`pending action: ${type}`);
      if (type !== 'openT4Run') return;
      await waitForVisible('#top-menubar, .goog-menubar', 15000);
      log('  menubar ready, waiting for Colab to settle');
      await delay(3000);
      const A = window.__colabAutomation;
      await A.changeToT4();
      closeAllMenus();
      await delay(100);
      await clickMenuItemKeyboard('Среда выполнения', 'Выполнить все');
      log('pending openT4Run completed');
    } catch (e) {
      log(`pendingAction error: ${e.message}`);
    }
  }

  function injectToolbarButtons() {
    if (document.getElementById('colab-auto-btns')) { return; }

    const toolbar = document.querySelector('#top-toolbar, [role="toolbar"], .toolbar, .action-buttons-menu');
    const container = document.createElement('span');
    container.id = 'colab-auto-btns';
    container.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-left:8px';

    if (toolbar) {
      toolbar.appendChild(container);
      log('buttons injected into toolbar');
    } else {
      log('toolbar not found, creating row under menubar');
      const menubar = document.querySelector('#top-menubar, .goog-menubar');
      if (!menubar) return;
      const row = document.createElement('div');
      row.id = 'colab-auto-toolbar';
      row.style.cssText = 'display:flex;align-items:center;padding:4px 8px;gap:6px;border-bottom:1px solid #e0e0e0';
      row.appendChild(container);
      menubar.parentNode?.insertBefore(row, menubar.nextSibling);
    }

    const actions = [
      { id: 'del', icon: '🗑', label: 'Откл+удалить', fn: 'deleteRuntime', title: 'Среда выполнения → Отключиться и удалить → Да' },
      { id: 'openplus', icon: '🟢', label: 'Открыть+', fn: 'openWithT4AndRun', title: 'Файл → Загрузить блокнот → Выбрать файл → T4 → Выполнить всё' },
      { id: 't4', icon: '🔄', label: 'T4 GPU', fn: 'changeToT4', title: 'Среда выполнения → Сменить среду выполнения → T4 → Сохранить' },
      { id: 'open', icon: '📂', label: 'Открыть', fn: 'openMatchingNotebook', title: 'Файл → Загрузить блокнот → Выбрать файл' },
      { id: 'runall', icon: '▶', label: 'T4 + Вып. всё', fn: 'runAllOnT4', title: 'T4 + Среда выполнения → Выполнить всё' },
      { id: 'dl', icon: '⬇', label: 'Скачать .ipynb', fn: 'downloadIPYNB', title: 'Файл → Скачать → Скачать IPYNB' }
    ];

    for (const a of actions) {
      const btn = document.createElement('button');
      btn.id = 'colab-btn-' + a.id;
      btn.textContent = a.icon + ' ' + a.label;
      btn.title = a.title;
      btn.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid #dadce0;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;color:#333;white-space:nowrap';
      btn.addEventListener('mouseenter', () => { btn.style.background = '#f1f3f4'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#fff'; });
      btn.addEventListener('click', async (event) => {
        log(`click handler: ${a.id} isTrusted=${event.isTrusted} target=${event.target?.id || event.target?.tagName} xy=(${event.clientX|0},${event.clientY|0})`);
        btn.textContent = '⏳';
        const A = window.__colabAutomation;
        try {
          await A[a.fn]();
        } catch (err) {
          log(`${a.fn} error: ${err.message}`);
        }
        btn.textContent = a.icon + ' ' + a.label;
      });
      container.appendChild(btn);
    }
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') { sendResponse({ alive: true }); return true; }
    if (request.action === 'closeMenus') { closeAllMenus(); sendResponse({ ok: true }); return true; }
    if (request.action === 'injectButtons') { injectToolbarButtons(); sendResponse({ ok: true }); return true; }
    if (request.action === 'getLogs') { sendResponse({ logs: getLogsText() }); return true; }
    if (request.action === 'clearLogs') { clearLogs(); sendResponse({ ok: true }); return true; }
    if (request.action === 'getDOMSnapshot') { sendResponse({ snapshot: getDOMSnapshot() }); return true; }
    if (request.action === 'getLogging') { sendResponse({ enabled: window.__colabLogging }); return true; }
    if (request.action === 'setLogging') { window.__colabLogging = request.enabled; sendResponse({ enabled: window.__colabLogging }); return true; }
  });

  function getNotebookName() {
    const title = document.title.replace(' - Colaboratory', '').trim();
    if (title && title !== 'Colaboratory') {
      log(`getNotebookName: from title "${title}"`);
      return title;
    }
    const el = document.querySelector('.notebook-name, [class*="notebook"][contenteditable], input[class*="title"]');
    if (el) {
      const name = (el.textContent || el.value || '').trim();
      if (name) { log(`getNotebookName: from DOM "${name}"`); return name; }
    }
    const match = window.location.href.match(/[?&]fileId=([^&]+)/);
    if (match) { log(`getNotebookName: from fileId`); return ''; }
    log('getNotebookName: not found');
    return '';
  }

  function autoInject() {
    const check = () => {
      if (document.querySelector('#top-menubar, .goog-menubar')) {
        injectToolbarButtons();
        return true;
      }
      return false;
    };
    if (check()) return;
    const obs = new MutationObserver(() => { if (check()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  autoInject();
  checkPendingAction().catch(e => log(`checkPendingAction error: ${e.message}`));
})();
