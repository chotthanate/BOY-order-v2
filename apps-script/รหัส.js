function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return json({ status: "error", message: "⚠️ ระบบกำลังใช้งานหนัก กรุณารอสักครู่ครับ" });
  }

  try {
    var sheetId = "1HvgQCAFnlSoQ1GhjP8XgkGFg_IFltrVCeNtupK_eVO0";
    var ss = SpreadsheetApp.openById(sheetId);
    
    // เราจะใช้ Sheet แรกสุด ช่อง Z1 เก็บฐานข้อมูลหลัก และ Z2 เก็บฉบับร่าง (Draft) กันเหนียว
    var configSheet = ss.getSheets()[0]; 
    var currentMonth = (new Date().getMonth() + 1).toString();
    var sheet = ss.getSheetByName(currentMonth);

    var data = JSON.parse(e.postData.contents || "{}");
    var action = data.action;
    var todayStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");

    // =========================
    // 🛠️ โหมดโหลดฉบับร่าง (ถ้าเปิดมือถือเครื่องอื่น)
    // =========================
    if (action === 'loadDraft') {
      var draftStr = configSheet.getRange("Z2").getValue() || '{}';
      var draft = {};
      try { 
        var tempDraft = JSON.parse(draftStr); 
        if (tempDraft.date === todayStr) draft = tempDraft; // โหลดเฉพาะร่างของวันนี้
      } catch(ex) {}
      return json({ status: 'success', draft: draft });
    }

    // =========================
    // 🛠️ โหมด AutoSave ฉบับร่าง
    // =========================
    if (action === 'autoSave') {
      data.draftData = data.draftData || {};
      data.draftData.date = todayStr; // ประทับตราวัดปัจจุบัน
      if (!data.draftData.timestamp) data.draftData.timestamp = new Date().toISOString();
      configSheet.getRange("Z2").setValue(JSON.stringify(data.draftData));
      return json({ status: 'success' });
    }

    // =========================
    // 🛠️ โหมดโหลด/บันทึกฐานข้อมูลหลัก
    // =========================
    function uniqueStrings(arr) {
      var seen = {};
      var output = [];
      if (!Array.isArray(arr)) return output;
      arr.forEach(function(item) {
        item = String(item || "").trim();
        if (item && !seen[item]) {
          seen[item] = true;
          output.push(item);
        }
      });
      return output;
    }

    function normalizeDatabase(raw) {
      raw = raw || {};
      var categories = {};
      var knownItems = {};
      var inputCategories = raw.categories || {};

      Object.keys(inputCategories).forEach(function(cat) {
        var cleanCat = String(cat || "").trim();
        if (!cleanCat || !Array.isArray(inputCategories[cat])) return;
        categories[cleanCat] = uniqueStrings(inputCategories[cat]);
        categories[cleanCat].forEach(function(item) {
          knownItems[item] = true;
        });
      });

      var weightItems = uniqueStrings(raw.weightItems || []).filter(function(item) {
        return !!knownItems[item];
      });

      var itemMappings = {};
      var inputMappings = raw.itemMappings || {};
      Object.keys(inputMappings).forEach(function(item) {
        var cleanItem = String(item || "").trim();
        var cleanMapping = String(inputMappings[item] || "").trim();
        if (cleanItem && cleanMapping && knownItems[cleanItem]) itemMappings[cleanItem] = cleanMapping;
      });

      return {
        categories: categories,
        weightItems: weightItems,
        itemMappings: itemMappings,
        updatedAt: raw.updatedAt || new Date().toISOString()
      };
    }

    if (action === 'loadDB') {
      var dbStr = configSheet.getRange("Z1").getValue() || '{}';
      var database = {};
      try {
        database = normalizeDatabase(JSON.parse(dbStr));
      } catch(ex) {}
      return json({ status: 'success', database: database });
    }

    if (action === 'saveDB') {
      var masterDatabase = normalizeDatabase(data.database || {});
      configSheet.getRange("Z1").setValue(JSON.stringify(masterDatabase));
      return json({ status: 'success', database: masterDatabase });
    }

    function isValidNumber(val) {
      var num = parseFloat(val);
      return typeof num === "number" && !isNaN(num);
    }

    // =========================
    // 🟢 โหมด ORDER (สั่งของ)
    // =========================
    if (action === "order") {
      if (!sheet) return json({ status: "error", message: "ไม่พบชีทเดือน " + currentMonth });
      var lineToken = "4VEgaL31by4Jb2sl3DNv7r7rVG88J/KFwryrqwbSVmi+Qyo9NNj+aarfTXYbwFF2e4XkFqRgGAyYbhtJZl6/FeG04q28sUhMIc+lKvaBvpr2WbRNuu1Hs394jtvaSvhf35nLqYv6lQgnhkPI7UpLOQdB04t89/1O/w1cDnyilFU=";
      var targetId = "C12caad9659b713f06920389252e9e027";
      var cartData = data.qtyData || {};
      var categories = data.categories || {};
      var message = "📦 รายการสั่งของ Big C (" + Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy") + ")\n";
      var hasItem = false;

      for (var cat in categories) {
        var section = "";
        categories[cat].forEach(function(item) {
          if (isValidNumber(cartData[item]) && cartData[item] > 0) {
            section += "- " + item + " x " + cartData[item] + "\n";
            hasItem = true;
          }
        });
        if (section) message += "\n" + cat + "\n" + section;
      }

      if (hasItem) sendLine(message, lineToken, targetId);
      configSheet.getRange("Z2").clearContent(); // ล้างร่าง
      return json({ status: "success" });
    }

    // =========================
    // 🟢 โหมด RECEIVE / RETURN (รับ/คืนสินค้า)
    // =========================
    if (action === "receive" || action === "return") {
      if (!sheet) return json({ status: "error", message: "ไม่พบชีทเดือน " + currentMonth });
      var formattedDate = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy");

      if (action === "return") {
        var cash = parseFloat(data.cash);
        var transfer = parseFloat(data.transfer);
        var hasCash = isValidNumber(cash);
        var hasTransfer = isValidNumber(transfer);

        if (hasCash || hasTransfer) {
          var day = new Date().getDate();
          var row = day + 4;
          sheet.getRange(row, 2, 1, 3).setValues([[formattedDate, hasCash ? cash : 0, hasTransfer ? transfer : 0]]);
        }
      }

      var items = data.qtyData || {};
      var rows = [];

      for (var k in items) {
        var value = parseFloat(items[k]);
        if (!isValidNumber(value) || value === 0) continue;

        var name = k, unit = "";
        var match = k.match(/(.*?)\s*\((.*?)\)$/);
        if (match) { name = match[1].trim(); unit = match[2].trim(); }
        rows.push([formattedDate, name, unit, (action === "return" ? -value : value)]);
      }

      if (rows.length > 0) {
        var startRow = 18;
        var maxRows = Math.max(1, sheet.getLastRow() - startRow + 5);
        var values = sheet.getRange(startRow, 9, maxRows, 1).getValues();
        var targetRow = startRow;

        for (var i = 0; i < values.length; i++) {
          if (!values[i][0] || String(values[i][0]).trim() === "") {
            targetRow = startRow + i;
            break;
          }
        }
        sheet.getRange(targetRow, 9, rows.length, 4).setValues(rows);
      }
      
      configSheet.getRange("Z2").clearContent(); // ล้างร่าง
      return json({ status: "success" });
    }

  } catch (err) {
    return json({ status: "error", message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function sendLine(message, token, userId) {
  var payload = { to: userId, messages: [{ type: "text", text: message }] };
  var options = { method: "post", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, payload: JSON.stringify(payload), muteHttpExceptions: true };
  var lastError = "";
  for (var i = 0; i < 3; i++) { 
    try {
      var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", options);
      var code = res.getResponseCode();
      if (code === 200) return;
      lastError = "LINE API " + code + ": " + (res.getContentText() || "").substring(0, 200);
    } catch (e) {
      lastError = e.toString();
    }
    if (i < 2) Utilities.sleep(1000 * (i + 1));
  }
  throw new Error("ส่ง LINE ไม่สำเร็จหลังจากพยายาม 3 ครั้ง: " + lastError);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
