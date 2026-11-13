/**
 * ============================================================
 *  HDTM SEED — Google Apps Script
 *  Chạy 1 lần để tạo master data cho Web App HĐTM Rural.
 *  Paste vào GAS Multi-Purpose hiện có (cuối file) hoặc chạy
 *  riêng trong Apps Script editor.
 * ============================================================
 *
 *  CÁCH DÙNG:
 *    1. Mở GAS Multi-Purpose hiện tại
 *    2. Paste hàm seedHDTM() vào cuối Code.gs
 *    3. Chạy seedHDTM() một lần từ editor
 *    4. Các bảng sẽ tự tạo trong sheet "Data Web App Rural"
 *
 *  TABLES TẠO RA:
 *    hdtm_types     — Master loại HĐTM
 *    hdtm_rules     — Rule triển khai theo loại HĐTM
 *    hdtm_activities— Hoạt động đã đăng ký
 *    hdtm_history   — Lịch sử thay đổi
 *    hdtm_targets   — Target theo tháng/tuần/QLKV/GĐV
 *    hdtm_actuals   — Kết quả thực tế
 */

function seedHDTM() {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  if (!ss) {
    Logger.log('❌ Chưa set SHEET_ID trong Script Properties');
    return;
  }

  // ========== 1. MASTER LOẠI HĐTM ==========
  var types = [
    { code: 'HN_CD',    name: 'Hoạt náo theo chủ đề',  target_type: 'weekly',  days_per: 1,  uplift_benchmark: 20,  color: '#FF9800', active: 'TRUE' },
    { code: 'HC_NCC',   name: 'HC kết nối NCC',        target_type: 'monthly', days_per: 1,  uplift_benchmark: 30,  color: '#4CAF50', active: 'TRUE' },
    { code: 'HC_CD',    name: 'HC kết nối cộng đồng',   target_type: 'monthly', days_per: 1,  uplift_benchmark: 30,  color: '#2196F3', active: 'TRUE' },
    { code: 'GHHC_SN',  name: 'GHHC Sinh nhật',         target_type: 'monthly', days_per: 1,  uplift_benchmark: 100, color: '#E91E63', active: 'TRUE' },
    { code: 'HDTM_KHAC',name: 'HĐTM khác',              target_type: 'monthly', days_per: 1,  uplift_benchmark: 10,  color: '#607D8B', active: 'TRUE' }
  ];

  ensureSheet_(ss, 'hdtm_types', ['code','name','target_type','days_per','uplift_benchmark','color','active']);
  var sheetT = ss.getSheetByName('hdtm_types');
  types.forEach(function(t) {
    sheetT.appendRow([t.code, t.name, t.target_type, t.days_per, t.uplift_benchmark, t.color, t.active]);
  });

  // ========== 2. MASTER RULES ==========
  var rules = [
    { type_code: 'HN_CD',   rule_name: 'Công thức tính target', rule_value: 'TBN × TT 20% × số ngày triển khai', description: 'Uplift min 5 triệu, max 20 triệu' },
    { type_code: 'HN_CD',   rule_name: 'Số ngày/lượt',          rule_value: '1',                               description: '1 ngày/lượt' },
    { type_code: 'HC_NCC',  rule_name: 'Công thức tính target', rule_value: 'TBN × tỉ lệ × số ngày',           description: 'Hội chợ kết nối nhà cung cấp' },
    { type_code: 'HC_CD',   rule_name: 'Công thức tính target', rule_value: 'TBN × tỉ lệ × số ngày',           description: 'Hội chợ kết nối cộng đồng' },
    { type_code: 'GHHC_SN', rule_name: 'Công thức tính target', rule_value: 'TBN × 2 × số ngày triển khai',    description: 'Uplift min 20 triệu, max 50 triệu' },
    { type_code: 'HDTM_KHAC',rule_name:'Công thức tính target', rule_value: 'Uplift 10%',                       description: 'Các hoạt động khác' }
  ];

  ensureSheet_(ss, 'hdtm_rules', ['type_code','rule_name','rule_value','description']);
  var sheetR = ss.getSheetByName('hdtm_rules');
  rules.forEach(function(r) {
    sheetR.appendRow([r.type_code, r.rule_name, r.rule_value, r.description]);
  });

  // ========== 3. ACTIVITIES (empty) ==========
  ensureSheet_(ss, 'hdtm_activities', [
    'activity_id','parent_id','type_code','sap','store_name','mien','tinh','huyen','qlkv','gdv',
    'week','plan_date','target','actual','uplift_planned','uplift_actual','spd_base','spd_actual',
    'status','registered_by','registered_at','note','created_at','updated_at'
  ]);

  // ========== 4. HISTORY (empty) ==========
  ensureSheet_(ss, 'hdtm_history', [
    'activity_id','action','changed_by','changed_at','field_name','old_value','new_value','reason'
  ]);

  // ========== 5. TARGETS (empty) ==========
  ensureSheet_(ss, 'hdtm_targets', [
    'month','week','qlkv','gdv','type_code','target_qty','target_ch','note'
  ]);

  // ========== 6. ACTUALS (empty) ==========
  ensureSheet_(ss, 'hdtm_actuals', [
    'activity_id','sap','actual_date','spd_actual','revenue','note','reported_by','reported_at'
  ]);

  Logger.log('✅ HDTM seed complete! 6 tables created.');
  Logger.log('  hdtm_types: ' + (ss.getSheetByName('hdtm_types').getLastRow() - 1) + ' types');
  Logger.log('  hdtm_rules: ' + (ss.getSheetByName('hdtm_rules').getLastRow() - 1) + ' rules');
  return '✅ Done';
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    Logger.log('Created sheet: ' + name);
  }
}

/**
 * GHI CHÚ QUAN TRỌNG:
 * Frontend (app.js) dùng TOÀN BỘ action CHUNG đã có sẵn trong GAS Multi-Purpose:
 *   action=list    (GET)  → đọc bảng (hdtm_activities, hdtm_history, hdtm_types, hdtm_rules, hdtm_targets)
 *   action=save    (POST) → thêm record mới, tự sinh id
 *   action=update  (POST) → cập nhật record theo id/idField
 *
 * KHÔNG cần thêm doPost/case riêng cho HDTM — vì GAS đã hỗ trợ bảng động
 * theo tên `table` bất kỳ. Chỉ cần:
 *   1. Dán seedHDTM() + ensureSheet_() (ở trên) vào CUỐI file Code.gs hiện có.
 *   2. Set Script Property SHEET_ID = ID của sheet "Data Web App Rural".
 *   3. Chạy seedHDTM() 1 lần từ Apps Script editor để tạo 6 sheet + master data.
 *   4. Deploy lại (hoặc dùng chung deployment cũ nếu đã "Execute as: Me, Access: Anyone").
 */