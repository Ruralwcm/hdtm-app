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
    { code: 'HN_T',    name: 'Hoạt náo_Thường',       target_type: 'weekly',  days_per: 1,  uplift_benchmark: 1.15, color: '#2196F3', active: 'TRUE' },
    { code: 'HN_DN',   name: 'Hoạt náo điểm nhấn_FF', target_type: 'weekly',  days_per: 2,  uplift_benchmark: 1.30, color: '#FF9800', active: 'TRUE' },
    { code: 'HC',      name: 'Hội chợ',               target_type: 'monthly',  days_per: 1,  uplift_benchmark: 1.50, color: '#4CAF50', active: 'TRUE' },
    { code: 'HC_LON',  name: 'Hội chợ lớn',           target_type: 'monthly',  days_per: 1,  uplift_benchmark: 2.00, color: '#E91E63', active: 'TRUE' },
    { code: 'DDT',     name: 'Đánh đối thủ',           target_type: 'weekly',  days_per: 1,  uplift_benchmark: 1.40, color: '#9C27B0', active: 'TRUE' },
    { code: 'KT',      name: 'Khai trương',            target_type: 'monthly',  days_per: 1,  uplift_benchmark: 2.50, color: '#F44336', active: 'TRUE' },
    { code: 'KHAC',    name: 'Các hoạt động khác',     target_type: 'monthly',  days_per: 1,  uplift_benchmark: 1.10, color: '#607D8B', active: 'TRUE' }
  ];

  ensureSheet_(ss, 'hdtm_types', ['code','name','target_type','days_per','uplift_benchmark','color','active']);
  var sheetT = ss.getSheetByName('hdtm_types');
  types.forEach(function(t) {
    sheetT.appendRow([t.code, t.name, t.target_type, t.days_per, t.uplift_benchmark, t.color, t.active]);
  });

  // ========== 2. MASTER RULES ==========
  var rules = [
    { type_code: 'HN_T',   rule_name: 'Max CH/Ngày',          rule_value: 'Không giới hạn',  description: 'Số CH tối đa 1 QLKV có thể đăng ký hoạt náo thường trong 1 ngày' },
    { type_code: 'HN_T',   rule_name: 'Số ngày/lượt',          rule_value: '1',               description: 'Hoạt náo thường: 1 ngày/lượt' },
    { type_code: 'HN_T',   rule_name: 'Trùng lịch',            rule_value: 'CẢNH BÁO',        description: 'Cảnh báo nếu CH đã có hoạt động cùng ngày' },
    { type_code: 'HN_DN',  rule_name: 'Số ngày/lượt',          rule_value: '2',               description: 'Hoạt náo điểm nhấn: 2 ngày/lượt' },
    { type_code: 'HN_DN',  rule_name: 'Trùng lịch',            rule_value: 'CẢNH BÁO',        description: 'Cảnh báo nếu CH đã có hoạt động cùng ngày' },
    { type_code: 'HC',     rule_name: 'Số ngày/lượt',          rule_value: '1',               description: 'Hội chợ: 1 ngày/lượt' },
    { type_code: 'HC',     rule_name: 'Target tháng',          rule_value: 'Theo Target',     description: 'Hội chợ: số lượng theo Target tháng được phân bổ' },
    { type_code: 'HC_LON', rule_name: 'Số ngày/lượt',          rule_value: '1',               description: 'Hội chợ lớn: 1 ngày/lượt' },
    { type_code: 'HC_LON', rule_name: 'Quy đổi',               rule_value: 'Khai trương = Hội chợ lớn', description: 'Khai trương tính như Hội chợ lớn' },
    { type_code: 'DDT',    rule_name: 'Số ngày/lượt',          rule_value: '1',               description: 'Đánh đối thủ: 1 ngày/lượt' },
    { type_code: 'KT',     rule_name: 'Số ngày/lượt',          rule_value: '1',               description: 'Khai trương: 1 ngày/lượt' },
    { type_code: 'KT',     rule_name: 'Quy đổi',               rule_value: 'Khai trương = Hội chợ lớn', description: 'Khai trương tính như Hội chợ lớn' }
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