/* ===================================================
   Budget Tracker — app.js
   Vanilla JS · LocalStorage · Chart.js
   =================================================== */

'use strict';

// ── Category emoji map ──────────────────────────────
const CATEGORY_ICONS = {
  Food:      '🍔',
  Transport: '🚌',
  Fun:       '🎮',
  Health:    '💊',
  Shopping:  '🛍️',
  Bills:     '🧾',
  Other:     '📦',
  Income:    '💵',
};

function getCategoryIcon(cat) {
  return CATEGORY_ICONS[cat] || '📌';
}

// ── LocalStorage helpers ────────────────────────────
const STORAGE_KEY       = 'budgetTracker_transactions';
const THEME_KEY         = 'budgetTracker_theme';
const LIMIT_KEY         = 'budgetTracker_limit';
const CUSTOM_CATS_KEY   = 'budgetTracker_customCategories';

function loadTransactions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

function saveTransactions(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadCustomCategories() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_CATS_KEY)) || [];
  } catch { return []; }
}

function saveCustomCategories(cats) {
  localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(cats));
}

function loadLimit() {
  const v = localStorage.getItem(LIMIT_KEY);
  return v !== null ? parseFloat(v) : null;
}

function saveLimit(val) {
  if (val === null) {
    localStorage.removeItem(LIMIT_KEY);
  } else {
    localStorage.setItem(LIMIT_KEY, val);
  }
}

// ── State ───────────────────────────────────────────
let transactions    = loadTransactions();
let customCategories = loadCustomCategories();
let spendingLimit   = loadLimit();
let chartInstance   = null;
let currentSort     = 'date-desc';

// ── DOM references ───────────────────────────────────
const form                 = document.getElementById('transactionForm');
const itemNameInput        = document.getElementById('itemName');
const amountInput          = document.getElementById('amount');
const typeSelect           = document.getElementById('type');
const categorySelect       = document.getElementById('category');
const customCategoryGroup  = document.getElementById('customCategoryGroup');
const customCategoryInput  = document.getElementById('customCategory');
const addCategoryBtn       = document.getElementById('addCategoryBtn');
const saveCustomCategoryBtn = document.getElementById('saveCustomCategoryBtn');

const totalBalanceEl  = document.getElementById('totalBalance');
const incomeTotalEl   = document.getElementById('incomeTotal');
const expenseTotalEl  = document.getElementById('expenseTotal');
const limitWarningEl  = document.getElementById('limitWarning');

const spendingLimitInput = document.getElementById('spendingLimit');
const setLimitBtn        = document.getElementById('setLimitBtn');
const clearLimitBtn      = document.getElementById('clearLimitBtn');
const currentLimitEl     = document.getElementById('currentLimit');

const transactionListEl = document.getElementById('transactionList');
const emptyMsgEl        = document.getElementById('emptyMsg');
const sortSelect        = document.getElementById('sortBy');

const themeToggleBtn  = document.getElementById('themeToggle');
const monthSelector   = document.getElementById('monthSelector');
const monthlySummaryEl = document.getElementById('monthlySummary');

// Error elements
const nameError     = document.getElementById('nameError');
const amountError   = document.getElementById('amountError');
const categoryError = document.getElementById('categoryError');

// ── Theme ────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'light';
  document.body.classList.toggle('dark', saved === 'dark');
  themeToggleBtn.textContent = saved === 'dark' ? '☀️' : '🌙';
}

themeToggleBtn.addEventListener('click', () => {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  themeToggleBtn.textContent = isDark ? '☀️' : '🌙';
  // Re-render chart to update colors
  renderChart();
});

// ── Custom Categories ────────────────────────────────
function loadCustomCategoriesIntoSelect() {
  // Remove old custom options (those with data-custom attribute)
  const existing = categorySelect.querySelectorAll('[data-custom]');
  existing.forEach(o => o.remove());

  customCategories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = `📌 ${cat}`;
    opt.setAttribute('data-custom', 'true');
    categorySelect.appendChild(opt);
  });
}

addCategoryBtn.addEventListener('click', () => {
  customCategoryGroup.classList.toggle('hidden');
  if (!customCategoryGroup.classList.contains('hidden')) {
    customCategoryInput.focus();
  }
});

saveCustomCategoryBtn.addEventListener('click', () => {
  const name = customCategoryInput.value.trim();
  if (!name) { customCategoryInput.focus(); return; }
  if (customCategories.includes(name)) {
    customCategoryInput.value = '';
    customCategoryGroup.classList.add('hidden');
    // Select the existing one
    categorySelect.value = name;
    return;
  }
  customCategories.push(name);
  saveCustomCategories(customCategories);
  loadCustomCategoriesIntoSelect();
  categorySelect.value = name;
  customCategoryInput.value = '';
  customCategoryGroup.classList.add('hidden');
});

// ── Spending Limit ───────────────────────────────────
function updateLimitDisplay() {
  if (spendingLimit !== null) {
    currentLimitEl.textContent = `Current limit: $${spendingLimit.toFixed(2)}`;
    spendingLimitInput.value = spendingLimit;
  } else {
    currentLimitEl.textContent = 'No limit set.';
    spendingLimitInput.value = '';
  }
}

setLimitBtn.addEventListener('click', () => {
  const val = parseFloat(spendingLimitInput.value);
  if (isNaN(val) || val <= 0) {
    spendingLimitInput.focus();
    return;
  }
  spendingLimit = val;
  saveLimit(spendingLimit);
  updateLimitDisplay();
  updateBalance();
});

clearLimitBtn.addEventListener('click', () => {
  spendingLimit = null;
  saveLimit(null);
  updateLimitDisplay();
  limitWarningEl.classList.add('hidden');
});

// ── Form validation ──────────────────────────────────
function clearErrors() {
  nameError.textContent     = '';
  amountError.textContent   = '';
  categoryError.textContent = '';
  itemNameInput.classList.remove('error');
  amountInput.classList.remove('error');
  categorySelect.classList.remove('error');
}

function validateForm() {
  clearErrors();
  let valid = true;

  const name = itemNameInput.value.trim();
  const amt  = parseFloat(amountInput.value);
  const cat  = categorySelect.value;

  if (!name) {
    nameError.textContent = 'Item name is required.';
    itemNameInput.classList.add('error');
    valid = false;
  }

  if (!amountInput.value || isNaN(amt) || amt <= 0) {
    amountError.textContent = 'Enter a valid amount greater than 0.';
    amountInput.classList.add('error');
    valid = false;
  }

  if (!cat) {
    categoryError.textContent = 'Please select a category.';
    categorySelect.classList.add('error');
    valid = false;
  }

  return valid;
}

// ── Add Transaction ──────────────────────────────────
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const transaction = {
    id:       Date.now().toString(),
    name:     itemNameInput.value.trim(),
    amount:   parseFloat(parseFloat(amountInput.value).toFixed(2)),
    type:     typeSelect.value,
    category: categorySelect.value,
    date:     new Date().toISOString(),
  };

  transactions.unshift(transaction);
  saveTransactions(transactions);

  // Reset form
  form.reset();
  clearErrors();
  customCategoryGroup.classList.add('hidden');

  // Re-render everything
  renderAll();
});

// ── Delete Transaction ───────────────────────────────
function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  saveTransactions(transactions);
  renderAll();
}

// ── Balance calculation ──────────────────────────────
function calcTotals() {
  let income = 0, expense = 0;
  transactions.forEach(t => {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  });
  return { income, expense, balance: income - expense };
}

function updateBalance() {
  const { income, expense, balance } = calcTotals();

  totalBalanceEl.textContent = formatCurrency(balance);
  incomeTotalEl.textContent  = `+ ${formatCurrency(income)} Income`;
  expenseTotalEl.textContent = `− ${formatCurrency(expense)} Expenses`;

  // Limit warning
  if (spendingLimit !== null && expense > spendingLimit) {
    limitWarningEl.classList.remove('hidden');
  } else {
    limitWarningEl.classList.add('hidden');
  }
}

function formatCurrency(val) {
  const abs = Math.abs(val);
  const formatted = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (val < 0 ? '-' : '') + '$' + formatted;
}

// ── Sort helpers ─────────────────────────────────────
function getSortedTransactions() {
  const list = [...transactions];
  switch (currentSort) {
    case 'date-desc':    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
    case 'date-asc':     return list.sort((a, b) => new Date(a.date) - new Date(b.date));
    case 'amount-desc':  return list.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':   return list.sort((a, b) => a.amount - b.amount);
    case 'category-asc': return list.sort((a, b) => a.category.localeCompare(b.category));
    default:             return list;
  }
}

sortSelect.addEventListener('change', () => {
  currentSort = sortSelect.value;
  renderTransactionList();
});

// ── Render transaction list ──────────────────────────
function renderTransactionList() {
  const sorted = getSortedTransactions();
  const { expense } = calcTotals();

  // Clear existing items (keep the empty placeholder in DOM)
  transactionListEl.innerHTML = '';

  if (sorted.length === 0) {
    transactionListEl.innerHTML = '<li class="empty-msg" id="emptyMsg">No transactions yet. Add one above!</li>';
    return;
  }

  sorted.forEach(t => {
    const isOverLimit = spendingLimit !== null && t.type === 'expense' && expense > spendingLimit;
    const li = document.createElement('li');
    li.className = `transaction-item${isOverLimit ? ' over-limit' : ''}`;
    li.setAttribute('data-id', t.id);

    const date    = new Date(t.date);
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const icon    = t.type === 'income' ? '💵' : getCategoryIcon(t.category);
    const sign    = t.type === 'income' ? '+' : '−';

    li.innerHTML = `
      <div class="item-icon">${icon}</div>
      <div class="item-details">
        <div class="item-name">${escapeHtml(t.name)}</div>
        <div class="item-meta">
          <span class="category-badge">${escapeHtml(t.category)}</span>
          ${dateStr}
        </div>
      </div>
      <div class="item-amount ${t.type}">${sign}${formatCurrency(t.amount).replace('-', '')}</div>
      <button class="delete-btn" data-id="${t.id}" title="Delete transaction" aria-label="Delete ${escapeHtml(t.name)}">🗑️</button>
    `;

    transactionListEl.appendChild(li);
  });

  // Attach delete listeners
  transactionListEl.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteTransaction(btn.dataset.id));
  });
}

// Prevent XSS
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Chart ────────────────────────────────────────────
function getChartColors(count) {
  const palette = [
    '#6c63ff','#ff6584','#43e97b','#f7971e','#00c6ff',
    '#a18cd1','#fbc2eb','#fd7043','#26c6da','#9ccc65',
  ];
  return palette.slice(0, count);
}

function renderChart() {
  const expenses    = transactions.filter(t => t.type === 'expense');
  const chartEmptyEl = document.getElementById('chartEmpty');
  const canvas      = document.getElementById('expenseChart');

  if (expenses.length === 0) {
    chartEmptyEl.classList.remove('hidden');
    canvas.style.display = 'none';
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  chartEmptyEl.classList.add('hidden');
  canvas.style.display = 'block';

  // Aggregate by category
  const catMap = {};
  expenses.forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + t.amount;
  });

  const labels = Object.keys(catMap);
  const data   = Object.values(catMap);
  const colors = getChartColors(labels.length);

  const isDark    = document.body.classList.contains('dark');
  const textColor = isDark ? '#e8eaf6' : '#1a1d2e';

  if (chartInstance) {
    chartInstance.data.labels            = labels;
    chartInstance.data.datasets[0].data  = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.options.plugins.legend.labels.color = textColor;
    chartInstance.update();
    return;
  }

  chartInstance = new Chart(canvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: isDark ? '#1a1d2e' : '#ffffff',
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color:    textColor,
            padding:  14,
            font:     { size: 12, family: "'Segoe UI', system-ui, sans-serif" },
            boxWidth: 12,
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = ((ctx.raw / total) * 100).toFixed(1);
              return ` ${ctx.label}: $${ctx.raw.toFixed(2)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// ── Monthly Summary ──────────────────────────────────
function buildMonthOptions() {
  if (transactions.length === 0) {
    monthSelector.innerHTML = '<option value="">No data</option>';
    return;
  }

  // Collect unique year-month combos
  const months = [...new Set(
    transactions.map(t => t.date.slice(0, 7))
  )].sort().reverse();

  monthSelector.innerHTML = months
    .map(m => {
      const [y, mo] = m.split('-');
      const label   = new Date(`${m}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      return `<option value="${m}">${label}</option>`;
    })
    .join('');
}

function renderMonthlySummary() {
  const month = monthSelector.value;
  if (!month) {
    monthlySummaryEl.innerHTML = '<p class="empty-msg">No data for selected month.</p>';
    return;
  }

  const filtered = transactions.filter(t => t.date.startsWith(month));
  if (filtered.length === 0) {
    monthlySummaryEl.innerHTML = '<p class="empty-msg">No transactions this month.</p>';
    return;
  }

  const expenseItems = filtered.filter(t => t.type === 'expense');
  const incomeItems  = filtered.filter(t => t.type === 'income');

  const totalExpense = expenseItems.reduce((s, t) => s + t.amount, 0);
  const totalIncome  = incomeItems.reduce((s, t) => s + t.amount, 0);

  // Group expenses by category
  const catMap = {};
  expenseItems.forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + t.amount;
  });

  const catItems = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => `
      <div class="monthly-item">
        <div class="cat-name">${getCategoryIcon(cat)} ${escapeHtml(cat)}</div>
        <div class="cat-amount">${formatCurrency(amt)}</div>
      </div>
    `).join('');

  monthlySummaryEl.innerHTML = `
    <div class="monthly-grid">${catItems || '<p class="empty-msg">No expenses.</p>'}</div>
    <div class="monthly-totals">
      <span class="income">Income: ${formatCurrency(totalIncome)}</span>
      <span class="expense">Expenses: ${formatCurrency(totalExpense)}</span>
      <span>Net: ${formatCurrency(totalIncome - totalExpense)}</span>
    </div>
  `;
}

monthSelector.addEventListener('change', renderMonthlySummary);

// ── Render all ───────────────────────────────────────
function renderAll() {
  updateBalance();
  renderTransactionList();
  renderChart();
  buildMonthOptions();
  renderMonthlySummary();
}

// ── Init ─────────────────────────────────────────────
function init() {
  initTheme();
  loadCustomCategoriesIntoSelect();
  updateLimitDisplay();
  renderAll();
}

init();
