/**
 * Export utilities: Export saved words to CSV or JSON.
 */

/**
 * Export items as JSON file download.
 * @param {Array<object>} items - Word/sentence data
 */
export function exportAsJson(items) {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    count: items.length,
    items: items.map(sanitizeItem)
  };

  downloadFile(
    JSON.stringify(data, null, 2),
    `lectura-export-${formatDate()}.json`,
    'application/json'
  );
}

/**
 * Export items as CSV file download.
 * @param {Array<object>} items
 */
export function exportAsCsv(items) {
  const headers = ['word', 'type', 'pos', 'phonetic', 'definitions', 'examType', 'color', 'mastered', 'sourceSentence', 'sourceUrl', 'note', 'createdAt'];
  const rows = items.map(item => {
    const i = sanitizeItem(item);
    return [
      escapeCsv(i.text),
      i.type,
      i.pos || '',
      i.phonetic || '',
      (i.definitions || []).join('; '),
      i.examType || '',
      i.color || '',
      i.mastered ? 'yes' : 'no',
      escapeCsv(i.sourceSentence || ''),
      i.sourceUrl || '',
      escapeCsv(i.note || ''),
      i.createdAt || ''
    ];
  });

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  // UTF-8 BOM for Excel compatibility
  const BOM = '﻿';
  downloadFile(BOM + csv, `lectura-export-${formatDate()}.csv`, 'text/csv;charset=utf-8');
}

/**
 * Export as Anki-compatible CSV (word, definition, example).
 * @param {Array<object>} items
 */
export function exportAsAnki(items) {
  const wordItems = items.filter(i => i.type === 'word');
  const rows = wordItems.map(item => {
    const i = sanitizeItem(item);
    const front = i.text;
    const back = [
      i.phonetic ? `/${i.phonetic}/` : '',
      i.pos || '',
      (i.definitions || []).join('<br>'),
      i.sourceSentence ? `<br><br><i>"${escapeHtmlAttr(i.sourceSentence)}"</i>` : ''
    ].filter(Boolean).join('<br>');

    return [escapeCsv(front), escapeCsv(back), escapeCsv(i.sourceUrl || '')];
  });

  const csv = ['Front,Back,Source', ...rows.map(r => r.join(','))].join('\n');
  const BOM = '﻿';
  downloadFile(BOM + csv, `lectura-anki-${formatDate()}.csv`, 'text/csv;charset=utf-8');
}

// ─── Helpers ────────────────────────────────────────────────

function sanitizeItem(item) {
  return {
    text: item.text,
    type: item.type,
    pos: item.pos,
    phonetic: item.phoneticUs || item.phonetic,
    definitions: item.definitions,
    examType: item.examType,
    color: item.color,
    mastered: item.mastered,
    sourceSentence: item.sourceSentence,
    sourceUrl: item.sourceUrl,
    note: item.note,
    createdAt: item.createdAt
  };
}

function escapeCsv(value) {
  if (!value) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

function escapeHtmlAttr(text) {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
