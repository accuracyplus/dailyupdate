/**
 * APML Daily GM Update — Google Apps Script Backend
 * ----------------------------------------------------
 * Sheets created automatically on first call:
 *   1. DailyEntries — one row per day (with both PC + FO data flattened + RawJSON)
 *   2. PC_Feedback  — patient call feedback rows (one per call)
 *   3. FO_NotDelivered — undelivered reports rows (one per report)
 *   4. Tasks        — pending tasks
 *   5. Followups    — task follow-up log
 *   6. Targets      — monthly targets (key | value)
 *
 * Deploy:
 *   1. Open your "APML Daily GM Update" Google Sheet
 *   2. Extensions → Apps Script
 *   3. Paste this entire file, then Save
 *   4. Deploy → New deployment → Type: Web app
 *      Execute as: Me
 *      Who has access: Anyone
 *   5. Copy the Web App URL into the app's Settings tab
 */

const SHEETS = {
  ENTRIES: 'DailyEntries',
  FEEDBACK: 'PC_Feedback',
  NOT_DELIVERED: 'FO_NotDelivered',
  TASKS: 'Tasks',
  FOLLOWUPS: 'Followups',
  TARGETS: 'Targets',
};

// ============================================================
// ENTRY POINTS
// ============================================================
function doPost(e) {
  return handle_(e);
}
function doGet(e) {
  return handle_(e);
}

function handle_(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
      if (typeof payload.entry === 'string') payload.entry = JSON.parse(payload.entry);
      if (typeof payload.task === 'string') payload.task = JSON.parse(payload.task);
      if (typeof payload.targets === 'string') payload.targets = JSON.parse(payload.targets);
    }
    const action = payload.action;
    let result;
    switch (action) {
      case 'getEntry': result = { entry: getEntry_(payload.date) }; break;
      case 'saveEntry': result = saveEntry_(payload.entry); break;
      case 'listEntries': result = { entries: listEntries_() }; break;
      case 'getTargets': result = { targets: getTargets_() }; break;
      case 'saveTargets': result = saveTargets_(payload.targets); break;
      case 'getTasks': result = { tasks: getTasks_() }; break;
      case 'saveTask': result = saveTask_(payload.task); break;
      case 'deleteTask': result = deleteTask_(payload.id); break;
      case 'ping': result = { ok: true, time: new Date().toISOString() }; break;
      default: result = { error: 'Unknown action: ' + action };
    }
    return jsonOut_(result);
  } catch (err) {
    return jsonOut_({ error: String(err && err.message ? err.message : err) });
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// SHEET HELPERS
// ============================================================
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name, headers) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers && headers.length) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#0A2540').setFontColor('#FFFFFF');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

const ENTRY_HEADERS = [
  'Date', 'SubmittedBy', 'MeetingTime',
  // PC
  'PC_RevWalkin', 'PC_RevHome', 'PC_RevMarketing', 'PC_RevTotal',
  'PC_PatientsTotal', 'PC_PatientsNew', 'PC_PatientsRepeat',
  'PC_HomeCollections', 'PC_MarketingLeads',
  'PC_Enquiries', 'PC_Converted', 'PC_ConvRate',
  'PC_SMPosts', 'PC_SMStories', 'PC_SMEngagement', 'PC_SMLeads',
  'PC_SMSpendMTD', 'PC_SMConvMTD',
  'PC_DevPlansCount', 'PC_DevPlansNotes',
  'PC_NewReviews', 'PC_AvgRating', 'PC_Complaints', 'PC_ComplaintsResolved',
  'PC_Remarks',
  // FO
  'FO_RegTotal', 'FO_RegWalkin', 'FO_RegAppt', 'FO_RegInsurance', 'FO_RegCash',
  'FO_RegErrors', 'FO_RegStatusNotes',
  'FO_CallsReceived', 'FO_CallsAnswered', 'FO_CallsMissed',
  'FO_CallsOutbound', 'FO_CallConversions', 'FO_AnswerRate',
  'FO_ReportsDue', 'FO_DelEmail', 'FO_DelWhatsApp', 'FO_DelInPerson', 'FO_DelTotal', 'FO_DelRate',
  'FO_Remarks',
  // Bookkeeping
  'UpdatedAt', 'RawJSON'
];
const FEEDBACK_HEADERS = ['Date', 'Patient', 'Service', 'Satisfaction', 'Source', 'Comments'];
const NOT_DEL_HEADERS = ['Date', 'Patient', 'ReportType', 'Reason', 'Action'];
const TASK_HEADERS = ['ID', 'CreatedDate', 'Title', 'Description', 'Owner', 'Priority', 'DueDate', 'Status', 'RaisedBy', 'ClosedDate', 'UpdatedAt'];
const FOLLOWUP_HEADERS = ['FollowupID', 'TaskID', 'Date', 'Note'];
const TARGET_HEADERS = ['Key', 'Value'];

// ============================================================
// ENTRIES
// ============================================================
function num_(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

function pct_(num, den) { den = num_(den); return den > 0 ? (num_(num) / den) * 100 : 0; }

function flattenEntry_(entry) {
  const pc = entry.pc || {};
  const fo = entry.fo || {};
  const meta = entry.meta || {};
  const revTotal = num_(pc.revenue_walkin) + num_(pc.revenue_home) + num_(pc.revenue_marketing);
  const convRate = pct_(pc.enquiries_converted, pc.enquiries_received);
  const ansRate = pct_(fo.calls_answered, fo.calls_received);
  const delTotal = num_(fo.reports_delivered_email) + num_(fo.reports_delivered_whatsapp) + num_(fo.reports_delivered_inperson);
  const delRate = pct_(delTotal, fo.reports_due);
  return [
    entry.date, meta.submittedBy || '', meta.meetingTime || '',
    num_(pc.revenue_walkin), num_(pc.revenue_home), num_(pc.revenue_marketing), revTotal,
    num_(pc.patients_total), num_(pc.patients_new), num_(pc.patients_repeat),
    num_(pc.home_collection_count), num_(pc.marketing_staff_leads),
    num_(pc.enquiries_received), num_(pc.enquiries_converted), convRate,
    num_(pc.sm_posts), num_(pc.sm_stories), num_(pc.sm_engagement), num_(pc.sm_leads),
    num_(pc.sm_spend_mtd), num_(pc.sm_conversions_mtd),
    num_(pc.dev_plans_count), pc.dev_plans_notes || '',
    num_(pc.new_reviews), num_(pc.avg_rating), num_(pc.complaints_received), num_(pc.complaints_resolved),
    pc.remarks || '',
    num_(fo.reg_total), num_(fo.reg_walkin), num_(fo.reg_appt), num_(fo.reg_insurance), num_(fo.reg_cash),
    num_(fo.reg_errors), fo.reg_status_notes || '',
    num_(fo.calls_received), num_(fo.calls_answered), num_(fo.calls_missed),
    num_(fo.calls_outbound), num_(fo.call_conversions), ansRate,
    num_(fo.reports_due), num_(fo.reports_delivered_email), num_(fo.reports_delivered_whatsapp), num_(fo.reports_delivered_inperson), delTotal, delRate,
    fo.remarks || '',
    new Date().toISOString(), JSON.stringify(entry)
  ];
}

function findRowByDate_(sh, date) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const dates = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < dates.length; i++) {
    let v = dates[i][0];
    if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
    if (String(v) === String(date)) return i + 2;
  }
  return -1;
}

function saveEntry_(entry) {
  if (!entry || !entry.date) return { error: 'Missing entry.date' };
  const sh = sheet_(SHEETS.ENTRIES, ENTRY_HEADERS);
  const row = flattenEntry_(entry);
  const existingRow = findRowByDate_(sh, entry.date);
  if (existingRow > 0) {
    sh.getRange(existingRow, 1, 1, row.length).setValues([row]);
  } else {
    sh.appendRow(row);
  }
  // Mirror feedback array (replace all rows for this date)
  syncChildArray_(SHEETS.FEEDBACK, FEEDBACK_HEADERS, entry.date, (entry.pc && entry.pc.call_feedback) || [], (f) => [entry.date, f.patient || '', f.service || '', f.satisfied || '', f.source || '', f.comments || '']);
  // Mirror non-delivered reports
  syncChildArray_(SHEETS.NOT_DELIVERED, NOT_DEL_HEADERS, entry.date, (entry.fo && entry.fo.reports_not_delivered) || [], (r) => [entry.date, r.patient || '', r.reportType || '', r.reason || '', r.action || '']);
  return { ok: true };
}

function syncChildArray_(sheetName, headers, date, items, mapper) {
  const sh = sheet_(sheetName, headers);
  const last = sh.getLastRow();
  if (last >= 2) {
    // Delete all rows where col 1 == date (iterate from bottom)
    const existing = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = existing.length - 1; i >= 0; i--) {
      let v = existing[i][0];
      if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
      if (String(v) === String(date)) sh.deleteRow(i + 2);
    }
  }
  if (items && items.length) {
    const rows = items.map(mapper);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function getEntry_(date) {
  const sh = sheet_(SHEETS.ENTRIES, ENTRY_HEADERS);
  const r = findRowByDate_(sh, date);
  if (r < 0) return null;
  const lastCol = sh.getLastColumn();
  const row = sh.getRange(r, 1, 1, lastCol).getValues()[0];
  const rawJson = row[lastCol - 1];
  try { return JSON.parse(rawJson); } catch (e) { return null; }
}

function listEntries_() {
  const sh = sheet_(SHEETS.ENTRIES, ENTRY_HEADERS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const lastCol = sh.getLastColumn();
  const rows = sh.getRange(2, 1, last - 1, lastCol).getValues();
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i][lastCol - 1];
    if (raw) { try { out.push(JSON.parse(raw)); } catch (e) {} }
  }
  out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return out;
}

// ============================================================
// TARGETS
// ============================================================
function getTargets_() {
  const sh = sheet_(SHEETS.TARGETS, TARGET_HEADERS);
  const last = sh.getLastRow();
  const out = {};
  if (last >= 2) {
    const rows = sh.getRange(2, 1, last - 1, 2).getValues();
    rows.forEach(r => { if (r[0]) out[r[0]] = num_(r[1]); });
  }
  return out;
}

function saveTargets_(targets) {
  const sh = sheet_(SHEETS.TARGETS, TARGET_HEADERS);
  const keys = Object.keys(targets || {});
  // Wipe existing (keep header)
  if (sh.getLastRow() >= 2) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  if (keys.length) {
    const rows = keys.map(k => [k, num_(targets[k])]);
    sh.getRange(2, 1, rows.length, 2).setValues(rows);
  }
  return { ok: true };
}

// ============================================================
// TASKS + FOLLOWUPS
// ============================================================
function getTasks_() {
  const sh = sheet_(SHEETS.TASKS, TASK_HEADERS);
  const fsh = sheet_(SHEETS.FOLLOWUPS, FOLLOWUP_HEADERS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, TASK_HEADERS.length).getValues();
  // Build followup map
  const followupsMap = {};
  const flast = fsh.getLastRow();
  if (flast >= 2) {
    const fRows = fsh.getRange(2, 1, flast - 1, FOLLOWUP_HEADERS.length).getValues();
    fRows.forEach(r => {
      const taskId = r[1];
      if (!followupsMap[taskId]) followupsMap[taskId] = [];
      let dateVal = r[2];
      if (dateVal instanceof Date) dateVal = Utilities.formatDate(dateVal, Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
      followupsMap[taskId].push({ id: r[0], date: String(dateVal), note: r[3] });
    });
  }
  return rows.map(r => {
    let due = r[6]; if (due instanceof Date) due = Utilities.formatDate(due, Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
    let cd = r[1]; if (cd instanceof Date) cd = Utilities.formatDate(cd, Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
    let closed = r[9]; if (closed instanceof Date) closed = Utilities.formatDate(closed, Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
    return {
      id: r[0], createdDate: String(cd || ''), title: r[2], description: r[3], owner: r[4],
      priority: r[5], dueDate: due ? String(due) : '', status: r[7], raisedBy: r[8],
      closedDate: closed ? String(closed) : undefined, followups: followupsMap[r[0]] || []
    };
  });
}

function findTaskRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return -1;
}

function saveTask_(task) {
  if (!task || !task.id) return { error: 'Missing task.id' };
  const sh = sheet_(SHEETS.TASKS, TASK_HEADERS);
  const row = [
    task.id, task.createdDate || '', task.title || '', task.description || '',
    task.owner || '', task.priority || '', task.dueDate || '', task.status || 'Open',
    task.raisedBy || '', task.closedDate || '', new Date().toISOString()
  ];
  const existing = findTaskRow_(sh, task.id);
  if (existing > 0) sh.getRange(existing, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
  // Sync followups
  syncTaskFollowups_(task.id, task.followups || []);
  return { ok: true };
}

function syncTaskFollowups_(taskId, followups) {
  const sh = sheet_(SHEETS.FOLLOWUPS, FOLLOWUP_HEADERS);
  const last = sh.getLastRow();
  if (last >= 2) {
    const ids = sh.getRange(2, 2, last - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (ids[i][0] === taskId) sh.deleteRow(i + 2);
    }
  }
  if (followups.length) {
    const rows = followups.map(f => [f.id || (taskId + '-' + Date.now()), taskId, f.date || '', f.note || '']);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function deleteTask_(id) {
  const sh = sheet_(SHEETS.TASKS, TASK_HEADERS);
  const r = findTaskRow_(sh, id);
  if (r > 0) sh.deleteRow(r);
  // Also clean followups
  const fsh = sheet_(SHEETS.FOLLOWUPS, FOLLOWUP_HEADERS);
  const last = fsh.getLastRow();
  if (last >= 2) {
    const ids = fsh.getRange(2, 2, last - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (ids[i][0] === id) fsh.deleteRow(i + 2);
    }
  }
  return { ok: true };
}
