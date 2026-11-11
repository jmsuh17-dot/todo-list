(function () {
  'use strict';

  var ITEMS_KEY = 'todo-app.items';
  var PREFS_KEY = 'todo-app.prefs';
  var MAX_LEN = 100;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  var DEFAULT_PREFS = { filter: 'all', hideDone: false, doneCollapsed: false };

  // ===== DOM =====
  var $ = function (id) { return document.getElementById(id); };
  var todayLabel = $('today-label');
  var countTotal = $('count-total');
  var countActive = $('count-active');
  var countDone = $('count-done');
  var countOverdue = $('count-overdue');
  var progressBar = $('progress-bar');
  var progressFill = $('progress-fill');
  var progressText = $('progress-text');
  var form = $('todo-form');
  var textInput = $('todo-text');
  var dateInput = $('todo-date');
  var formError = $('form-error');
  var charCount = $('char-count');
  var filterTabs = document.querySelectorAll('.filter-tab');
  var hideDoneInput = $('hide-done');
  var hideDoneLabel = hideDoneInput.closest('.hide-done');
  var table = $('todo-table');
  var tbody = $('todo-body');
  var emptyState = $('empty-state');
  var emptyTitle = $('empty-title');
  var emptyHint = $('empty-hint');
  var clearDoneBtn = $('clear-done');
  var toastEl = $('toast');

  // ===== 상태 =====
  var items = [];
  var prefs = Object.assign({}, DEFAULT_PREFS);
  var today = todayStr();
  var lastAddedId = null;
  var toastTimer = null;

  // ===== 날짜 유틸 =====
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseDate(str) {
    var p = str.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function isValidDate(str) {
    if (!DATE_RE.test(str)) return false;
    var d = parseDate(str);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) === str;
  }

  function formatDate(str) {
    var d = parseDate(str);
    var md = pad(d.getMonth() + 1) + '.' + pad(d.getDate());
    var wd = ' (' + WEEKDAYS[d.getDay()] + ')';
    if (d.getFullYear() !== new Date().getFullYear()) {
      return d.getFullYear() + '.' + md + wd;
    }
    return md + wd;
  }

  function formatToday() {
    return new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
    });
  }

  // ===== 저장소 =====
  function isValidItem(it) {
    return it && typeof it === 'object' &&
      typeof it.id === 'string' &&
      typeof it.text === 'string' &&
      typeof it.date === 'string' && isValidDate(it.date) &&
      typeof it.done === 'boolean';
  }

  function loadItems() {
    try {
      var raw = localStorage.getItem(ITEMS_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      if (!Array.isArray(data)) throw new Error('배열이 아닙니다.');
      return data.filter(isValidItem).map(function (it) {
        return {
          id: it.id,
          text: it.text.slice(0, MAX_LEN),
          date: it.date,
          done: it.done,
          createdAt: typeof it.createdAt === 'number' ? it.createdAt : 0
        };
      });
    } catch (e) {
      console.warn('[할일 목록] 저장된 할일을 불러오지 못해 빈 목록으로 시작합니다.', e);
      return [];
    }
  }

  function saveItems() {
    try {
      localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('[할일 목록] 할일을 저장하지 못했습니다.', e);
      showToast('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.');
    }
  }

  function loadPrefs() {
    try {
      var raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return Object.assign({}, DEFAULT_PREFS);
      var data = JSON.parse(raw) || {};
      return {
        filter: ['all', 'active', 'done'].indexOf(data.filter) >= 0 ? data.filter : 'all',
        hideDone: data.hideDone === true,
        doneCollapsed: data.doneCollapsed === true
      };
    } catch (e) {
      console.warn('[할일 목록] 설정을 불러오지 못해 기본값을 사용합니다.', e);
      return Object.assign({}, DEFAULT_PREFS);
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
      console.warn('[할일 목록] 설정을 저장하지 못했습니다.', e);
    }
  }

  // ===== 데이터 조작 =====
  function makeId() {
    return Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  }

  function findItem(id) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i];
    }
    return null;
  }

  // 검증 결과: { ok, field, message }
  function validate(text, date) {
    if (!text) return { ok: false, field: 'text', message: '할일을 입력해 주세요.' };
    if (!date) return { ok: false, field: 'date', message: '날짜를 선택해 주세요.' };
    if (!isValidDate(date)) return { ok: false, field: 'date', message: '올바른 날짜를 선택해 주세요.' };
    return { ok: true };
  }

  function addItem(text, date) {
    text = String(text || '').trim().slice(0, MAX_LEN);
    date = String(date || '').trim();
    var result = validate(text, date);
    if (!result.ok) return result;
    var now = Date.now();
    var item = { id: makeId(), text: text, date: date, done: false, createdAt: now };
    items.push(item);
    saveItems();
    result.item = item;
    return result;
  }

  function toggleItem(id) {
    var item = findItem(id);
    if (!item) return null;
    item.done = !item.done;
    saveItems();
    return item;
  }

  function deleteItem(id) {
    var before = items.length;
    items = items.filter(function (it) { return it.id !== id; });
    if (items.length !== before) saveItems();
  }

  function getStatus(item) {
    if (item.done) return 'done';
    if (item.date < today) return 'overdue';
    if (item.date === today) return 'today';
    return 'normal';
  }

  function sortItems(list) {
    return list.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
  }

  // ===== 렌더링 =====
  function createRow(item) {
    var status = getStatus(item);
    var tr = document.createElement('tr');
    tr.className = 'todo-row';
    if (status !== 'normal') tr.classList.add('is-' + status);
    if (item.id === lastAddedId) tr.classList.add('is-new');
    tr.dataset.id = item.id;

    var checkId = 'chk-' + item.id;

    // 완료 체크박스
    var tdCheck = document.createElement('td');
    tdCheck.className = 'cell-check';
    var hit = document.createElement('label');
    hit.className = 'check-hit';
    hit.htmlFor = checkId;
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'checkbox js-toggle';
    cb.id = checkId;
    cb.checked = item.done;
    cb.setAttribute('aria-label', "'" + item.text + "' 완료 표시");
    hit.appendChild(cb);
    tdCheck.appendChild(hit);

    // 할일 텍스트 + 배지
    var tdText = document.createElement('td');
    tdText.className = 'cell-text';
    var label = document.createElement('label');
    label.className = 'todo-text';
    label.htmlFor = checkId;
    label.textContent = item.text;
    tdText.appendChild(label);

    var statusText = '';
    if (status === 'today') statusText = '오늘';
    else if (status === 'overdue') statusText = '기한초과';
    if (statusText) {
      var badge = document.createElement('span');
      badge.className = 'badge badge--' + status;
      badge.textContent = statusText;
      tdText.appendChild(badge);
    }

    // 날짜
    var tdDate = document.createElement('td');
    tdDate.className = 'cell-date';
    var dateText = document.createElement('time');
    dateText.dateTime = item.date;
    dateText.textContent = formatDate(item.date);
    tdDate.appendChild(dateText);
    if (statusText) {
      var dateStatus = document.createElement('span');
      dateStatus.className = 'date-status';
      dateStatus.setAttribute('aria-hidden', 'true');
      dateStatus.textContent = ' · ' + statusText;
      tdDate.appendChild(dateStatus);
    }

    // 삭제
    var tdAction = document.createElement('td');
    tdAction.className = 'cell-action';
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn-delete js-delete';
    del.textContent = '삭제';
    del.setAttribute('aria-label', "'" + item.text + "' 삭제");
    tdAction.appendChild(del);

    tr.appendChild(tdCheck);
    tr.appendChild(tdText);
    tr.appendChild(tdDate);
    tr.appendChild(tdAction);
    return tr;
  }

  function createDoneHeader(count) {
    var tr = document.createElement('tr');
    tr.className = 'done-header';
    var td = document.createElement('td');
    td.colSpan = 4;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'done-toggle js-done-toggle';
    btn.setAttribute('aria-expanded', prefs.doneCollapsed ? 'false' : 'true');
    var title = document.createElement('span');
    title.textContent = '완료됨 (' + count + ')';
    var state = document.createElement('span');
    state.className = 'done-toggle__state';
    state.textContent = prefs.doneCollapsed ? '▸ 펼치기' : '▾ 접기';
    btn.appendChild(title);
    btn.appendChild(state);
    td.appendChild(btn);
    tr.appendChild(td);
    return tr;
  }

  function showEmpty(title, hint, hintIsLink) {
    table.hidden = true;
    emptyState.hidden = false;
    emptyTitle.textContent = title;
    emptyHint.textContent = hint || '';
    emptyHint.classList.toggle('is-link', !!hintIsLink);
  }

  function renderSummary(activeItems, doneItems) {
    var total = items.length;
    var overdue = activeItems.filter(function (it) { return it.date < today; }).length;
    var percent = total === 0 ? 0 : Math.round((doneItems.length / total) * 100);

    countTotal.textContent = total;
    countActive.textContent = activeItems.length;
    countDone.textContent = doneItems.length;
    countOverdue.textContent = overdue;
    countOverdue.classList.toggle('is-zero', overdue === 0);

    progressFill.style.width = percent + '%';
    progressText.textContent = percent + '%';
    progressBar.setAttribute('aria-valuenow', String(percent));
    progressBar.setAttribute('aria-valuetext', '완료 ' + doneItems.length + '개 / 전체 ' + total + '개, ' + percent + '%');
  }

  function renderToolbar() {
    for (var i = 0; i < filterTabs.length; i++) {
      var tab = filterTabs[i];
      tab.setAttribute('aria-pressed', tab.dataset.filter === prefs.filter ? 'true' : 'false');
    }
    var enabled = prefs.filter === 'all';
    hideDoneInput.disabled = !enabled;
    hideDoneInput.checked = prefs.hideDone;
    hideDoneLabel.classList.toggle('is-disabled', !enabled);
  }

  function render() {
    today = todayStr();
    todayLabel.textContent = formatToday();

    var sorted = sortItems(items);
    var activeItems = sorted.filter(function (it) { return !it.done; });
    var doneItems = sorted.filter(function (it) { return it.done; });

    renderSummary(activeItems, doneItems);
    renderToolbar();
    clearDoneBtn.disabled = doneItems.length === 0;

    tbody.textContent = '';

    if (items.length === 0) {
      showEmpty('아직 등록된 할일이 없어요', '위 입력창에 첫 할일을 추가해 보세요.', true);
    } else if (prefs.filter === 'active' && activeItems.length === 0) {
      showEmpty('진행 중인 할일이 없어요. 모두 완료했어요!');
    } else if (prefs.filter === 'done' && doneItems.length === 0) {
      showEmpty('아직 완료한 할일이 없어요.');
    } else if (prefs.filter === 'all' && prefs.hideDone && activeItems.length === 0) {
      showEmpty('진행 중인 할일이 없어요. 모두 완료했어요!', '완료 항목은 숨김 상태입니다.');
    } else {
      table.hidden = false;
      emptyState.hidden = true;
      var frag = document.createDocumentFragment();

      if (prefs.filter !== 'done') {
        activeItems.forEach(function (it) { frag.appendChild(createRow(it)); });
      }

      if (prefs.filter === 'done') {
        // 완료 필터: 구역 헤더 없이 완료 항목만
        doneItems.forEach(function (it) { frag.appendChild(createRow(it)); });
      } else if (prefs.filter === 'all' && !prefs.hideDone && doneItems.length > 0) {
        frag.appendChild(createDoneHeader(doneItems.length));
        if (!prefs.doneCollapsed) {
          doneItems.forEach(function (it) { frag.appendChild(createRow(it)); });
        }
      }

      tbody.appendChild(frag);
    }

    lastAddedId = null;
  }

  // ===== 토스트 =====
  function showToast(message) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-visible');
    }, 2500);
  }

  // ===== 폼 =====
  function setError(field, message) {
    formError.textContent = message;
    textInput.classList.toggle('is-invalid', field === 'text');
    dateInput.classList.toggle('is-invalid', field === 'date');
    if (field === 'text') textInput.setAttribute('aria-invalid', 'true');
    else textInput.removeAttribute('aria-invalid');
    if (field === 'date') dateInput.setAttribute('aria-invalid', 'true');
    else dateInput.removeAttribute('aria-invalid');
  }

  function clearError() {
    if (!formError.textContent) return;
    setError(null, '');
  }

  function updateCharCount() {
    var len = textInput.value.length;
    charCount.textContent = len + '/' + MAX_LEN;
    charCount.classList.toggle('is-visible', len > 0);
    charCount.classList.toggle('is-warning', len >= 90);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var result = addItem(textInput.value, dateInput.value);
    if (!result.ok) {
      setError(result.field, result.message);
      (result.field === 'text' ? textInput : dateInput).focus();
      return;
    }
    clearError();
    lastAddedId = result.item.id;
    textInput.value = '';
    updateCharCount();
    render();
    textInput.focus();
    showToast('할일이 추가되었어요');
  });

  textInput.addEventListener('input', function () {
    clearError();
    updateCharCount();
  });
  dateInput.addEventListener('input', clearError);
  dateInput.addEventListener('change', clearError);

  // ===== 도구 막대 =====
  for (var i = 0; i < filterTabs.length; i++) {
    filterTabs[i].addEventListener('click', function () {
      prefs.filter = this.dataset.filter;
      savePrefs();
      render();
    });
  }

  hideDoneInput.addEventListener('change', function () {
    prefs.hideDone = hideDoneInput.checked;
    savePrefs();
    render();
  });

  // ===== 목록 (이벤트 위임) =====
  tbody.addEventListener('change', function (e) {
    var cb = e.target.closest('.js-toggle');
    if (!cb) return;
    var row = cb.closest('.todo-row');
    var item = toggleItem(row.dataset.id);
    if (!item) return;
    render();
    // 토글 후 같은 항목의 체크박스에 포커스 유지(보이는 경우)
    var again = document.getElementById('chk-' + item.id);
    if (again) again.focus();
    showToast(item.done ? '완료 처리했어요' : '완료를 해제했어요');
  });

  tbody.addEventListener('click', function (e) {
    var toggleBtn = e.target.closest('.js-done-toggle');
    if (toggleBtn) {
      prefs.doneCollapsed = !prefs.doneCollapsed;
      savePrefs();
      render();
      var btn = tbody.querySelector('.js-done-toggle');
      if (btn) btn.focus();
      return;
    }

    var delBtn = e.target.closest('.js-delete');
    if (!delBtn) return;
    var row = delBtn.closest('.todo-row');
    var item = findItem(row.dataset.id);
    if (!item) return;
    if (!window.confirm("'" + item.text + "' 할일을 삭제할까요?")) return;

    // 다음 행의 id 기억(포커스 이동용)
    var nextRow = row.nextElementSibling;
    while (nextRow && !nextRow.classList.contains('todo-row')) nextRow = nextRow.nextElementSibling;
    var nextId = nextRow ? nextRow.dataset.id : null;

    deleteItem(item.id);
    render();

    var target = null;
    if (nextId) {
      var newRow = tbody.querySelector('tr[data-id="' + nextId + '"]');
      if (newRow) target = newRow.querySelector('.js-delete');
    }
    (target || textInput).focus();
    showToast('삭제되었어요');
  });

  // 빈 상태 보조문구 클릭 → 입력창 포커스
  emptyHint.addEventListener('click', function () {
    if (emptyHint.classList.contains('is-link')) textInput.focus();
  });

  // ===== 푸터 =====
  clearDoneBtn.addEventListener('click', function () {
    var n = items.filter(function (it) { return it.done; }).length;
    if (n === 0) return;
    if (!window.confirm('완료된 할일 ' + n + '개를 모두 삭제할까요?')) return;
    items = items.filter(function (it) { return !it.done; });
    saveItems();
    render();
    showToast('완료된 할일 ' + n + '개를 삭제했어요');
  });

  // ===== 자정 경과 대응 =====
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    var prevToday = today;
    var now = todayStr();
    if (dateInput.value === prevToday && now !== prevToday) dateInput.value = now;
    render();
  });

  // ===== 초기화 =====
  items = loadItems();
  prefs = loadPrefs();
  dateInput.value = today;
  updateCharCount();
  render();
})();
