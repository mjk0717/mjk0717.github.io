"use strict";
(() => {
  // src/util.ts
  var idCounter = 0;
  function nextId(prefix) {
    idCounter += 1;
    return prefix + "_" + Date.now().toString(36) + "_" + idCounter.toString(36);
  }
  function escapeHtml(str) {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => map[c]);
  }
  function debounce(fn, wait) {
    let t = null;
    return function(...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }
  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }
  function closest(el2, predicate) {
    let cur = el2;
    while (cur) {
      if (predicate(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  function downloadText(text, filename, mime) {
    const blob = new Blob([text], { type: mime || "application/json" });
    const url = URL.createObjectURL(blob);
    downloadDataUrl(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch (e) {
    }
    document.body.removeChild(ta);
  }
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file, "utf-8");
    });
  }
  var ORACLE_TYPES = [
    "VARCHAR2(50)",
    "VARCHAR2(100)",
    "VARCHAR2(200)",
    "VARCHAR2(4000)",
    "NUMBER",
    "NUMBER(10)",
    "NUMBER(10,2)",
    "NUMBER(1)",
    "CHAR(1)",
    "DATE",
    "TIMESTAMP",
    "CLOB",
    "BLOB",
    "INTEGER",
    "FLOAT",
    "RAW(16)",
    "NVARCHAR2(100)"
  ];
  var ANSI_TYPES = [
    "VARCHAR(50)",
    "VARCHAR(100)",
    "VARCHAR(200)",
    "VARCHAR(4000)",
    "CHARACTER VARYING(255)",
    "CHAR(1)",
    "NCHAR(1)",
    "NVARCHAR(100)",
    "INTEGER",
    "SMALLINT",
    "BIGINT",
    "NUMERIC",
    "NUMERIC(10)",
    "NUMERIC(10,2)",
    "DECIMAL(10,2)",
    "FLOAT",
    "REAL",
    "DOUBLE PRECISION",
    "BOOLEAN",
    "DATE",
    "TIME",
    "TIMESTAMP",
    "TIMESTAMP WITH TIME ZONE",
    "CLOB",
    "BLOB"
  ];
  function dataTypeSuggestions(mode) {
    return mode === "logical" ? ANSI_TYPES : ORACLE_TYPES;
  }

  // src/columnTypes.ts
  function legacyType(col) {
    return col.dataType || col.physicalDataType || col.logicalDataType || "";
  }
  function logicalDataType(col) {
    return col.logicalDataType || legacyType(col);
  }
  function physicalDataType(col) {
    return col.physicalDataType || legacyType(col);
  }
  function displayDataType(col, mode) {
    return mode === "logical" ? logicalDataType(col) : physicalDataType(col);
  }
  function setLogicalDataType(col, value) {
    col.logicalDataType = value;
    if (!col.physicalDataType && !col.dataType) col.dataType = value;
  }
  function setPhysicalDataType(col, value) {
    col.physicalDataType = value;
    col.dataType = value;
    if (!col.logicalDataType) col.logicalDataType = value;
  }
  function normalizeDataTypes(col) {
    const physical = physicalDataType(col);
    const logical = logicalDataType(col);
    col.physicalDataType = physical;
    col.logicalDataType = logical;
    col.dataType = physical;
    return col;
  }
  function copyDataTypes(from, to) {
    to.logicalDataType = logicalDataType(from);
    to.physicalDataType = physicalDataType(from);
    to.dataType = physicalDataType(from);
  }

  // src/state.ts
  var listeners = {};
  function on(evt, cb) {
    (listeners[evt] = listeners[evt] || []).push(cb);
  }
  function off(evt, cb) {
    if (listeners[evt]) listeners[evt] = listeners[evt].filter((f) => f !== cb);
  }
  function emit(evt) {
    (listeners[evt] || []).slice().forEach((cb) => cb());
  }
  var data = {
    entities: [],
    relations: [],
    systemColumns: [],
    view: { scale: 1, x: 0, y: 0 },
    selected: null,
    selectedEntityIds: [],
    designMode: "logical",
    lineStyle: "curved",
    minimapVisible: true
  };
  var STORAGE_KEY = "erd_tool_state_v1";
  function persist() {
    try {
      const payload = {
        entities: data.entities,
        relations: data.relations,
        systemColumns: data.systemColumns,
        view: data.view,
        designMode: data.designMode,
        lineStyle: data.lineStyle,
        minimapVisible: data.minimapVisible
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
    }
  }
  var persistDebounced = debounce(persist, 400);
  function notify(evt = "change") {
    emit(evt);
    persistDebounced();
  }
  function load() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      data.entities = parsed.entities || [];
      data.entities.forEach((entity) => entity.columns.forEach(normalizeDataTypes));
      data.relations = parsed.relations || [];
      data.systemColumns = (parsed.systemColumns || []).map(normalizeDataTypes);
      data.view = parsed.view || { scale: 1, x: 0, y: 0 };
      data.designMode = parsed.designMode || "logical";
      data.lineStyle = parsed.lineStyle || "curved";
      data.minimapVisible = parsed.minimapVisible !== false;
      return true;
    } catch (e) {
      return false;
    }
  }
  function replaceAll(next) {
    data.entities = next.entities || [];
    data.entities.forEach((entity) => entity.columns.forEach(normalizeDataTypes));
    data.relations = next.relations || [];
    data.systemColumns = (next.systemColumns || []).map(normalizeDataTypes);
    data.view = next.view || { scale: 1, x: 0, y: 0 };
    data.designMode = next.designMode || "logical";
    data.lineStyle = next.lineStyle || "curved";
    data.minimapVisible = next.minimapVisible !== false;
    data.selected = null;
    data.selectedEntityIds = [];
    notify("change");
  }
  function setDesignMode(mode) {
    data.designMode = mode;
    notify("change");
  }
  function setLineStyle(lineStyle) {
    data.lineStyle = lineStyle;
    notify("change");
  }
  function toggleMinimap() {
    data.minimapVisible = !data.minimapVisible;
    notify("change");
  }
  function nextEntityPosition() {
    const n = data.entities.length;
    return { x: 60 + n % 4 * 280, y: 60 + Math.floor(n / 4) * 240 };
  }
  function getEntity(id) {
    return data.entities.find((e) => e.id === id);
  }
  function addEntity(entity) {
    entity.columns.forEach(normalizeDataTypes);
    data.entities.push(entity);
    notify("change");
    return entity;
  }
  function updateEntity(id, patch) {
    const e = getEntity(id);
    if (!e) return;
    Object.assign(e, patch);
    notify("change");
  }
  function removeEntity(id) {
    data.entities = data.entities.filter((e) => e.id !== id);
    data.relations = data.relations.filter((r) => r.sourceEntityId !== id && r.targetEntityId !== id);
    notify("change");
  }
  function moveEntity(id, x, y) {
    const e = getEntity(id);
    if (!e) return;
    e.x = x;
    e.y = y;
    notify("move");
  }
  function moveEntities(moves) {
    moves.forEach((m) => {
      const e = getEntity(m.id);
      if (e) {
        e.x = m.x;
        e.y = m.y;
      }
    });
    notify("move");
  }
  function getColumn(entityId, colId) {
    const e = getEntity(entityId);
    if (!e) return null;
    return e.columns.find((c) => c.id === colId) || null;
  }
  function addColumn(entityId, column) {
    const e = getEntity(entityId);
    if (!e) return null;
    normalizeDataTypes(column);
    if (column.isSystem) {
      e.columns.push(column);
    } else if (column.pk) {
      let insertAt = 0;
      e.columns.forEach((c, i) => {
        if (c.pk) insertAt = i + 1;
      });
      e.columns.splice(insertAt, 0, column);
    } else {
      const firstSystemIdx = e.columns.findIndex((c) => c.isSystem);
      if (firstSystemIdx === -1) e.columns.push(column);
      else e.columns.splice(firstSystemIdx, 0, column);
    }
    notify("change");
    return column;
  }
  function updateColumn(entityId, colId, patch) {
    const c = getColumn(entityId, colId);
    if (!c) return;
    Object.assign(c, patch);
    notify("change");
  }
  function removeColumn(entityId, colId) {
    const e = getEntity(entityId);
    if (!e) return;
    e.columns = e.columns.filter((c) => c.id !== colId);
    data.relations = data.relations.map((r) => ({ ...r, columnPairs: r.columnPairs.filter((p) => p.sourceColumnId !== colId && p.targetColumnId !== colId) })).filter((r) => r.columnPairs.length > 0);
    notify("change");
  }
  function reorderColumns(entityId, orderedIds) {
    const e = getEntity(entityId);
    if (!e) return;
    const map = new Map(e.columns.map((c) => [c.id, c]));
    const next = orderedIds.map((id) => map.get(id)).filter((c) => !!c);
    e.columns.forEach((c) => {
      if (next.indexOf(c) === -1) next.push(c);
    });
    e.columns = next;
    notify("change");
  }
  function getRelation(id) {
    return data.relations.find((r) => r.id === id);
  }
  function addRelation(relation) {
    data.relations.push(relation);
    notify("change");
    return relation;
  }
  function updateRelation(id, patch) {
    const r = getRelation(id);
    if (!r) return;
    Object.assign(r, patch);
    notify("change");
  }
  function removeRelation(id) {
    data.relations = data.relations.filter((r) => r.id !== id);
    notify("change");
  }
  function relationExists(sourceColumnId, targetColumnId) {
    return data.relations.some((r) => r.columnPairs.some((p) => p.sourceColumnId === sourceColumnId && p.targetColumnId === targetColumnId));
  }
  function relationExistsWithPairs(pairs) {
    const key = (p) => p.sourceColumnId + "::" + p.targetColumnId;
    const candidateKeys = new Set(pairs.map(key));
    return data.relations.some((r) => {
      if (r.columnPairs.length !== pairs.length) return false;
      return r.columnPairs.every((p) => candidateKeys.has(key(p)));
    });
  }
  function applySystemColumnsToEntity(e) {
    data.systemColumns.forEach((def) => {
      normalizeDataTypes(def);
      const col = e.columns.find((c) => c.systemColId === def.id);
      if (col) {
        col.name = def.name;
        copyDataTypes(def, col);
        col.comment = def.comment;
        col.defaultValue = def.defaultValue || "";
      } else {
        e.columns.push({
          id: nextId("col"),
          name: def.name,
          dataType: def.dataType,
          comment: def.comment,
          logicalDataType: def.logicalDataType || def.dataType,
          physicalDataType: def.physicalDataType || def.dataType,
          defaultValue: def.defaultValue || "",
          pk: false,
          fk: false,
          nullable: true,
          isSystem: true,
          systemColId: def.id
        });
      }
    });
  }
  function setSystemColumns(list) {
    const prevIds = data.systemColumns.map((c) => c.id);
    const nextIds = [];
    list.forEach((def) => {
      if (!def.id) def.id = nextId("sysdef");
      normalizeDataTypes(def);
      nextIds.push(def.id);
    });
    prevIds.forEach((id) => {
      if (nextIds.indexOf(id) === -1) {
        data.entities.forEach((e) => {
          e.columns = e.columns.filter((c) => c.systemColId !== id);
        });
      }
    });
    data.systemColumns = list;
    data.entities.forEach(applySystemColumnsToEntity);
    notify("change");
  }
  function select(type, id) {
    data.selected = { type, id };
    data.selectedEntityIds = type === "entity" ? [id] : [];
    emit("select");
  }
  function toggleEntitySelection(id) {
    const idx = data.selectedEntityIds.indexOf(id);
    if (idx === -1) {
      data.selectedEntityIds.push(id);
      data.selected = { type: "entity", id };
    } else {
      data.selectedEntityIds.splice(idx, 1);
      const last = data.selectedEntityIds[data.selectedEntityIds.length - 1];
      data.selected = last ? { type: "entity", id: last } : null;
    }
    emit("select");
  }
  function isEntitySelected(id) {
    return data.selectedEntityIds.indexOf(id) !== -1;
  }
  function selectEntities(ids) {
    data.selectedEntityIds = ids.slice();
    data.selected = ids.length ? { type: "entity", id: ids[ids.length - 1] } : null;
    emit("select");
  }
  function setHeaderColorForEntities(ids, color) {
    ids.forEach((id) => {
      const e = getEntity(id);
      if (e) e.headerColor = color;
    });
    notify("change");
  }
  function clearSelection() {
    data.selected = null;
    data.selectedEntityIds = [];
    emit("select");
  }
  var state = {
    data,
    on,
    off,
    emit: notify,
    load,
    persist,
    replaceAll,
    select,
    clearSelection,
    toggleEntitySelection,
    isEntitySelected,
    selectEntities,
    setHeaderColorForEntities,
    setDesignMode,
    setLineStyle,
    toggleMinimap,
    nextEntityPosition,
    addEntity,
    getEntity,
    updateEntity,
    removeEntity,
    moveEntity,
    moveEntities,
    getColumn,
    addColumn,
    updateColumn,
    removeColumn,
    reorderColumns,
    addRelation,
    getRelation,
    updateRelation,
    removeRelation,
    relationExists,
    relationExistsWithPairs,
    setSystemColumns,
    applySystemColumnsToEntity
  };

  // src/theme.ts
  var theme = {
    entityWidth: 240,
    headerHeight: 32,
    rowHeight: 26,
    colors: {
      headerBg: "#2d6cdf",
      headerText: "#ffffff",
      bodyBg: "#ffffff",
      border: "#94a3b8",
      rowAlt: "#f8fafc",
      pkBg: "#eef2ff",
      systemBg: "#fff6cc",
      systemText: "#7a5b00",
      text: "#1e293b",
      subtext: "#64748b",
      relationStroke: "#64748b",
      relationStrokeHover: "#2563eb",
      relationLabelBg: "#ffffff",
      selected: "#2563eb"
    },
    fontFamily: '"Segoe UI", Arial, sans-serif'
  };
  var HEADER_COLOR_PALETTE = [
    "#2d6cdf",
    "#dc2626",
    "#d97706",
    "#16a34a",
    "#0891b2",
    "#7c3aed",
    "#db2777",
    "#475569"
  ];

  // src/search.ts
  var inputEl = null;
  var active = false;
  var query = "";
  var listeners2 = [];
  function normalized(value) {
    return String(value == null ? "" : value).toLowerCase();
  }
  function includesQuery(values) {
    const q = normalized(query.trim());
    if (!q) return false;
    return values.some((value) => normalized(value).indexOf(q) !== -1);
  }
  function notify2() {
    listeners2.slice().forEach((listener) => listener());
  }
  function onChange(listener) {
    listeners2.push(listener);
  }
  function isActive() {
    return active;
  }
  function matchesEntity(entity) {
    const values = [entity.name, entity.comment];
    entity.columns.forEach((col) => values.push(col.name, col.comment, col.dataType, logicalDataType(col), physicalDataType(col)));
    return includesQuery(values);
  }
  function matchesRelation(relation) {
    const source = state.getEntity(relation.sourceEntityId);
    const target = state.getEntity(relation.targetEntityId);
    const sourceCols = relation.columnPairs.map((pair) => source && source.columns.find((col) => col.id === pair.sourceColumnId));
    const targetCols = relation.columnPairs.map((pair) => target && target.columns.find((col) => col.id === pair.targetColumnId));
    const values = [
      relation.name,
      relation.logicalName,
      source && source.name,
      source && source.comment,
      target && target.name,
      target && target.comment
    ];
    sourceCols.forEach((col) => {
      if (col) values.push(col.name, col.comment, col.dataType, logicalDataType(col), physicalDataType(col));
    });
    targetCols.forEach((col) => {
      if (col) values.push(col.name, col.comment, col.dataType, logicalDataType(col), physicalDataType(col));
    });
    return includesQuery(values);
  }
  function focus() {
    if (!inputEl) return;
    inputEl.focus();
    inputEl.select();
  }
  function init() {
    inputEl = document.getElementById("global-search-input");
    if (!inputEl) return;
    inputEl.addEventListener("focus", () => {
      active = true;
      notify2();
    });
    inputEl.addEventListener("blur", () => {
      active = false;
      notify2();
    });
    inputEl.addEventListener("input", () => {
      query = inputEl ? inputEl.value : "";
      notify2();
    });
    inputEl.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (inputEl.value) {
        inputEl.value = "";
        query = "";
        notify2();
      } else {
        inputEl.blur();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "f") return;
      e.preventDefault();
      focus();
    }, true);
  }
  var search = { init, onChange, isActive, matchesEntity, matchesRelation, focus };

  // src/entityRenderer.ts
  var layerEl;
  var nodeMap = /* @__PURE__ */ new Map();
  function entityHeight(entity) {
    return theme.headerHeight + entity.columns.length * theme.rowHeight;
  }
  function getEntityBox(id) {
    const e = state.getEntity(id);
    if (!e) return null;
    return { x: e.x, y: e.y, w: theme.entityWidth, h: entityHeight(e) };
  }
  function getColumnRowCenter(entityId, colId) {
    const e = state.getEntity(entityId);
    if (!e) return null;
    const idx = e.columns.findIndex((c) => c.id === colId);
    if (idx === -1) return null;
    return {
      x: e.x,
      xRight: e.x + theme.entityWidth,
      y: e.y + theme.headerHeight + idx * theme.rowHeight + theme.rowHeight / 2
    };
  }
  function rowFlag(col) {
    if (col.isSystem) return "S";
    if (col.pk && col.fk) return "P/F";
    if (col.pk) return "PK";
    if (col.fk) return "FK";
    return "";
  }
  function displayEntityName(entity) {
    if (state.data.designMode === "logical" && entity.comment) return entity.comment;
    return entity.name;
  }
  function displayColumnName(col) {
    if (state.data.designMode === "logical" && col.comment) return col.comment;
    return col.name;
  }
  function displayColumnDataType(col) {
    return displayDataType(col, state.data.designMode);
  }
  function rowClass(col, idx) {
    const cls = ["entity-row"];
    if (col.isSystem) cls.push("row-system");
    else if (col.pk) cls.push("row-pk");
    else if (idx % 2 === 1) cls.push("row-alt");
    if (col.fk) cls.push("row-fk");
    return cls.join(" ");
  }
  function rowsSignature(entity) {
    return state.data.designMode + "|" + JSON.stringify(entity.columns.map(
      (c) => [c.id, c.name, c.comment, c.dataType, c.logicalDataType, c.physicalDataType, c.pk, c.fk, c.nullable, c.isSystem]
    ));
  }
  function buildEntityNode(entity) {
    const node = document.createElement("div");
    node.className = "entity";
    node.dataset.entityId = entity.id;
    node.innerHTML = '<div class="entity-header" title="' + escapeHtml(entity.name) + (entity.comment ? " - " + escapeHtml(entity.comment) : "") + '"><span class="entity-name"></span></div><div class="entity-body"></div>';
    return node;
  }
  function updateEntityNode(node, entity) {
    node.style.left = entity.x + "px";
    node.style.top = entity.y + "px";
    node.style.width = theme.entityWidth + "px";
    const header = node.querySelector(".entity-header");
    header.title = entity.name + (entity.comment ? " - " + entity.comment : "");
    header.style.background = entity.headerColor || theme.colors.headerBg;
    header.querySelector(".entity-name").textContent = displayEntityName(entity);
    const body = node.querySelector(".entity-body");
    const sig = rowsSignature(entity);
    if (body.dataset.rowsSig !== sig) {
      body.dataset.rowsSig = sig;
      body.innerHTML = "";
      entity.columns.forEach((col, idx) => {
        const row = document.createElement("div");
        row.className = rowClass(col, idx);
        row.dataset.colId = col.id;
        row.dataset.entityId = entity.id;
        row.title = col.name + " : " + displayColumnDataType(col) + " " + (col.nullable ? "NULL" : "NOT NULL") + (logicalDataType(col) !== physicalDataType(col) ? "\nLogical: " + logicalDataType(col) + "\nPhysical: " + physicalDataType(col) : "") + (col.comment ? "\n" + col.comment : "");
        row.innerHTML = '<span class="row-flag">' + rowFlag(col) + '</span><span class="row-name">' + escapeHtml(displayColumnName(col)) + '</span><span class="row-type">' + escapeHtml(displayColumnDataType(col)) + (col.nullable ? "" : '<span class="not-null-mark" title="NOT NULL">*</span>') + "</span>";
        body.appendChild(row);
      });
    }
    const hlIds = highlightedColumnIds(entity.id);
    Array.prototype.forEach.call(body.children, (row) => {
      const colId = row.dataset.colId;
      row.classList.toggle("row-highlighted", !!colId && hlIds.has(colId));
    });
    node.classList.toggle("selected", state.isEntitySelected(entity.id));
    node.classList.toggle("search-dimmed", search.isActive() && !search.matchesEntity(entity));
  }
  function highlightedColumnIds(entityId) {
    const ids = /* @__PURE__ */ new Set();
    const selected = state.data.selected;
    if (selected && selected.type === "relation") {
      const relation = state.getRelation(selected.id);
      if (relation) {
        relation.columnPairs.forEach((p) => {
          if (relation.sourceEntityId === entityId) ids.add(p.sourceColumnId);
          if (relation.targetEntityId === entityId) ids.add(p.targetColumnId);
        });
      }
      return ids;
    }
    const selectedEntityIds = new Set(state.data.selectedEntityIds);
    if (!selectedEntityIds.size) return ids;
    state.data.relations.forEach((relation) => {
      if (!selectedEntityIds.has(relation.sourceEntityId) && !selectedEntityIds.has(relation.targetEntityId)) return;
      relation.columnPairs.forEach((p) => {
        if (relation.sourceEntityId === entityId) ids.add(p.sourceColumnId);
        if (relation.targetEntityId === entityId) ids.add(p.targetColumnId);
      });
    });
    return ids;
  }
  function render() {
    const entities = state.data.entities;
    const seen = /* @__PURE__ */ new Set();
    entities.forEach((entity) => {
      seen.add(entity.id);
      let node = nodeMap.get(entity.id);
      if (!node) {
        node = buildEntityNode(entity);
        nodeMap.set(entity.id, node);
        layerEl.appendChild(node);
      }
      updateEntityNode(node, entity);
    });
    nodeMap.forEach((node, id) => {
      if (!seen.has(id)) {
        node.remove();
        nodeMap.delete(id);
      }
    });
  }
  function init2(layer) {
    layerEl = layer;
    state.on("change", render);
    state.on("move", render);
    state.on("select", render);
    search.onChange(render);
    render();
  }
  var entityRenderer = {
    init: init2,
    render,
    entityHeight,
    getEntityBox,
    getColumnRowCenter,
    displayName: displayEntityName,
    displayColumnName,
    displayColumnDataType
  };

  // src/viewport.ts
  var FIT_MARGIN = 60;
  var viewportEl;
  var transformEl;
  var panning = false;
  var panStart = null;
  var viewStart = null;
  var movedDuringPan = false;
  var suppressNextClick = false;
  var viewChangeListeners = [];
  function onViewChange(cb) {
    viewChangeListeners.push(cb);
  }
  function view() {
    return state.data.view;
  }
  function applyTransform() {
    const v = view();
    transformEl.style.transform = "translate(" + v.x + "px," + v.y + "px) scale(" + v.scale + ")";
    viewChangeListeners.slice().forEach((cb) => cb());
  }
  function visibleWorldRect() {
    const v = view();
    const w = viewportEl.clientWidth, h = viewportEl.clientHeight;
    return { x: -v.x / v.scale, y: -v.y / v.scale, w: w / v.scale, h: h / v.scale };
  }
  function centerOnWorld(wx, wy) {
    const v = view();
    v.x = viewportEl.clientWidth / 2 - wx * v.scale;
    v.y = viewportEl.clientHeight / 2 - wy * v.scale;
    applyTransform();
    state.persist();
  }
  function screenToWorld(clientX, clientY) {
    const rect = viewportEl.getBoundingClientRect();
    const v = view();
    const sx = clientX - rect.left, sy = clientY - rect.top;
    return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
  }
  function onWheel(e) {
    e.preventDefault();
    const rect = viewportEl.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const v = view();
    const prevScale = v.scale;
    const factor = Math.exp(-e.deltaY * 1e-3);
    const newScale = clamp(prevScale * factor, 0.3, 2.5);
    const wx = (mx - v.x) / prevScale, wy = (my - v.y) / prevScale;
    v.x = mx - wx * newScale;
    v.y = my - wy * newScale;
    v.scale = newScale;
    applyTransform();
    state.persist();
  }
  function onPanStart(e) {
    if (e.button !== 0) return;
    if (closest(e.target, (el2) => el2.classList && el2.classList.contains("entity"))) return;
    panning = true;
    panStart = { x: e.clientX, y: e.clientY };
    viewStart = { x: view().x, y: view().y };
    movedDuringPan = false;
    viewportEl.classList.add("panning");
    document.addEventListener("mousemove", onPanMove);
    document.addEventListener("mouseup", onPanEnd);
  }
  function onPanMove(e) {
    if (!panning || !panStart || !viewStart) return;
    if (Math.abs(e.clientX - panStart.x) > 2 || Math.abs(e.clientY - panStart.y) > 2) movedDuringPan = true;
    view().x = viewStart.x + (e.clientX - panStart.x);
    view().y = viewStart.y + (e.clientY - panStart.y);
    applyTransform();
  }
  function onPanEnd() {
    suppressNextClick = movedDuringPan;
    panning = false;
    viewportEl.classList.remove("panning");
    document.removeEventListener("mousemove", onPanMove);
    document.removeEventListener("mouseup", onPanEnd);
    state.persist();
  }
  function onClickAfterPan(e) {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  function resetView() {
    const v = view();
    const entities = state.data.entities;
    if (!entities.length) {
      v.x = 0;
      v.y = 0;
      v.scale = 1;
      applyTransform();
      state.persist();
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    entities.forEach((e) => {
      const box = entityRenderer.getEntityBox(e.id);
      if (!box) return;
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.w);
      maxY = Math.max(maxY, box.y + box.h);
    });
    const contentW = Math.max(maxX - minX, 1);
    const contentH = Math.max(maxY - minY, 1);
    const viewportW = viewportEl.clientWidth;
    const viewportH = viewportEl.clientHeight;
    const scale = clamp(Math.min((viewportW - FIT_MARGIN * 2) / contentW, (viewportH - FIT_MARGIN * 2) / contentH), 0.2, 1.5);
    v.scale = scale;
    v.x = (viewportW - contentW * scale) / 2 - minX * scale;
    v.y = (viewportH - contentH * scale) / 2 - minY * scale;
    applyTransform();
    state.persist();
  }
  function init3(viewport2, transform) {
    viewportEl = viewport2;
    transformEl = transform;
    viewportEl.addEventListener("wheel", onWheel, { passive: false });
    viewportEl.addEventListener("mousedown", onPanStart);
    viewportEl.addEventListener("click", onClickAfterPan, true);
    applyTransform();
  }
  var viewport = { init: init3, applyTransform, screenToWorld, resetView, onViewChange, visibleWorldRect, centerOnWorld };

  // src/modal.ts
  var current = null;
  function close() {
    if (!current) return;
    if (current.onClose) current.onClose();
    current.overlay.remove();
    document.removeEventListener("keydown", onKeydown);
    current = null;
  }
  function onKeydown(e) {
    if (e.key === "Escape") close();
  }
  function makeDraggable(header, box) {
    header.addEventListener("mousedown", (e) => {
      if (e.target.closest(".modal-close")) return;
      e.preventDefault();
      const rect = box.getBoundingClientRect();
      box.style.position = "fixed";
      box.style.left = rect.left + "px";
      box.style.top = rect.top + "px";
      box.style.margin = "0";
      const startX = e.clientX, startY = e.clientY;
      const originLeft = rect.left, originTop = rect.top;
      function onMove(ev) {
        box.style.left = originLeft + ev.clientX - startX + "px";
        box.style.top = originTop + ev.clientY - startY + "px";
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }
  function open(opts) {
    if (current) close();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const box = document.createElement("div");
    box.className = "modal-box";
    if (opts.width) box.style.width = opts.width;
    if (opts.body && opts.body.querySelector(".wizard-steps")) box.classList.add("modal-wizard");
    const header = document.createElement("div");
    header.className = "modal-header";
    header.innerHTML = '<span class="modal-title">' + escapeHtml(opts.title || "") + '</span><button type="button" class="modal-close" aria-label="Close">\u2715</button>';
    const body = document.createElement("div");
    body.className = "modal-body";
    if (opts.body) body.appendChild(opts.body);
    const footer = document.createElement("div");
    footer.className = "modal-footer";
    buildFooterButtons(footer, opts.actions || []);
    box.appendChild(header);
    box.appendChild(body);
    if ((opts.actions || []).length) box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    header.querySelector(".modal-close").addEventListener("click", close);
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", onKeydown);
    makeDraggable(header, box);
    current = { overlay, box, body, onClose: opts.onClose };
    return { close, root: overlay, body };
  }
  function buildFooterButtons(footer, actions) {
    footer.innerHTML = "";
    actions.forEach((action) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn" + (action.variant ? " btn-" + action.variant : "");
      btn.textContent = action.label;
      btn.addEventListener("click", () => action.onClick && action.onClick());
      footer.appendChild(btn);
    });
  }
  function syncFooter(box, actions) {
    let footer = box.querySelector(".modal-footer");
    if (!actions.length) {
      if (footer) footer.remove();
      return;
    }
    if (!footer) {
      footer = document.createElement("div");
      footer.className = "modal-footer";
      box.appendChild(footer);
    }
    buildFooterButtons(footer, actions);
  }
  function transition(opts, _direction) {
    if (!current) return open(opts);
    const box = current.box;
    const bodyEl = current.body;
    const titleEl = box.querySelector(".modal-title");
    const oldHeight = bodyEl.getBoundingClientRect().height;
    if (opts.width) box.style.width = opts.width;
    if (titleEl) titleEl.textContent = opts.title || "";
    if (opts.body.querySelector(".wizard-steps")) box.classList.add("modal-wizard");
    bodyEl.innerHTML = "";
    bodyEl.appendChild(opts.body);
    syncFooter(box, opts.actions || []);
    const newHeight = bodyEl.getBoundingClientRect().height;
    if (Math.round(oldHeight) !== Math.round(newHeight)) {
      bodyEl.style.height = oldHeight + "px";
      bodyEl.classList.add("modal-body-resizing");
      void bodyEl.offsetWidth;
      let done = false;
      const finish = (e) => {
        if (done || e && e.propertyName !== "height") return;
        done = true;
        bodyEl.classList.remove("modal-body-resizing");
        bodyEl.style.height = "";
        bodyEl.removeEventListener("transitionend", finish);
      };
      bodyEl.addEventListener("transitionend", finish);
      setTimeout(finish, 260);
      requestAnimationFrame(() => {
        bodyEl.style.height = newHeight + "px";
      });
    }
    current.onClose = opts.onClose;
    return { close, root: current.overlay, body: bodyEl };
  }
  var modal = { open, close, transition };

  // src/cardinality.ts
  var CARDINALITY_GROUPS = [
    {
      label: "One",
      options: [
        { value: "one", label: "One" },
        { value: "zero-or-one", label: "Zero or One" }
      ]
    },
    {
      label: "Many",
      options: [
        { value: "many", label: "Many" },
        { value: "zero-or-many", label: "Zero or Many" },
        { value: "one-or-many", label: "One or Many" }
      ]
    }
  ];
  var DEFAULT_SOURCE_CARDINALITY = "one-or-many";
  var DEFAULT_TARGET_CARDINALITY = "one";
  function sourceCardinalityOf(c) {
    return c.sourceCardinality || DEFAULT_SOURCE_CARDINALITY;
  }
  function targetCardinalityOf(c) {
    return c.targetCardinality || DEFAULT_TARGET_CARDINALITY;
  }

  // src/modalRelation.ts
  function cardinalitySelectHtml(className, selected) {
    const groups = CARDINALITY_GROUPS.map((group) => {
      const options = group.options.map(
        (o) => '<option value="' + o.value + '"' + (o.value === selected ? " selected" : "") + ">" + o.label + "</option>"
      ).join("");
      return '<optgroup label="' + group.label + '">' + options + "</optgroup>";
    }).join("");
    return '<label>Cardinality<br><select class="' + className + '">' + groups + "</select></label>";
  }
  function defaultTargetColumnIds(entity) {
    const pks = entity.columns.filter((c) => c.pk);
    if (pks.length) return pks.map((c) => c.id);
    return entity.columns[0] ? [entity.columns[0].id] : [];
  }
  function previewLine(sourceEntity, targetColumn, targetEntityName) {
    const plan = relationInteraction.planFkColumn(sourceEntity.id, targetColumn, targetEntityName);
    if (!plan.isNew) return 'Existing column "' + plan.name + '" on ' + sourceEntity.name + " will be marked as FK (non-identifying) - no change to its position or PK status.";
    return 'New FK column "' + plan.name + '" (' + displayDataType(targetColumn, state.data.designMode) + ") will be added to " + sourceEntity.name + " as part of its primary key.";
  }
  function targetChecklistHtml(entity, checkedIds) {
    return entity.columns.map((c) => {
      const flag = c.pk ? " (PK)" : "";
      const checked = checkedIds.indexOf(c.id) !== -1 ? " checked" : "";
      return '<label class="col-check-row"><input type="checkbox" class="f-target-col-check" value="' + c.id + '"' + checked + "> " + escapeHtml(c.name + flag + " - " + displayDataType(c, state.data.designMode)) + "</label>";
    }).join("");
  }
  function existingColumnSelectHtml(entity) {
    return entity.columns.map((c) => {
      const flag = c.pk ? " (PK)" : c.fk ? " (FK)" : "";
      return '<option value="' + c.id + '">' + escapeHtml(c.name + flag + " - " + displayDataType(c, state.data.designMode)) + "</option>";
    }).join("");
  }
  function findMatchingSourceColumn(sourceEntity, targetColumn) {
    return sourceEntity.columns.find((c) => c.name.toUpperCase() === targetColumn.name.toUpperCase()) || null;
  }
  function openCreate(sourceEntityId, targetEntityId) {
    const sourceEntity = state.getEntity(sourceEntityId);
    const targetEntity = state.getEntity(targetEntityId);
    if (!sourceEntity || !targetEntity) return;
    if (!targetEntity.columns.length) {
      window.alert(targetEntity.name + " has no columns to reference.");
      return;
    }
    const body = document.createElement("div");
    body.innerHTML = '<div class="rel-modal-grid"><div><h4>' + escapeHtml(targetEntity.name) + ' <span class="hint">(one)</span></h4><div class="target-col-checklist">' + targetChecklistHtml(targetEntity, defaultTargetColumnIds(targetEntity)) + "</div>" + cardinalitySelectHtml("f-target-card", DEFAULT_TARGET_CARDINALITY) + "</div><div><h4>" + escapeHtml(sourceEntity.name) + ' <span class="hint">(many)</span></h4><div class="fk-mode-choice"><label><input type="radio" name="fk-mode" class="f-fk-mode" value="new" checked> New column(s)</label><label><input type="radio" name="fk-mode" class="f-fk-mode" value="existing"> Existing column(s)</label></div><div class="f-existing-col-mapping" style="display:none"></div>' + cardinalitySelectHtml("f-source-card", DEFAULT_SOURCE_CARDINALITY) + '</div></div><div class="rel-preview"></div><label>Relation name - physical (optional)<br><input type="text" class="f-rel-name" placeholder="e.g. FK_ORDER_CUSTOMER"></label><label>Relation name - logical (optional)<br><input type="text" class="f-rel-logical-name" placeholder="e.g. places"></label>';
    const targetChecks = Array.from(body.querySelectorAll(".f-target-col-check"));
    const fkModeInputs = Array.from(body.querySelectorAll(".f-fk-mode"));
    const mappingWrap = body.querySelector(".f-existing-col-mapping");
    const previewEl = body.querySelector(".rel-preview");
    function fkMode() {
      return fkModeInputs.find((r) => r.checked).value;
    }
    function checkedTargetColumns() {
      return targetChecks.filter((cb) => cb.checked).map((cb) => targetEntity.columns.find((c) => c.id === cb.value)).filter(Boolean);
    }
    function updatePreview() {
      const cols = checkedTargetColumns();
      if (!cols.length) {
        previewEl.textContent = "Select at least one column to reference.";
        return;
      }
      if (fkMode() === "existing") {
        const lines = cols.map((tCol) => {
          const sel = mappingWrap.querySelector('.f-map-col[data-target-col-id="' + tCol.id + '"]');
          const sCol = sel && sourceEntity.columns.find((c) => c.id === sel.value);
          if (!sCol) return "";
          return sCol.pk ? 'Column "' + sCol.name + '" on ' + sourceEntity.name + " will be marked as FK (identifying - already PK, no change to its position)." : 'Column "' + sCol.name + '" on ' + sourceEntity.name + " will be marked as FK (non-identifying) - no change to its position or PK status.";
        });
        previewEl.textContent = lines.filter(Boolean).join("\n");
        return;
      }
      previewEl.textContent = cols.map((c) => previewLine(sourceEntity, c, targetEntity.name)).join("\n");
    }
    function renderMapping() {
      const cols = checkedTargetColumns();
      if (fkMode() !== "existing") {
        mappingWrap.style.display = "none";
        updatePreview();
        return;
      }
      mappingWrap.style.display = "";
      mappingWrap.innerHTML = "";
      cols.forEach((tCol) => {
        const row = document.createElement("label");
        row.innerHTML = escapeHtml(tCol.name) + ' &rarr; <select class="f-map-col" data-target-col-id="' + tCol.id + '">' + existingColumnSelectHtml(sourceEntity) + "</select>";
        const select2 = row.querySelector("select");
        const matched = findMatchingSourceColumn(sourceEntity, tCol);
        if (matched) select2.value = matched.id;
        select2.addEventListener("change", updatePreview);
        mappingWrap.appendChild(row);
      });
      updatePreview();
    }
    function autoSwitchToExistingIfMatched() {
      const cols = checkedTargetColumns();
      const anyMatch = cols.some((tCol) => findMatchingSourceColumn(sourceEntity, tCol));
      if (anyMatch) fkModeInputs.find((r) => r.value === "existing").checked = true;
    }
    targetChecks.forEach((cb) => cb.addEventListener("change", () => {
      autoSwitchToExistingIfMatched();
      renderMapping();
    }));
    fkModeInputs.forEach((r) => r.addEventListener("change", renderMapping));
    autoSwitchToExistingIfMatched();
    renderMapping();
    modal.open({
      title: "New relation",
      width: "660px",
      body,
      actions: [
        { label: "Cancel", onClick: () => modal.close() },
        { label: "Create relation", variant: "primary", onClick: () => {
          const cols = checkedTargetColumns();
          if (!cols.length) {
            window.alert("Select at least one column to reference.");
            return;
          }
          const name = body.querySelector(".f-rel-name").value.trim();
          const logicalName = body.querySelector(".f-rel-logical-name").value.trim();
          const sourceCardinality = body.querySelector(".f-source-card").value;
          const targetCardinality = body.querySelector(".f-target-card").value;
          const targetColumnIds = cols.map((c) => c.id);
          let explicitSourceColumnIds;
          if (fkMode() === "existing") {
            explicitSourceColumnIds = {};
            for (const tCol of cols) {
              const sel = mappingWrap.querySelector('.f-map-col[data-target-col-id="' + tCol.id + '"]');
              explicitSourceColumnIds[tCol.id] = sel.value;
            }
          }
          relationInteraction.commit({
            sourceEntityId,
            targetEntityId,
            targetColumnIds,
            name,
            logicalName,
            sourceCardinality,
            targetCardinality,
            explicitSourceColumnIds
          });
          modal.close();
        } }
      ]
    });
  }
  function openEdit(relationId) {
    const relation = state.getRelation(relationId);
    if (!relation) return;
    const sourceEntity = state.getEntity(relation.sourceEntityId);
    const targetEntity = state.getEntity(relation.targetEntityId);
    if (!sourceEntity || !targetEntity) return;
    const pairsHtml = relation.columnPairs.map((p) => {
      const sCol = sourceEntity.columns.find((c) => c.id === p.sourceColumnId);
      const tCol = targetEntity.columns.find((c) => c.id === p.targetColumnId);
      return "<li>" + escapeHtml(sourceEntity.name) + "." + escapeHtml(sCol ? sCol.name : "?") + " &rarr; " + escapeHtml(targetEntity.name) + "." + escapeHtml(tCol ? tCol.name : "?") + "</li>";
    }).join("");
    const body = document.createElement("div");
    body.innerHTML = '<div class="rel-modal-grid"><div><h4>' + escapeHtml(targetEntity.name) + ' <span class="hint">(one)</span></h4>' + cardinalitySelectHtml("f-target-card", targetCardinalityOf(relation)) + "</div><div><h4>" + escapeHtml(sourceEntity.name) + ' <span class="hint">(many)</span></h4>' + cardinalitySelectHtml("f-source-card", sourceCardinalityOf(relation)) + '</div></div><div class="rel-pairs-readout"><span class="hint">Linked columns</span><ul class="col-ref-list">' + pairsHtml + '</ul></div><label>Relation name - physical (optional)<br><input type="text" class="f-rel-name" value="' + escapeHtml(relation.name || "") + '"></label><label>Relation name - logical (optional)<br><input type="text" class="f-rel-logical-name" value="' + escapeHtml(relation.logicalName || "") + '"></label>';
    modal.open({
      title: "Edit relation",
      width: "620px",
      body,
      actions: [
        { label: "Delete relation", variant: "danger", onClick: () => {
          modal.close();
          relationInteraction.remove(relationId);
        } },
        { label: "Cancel", onClick: () => modal.close() },
        { label: "Save", variant: "primary", onClick: () => {
          const name = body.querySelector(".f-rel-name").value.trim();
          const logicalName = body.querySelector(".f-rel-logical-name").value.trim();
          const sourceCardinality = body.querySelector(".f-source-card").value;
          const targetCardinality = body.querySelector(".f-target-card").value;
          state.updateRelation(relationId, { name, logicalName, sourceCardinality, targetCardinality });
          modal.close();
        } }
      ]
    });
  }
  var modalRelation = { openCreate, openEdit };

  // src/modalEntity.ts
  var draft = null;
  var gridBody;
  var dragIndex = null;
  var dragMoved = false;
  var history = [];
  var historyIndex = -1;
  var refreshAll = null;
  function cloneEntity(e) {
    return JSON.parse(JSON.stringify(e));
  }
  function initHistory() {
    history = [cloneEntity(draft)];
    historyIndex = 0;
  }
  function pushHistory() {
    if (!draft) return;
    history = history.slice(0, historyIndex + 1);
    history.push(cloneEntity(draft));
    historyIndex++;
  }
  function jumpHistory(index2) {
    if (index2 < 0 || index2 >= history.length) return;
    historyIndex = index2;
    draft = cloneEntity(history[index2]);
    if (refreshAll) refreshAll();
  }
  function undo() {
    jumpHistory(historyIndex - 1);
  }
  function redo() {
    jumpHistory(historyIndex + 1);
  }
  function onModalKeydown(e) {
    if (!document.contains(gridBody)) return;
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === "y" || key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && draft) {
      const b = rangeBounds();
      if (!b || b.r0 === b.r1 && b.c0 === b.c1) return;
      e.preventDefault();
      const fields = cellFields();
      for (let r = b.r0; r <= b.r1; r++) {
        const col = draft.columns[r];
        if (!col || col.isSystem) continue;
        for (let c = b.c0; c <= b.c1; c++) setColumnField(col, fields[c], "");
      }
      renderGrid();
      refreshSelectionHighlight();
      pushHistory();
    }
  }
  var selAnchor = null;
  var selFocus = null;
  var isSelecting = false;
  function cellFields() {
    const nameFields = state.data.designMode === "logical" ? ["comment", "name"] : ["name", "comment"];
    return nameFields.concat(["logicalDataType", "physicalDataType", "defaultValue"]);
  }
  function cellClasses() {
    const nameClasses = state.data.designMode === "logical" ? ["f-comment", "f-name"] : ["f-name", "f-comment"];
    return nameClasses.concat(["f-logical-type", "f-physical-type", "f-default"]);
  }
  function newColumn() {
    return {
      id: nextId("col"),
      name: "NEW_COLUMN",
      dataType: "VARCHAR2(50)",
      logicalDataType: "VARCHAR(50)",
      physicalDataType: "VARCHAR2(50)",
      comment: "",
      pk: false,
      fk: false,
      nullable: true,
      isSystem: false,
      systemColId: null
    };
  }
  function setColumnField(col, field, value) {
    if (field === "logicalDataType") setLogicalDataType(col, value);
    else if (field === "physicalDataType") setPhysicalDataType(col, value);
    else col[field] = value;
  }
  function renderRow(col, idx) {
    const tr = document.createElement("tr");
    tr.className = "col-row" + (col.isSystem ? " col-row-system" : "") + (dragIndex === idx ? " dragging" : "");
    const physicalColumnCell = '<td><input type="text" class="f-name" value="' + escapeHtml(col.name) + '" ' + (col.isSystem ? "disabled" : "") + "></td>";
    const logicalColumnCell = '<td><input type="text" class="f-comment" value="' + escapeHtml(col.comment || "") + '" ' + (col.isSystem ? "disabled" : "") + "></td>";
    const columnNameCells = state.data.designMode === "logical" ? logicalColumnCell + physicalColumnCell : physicalColumnCell + logicalColumnCell;
    tr.innerHTML = '<td class="col-handle-cell"><span class="drag-handle" title="Drag to reorder">\u22EE\u22EE</span></td><td class="col-order">' + (idx + 1) + "</td>" + columnNameCells + '<td><input type="text" class="f-logical-type" list="logical-type-datalist" value="' + escapeHtml(logicalDataType(col)) + '" ' + (col.isSystem ? "disabled" : "") + '></td><td><input type="text" class="f-physical-type" list="physical-type-datalist" value="' + escapeHtml(physicalDataType(col)) + '" ' + (col.isSystem ? "disabled" : "") + '></td><td><input type="text" class="f-default" value="' + escapeHtml(col.defaultValue || "") + '" ' + (col.isSystem ? "disabled" : "") + '></td><td class="col-check"><input type="checkbox" class="f-pk" ' + (col.pk ? "checked" : "") + '></td><td class="col-check"><input type="checkbox" class="f-null" ' + (col.nullable ? "checked" : "") + '></td><td class="col-check">' + (col.fk ? '<span class="badge-fk">FK</span>' : "") + "</td><td>" + (col.isSystem ? "" : '<button type="button" class="btn-icon btn-del-col" title="Delete column">\u2715</button>') + "</td>";
    const nameInput = tr.querySelector(".f-name");
    if (nameInput) {
      nameInput.addEventListener("input", (e) => {
        col.name = e.target.value;
      });
      nameInput.addEventListener("change", pushHistory);
    }
    const commentInput = tr.querySelector(".f-comment");
    if (commentInput) {
      commentInput.addEventListener("input", (e) => {
        col.comment = e.target.value;
      });
      commentInput.addEventListener("change", pushHistory);
    }
    const logicalTypeInput = tr.querySelector(".f-logical-type");
    if (logicalTypeInput) {
      logicalTypeInput.addEventListener("input", (e) => {
        setLogicalDataType(col, e.target.value);
      });
      logicalTypeInput.addEventListener("change", pushHistory);
    }
    const physicalTypeInput = tr.querySelector(".f-physical-type");
    if (physicalTypeInput) {
      physicalTypeInput.addEventListener("input", (e) => {
        setPhysicalDataType(col, e.target.value);
      });
      physicalTypeInput.addEventListener("change", pushHistory);
    }
    const defaultInput = tr.querySelector(".f-default");
    if (defaultInput) {
      defaultInput.addEventListener("input", (e) => {
        col.defaultValue = e.target.value;
      });
      defaultInput.addEventListener("change", pushHistory);
    }
    tr.querySelector(".f-pk").addEventListener("change", (e) => {
      col.pk = e.target.checked;
      if (col.pk) col.nullable = false;
      renderGrid();
      pushHistory();
    });
    tr.querySelector(".f-null").addEventListener("change", (e) => {
      col.nullable = e.target.checked;
      pushHistory();
    });
    const delBtn = tr.querySelector(".btn-del-col");
    if (delBtn) delBtn.addEventListener("click", () => {
      draft.columns = draft.columns.filter((c) => c.id !== col.id);
      renderGrid();
      pushHistory();
    });
    const handle = tr.querySelector(".drag-handle");
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      dragIndex = idx;
      dragMoved = false;
      document.addEventListener("mousemove", onDragMove);
      document.addEventListener("mouseup", onDragEnd);
    });
    return tr;
  }
  function onDragMove(e) {
    if (dragIndex === null || !draft) return;
    const rows = Array.prototype.slice.call(gridBody.querySelectorAll("tr"));
    const overRow = rows.find((r) => {
      const rect = r.getBoundingClientRect();
      return e.clientY >= rect.top && e.clientY <= rect.bottom;
    });
    if (!overRow) return;
    const overIndex = rows.indexOf(overRow);
    if (overIndex === -1 || overIndex === dragIndex) return;
    const moved = draft.columns.splice(dragIndex, 1)[0];
    draft.columns.splice(overIndex, 0, moved);
    dragIndex = overIndex;
    dragMoved = true;
    renderGrid();
  }
  function onDragEnd() {
    const moved = dragMoved;
    dragIndex = null;
    dragMoved = false;
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
    if (moved) {
      renderGrid();
      pushHistory();
    }
  }
  function cellInput(row, col) {
    const tr = gridBody.querySelectorAll("tr")[row];
    if (!tr) return null;
    return tr.querySelector("." + cellClasses()[col]);
  }
  function cellIndexOf(input) {
    const tr = input.closest("tr");
    if (!tr) return null;
    const rows = Array.prototype.slice.call(gridBody.querySelectorAll("tr"));
    const row = rows.indexOf(tr);
    const col = cellClasses().findIndex((cls) => input.classList.contains(cls));
    if (row === -1 || col === -1) return null;
    return { row, col };
  }
  function rangeBounds() {
    if (!selAnchor || !selFocus) return null;
    return {
      r0: Math.min(selAnchor.row, selFocus.row),
      r1: Math.max(selAnchor.row, selFocus.row),
      c0: Math.min(selAnchor.col, selFocus.col),
      c1: Math.max(selAnchor.col, selFocus.col)
    };
  }
  function refreshSelectionHighlight() {
    gridBody.querySelectorAll(".cell-selected").forEach((el2) => el2.classList.remove("cell-selected"));
    const b = rangeBounds();
    if (!b) return;
    for (let r = b.r0; r <= b.r1; r++) {
      for (let c = b.c0; c <= b.c1; c++) {
        const input = cellInput(r, c);
        if (input) input.classList.add("cell-selected");
      }
    }
  }
  function onGridMouseDown(e) {
    const input = e.target.closest("input");
    if (!input) return;
    const idx = cellIndexOf(input);
    if (!idx) return;
    isSelecting = true;
    selAnchor = idx;
    selFocus = idx;
    refreshSelectionHighlight();
  }
  function onGridMouseOver(e) {
    if (!isSelecting) return;
    const input = e.target.closest("input");
    if (!input) return;
    const idx = cellIndexOf(input);
    if (!idx) return;
    selFocus = idx;
    refreshSelectionHighlight();
  }
  function onGridMouseUp() {
    isSelecting = false;
  }
  function onGridCopy(e) {
    if (!document.contains(gridBody)) return;
    const active2 = document.activeElement;
    if (!active2 || !gridBody.contains(active2)) return;
    const b = rangeBounds();
    if (!b) return;
    if (b.r0 === b.r1 && b.c0 === b.c1 && active2 instanceof HTMLInputElement && active2.selectionStart !== active2.selectionEnd) return;
    const lines = [];
    for (let r = b.r0; r <= b.r1; r++) {
      const vals = [];
      for (let c = b.c0; c <= b.c1; c++) vals.push((cellInput(r, c) || { value: "" }).value);
      lines.push(vals.join("	"));
    }
    e.clipboardData.setData("text/plain", lines.join("\n"));
    e.preventDefault();
  }
  function onGridPaste(e) {
    if (!document.contains(gridBody) || !draft) return;
    const active2 = document.activeElement;
    if (!active2 || !gridBody.contains(active2)) return;
    const anchor = active2 instanceof HTMLInputElement ? cellIndexOf(active2) : null;
    if (!anchor) return;
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    if (!text) return;
    const rawLines = text.replace(/\r/g, "").split("\n");
    if (rawLines.length && rawLines[rawLines.length - 1] === "") rawLines.pop();
    const grid = rawLines.map((line) => line.split("	"));
    const isSingleValue = grid.length <= 1 && grid[0].length <= 1;
    if (isSingleValue && active2 instanceof HTMLInputElement && active2.selectionStart !== active2.selectionEnd) return;
    e.preventDefault();
    let maxCol = 0;
    const fields = cellFields();
    grid.forEach((vals, rOffset) => {
      const row = anchor.row + rOffset;
      const col = draft.columns[row];
      if (!col || col.isSystem) return;
      vals.forEach((val, cOffset) => {
        const c = anchor.col + cOffset;
        if (c >= fields.length) return;
        maxCol = Math.max(maxCol, c);
        setColumnField(col, fields[c], val);
      });
    });
    selAnchor = anchor;
    selFocus = { row: Math.min(anchor.row + grid.length - 1, draft.columns.length - 1), col: Math.min(maxCol, fields.length - 1) };
    renderGrid();
    refreshSelectionHighlight();
    pushHistory();
  }
  function renderGrid() {
    gridBody.innerHTML = "";
    draft.columns.forEach((col, idx) => gridBody.appendChild(renderRow(col, idx)));
  }
  function buildBody(entity) {
    draft = JSON.parse(JSON.stringify(entity));
    initHistory();
    const wrap = document.createElement("div");
    document.addEventListener("keydown", onModalKeydown);
    const logicalDatalist = document.createElement("datalist");
    logicalDatalist.id = "logical-type-datalist";
    logicalDatalist.innerHTML = dataTypeSuggestions("logical").map((t) => '<option value="' + t + '">').join("");
    wrap.appendChild(logicalDatalist);
    const physicalDatalist = document.createElement("datalist");
    physicalDatalist.id = "physical-type-datalist";
    physicalDatalist.innerHTML = dataTypeSuggestions("physical").map((t) => '<option value="' + t + '">').join("");
    wrap.appendChild(physicalDatalist);
    const head = document.createElement("div");
    head.className = "entity-modal-head";
    const physicalNameField = '<label>Physical Name<br><input type="text" class="f-entity-name" value="' + escapeHtml(draft.name) + '"></label>';
    const logicalNameField = '<label>Logical Name<br><input type="text" class="f-entity-comment" value="' + escapeHtml(draft.comment || "") + '"></label>';
    head.innerHTML = state.data.designMode === "logical" ? logicalNameField + physicalNameField : physicalNameField + logicalNameField;
    const nameInput = head.querySelector(".f-entity-name");
    const commentInput = head.querySelector(".f-entity-comment");
    nameInput.addEventListener("input", (e) => {
      draft.name = e.target.value;
    });
    nameInput.addEventListener("change", pushHistory);
    commentInput.addEventListener("input", (e) => {
      draft.comment = e.target.value;
    });
    commentInput.addEventListener("change", pushHistory);
    wrap.appendChild(head);
    const palette = document.createElement("div");
    palette.className = "header-color-palette";
    function renderPalette() {
      palette.innerHTML = '<span class="hint">Header color</span>';
      HEADER_COLOR_PALETTE.forEach((color) => {
        const swatch = document.createElement("button");
        swatch.type = "button";
        swatch.className = "color-swatch" + ((draft.headerColor || theme.colors.headerBg) === color ? " selected" : "");
        swatch.style.background = color;
        swatch.title = color;
        swatch.addEventListener("click", () => {
          draft.headerColor = color;
          renderPalette();
          pushHistory();
        });
        palette.appendChild(swatch);
      });
    }
    renderPalette();
    wrap.appendChild(palette);
    const table = document.createElement("table");
    table.className = "col-grid";
    const physicalColumnHeader = "<th>Physical Column</th>";
    const logicalColumnHeader = "<th>Logical Column</th>";
    const columnNameHeaders = state.data.designMode === "logical" ? logicalColumnHeader + physicalColumnHeader : physicalColumnHeader + logicalColumnHeader;
    table.innerHTML = "<thead><tr><th></th><th>#</th>" + columnNameHeaders + "<th>Logical type</th><th>Physical type</th><th>Default</th><th>PK</th><th>Null</th><th>FK</th><th></th></tr></thead><tbody></tbody>";
    wrap.appendChild(table);
    gridBody = table.querySelector("tbody");
    renderGrid();
    table.addEventListener("mousedown", onGridMouseDown);
    table.addEventListener("mouseover", onGridMouseOver);
    document.addEventListener("mouseup", onGridMouseUp);
    document.addEventListener("copy", onGridCopy);
    document.addEventListener("paste", onGridPaste);
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn-add-col";
    addBtn.textContent = "+ Add column";
    addBtn.addEventListener("click", () => {
      const firstSystemIdx = draft.columns.findIndex((c) => c.isSystem);
      const insertAt = firstSystemIdx === -1 ? draft.columns.length : firstSystemIdx;
      draft.columns.splice(insertAt, 0, newColumn());
      renderGrid();
      pushHistory();
    });
    wrap.appendChild(addBtn);
    refreshAll = () => {
      nameInput.value = draft.name;
      commentInput.value = draft.comment || "";
      renderPalette();
      renderGrid();
    };
    return wrap;
  }
  function cleanupGridListeners() {
    document.removeEventListener("mouseup", onGridMouseUp);
    document.removeEventListener("copy", onGridCopy);
    document.removeEventListener("paste", onGridPaste);
    document.removeEventListener("keydown", onModalKeydown);
    selAnchor = null;
    selFocus = null;
    history = [];
    historyIndex = -1;
    refreshAll = null;
  }
  function open2(entityId) {
    const entity = state.getEntity(entityId);
    if (!entity) return;
    const body = buildBody(entity);
    modal.open({
      title: "Table details",
      width: "900px",
      body,
      onClose: cleanupGridListeners,
      actions: [
        { label: "Delete table", variant: "danger", onClick: () => {
          state.removeEntity(entity.id);
          modal.close();
        } },
        { label: "Cancel", onClick: () => modal.close() },
        { label: "Save", variant: "primary", onClick: () => {
          const keptIds = new Set(draft.columns.map((c) => c.id));
          state.data.relations = state.data.relations.map((r) => {
            if (r.sourceEntityId !== entity.id && r.targetEntityId !== entity.id) return r;
            const columnPairs = r.columnPairs.filter(
              (p) => (r.sourceEntityId !== entity.id || keptIds.has(p.sourceColumnId)) && (r.targetEntityId !== entity.id || keptIds.has(p.targetColumnId))
            );
            return { ...r, columnPairs };
          }).filter((r) => r.columnPairs.length > 0);
          state.updateEntity(entity.id, { name: draft.name, comment: draft.comment, columns: draft.columns, headerColor: draft.headerColor });
          modal.close();
        } }
      ]
    });
  }
  function openNew(template) {
    const body = buildBody(template);
    modal.open({
      title: "Table details",
      width: "900px",
      body,
      onClose: cleanupGridListeners,
      actions: [
        { label: "Cancel", onClick: () => modal.close() },
        { label: "Save", variant: "primary", onClick: () => {
          state.addEntity({ ...draft });
          modal.close();
        } }
      ]
    });
  }
  var modalEntity = { open: open2, openNew };

  // src/appTheme.ts
  var STORAGE_KEY2 = "erd_tool_theme";
  var LIGHT_IDENTIFYING_RELATION_STROKE = "#1d4ed8";
  var LIGHT_NON_IDENTIFYING_RELATION_STROKE = "#64748b";
  var DARK_IDENTIFYING_RELATION_STROKE = "#f87171";
  var DARK_NON_IDENTIFYING_RELATION_STROKE = "#94a3b8";
  var DARK_RELATION_STROKE_HOVER = "#fb7185";
  var LIGHT_RELATION_HIGHLIGHT_HALO = "#f59e0b";
  var DARK_RELATION_HIGHLIGHT_HALO = "#fbbf24";
  var dark = false;
  function detectInitialDarkMode() {
    const saved = localStorage.getItem(STORAGE_KEY2);
    if (saved) return saved === "dark";
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function apply() {
    document.body.classList.toggle("dark-mode", dark);
  }
  function init4() {
    dark = detectInitialDarkMode();
    apply();
    state.emit("change");
  }
  function isDark() {
    return dark;
  }
  function setDark(next) {
    if (dark === next) return;
    dark = next;
    localStorage.setItem(STORAGE_KEY2, dark ? "dark" : "light");
    apply();
    state.emit("change");
  }
  function toggle() {
    setDark(!dark);
  }
  function relationStroke(identifying) {
    if (dark) return identifying ? DARK_IDENTIFYING_RELATION_STROKE : DARK_NON_IDENTIFYING_RELATION_STROKE;
    return identifying ? LIGHT_IDENTIFYING_RELATION_STROKE : LIGHT_NON_IDENTIFYING_RELATION_STROKE;
  }
  function relationStrokeHover(fallback) {
    return dark ? DARK_RELATION_STROKE_HOVER : fallback;
  }
  function relationHighlightHalo() {
    return dark ? DARK_RELATION_HIGHLIGHT_HALO : LIGHT_RELATION_HIGHLIGHT_HALO;
  }
  var appTheme = { init: init4, isDark, setDark, toggle, relationStroke, relationStrokeHover, relationHighlightHalo };

  // src/toolbar.ts
  var MOON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5Z"/></svg>';
  var SUN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  function addTableAt(x, y) {
    const entity = {
      id: nextId("ent"),
      name: "NEW_TABLE",
      comment: "",
      x,
      y,
      headerColor: null,
      columns: [{
        id: nextId("col"),
        name: "ID",
        dataType: "NUMBER(10)",
        logicalDataType: "INTEGER",
        physicalDataType: "NUMBER(10)",
        comment: "",
        pk: true,
        fk: false,
        nullable: false,
        isSystem: false,
        systemColId: null
      }]
    };
    state.applySystemColumnsToEntity(entity);
    modalEntity.openNew(entity);
  }
  function initModeSwitch() {
    const toggle2 = document.getElementById("mode-toggle");
    if (!toggle2) return;
    const sync = () => {
      toggle2.checked = state.data.designMode === "physical";
    };
    sync();
    toggle2.addEventListener("change", () => state.setDesignMode(toggle2.checked ? "physical" : "logical"));
    state.on("change", sync);
  }
  function initThemeToggle() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    const themeButton = btn;
    function apply2() {
      const dark2 = appTheme.isDark();
      themeButton.innerHTML = dark2 ? SUN_ICON : MOON_ICON;
      themeButton.title = dark2 ? "Light mode" : "Dark mode";
      themeButton.setAttribute("aria-label", dark2 ? "Switch to light mode" : "Switch to dark mode");
    }
    apply2();
    themeButton.addEventListener("click", () => appTheme.toggle());
    state.on("change", apply2);
  }
  function init5() {
    appTheme.init();
    initThemeToggle();
    initModeSwitch();
  }
  var toolbar = { init: init5, addTableAt };

  // src/ddlExport.ts
  function escapeSqlString(s) {
    return s.replace(/'/g, "''");
  }
  function quoteIdentifier(name, vendor) {
    if (vendor === "mysql") return "`" + name + "`";
    if (vendor === "mssql") return "[" + name + "]";
    return '"' + name + '"';
  }
  function qualifiedTableName(name, vendor, owner) {
    return (owner ? quoteIdentifier(owner, vendor) + "." : "") + quoteIdentifier(name, vendor);
  }
  function tablespaceClause(name, vendor) {
    return vendor === "mssql" ? "\nON [" + name + "]" : "\nTABLESPACE " + name;
  }
  function indexTablespaceClause(name, vendor) {
    if (vendor === "mysql") return "";
    if (vendor === "mssql") return " ON [" + name + "]";
    return " USING INDEX TABLESPACE " + name;
  }
  function mssqlDescriptionProperty(schema, tableName, columnName, comment) {
    const lines = [
      "EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'" + escapeSqlString(comment) + "',",
      "  @level0type = N'SCHEMA', @level0name = " + quoteIdentifier(schema, "mssql") + ",",
      "  @level1type = N'TABLE', @level1name = " + quoteIdentifier(tableName, "mssql") + (columnName ? "," : ";")
    ];
    if (columnName) lines.push("  @level2type = N'COLUMN', @level2name = " + quoteIdentifier(columnName, "mssql") + ";");
    return lines.join("\n");
  }
  function tableCommentStatement(entity, vendor, owner, qualifiedName) {
    if (!entity.comment) return null;
    if (vendor === "mssql") return mssqlDescriptionProperty(owner || "dbo", entity.name, void 0, entity.comment);
    return "COMMENT ON TABLE " + qualifiedName + " IS '" + escapeSqlString(entity.comment) + "';";
  }
  function columnCommentStatement(entity, col, vendor, owner, qualifiedName) {
    if (!col.comment) return null;
    if (vendor === "mssql") return mssqlDescriptionProperty(owner || "dbo", entity.name, col.name, col.comment);
    return "COMMENT ON COLUMN " + qualifiedName + "." + quoteIdentifier(col.name, vendor) + " IS '" + escapeSqlString(col.comment) + "';";
  }
  function generateDdl(entity, opts) {
    const vendor = (opts == null ? void 0 : opts.vendor) || "oracle";
    const isMySql = vendor === "mysql";
    const qualifiedName = qualifiedTableName(entity.name, vendor, opts == null ? void 0 : opts.owner);
    const colLines = entity.columns.map((c) => {
      const def = (c.defaultValue || "").trim();
      let line = "  " + quoteIdentifier(c.name, vendor) + " " + physicalDataType(c) + (def ? " DEFAULT " + def : "") + (c.nullable ? "" : " NOT NULL");
      if (isMySql && c.comment) line += " COMMENT '" + escapeSqlString(c.comment) + "'";
      return line;
    });
    const pkCols = entity.columns.filter((c) => c.pk);
    if (pkCols.length) {
      let pkLine = "  CONSTRAINT " + quoteIdentifier(entity.name + "_PK", vendor) + " PRIMARY KEY (" + pkCols.map((c) => quoteIdentifier(c.name, vendor)).join(", ") + ")";
      if (opts == null ? void 0 : opts.indexTablespace) pkLine += indexTablespaceClause(opts.indexTablespace, vendor);
      colLines.push(pkLine);
    }
    let tableEnd = ")";
    if (opts == null ? void 0 : opts.tablespace) tableEnd += tablespaceClause(opts.tablespace, vendor);
    if (isMySql && entity.comment) tableEnd += " COMMENT='" + escapeSqlString(entity.comment) + "'";
    tableEnd += ";";
    const statements = ["CREATE TABLE " + qualifiedName + " (\n" + colLines.join(",\n") + "\n" + tableEnd];
    if (!isMySql) {
      const tableComment = tableCommentStatement(entity, vendor, opts == null ? void 0 : opts.owner, qualifiedName);
      if (tableComment) statements.push(tableComment);
      entity.columns.forEach((c) => {
        const colComment = columnCommentStatement(entity, c, vendor, opts == null ? void 0 : opts.owner, qualifiedName);
        if (colComment) statements.push(colComment);
      });
    }
    return statements.join("\n\n");
  }
  function generateDropTableDdl(entity, vendor, owner) {
    return "DROP TABLE " + qualifiedTableName(entity.name, vendor, owner) + ";";
  }
  function generateFkConstraintDdl(relation, sourceEntity, targetEntity, vendor, owner) {
    const sourceCols = relation.columnPairs.map((p) => sourceEntity.columns.find((c) => c.id === p.sourceColumnId)).filter((c) => !!c);
    const targetCols = relation.columnPairs.map((p) => targetEntity.columns.find((c) => c.id === p.targetColumnId)).filter((c) => !!c);
    const constraintName = relation.name || sourceEntity.name + "_" + targetEntity.name + "_FK";
    return "ALTER TABLE " + qualifiedTableName(sourceEntity.name, vendor, owner) + " ADD CONSTRAINT " + quoteIdentifier(constraintName, vendor) + " FOREIGN KEY (" + sourceCols.map((c) => quoteIdentifier(c.name, vendor)).join(", ") + ") REFERENCES " + qualifiedTableName(targetEntity.name, vendor, owner) + " (" + targetCols.map((c) => quoteIdentifier(c.name, vendor)).join(", ") + ");";
  }
  function generateBulkDdl(entityIds, opts) {
    const selected = new Set(entityIds);
    const entities = state.data.entities.filter((e) => selected.has(e.id));
    const parts = [];
    entities.forEach((e) => {
      if (opts.includeDrop) parts.push(generateDropTableDdl(e, opts.vendor || "oracle", opts.owner));
      parts.push(generateDdl(e, opts));
      if (opts.includeFk) {
        state.data.relations.forEach((r) => {
          if (r.sourceEntityId !== e.id || !selected.has(r.targetEntityId)) return;
          const tgt = state.getEntity(r.targetEntityId);
          if (tgt) parts.push(generateFkConstraintDdl(r, e, tgt, opts.vendor || "oracle", opts.owner));
        });
      }
    });
    return parts.join("\n\n");
  }
  function open3(entityId) {
    const entity = state.getEntity(entityId);
    if (!entity) return;
    const ddl = generateDdl(entity);
    const body = document.createElement("div");
    body.innerHTML = '<p class="hint">' + escapeHtml(entity.name) + ' as CREATE TABLE / COMMENT statements.</p><textarea class="f-ddl-output" rows="18" readonly></textarea>';
    body.querySelector(".f-ddl-output").value = ddl;
    modal.open({
      title: "DDL - " + entity.name,
      width: "700px",
      body,
      actions: [
        { label: "Close", onClick: () => modal.close() },
        { label: "Copy to clipboard", variant: "primary", onClick: () => copyToClipboard(ddl) }
      ]
    });
  }
  var ddlExport = { open: open3, generateDdl, generateBulkDdl };

  // src/contextMenu.ts
  var menuEl = null;
  function close2() {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
    document.removeEventListener("mousedown", onOutsideClick);
    document.removeEventListener("keydown", onKeydown2);
  }
  function onOutsideClick(e) {
    if (menuEl && !menuEl.contains(e.target)) close2();
  }
  function onKeydown2(e) {
    if (e.key === "Escape") close2();
  }
  function show(items, x, y, headerEl) {
    close2();
    menuEl = document.createElement("div");
    menuEl.className = "context-menu";
    menuEl.style.left = x + "px";
    menuEl.style.top = y + "px";
    if (headerEl) {
      menuEl.appendChild(headerEl);
      menuEl.appendChild(document.createElement("div")).className = "context-menu-sep";
    }
    items.forEach((item) => {
      if (item.sepBefore) menuEl.appendChild(document.createElement("div")).className = "context-menu-sep";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "context-menu-item" + (item.danger ? " danger" : "");
      btn.textContent = item.label;
      btn.addEventListener("click", () => {
        close2();
        item.onClick();
      });
      menuEl.appendChild(btn);
    });
    document.body.appendChild(menuEl);
    setTimeout(() => {
      document.addEventListener("mousedown", onOutsideClick);
      document.addEventListener("keydown", onKeydown2);
    }, 0);
  }
  function buildPaletteHeader(entity) {
    const wrap = document.createElement("div");
    wrap.className = "header-color-palette context-menu-palette";
    const targetIds = state.isEntitySelected(entity.id) && state.data.selectedEntityIds.length > 1 ? state.data.selectedEntityIds.slice() : [entity.id];
    function render3() {
      wrap.innerHTML = targetIds.length > 1 ? '<span class="hint">Recolor ' + targetIds.length + " tables</span>" : "";
      HEADER_COLOR_PALETTE.forEach((color) => {
        const swatch = document.createElement("button");
        swatch.type = "button";
        swatch.className = "color-swatch" + ((entity.headerColor || theme.colors.headerBg) === color ? " selected" : "");
        swatch.style.background = color;
        swatch.title = color;
        swatch.addEventListener("click", (e) => {
          e.stopPropagation();
          state.setHeaderColorForEntities(targetIds, color);
          entity.headerColor = color;
          render3();
        });
        wrap.appendChild(swatch);
      });
    }
    render3();
    return wrap;
  }
  function showForEntity(entityId, x, y) {
    const entity = state.getEntity(entityId);
    if (!entity) return;
    show([
      { label: "Edit Table", onClick: () => modalEntity.open(entityId) },
      { label: "Create DDL", onClick: () => ddlExport.open(entityId) },
      { label: "Delete table", danger: true, sepBefore: true, onClick: () => state.removeEntity(entityId) }
    ], x, y, buildPaletteHeader(entity));
  }
  function showForRelation(relationId, x, y) {
    show([
      { label: "Edit relation", onClick: () => modalRelation.openEdit(relationId) },
      { label: "Delete relation", danger: true, onClick: () => relationInteraction.remove(relationId) }
    ], x, y);
  }
  function showForCanvas(worldPos, x, y) {
    show([
      { label: "Create Entity/Table", onClick: () => toolbar.addTableAt(Math.round(worldPos.x), Math.round(worldPos.y)) }
    ], x, y);
  }
  var contextMenu = { show, close: close2, showForEntity, showForRelation, showForCanvas };

  // src/relationRenderer.ts
  var SVG_NS = "http://www.w3.org/2000/svg";
  var svgEl;
  var relGroup;
  var tempGroup;
  function el(tag, attrs) {
    const n = document.createElementNS(SVG_NS, tag);
    if (attrs) Object.keys(attrs).forEach((k) => n.setAttribute(k, String(attrs[k])));
    return n;
  }
  function sideDir(side) {
    switch (side) {
      case "left":
        return { x: -1, y: 0 };
      case "right":
        return { x: 1, y: 0 };
      case "top":
        return { x: 0, y: -1 };
      case "bottom":
        return { x: 0, y: 1 };
    }
  }
  function pointOnSide(box, side, t) {
    switch (side) {
      case "left":
        return { x: box.x, y: box.y + box.h * t };
      case "right":
        return { x: box.x + box.w, y: box.y + box.h * t };
      case "top":
        return { x: box.x + box.w * t, y: box.y };
      case "bottom":
        return { x: box.x + box.w * t, y: box.y + box.h };
    }
  }
  function nearestAnchor(box, pt) {
    const edges = [
      { side: "left", a: { x: box.x, y: box.y }, b: { x: box.x, y: box.y + box.h } },
      { side: "right", a: { x: box.x + box.w, y: box.y }, b: { x: box.x + box.w, y: box.y + box.h } },
      { side: "top", a: { x: box.x, y: box.y }, b: { x: box.x + box.w, y: box.y } },
      { side: "bottom", a: { x: box.x, y: box.y + box.h }, b: { x: box.x + box.w, y: box.y + box.h } }
    ];
    let best = null;
    edges.forEach(({ side, a, b }) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      let t = lenSq === 0 ? 0 : ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq;
      t = Math.min(Math.max(t, 0), 1);
      const dist = Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
      if (!best || dist < best.dist) best = { side, t, dist };
    });
    return { side: best.side, t: best.t };
  }
  function computeEndpoints(aBox, aRowY, bBox, bRowY, isSelf, aAnchor, bAnchor) {
    if (isSelf) {
      const aPt2 = aAnchor ? pointOnSide(aBox, aAnchor.side, aAnchor.t) : { x: aBox.x, y: aRowY };
      const bPt2 = bAnchor ? pointOnSide(bBox, bAnchor.side, bAnchor.t) : { x: bBox.x, y: bRowY };
      return { aPt: aPt2, bPt: bPt2, aSide: aAnchor ? aAnchor.side : "left", bSide: bAnchor ? bAnchor.side : "left" };
    }
    const aCenterX = aBox.x + aBox.w / 2, bCenterX = bBox.x + bBox.w / 2;
    let autoASide, autoBSide;
    if (aCenterX <= bCenterX) {
      autoASide = "right";
      autoBSide = "left";
    } else {
      autoASide = "left";
      autoBSide = "right";
    }
    const aSide = aAnchor ? aAnchor.side : autoASide;
    const bSide = bAnchor ? bAnchor.side : autoBSide;
    const aPt = aAnchor ? pointOnSide(aBox, aAnchor.side, aAnchor.t) : { x: autoASide === "right" ? aBox.x + aBox.w : aBox.x, y: aRowY };
    const bPt = bAnchor ? pointOnSide(bBox, bAnchor.side, bAnchor.t) : { x: autoBSide === "right" ? bBox.x + bBox.w : bBox.x, y: bRowY };
    return { aPt, bPt, aSide, bSide };
  }
  function bezierPointAt(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
    return {
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
    };
  }
  function cubicSamples(p0, c1, c2, p3) {
    const approxLen = Math.hypot(c1.x - p0.x, c1.y - p0.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(p3.x - c2.x, p3.y - c2.y);
    const n = Math.max(16, Math.min(64, Math.ceil(approxLen / 8)));
    const out = [];
    for (let i = 1; i <= n; i++) out.push(bezierPointAt(p0, c1, c2, p3, i / n));
    return out;
  }
  function arcSamples(p0, p1, r, largeArc, sweep) {
    const dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2;
    const dSq = dx * dx + dy * dy;
    if (dSq < 1e-9) return [p1];
    let rr = r;
    const lambda = dSq / (rr * rr);
    if (lambda > 1) rr = rr * Math.sqrt(lambda);
    const sign = largeArc !== sweep ? 1 : -1;
    const cc = sign * Math.sqrt(Math.max(0, (rr * rr - dSq) / dSq));
    const cxp = cc * dy, cyp = -cc * dx;
    const cx = cxp + (p0.x + p1.x) / 2, cy = cyp + (p0.y + p1.y) / 2;
    const th0 = Math.atan2(dy - cyp, dx - cxp);
    const th1 = Math.atan2(-dy - cyp, -dx - cxp);
    let dth = th1 - th0;
    if (!sweep && dth > 0) dth -= Math.PI * 2;
    if (sweep && dth < 0) dth += Math.PI * 2;
    const n = Math.max(12, Math.min(64, Math.ceil(Math.abs(dth) * rr / 8)));
    const out = [];
    for (let i = 1; i <= n; i++) {
      const th = th0 + dth * (i / n);
      out.push({ x: cx + rr * Math.cos(th), y: cy + rr * Math.sin(th) });
    }
    return out;
  }
  var MARKER_CLEARANCE = 32;
  function markerAnchor(edge, side) {
    const dir = sideDir(side);
    return { x: edge.x + dir.x * MARKER_CLEARANCE, y: edge.y + dir.y * MARKER_CLEARANCE };
  }
  var HANDLE_OFFSET = 9;
  function handleAnchor(edge, side) {
    const dir = sideDir(side);
    return { x: edge.x + dir.x * HANDLE_OFFSET, y: edge.y + dir.y * HANDLE_OFFSET };
  }
  function pointInBox(p, box, pad) {
    return p.x > box.x - pad && p.x < box.x + box.w + pad && p.y > box.y - pad && p.y < box.y + box.h + pad;
  }
  function bezierPath(aPt, aSide, bPt, bSide, avoid) {
    const markerA = markerAnchor(aPt, aSide);
    const markerB = markerAnchor(bPt, bSide);
    const dirA = sideDir(aSide), dirB = sideDir(bSide);
    const base = Math.max(Math.hypot(markerB.x - markerA.x, markerB.y - markerA.y) * 0.5, 50);
    let c1 = { x: markerA.x + dirA.x * base, y: markerA.y + dirA.y * base };
    let c2 = { x: markerB.x + dirB.x * base, y: markerB.y + dirB.y * base };
    if (avoid && avoid.length) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const dist = base * (1 + attempt * 0.7);
        c1 = { x: markerA.x + dirA.x * dist, y: markerA.y + dirA.y * dist };
        c2 = { x: markerB.x + dirB.x * dist, y: markerB.y + dirB.y * dist };
        let hitsBox = false;
        for (let i = 1; i < 24 && !hitsBox; i++) {
          const p = bezierPointAt(markerA, c1, c2, markerB, i / 24);
          hitsBox = avoid.some((box) => pointInBox(p, box, -1));
        }
        if (!hitsBox) break;
      }
    }
    return {
      d: "M " + aPt.x + " " + aPt.y + " L " + markerA.x + " " + markerA.y + " C " + c1.x + " " + c1.y + ", " + c2.x + " " + c2.y + ", " + markerB.x + " " + markerB.y + " L " + bPt.x + " " + bPt.y,
      mid: bezierPointAt(markerA, c1, c2, markerB, 0.5),
      samples: [aPt, markerA, ...cubicSamples(markerA, c1, c2, markerB), bPt]
    };
  }
  function segIntersectsBox(p1, p2, box, pad) {
    const left = box.x + pad, right = box.x + box.w - pad, top = box.y + pad, bottom = box.y + box.h - pad;
    if (right <= left || bottom <= top) return false;
    if (p1.y === p2.y) {
      if (p1.y <= top || p1.y >= bottom) return false;
      return Math.max(p1.x, p2.x) > left && Math.min(p1.x, p2.x) < right;
    }
    if (p1.x === p2.x) {
      if (p1.x <= left || p1.x >= right) return false;
      return Math.max(p1.y, p2.y) > top && Math.min(p1.y, p2.y) < bottom;
    }
    return false;
  }
  function angularPath(aPt, aSide, bPt, bSide, avoid) {
    const markerA = markerAnchor(aPt, aSide);
    const markerB = markerAnchor(bPt, bSide);
    const dirA = sideDir(aSide), dirB = sideDir(bSide);
    const dist = Math.max(Math.hypot(markerB.x - markerA.x, markerB.y - markerA.y) * 0.5, 50);
    const stubA = { x: markerA.x + dirA.x * dist, y: markerA.y + dirA.y * dist };
    const stubB = { x: markerB.x + dirB.x * dist, y: markerB.y + dirB.y * dist };
    const aHorizontal = aSide === "left" || aSide === "right";
    const bHorizontal = bSide === "left" || bSide === "right";
    let bends;
    let mid;
    if (aHorizontal && bHorizontal) {
      const opposite = dirA.x === -dirB.x;
      const facingToward = dirA.x * (markerB.x - markerA.x) >= 0;
      if (opposite && !facingToward) {
        const midY = (markerA.y + markerB.y) / 2;
        bends = [{ x: markerA.x, y: midY }, { x: markerB.x, y: midY }];
        mid = { x: (markerA.x + markerB.x) / 2, y: midY };
      } else {
        const midX = (stubA.x + stubB.x) / 2;
        bends = [{ x: midX, y: markerA.y }, { x: midX, y: markerB.y }];
        mid = { x: midX, y: (markerA.y + markerB.y) / 2 };
      }
    } else if (!aHorizontal && !bHorizontal) {
      const opposite = dirA.y === -dirB.y;
      const facingToward = dirA.y * (markerB.y - markerA.y) >= 0;
      if (opposite && !facingToward) {
        const midX = (markerA.x + markerB.x) / 2;
        bends = [{ x: midX, y: markerA.y }, { x: midX, y: markerB.y }];
        mid = { x: midX, y: (markerA.y + markerB.y) / 2 };
      } else {
        const midY = (stubA.y + stubB.y) / 2;
        bends = [{ x: markerA.x, y: midY }, { x: markerB.x, y: midY }];
        mid = { x: (markerA.x + markerB.x) / 2, y: midY };
      }
    } else {
      const corner1 = aHorizontal ? { x: markerB.x, y: markerA.y } : { x: markerA.x, y: markerB.y };
      const corner2 = aHorizontal ? { x: markerA.x, y: markerB.y } : { x: markerB.x, y: markerA.y };
      const clean = (corner) => {
        if (!avoid || !avoid.length) return true;
        const pts2 = [aPt, markerA, corner, markerB, bPt];
        for (let i = 0; i < pts2.length - 1; i++) {
          if (avoid.some((box) => segIntersectsBox(pts2[i], pts2[i + 1], box, 1))) return false;
        }
        return true;
      };
      const bend = !clean(corner1) && clean(corner2) ? corner2 : corner1;
      bends = [bend];
      mid = bend;
    }
    const pts = [aPt, markerA, ...bends, markerB, bPt];
    return { d: "M " + pts.map((p) => p.x + " " + p.y).join(" L "), mid, samples: pts };
  }
  function sameSideLoop(aPt, markerA, bPt, markerB, dir) {
    const chord = Math.hypot(markerB.x - markerA.x, markerB.y - markerA.y);
    const r = Math.max(chord / 2, 40);
    const chordMidX = (markerA.x + markerB.x) / 2, chordMidY = (markerA.y + markerB.y) / 2;
    return {
      d: "M " + aPt.x + " " + aPt.y + " L " + markerA.x + " " + markerA.y + " A " + r + " " + r + " 0 1 1 " + markerB.x + " " + markerB.y + " L " + bPt.x + " " + bPt.y,
      mid: { x: chordMidX + dir.x * r, y: chordMidY + dir.y * r },
      samples: [aPt, markerA, ...arcSamples(markerA, markerB, r, true, true), bPt]
    };
  }
  var PERPENDICULAR_LOOP_RADIUS = 60;
  function perpendicularCornerLoop(aPt, markerA, dirA, bPt, markerB, dirB) {
    const cross = dirA.x * dirB.y - dirA.y * dirB.x;
    const sweep = cross > 0 ? 1 : 0;
    return {
      d: "M " + aPt.x + " " + aPt.y + " L " + markerA.x + " " + markerA.y + " A " + PERPENDICULAR_LOOP_RADIUS + " " + PERPENDICULAR_LOOP_RADIUS + " 0 0 " + sweep + " " + markerB.x + " " + markerB.y + " L " + bPt.x + " " + bPt.y,
      mid: { x: (markerA.x + markerB.x) / 2, y: (markerA.y + markerB.y) / 2 },
      samples: [aPt, markerA, ...arcSamples(markerA, markerB, PERPENDICULAR_LOOP_RADIUS, false, sweep === 1), bPt]
    };
  }
  var SELF_DETOUR_CLEARANCE = 50;
  function oppositeSideSelfLoop(aPt, aSide, bPt, bSide, box) {
    const markerA = markerAnchor(aPt, aSide);
    const markerB = markerAnchor(bPt, bSide);
    const horizontal = aSide === "left" || aSide === "right";
    const c1 = horizontal ? { x: markerA.x, y: box.y - SELF_DETOUR_CLEARANCE } : { x: box.x - SELF_DETOUR_CLEARANCE, y: markerA.y };
    const c2 = horizontal ? { x: markerB.x, y: box.y - SELF_DETOUR_CLEARANCE } : { x: box.x - SELF_DETOUR_CLEARANCE, y: markerB.y };
    return {
      d: "M " + aPt.x + " " + aPt.y + " L " + markerA.x + " " + markerA.y + " C " + c1.x + " " + c1.y + ", " + c2.x + " " + c2.y + ", " + markerB.x + " " + markerB.y + " L " + bPt.x + " " + bPt.y,
      mid: bezierPointAt(markerA, c1, c2, markerB, 0.5),
      samples: [aPt, markerA, ...cubicSamples(markerA, c1, c2, markerB), bPt]
    };
  }
  function selfLoopPath(aPt, aSide, bPt, bSide, box) {
    const markerA = markerAnchor(aPt, aSide);
    const markerB = markerAnchor(bPt, bSide);
    const dirA = sideDir(aSide), dirB = sideDir(bSide);
    if (aSide === bSide) return sameSideLoop(aPt, markerA, bPt, markerB, dirA);
    const isOpposite = dirA.x === -dirB.x && dirA.y === -dirB.y;
    if (isOpposite) {
      if (box) return oppositeSideSelfLoop(aPt, aSide, bPt, bSide, box);
      return bezierPath(aPt, aSide, bPt, bSide);
    }
    return perpendicularCornerLoop(aPt, markerA, dirA, bPt, markerB, dirB);
  }
  function linePath(aPt, aSide, bPt, bSide, isSelf, avoid) {
    if (isSelf) return selfLoopPath(aPt, aSide, bPt, bSide, avoid && avoid[0]);
    return state.data.lineStyle === "angular" ? angularPath(aPt, aSide, bPt, bSide, avoid) : bezierPath(aPt, aSide, bPt, bSide, avoid);
  }
  function isIdentifying(relation) {
    return relation.columnPairs.every((p) => {
      const col = state.getColumn(relation.sourceEntityId, p.sourceColumnId);
      return !!col && col.pk;
    });
  }
  function displayRelationName(relation) {
    if (state.data.designMode === "logical" && relation.logicalName) return relation.logicalName;
    return relation.name;
  }
  function isConnectedToSelectedEntity(relation) {
    return state.data.selectedEntityIds.indexOf(relation.sourceEntityId) !== -1 || state.data.selectedEntityIds.indexOf(relation.targetEntityId) !== -1;
  }
  function crowFoot(point, side, stroke, strokeWidth) {
    const dir = sideDir(side);
    const perp = { x: -dir.y, y: dir.x };
    const forward = { x: point.x + dir.x * 12, y: point.y + dir.y * 12 };
    const g = el("g", { class: "crowfoot" });
    [-8, 8].forEach((off2) => {
      g.appendChild(el("line", {
        x1: point.x + perp.x * off2,
        y1: point.y + perp.y * off2,
        x2: forward.x,
        y2: forward.y,
        stroke,
        "stroke-width": strokeWidth
      }));
    });
    return g;
  }
  function bar(point, side, distance, stroke, strokeWidth) {
    const dir = sideDir(side);
    const perp = { x: -dir.y, y: dir.x };
    const cx = point.x + dir.x * distance, cy = point.y + dir.y * distance;
    return el("line", {
      x1: cx - perp.x * 8,
      y1: cy - perp.y * 8,
      x2: cx + perp.x * 8,
      y2: cy + perp.y * 8,
      stroke,
      "stroke-width": strokeWidth
    });
  }
  function circle(point, side, distance, stroke, strokeWidth) {
    const dir = sideDir(side);
    return el("circle", {
      cx: point.x + dir.x * distance,
      cy: point.y + dir.y * distance,
      r: 6,
      fill: theme.colors.bodyBg,
      stroke,
      "stroke-width": strokeWidth
    });
  }
  function cardinalityMarker(point, side, cardinality, highlighted, identifying) {
    const g = el("g", { class: "cardinality-marker" });
    const stroke = appTheme.relationStroke(identifying);
    const strokeWidth = highlighted ? 3 : 2.5;
    switch (cardinality) {
      case "one":
        g.appendChild(bar(point, side, 9, stroke, strokeWidth));
        g.appendChild(bar(point, side, 15, stroke, strokeWidth));
        break;
      case "zero-or-one":
        g.appendChild(bar(point, side, 9, stroke, strokeWidth));
        g.appendChild(circle(point, side, 17, stroke, strokeWidth));
        break;
      case "zero-or-many":
        g.appendChild(crowFoot(point, side, stroke, strokeWidth));
        g.appendChild(circle(point, side, 16, stroke, strokeWidth));
        break;
      case "one-or-many":
        g.appendChild(crowFoot(point, side, stroke, strokeWidth));
        g.appendChild(bar(point, side, 12, stroke, strokeWidth));
        break;
      case "many":
      default:
        g.appendChild(crowFoot(point, side, stroke, strokeWidth));
        break;
    }
    return g;
  }
  function buildRelationNode(relation) {
    const g = el("g", { class: "relation", "data-relation-id": relation.id });
    g.appendChild(el("path", { class: "relation-halo" }));
    g.appendChild(el("path", { class: "relation-hit" }));
    g.appendChild(el("path", { class: "relation-line" }));
    g.appendChild(el("g", { class: "relation-endpoints" }));
    g.appendChild(el("g", { class: "relation-handles" }));
    const label = el("g", { class: "relation-label" });
    label.appendChild(el("rect", { class: "relation-label-bg" }));
    label.appendChild(el("text", { class: "relation-label-text" }));
    g.appendChild(label);
    return g;
  }
  function relationNodeSignature(relation, pathD, isSelected, isHighlighted, identifying) {
    return pathD + "|" + isSelected + "|" + isHighlighted + "|" + identifying + "|" + appTheme.isDark() + "|" + displayRelationName(relation) + "|" + sourceCardinalityOf(relation) + "|" + targetCardinalityOf(relation);
  }
  function updateRelationNode(node, relation) {
    const aBox = entityRenderer.getEntityBox(relation.sourceEntityId);
    const bBox = entityRenderer.getEntityBox(relation.targetEntityId);
    if (!aBox || !bBox) {
      node.style.display = "none";
      delete node.dataset.sig;
      relationSamples.delete(relation.id);
      return;
    }
    node.style.display = "";
    const firstPair = relation.columnPairs[0];
    if (!firstPair) {
      node.style.display = "none";
      delete node.dataset.sig;
      relationSamples.delete(relation.id);
      return;
    }
    const aRow = entityRenderer.getColumnRowCenter(relation.sourceEntityId, firstPair.sourceColumnId);
    const bRow = entityRenderer.getColumnRowCenter(relation.targetEntityId, firstPair.targetColumnId);
    if (!aRow || !bRow) {
      node.style.display = "none";
      delete node.dataset.sig;
      relationSamples.delete(relation.id);
      return;
    }
    const isSelf = relation.sourceEntityId === relation.targetEntityId;
    const geom = computeEndpoints(aBox, aRow.y, bBox, bRow.y, isSelf, relation.sourceAnchor, relation.targetAnchor);
    const path = linePath(geom.aPt, geom.aSide, geom.bPt, geom.bSide, isSelf, isSelf ? [aBox] : [aBox, bBox]);
    relationSamples.set(relation.id, path.samples);
    const selected = state.data.selected;
    const isSelected = !!(selected && selected.type === "relation" && selected.id === relation.id);
    const isHighlighted = isSelected || isConnectedToSelectedEntity(relation);
    const identifying = isIdentifying(relation);
    node.classList.toggle("search-dimmed", search.isActive() && !search.matchesRelation(relation));
    const sig = relationNodeSignature(relation, path.d, isSelected, isHighlighted, identifying);
    if (node.dataset.sig === sig) return;
    node.dataset.sig = sig;
    const halo = node.querySelector(".relation-halo");
    halo.setAttribute("d", path.d);
    halo.setAttribute("fill", "none");
    halo.setAttribute("stroke", appTheme.relationHighlightHalo());
    halo.setAttribute("stroke-width", "8");
    halo.setAttribute("stroke-opacity", isHighlighted ? "0.34" : "0");
    halo.setAttribute("stroke-linecap", "round");
    halo.setAttribute("stroke-linejoin", "round");
    const line = node.querySelector(".relation-line");
    line.setAttribute("d", path.d);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", appTheme.relationStroke(identifying));
    line.setAttribute("stroke-width", isHighlighted ? "3.5" : "2.5");
    if (identifying) {
      line.removeAttribute("stroke-dasharray");
      halo.removeAttribute("stroke-dasharray");
    } else {
      line.setAttribute("stroke-dasharray", "6,4");
      halo.setAttribute("stroke-dasharray", "6,4");
    }
    const hit = node.querySelector(".relation-hit");
    hit.setAttribute("d", path.d);
    hit.setAttribute("fill", "none");
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", "12");
    const endpoints = node.querySelector(".relation-endpoints");
    endpoints.innerHTML = "";
    endpoints.appendChild(cardinalityMarker(geom.aPt, geom.aSide, sourceCardinalityOf(relation), isHighlighted, identifying));
    endpoints.appendChild(cardinalityMarker(geom.bPt, geom.bSide, targetCardinalityOf(relation), isHighlighted, identifying));
    const handles = node.querySelector(".relation-handles");
    handles.innerHTML = "";
    if (isSelected) {
      const sourceHandlePt = handleAnchor(geom.aPt, geom.aSide);
      const targetHandlePt = handleAnchor(geom.bPt, geom.bSide);
      handles.appendChild(el("circle", {
        class: "relation-handle",
        "data-end": "source",
        "data-side": geom.aSide,
        cx: sourceHandlePt.x,
        cy: sourceHandlePt.y,
        r: 6,
        fill: appTheme.relationStrokeHover(theme.colors.relationStrokeHover),
        stroke: "#ffffff",
        "stroke-width": 2
      }));
      handles.appendChild(el("circle", {
        class: "relation-handle",
        "data-end": "target",
        "data-side": geom.bSide,
        cx: targetHandlePt.x,
        cy: targetHandlePt.y,
        r: 6,
        fill: appTheme.relationStrokeHover(theme.colors.relationStrokeHover),
        stroke: "#ffffff",
        "stroke-width": 2
      }));
    }
    const labelGroup = node.querySelector(".relation-label");
    const text = labelGroup.querySelector(".relation-label-text");
    const bg = labelGroup.querySelector(".relation-label-bg");
    const labelText = displayRelationName(relation);
    if (labelText) {
      text.textContent = labelText;
      labelGroup.style.display = "";
      text.setAttribute("x", String(path.mid.x));
      text.setAttribute("y", String(path.mid.y + 4));
      text.setAttribute("text-anchor", "middle");
      requestAnimationFrame(() => {
        try {
          const bbox = text.getBBox();
          bg.setAttribute("x", String(bbox.x - 4));
          bg.setAttribute("y", String(bbox.y - 2));
          bg.setAttribute("width", String(bbox.width + 8));
          bg.setAttribute("height", String(bbox.height + 4));
        } catch (e) {
        }
      });
    } else {
      labelGroup.style.display = "none";
    }
  }
  var nodeMap2 = /* @__PURE__ */ new Map();
  var HOP_RADIUS = 7;
  function vSub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  }
  function vAdd(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }
  function vScale(a, k) {
    return { x: a.x * k, y: a.y * k };
  }
  function vNorm(a) {
    const len = Math.hypot(a.x, a.y) || 1;
    return { x: a.x / len, y: a.y / len };
  }
  var relationSamples = /* @__PURE__ */ new Map();
  function bboxOf(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  function bboxesOverlap(a, b, pad) {
    return a.x - pad <= b.x + b.w + pad && b.x - pad <= a.x + a.w + pad && a.y - pad <= b.y + b.h + pad && b.y - pad <= a.y + a.h + pad;
  }
  function segIntersection(p1, p2, p3, p4) {
    const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
    const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
    const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
    const EPS = 1e-6;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
    return { t, point: { x: p1.x + t * d1x, y: p1.y + t * d1y } };
  }
  var MIN_EDGE_DISTANCE = MARKER_CLEARANCE + HOP_RADIUS;
  function distanceToNearestEndpoint(pt, points) {
    const first = points[0], last = points[points.length - 1];
    return Math.min(Math.hypot(pt.x - first.x, pt.y - first.y), Math.hypot(pt.x - last.x, pt.y - last.y));
  }
  var MIN_CROSSING_GAP = HOP_RADIUS * 3;
  function dedupeCrossings(crossings) {
    const byOther = /* @__PURE__ */ new Map();
    crossings.forEach((c) => {
      const list = byOther.get(c.otherId) || [];
      list.push(c);
      byOther.set(c.otherId, list);
    });
    const out = [];
    byOther.forEach((list) => {
      const sorted = list.slice().sort((a, b) => a.segIndex + a.t - (b.segIndex + b.t));
      let prev;
      sorted.forEach((c) => {
        if (prev && Math.hypot(c.point.x - prev.point.x, c.point.y - prev.point.y) < MIN_CROSSING_GAP) return;
        out.push(c);
        prev = c;
      });
    });
    return out;
  }
  function isPreferredYielder(a, b) {
    if (a.identifying !== b.identifying) return !a.identifying;
    return a.id < b.id;
  }
  function computeLineCrossingHops(entries) {
    const hopsByRelation = /* @__PURE__ */ new Map();
    const boxes = entries.map((e) => bboxOf(e.points));
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[i].id === entries[j].id) continue;
        if (!bboxesOverlap(boxes[i], boxes[j], HOP_RADIUS)) continue;
        const yielderIdx = isPreferredYielder(entries[i], entries[j]) ? i : j;
        const otherIdx = yielderIdx === i ? j : i;
        const yielder = entries[yielderIdx], other = entries[otherIdx];
        for (let si = 0; si < yielder.points.length - 1; si++) {
          for (let sj = 0; sj < other.points.length - 1; sj++) {
            const hit = segIntersection(yielder.points[si], yielder.points[si + 1], other.points[sj], other.points[sj + 1]);
            if (!hit) continue;
            if (distanceToNearestEndpoint(hit.point, yielder.points) < MIN_EDGE_DISTANCE) continue;
            if (distanceToNearestEndpoint(hit.point, other.points) < MIN_EDGE_DISTANCE) continue;
            const list = hopsByRelation.get(yielder.id) || [];
            list.push({ segIndex: si, t: hit.t, point: hit.point, otherId: other.id });
            hopsByRelation.set(yielder.id, list);
          }
        }
      }
    }
    hopsByRelation.forEach((list, id) => hopsByRelation.set(id, dedupeCrossings(list)));
    return hopsByRelation;
  }
  function cumulativeLengths(points) {
    const cum = [0];
    for (let k = 1; k < points.length; k++) cum.push(cum[k - 1] + Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y));
    return cum;
  }
  function pointAtArcLength(points, cum, targetLen) {
    const clamped = Math.max(0, Math.min(cum[cum.length - 1], targetLen));
    for (let k = 0; k < points.length - 1; k++) {
      if (cum[k + 1] >= clamped) {
        const segLen = cum[k + 1] - cum[k];
        const frac = segLen === 0 ? 0 : (clamped - cum[k]) / segLen;
        return vAdd(points[k], vScale(vSub(points[k + 1], points[k]), frac));
      }
    }
    return points[points.length - 1];
  }
  function buildHopPath(points, crossings) {
    if (!points.length) return "";
    if (!crossings.length) return "M " + points.map((p) => p.x + " " + p.y).join(" L ");
    const cum = cumulativeLengths(points);
    const sorted = crossings.map((c) => ({ c, arc: cum[c.segIndex] + c.t * (cum[c.segIndex + 1] - cum[c.segIndex]) })).sort((a, b) => a.arc - b.arc);
    let d = "M " + points[0].x + " " + points[0].y;
    let k = 1;
    let emittedArc = 0;
    sorted.forEach(({ arc }) => {
      const beforeArc = Math.max(emittedArc, arc - HOP_RADIUS);
      const afterArc = arc + HOP_RADIUS;
      while (k < points.length && cum[k] < beforeArc) {
        d += " L " + points[k].x + " " + points[k].y;
        k++;
      }
      const before = pointAtArcLength(points, cum, beforeArc);
      const after = pointAtArcLength(points, cum, afterArc);
      d += " L " + before.x + " " + before.y;
      const dir = vNorm(vSub(after, before));
      const mid = { x: (before.x + after.x) / 2, y: (before.y + after.y) / 2 };
      const perpA = { x: -dir.y, y: dir.x };
      const perpB = { x: dir.y, y: -dir.x };
      const perp = perpA.y <= perpB.y ? perpA : perpB;
      const bumpHeight = Math.max(HOP_RADIUS, Math.hypot(after.x - before.x, after.y - before.y) / 2);
      const control = vAdd(mid, vScale(perp, bumpHeight * 2));
      d += " Q " + control.x + " " + control.y + ", " + after.x + " " + after.y;
      emittedArc = afterArc;
      while (k < points.length && cum[k] <= afterArc) k++;
    });
    while (k < points.length) {
      d += " L " + points[k].x + " " + points[k].y;
      k++;
    }
    return d;
  }
  var hoppedIds = /* @__PURE__ */ new Set();
  function applyLineCrossingHops() {
    const entries = [];
    nodeMap2.forEach((node, id) => {
      if (node.style.display === "none") return;
      const relation = state.getRelation(id);
      if (!relation) return;
      const points = relationSamples.get(id);
      if (!points || points.length < 2) return;
      const hit = node.querySelector(".relation-hit");
      const line = node.querySelector(".relation-line");
      const halo = node.querySelector(".relation-halo");
      entries.push({ id, points, line, halo, baseD: hit.getAttribute("d") || "", identifying: isIdentifying(relation) });
    });
    const hopsByRelation = computeLineCrossingHops(entries);
    entries.forEach((entry) => {
      const crossings = hopsByRelation.get(entry.id);
      if (crossings && crossings.length) {
        const d = buildHopPath(entry.points, crossings);
        entry.line.setAttribute("d", d);
        entry.halo.setAttribute("d", d);
        hoppedIds.add(entry.id);
      } else if (hoppedIds.has(entry.id)) {
        entry.line.setAttribute("d", entry.baseD);
        entry.halo.setAttribute("d", entry.baseD);
        hoppedIds.delete(entry.id);
      }
    });
  }
  function render2() {
    const relations = state.data.relations;
    const seen = /* @__PURE__ */ new Set();
    relations.forEach((relation) => {
      seen.add(relation.id);
      let node = nodeMap2.get(relation.id);
      if (!node) {
        node = buildRelationNode(relation);
        nodeMap2.set(relation.id, node);
        relGroup.appendChild(node);
      }
      updateRelationNode(node, relation);
    });
    nodeMap2.forEach((node, id) => {
      if (!seen.has(id)) {
        node.remove();
        nodeMap2.delete(id);
        relationSamples.delete(id);
        hoppedIds.delete(id);
      }
    });
    applyLineCrossingHops();
  }
  function setTempLine(fromPt, fromSide, toPt, toSide, isSelf = false) {
    tempGroup.style.display = "";
    tempGroup.innerHTML = "";
    const path = linePath(fromPt, fromSide, toPt, toSide, isSelf);
    const p = el("path", { d: path.d, fill: "none", stroke: appTheme.relationStrokeHover(theme.colors.relationStrokeHover), "stroke-width": 3, "stroke-dasharray": "5,4" });
    tempGroup.appendChild(p);
  }
  function clearTempLine() {
    tempGroup.style.display = "none";
    tempGroup.innerHTML = "";
  }
  function onHandleMouseDown(e) {
    const handle = closest(e.target, (n) => n.classList && n.classList.contains("relation-handle"));
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    const g = closest(handle, (n) => n.classList && n.classList.contains("relation"));
    const relationId = g.dataset.relationId;
    const end = handle.dataset.end;
    const relation = state.getRelation(relationId);
    if (!relation) return;
    const entityId = end === "source" ? relation.sourceEntityId : relation.targetEntityId;
    const box = entityRenderer.getEntityBox(entityId);
    if (!box) return;
    const otherHandle = g.querySelector('.relation-handle[data-end="' + (end === "source" ? "target" : "source") + '"]');
    if (!otherHandle) return;
    const fixedPt = { x: Number(otherHandle.getAttribute("cx")), y: Number(otherHandle.getAttribute("cy")) };
    const fixedSide = otherHandle.getAttribute("data-side");
    const isSelf = relation.sourceEntityId === relation.targetEntityId;
    let lastAnchor;
    function onMove(ev) {
      const world = viewport.screenToWorld(ev.clientX, ev.clientY);
      lastAnchor = nearestAnchor(box, world);
      setTempLine(fixedPt, fixedSide, pointOnSide(box, lastAnchor.side, lastAnchor.t), lastAnchor.side, isSelf);
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      clearTempLine();
      if (!lastAnchor) return;
      state.updateRelation(relationId, end === "source" ? { sourceAnchor: lastAnchor } : { targetAnchor: lastAnchor });
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  function onClick(e) {
    const g = closest(e.target, (n) => n.classList && n.classList.contains("relation"));
    if (!g) return;
    state.select("relation", g.dataset.relationId);
  }
  function onDblClick(e) {
    const g = closest(e.target, (n) => n.classList && n.classList.contains("relation"));
    if (!g) return;
    state.select("relation", g.dataset.relationId);
    modalRelation.openEdit(g.dataset.relationId);
  }
  function onContextMenu(e) {
    const g = closest(e.target, (n) => n.classList && n.classList.contains("relation"));
    if (!g) return;
    e.preventDefault();
    e.stopPropagation();
    state.select("relation", g.dataset.relationId);
    contextMenu.showForRelation(g.dataset.relationId, e.clientX, e.clientY);
  }
  function init6(svg) {
    svgEl = svg;
    relGroup = el("g", { class: "relations" });
    tempGroup = el("g", { class: "temp-relation" });
    tempGroup.style.display = "none";
    svgEl.appendChild(relGroup);
    svgEl.appendChild(tempGroup);
    svgEl.addEventListener("mousedown", onHandleMouseDown);
    svgEl.addEventListener("click", onClick);
    svgEl.addEventListener("dblclick", onDblClick);
    svgEl.addEventListener("contextmenu", onContextMenu);
    state.on("change", render2);
    state.on("move", render2);
    state.on("select", render2);
    search.onChange(render2);
    render2();
  }
  var relationRenderer = { init: init6, render: render2, setTempLine, clearTempLine };

  // src/relationInteraction.ts
  var DRAG_THRESHOLD = 4;
  function planFkColumn(sourceEntityId, targetColumn, targetEntityName) {
    const source = state.getEntity(sourceEntityId);
    const reusable = source.columns.find((c) => !c.pk && c.name.toUpperCase() === targetColumn.name.toUpperCase());
    if (reusable) return { isNew: false, name: reusable.name, existingId: reusable.id };
    let candidateName = targetColumn.name;
    const collides = source.columns.some((c) => c.name.toUpperCase() === candidateName.toUpperCase());
    if (collides) candidateName = targetEntityName + "_" + targetColumn.name;
    return { isNew: true, name: candidateName };
  }
  function reuseColumnAsFk(sourceEntityId, colId) {
    state.updateColumn(sourceEntityId, colId, { fk: true });
  }
  function findOrCreateFkColumn(sourceEntityId, targetColumn, targetEntityName) {
    const plan = planFkColumn(sourceEntityId, targetColumn, targetEntityName);
    if (!plan.isNew) {
      reuseColumnAsFk(sourceEntityId, plan.existingId);
      return plan.existingId;
    }
    const newCol = {
      id: nextId("col"),
      name: plan.name,
      dataType: targetColumn.dataType,
      comment: "",
      pk: true,
      fk: true,
      nullable: false,
      isSystem: false,
      systemColId: null
    };
    copyDataTypes(targetColumn, newCol);
    state.addColumn(sourceEntityId, newCol);
    return newCol.id;
  }
  function commit(opts) {
    const targetEntity = state.getEntity(opts.targetEntityId);
    if (!targetEntity || !opts.targetColumnIds.length) return null;
    const pairs = [];
    for (const targetColumnId of opts.targetColumnIds) {
      const targetColumn = state.getColumn(opts.targetEntityId, targetColumnId);
      if (!targetColumn) return null;
      const explicitSourceColumnId = opts.explicitSourceColumnIds && opts.explicitSourceColumnIds[targetColumnId];
      let sourceColumnId;
      if (explicitSourceColumnId) {
        reuseColumnAsFk(opts.sourceEntityId, explicitSourceColumnId);
        sourceColumnId = explicitSourceColumnId;
      } else {
        sourceColumnId = findOrCreateFkColumn(opts.sourceEntityId, targetColumn, targetEntity.name);
      }
      pairs.push({ sourceColumnId, targetColumnId });
    }
    if (state.relationExistsWithPairs(pairs)) return null;
    return state.addRelation({
      id: nextId("rel"),
      name: opts.name || "",
      logicalName: opts.logicalName || "",
      sourceEntityId: opts.sourceEntityId,
      targetEntityId: opts.targetEntityId,
      columnPairs: pairs,
      sourceCardinality: opts.sourceCardinality || DEFAULT_SOURCE_CARDINALITY,
      targetCardinality: opts.targetCardinality || DEFAULT_TARGET_CARDINALITY
    });
  }
  function remove(relationId) {
    const relation = state.getRelation(relationId);
    if (!relation) return;
    const entId = relation.sourceEntityId;
    const colIds = relation.columnPairs.map((p) => p.sourceColumnId);
    const stillUsedByOthers = colIds.some(
      (colId) => state.data.relations.some((r) => r.id !== relationId && r.columnPairs.some((p) => p.sourceColumnId === colId))
    );
    if (stillUsedByOthers) {
      state.removeRelation(relationId);
      return;
    }
    const entity = state.getEntity(entId);
    const colNames = colIds.map((id) => state.getColumn(entId, id)).filter((c) => !!c).map((c) => c.name).join(", ");
    const plural = colIds.length > 1;
    const body = document.createElement("div");
    body.innerHTML = "<p>Remove this relation. What should happen to the column" + (plural ? "s" : "") + ' "' + escapeHtml(colNames) + '" on ' + escapeHtml(entity ? entity.name : "") + "?</p>";
    modal.open({
      title: "Delete relation",
      body,
      actions: [
        { label: "Cancel", onClick: () => modal.close() },
        { label: "Keep column" + (plural ? "s" : ""), onClick: () => {
          state.removeRelation(relationId);
          colIds.forEach((colId) => state.updateColumn(entId, colId, { fk: false }));
          modal.close();
        } },
        { label: "Delete column" + (plural ? "s" : ""), variant: "danger", onClick: () => {
          state.removeRelation(relationId);
          colIds.forEach((colId) => state.removeColumn(entId, colId));
          modal.close();
        } }
      ]
    });
  }
  function start(entityId, startEvent) {
    const box = entityRenderer.getEntityBox(entityId);
    const entity = state.getEntity(entityId);
    if (!box || !entity) return;
    const maxRowIdx = Math.max(entity.columns.length - 1, 0);
    function anchorYFor(worldY) {
      const rowIdx = clamp(Math.floor((worldY - box.y - theme.headerHeight) / theme.rowHeight), 0, maxRowIdx);
      return box.y + theme.headerHeight + rowIdx * theme.rowHeight + theme.rowHeight / 2;
    }
    const startClient = { x: startEvent.clientX, y: startEvent.clientY };
    let dragging = false;
    let leftEntity = false;
    function onMove(ev) {
      if (!dragging) {
        const dx = ev.clientX - startClient.x, dy = ev.clientY - startClient.y;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragging = true;
      }
      const mouseWorld = viewport.screenToWorld(ev.clientX, ev.clientY);
      if (mouseWorld.x < box.x || mouseWorld.x > box.x + box.w || mouseWorld.y < box.y || mouseWorld.y > box.y + box.h) {
        leftEntity = true;
      }
      const side = mouseWorld.x >= box.x + box.w / 2 ? "right" : "left";
      const anchor = { x: side === "right" ? box.x + box.w : box.x, y: anchorYFor(mouseWorld.y) };
      relationRenderer.setTempLine(anchor, side, mouseWorld, side === "right" ? "left" : "right");
    }
    function onUp(ev) {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      relationRenderer.clearTempLine();
      if (!dragging) {
        return;
      }
      const targetEl = document.elementFromPoint(ev.clientX, ev.clientY);
      const entityNode = targetEl && closest(targetEl, (el2) => el2.classList && el2.classList.contains("entity"));
      if (!entityNode) return;
      const droppedEntityId = entityNode.dataset.entityId;
      if (droppedEntityId === entityId && !leftEntity) return;
      modalRelation.openCreate(droppedEntityId, entityId);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  var relationInteraction = { start, commit, planFkColumn, remove };

  // src/entityDrag.ts
  var layerEl2;
  function startMove(entityIds, startEvent) {
    const origins = entityIds.map((id) => {
      const e = state.getEntity(id);
      return e ? { id, x: e.x, y: e.y } : null;
    }).filter((o) => !!o);
    if (!origins.length) return;
    const startWorld = viewport.screenToWorld(startEvent.clientX, startEvent.clientY);
    let moved = false;
    function onMove(ev) {
      const w = viewport.screenToWorld(ev.clientX, ev.clientY);
      const dx = w.x - startWorld.x, dy = w.y - startWorld.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      state.moveEntities(origins.map((o) => ({ id: o.id, x: Math.round(o.x + dx), y: Math.round(o.y + dy) })));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (moved) state.persist();
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  function onMouseDown(e) {
    if (e.button !== 0) return;
    const target = e.target;
    const multi = e.ctrlKey || e.metaKey;
    const header = closest(target, (el2) => el2.classList && el2.classList.contains("entity-header"));
    if (header) {
      e.stopPropagation();
      const entityNode = closest(header, (el2) => !!el2.dataset && !!el2.dataset.entityId);
      const entityId = entityNode.dataset.entityId;
      if (multi) {
        state.toggleEntitySelection(entityId);
        return;
      }
      if (state.isEntitySelected(entityId) && state.data.selectedEntityIds.length > 1) {
        startMove(state.data.selectedEntityIds.slice(), e);
      } else {
        state.select("entity", entityId);
        startMove([entityId], e);
      }
      return;
    }
    const body = closest(target, (el2) => el2.classList && el2.classList.contains("entity-body"));
    if (body) {
      e.stopPropagation();
      const entityNode = closest(body, (el2) => !!el2.dataset && !!el2.dataset.entityId);
      const entityId = entityNode.dataset.entityId;
      if (multi) {
        state.toggleEntitySelection(entityId);
        return;
      }
      state.select("entity", entityId);
      relationInteraction.start(entityId, e);
    }
  }
  function onDblClick2(e) {
    const entityNode = closest(e.target, (el2) => el2.classList && el2.classList.contains("entity"));
    if (!entityNode) return;
    modalEntity.open(entityNode.dataset.entityId);
  }
  function onContextMenu2(e) {
    const entityNode = closest(e.target, (el2) => el2.classList && el2.classList.contains("entity"));
    if (!entityNode) return;
    e.preventDefault();
    e.stopPropagation();
    const entityId = entityNode.dataset.entityId;
    if (!state.isEntitySelected(entityId)) state.select("entity", entityId);
    contextMenu.showForEntity(entityId, e.clientX, e.clientY);
  }
  function init7(layer) {
    layerEl2 = layer;
    layerEl2.addEventListener("mousedown", onMouseDown);
    layerEl2.addEventListener("dblclick", onDblClick2);
    layerEl2.addEventListener("contextmenu", onContextMenu2);
  }
  var entityDrag = { init: init7 };

  // src/history.ts
  var MAX_HISTORY = 100;
  var DEBOUNCE_MS = 400;
  var HISTORY_STORAGE_KEY = "erd_tool_history_v1";
  var stack = [];
  var index = -1;
  var suppress = false;
  var debounceTimer = null;
  function cloneSnapshot() {
    return {
      entities: JSON.parse(JSON.stringify(state.data.entities)),
      relations: JSON.parse(JSON.stringify(state.data.relations)),
      systemColumns: JSON.parse(JSON.stringify(state.data.systemColumns))
    };
  }
  function persistHistory() {
    try {
      sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ stack, index }));
    } catch (e) {
    }
  }
  var persistHistoryDebounced = debounce(persistHistory, DEBOUNCE_MS);
  function loadHistory() {
    try {
      const raw = sessionStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.stack) || typeof parsed.index !== "number" || !parsed.stack.length) return false;
      stack = parsed.stack;
      index = Math.min(Math.max(parsed.index, 0), stack.length - 1);
      return true;
    } catch (e) {
      return false;
    }
  }
  function pushSnapshot() {
    if (suppress) return;
    const snap = cloneSnapshot();
    if (index >= 0 && JSON.stringify(stack[index]) === JSON.stringify(snap)) return;
    stack = stack.slice(0, index + 1);
    stack.push(snap);
    index++;
    if (stack.length > MAX_HISTORY) {
      stack.shift();
      index--;
    }
    persistHistoryDebounced();
  }
  function scheduleSnapshot() {
    if (suppress) return;
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      pushSnapshot();
    }, DEBOUNCE_MS);
  }
  function applySnapshot(snap) {
    suppress = true;
    state.data.entities = JSON.parse(JSON.stringify(snap.entities));
    state.data.relations = JSON.parse(JSON.stringify(snap.relations));
    state.data.systemColumns = JSON.parse(JSON.stringify(snap.systemColumns));
    state.data.selected = null;
    state.data.selectedEntityIds = [];
    state.emit("change");
    state.emit("select");
    suppress = false;
    persistHistoryDebounced();
  }
  function flushPending() {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
      pushSnapshot();
    }
  }
  function undo2() {
    flushPending();
    if (index <= 0) return;
    index--;
    applySnapshot(stack[index]);
  }
  function redo2() {
    if (index >= stack.length - 1) return;
    index++;
    applySnapshot(stack[index]);
  }
  function canUndo() {
    return index > 0;
  }
  function canRedo() {
    return index < stack.length - 1;
  }
  function onKeydown3(e) {
    if (document.querySelector(".modal-overlay")) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo2();
    } else if (key === "y" || key === "z" && e.shiftKey) {
      e.preventDefault();
      redo2();
    }
  }
  function exportHistory() {
    const start2 = Math.max(0, stack.length - MAX_HISTORY);
    return { stack: JSON.parse(JSON.stringify(stack.slice(start2))), index: Math.max(0, index - start2) };
  }
  function importHistory(data2) {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (data2 && Array.isArray(data2.stack) && data2.stack.length) {
      stack = JSON.parse(JSON.stringify(data2.stack)).slice(-MAX_HISTORY);
      const idx = typeof data2.index === "number" ? data2.index : stack.length - 1;
      index = Math.min(Math.max(idx, 0), stack.length - 1);
    } else {
      stack = [cloneSnapshot()];
      index = 0;
    }
    persistHistoryDebounced();
  }
  function init8() {
    const loaded = loadHistory();
    const current2 = cloneSnapshot();
    if (!loaded || JSON.stringify(stack[index]) !== JSON.stringify(current2)) pushSnapshot();
    state.on("change", scheduleSnapshot);
    state.on("move", scheduleSnapshot);
    document.addEventListener("keydown", onKeydown3);
  }
  var history2 = { init: init8, undo: undo2, redo: redo2, canUndo, canRedo, exportHistory, importHistory };

  // src/jsonIO.ts
  var fileInput = null;
  async function exportJson() {
    const data2 = state.data;
    const payload = {
      entities: data2.entities,
      relations: data2.relations,
      systemColumns: data2.systemColumns,
      view: data2.view,
      designMode: data2.designMode,
      lineStyle: data2.lineStyle,
      minimapVisible: data2.minimapVisible,
      history: history2.exportHistory()
    };
    const text = JSON.stringify(payload);
    const picker = window.showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({
          suggestedName: "erd-diagram.json",
          types: [{ description: "ERD diagram (JSON)", accept: { "application/json": [".json"] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }
    downloadText(text, "erd-diagram.json", "application/json");
  }
  function ensureFileInput() {
    if (fileInput) return fileInput;
    fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      readFileAsText(file).then((text) => {
        try {
          const parsed = JSON.parse(text);
          state.replaceAll(parsed);
          history2.importHistory(parsed.history);
        } catch (e) {
          window.alert("Could not read that file as ERD JSON: " + e.message);
        }
        fileInput.value = "";
      });
    });
    document.body.appendChild(fileInput);
    return fileInput;
  }
  function importJson() {
    ensureFileInput().click();
  }
  var jsonIO = { exportJson, importJson };

  // src/ddlParser.ts
  function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  }
  function splitStatements(text) {
    return text.split(";").map((s) => s.trim()).filter(Boolean);
  }
  function stripQuotes(name) {
    if (!name) return name;
    return name.replace(/^["`]|["`]$/g, "");
  }
  function parseQualifiedName(raw) {
    const parts = raw.split(".").map((p) => stripQuotes(p.trim()));
    return parts[parts.length - 1];
  }
  function extractParenGroup(str, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < str.length; i++) {
      const ch = str[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          return { inner: str.slice(openIdx + 1, i), endIdx: i + 1 };
        }
      }
    }
    return { inner: str.slice(openIdx + 1), endIdx: str.length };
  }
  function splitTopLevel(str) {
    const out = [];
    let depth = 0, cur = "";
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  function parseColumnList(inner) {
    return splitTopLevel(inner).map((s) => stripQuotes(s.trim()));
  }
  function parseClauseList(clauses, tableName) {
    const columns = [];
    const pkColumnNames = [];
    const inlineFks = [];
    clauses.forEach((clause) => {
      const c = clause.trim();
      if (!c) return;
      let cm;
      if ((cm = c.match(/^CONSTRAINT\s+(?:"[^"]+"|`[^`]+`|[\w$#]+)\s+PRIMARY\s+KEY\s*\(([^)]*)\)/i)) || (cm = c.match(/^PRIMARY\s+KEY\s*\(([^)]*)\)/i))) {
        parseColumnList(cm[1]).forEach((n) => pkColumnNames.push(n.toUpperCase()));
        return;
      }
      if (cm = c.match(/^CONSTRAINT\s+("[^"]+"|`[^`]+`|[\w$#]+)\s+FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+((?:"[^"]+"|`[^`]+`|[\w$#]+)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|[\w$#]+))?)\s*\(([^)]*)\)/i)) {
        inlineFks.push({
          table: tableName,
          name: stripQuotes(cm[1]),
          columns: parseColumnList(cm[2]),
          refTable: parseQualifiedName(cm[3]),
          refColumns: parseColumnList(cm[4])
        });
        return;
      }
      if (cm = c.match(/^FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+((?:"[^"]+"|`[^`]+`|[\w$#]+)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|[\w$#]+))?)\s*\(([^)]*)\)/i)) {
        inlineFks.push({
          table: tableName,
          columns: parseColumnList(cm[1]),
          refTable: parseQualifiedName(cm[2]),
          refColumns: parseColumnList(cm[3])
        });
        return;
      }
      if (/^CONSTRAINT\s+(?:"[^"]+"|`[^`]+`|[\w$#]+)\s+(UNIQUE|CHECK)\b/i.test(c) || /^(UNIQUE|CHECK)\b/i.test(c)) {
        return;
      }
      const colMatch = c.match(/^(?:"([^"]+)"|`([^`]+)`|([\w$#]+))\s+([A-Za-z][\w$#]*(?:\s*\([^)]*\))?)/);
      if (colMatch) {
        const name = colMatch[1] || colMatch[2] || colMatch[3];
        const dataType = colMatch[4].replace(/\s+/g, "");
        const nullable = !/NOT\s+NULL/i.test(c);
        const defMatch = c.match(/\bDEFAULT\s+([\s\S]+?)(?:\s+NOT\s+NULL|\s+NULL\b|\s+ENABLE\b|\s+DISABLE\b|\s+PRIMARY\b|\s+UNIQUE\b|\s+CHECK\b|\s+REFERENCES\b|\s*$)/i);
        const defaultValue = defMatch ? defMatch[1].trim() : "";
        columns.push({
          id: nextId("col"),
          name,
          dataType,
          logicalDataType: dataType,
          physicalDataType: dataType,
          comment: "",
          pk: false,
          fk: false,
          nullable,
          defaultValue,
          isSystem: false,
          systemColId: null
        });
      }
    });
    return { columns, pkColumnNames, inlineFks };
  }
  function parseCreateTable(stmt, tables) {
    const m = stmt.match(/^CREATE\s+TABLE\s+((?:"[^"]+"|`[^`]+`|[\w$#]+)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|[\w$#]+))?)\s*\(/i);
    if (!m) return null;
    const tableName = parseQualifiedName(m[1]);
    const openIdx = stmt.indexOf("(", m[0].length - 1);
    const group = extractParenGroup(stmt, openIdx);
    const clauses = splitTopLevel(group.inner);
    const { columns, pkColumnNames, inlineFks } = parseClauseList(clauses, tableName);
    pkColumnNames.forEach((pkName) => {
      const col = columns.find((c) => c.name.toUpperCase() === pkName);
      if (col) {
        col.pk = true;
        col.nullable = false;
      }
    });
    let table = tables.find((t) => t.name.toUpperCase() === tableName.toUpperCase());
    if (!table) {
      table = { name: tableName, comment: "", columns: [] };
      tables.push(table);
    }
    const existingNames = table.columns.map((c) => c.name.toUpperCase());
    columns.forEach((c) => {
      if (existingNames.indexOf(c.name.toUpperCase()) === -1) table.columns.push(c);
    });
    return { table, inlineFks };
  }
  function parseCommentOnTable(stmt) {
    const m = stmt.match(/^COMMENT\s+ON\s+TABLE\s+((?:"[^"]+"|`[^`]+`|[\w$#]+)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|[\w$#]+))?)\s+IS\s+'([\s\S]*)'$/i);
    if (!m) return null;
    return { table: parseQualifiedName(m[1]), comment: m[2].replace(/''/g, "'") };
  }
  function parseCommentOnColumn(stmt) {
    const m = stmt.match(/^COMMENT\s+ON\s+COLUMN\s+((?:"[^"]+"|`[^`]+`|[\w$#]+)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|[\w$#]+))?)\.("[^"]+"|`[^`]+`|[\w$#]+)\s+IS\s+'([\s\S]*)'$/i);
    if (!m) return null;
    return { table: parseQualifiedName(m[1]), column: stripQuotes(m[2]), comment: m[3].replace(/''/g, "'") };
  }
  function parseAlterTableFk(stmt) {
    const m = stmt.match(/^ALTER\s+TABLE\s+((?:"[^"]+"|`[^`]+`|[\w$#]+)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|[\w$#]+))?)\s+ADD\s+CONSTRAINT\s+("[^"]+"|`[^`]+`|[\w$#]+)\s+FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+((?:"[^"]+"|`[^`]+`|[\w$#]+)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|[\w$#]+))?)\s*\(([^)]*)\)/i);
    if (!m) return null;
    return {
      table: parseQualifiedName(m[1]),
      name: stripQuotes(m[2]),
      columns: parseColumnList(m[3]),
      refTable: parseQualifiedName(m[4]),
      refColumns: parseColumnList(m[5])
    };
  }
  function parseAlterTableAddParen(stmt) {
    const m = stmt.match(/^ALTER\s+TABLE\s+((?:"[^"]+"|`[^`]+`|[\w$#]+)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|[\w$#]+))?)\s+ADD\s*\(/i);
    if (!m) return null;
    const tableName = parseQualifiedName(m[1]);
    const openIdx = stmt.indexOf("(", m[0].length - 1);
    const group = extractParenGroup(stmt, openIdx);
    const clauses = splitTopLevel(group.inner);
    const { pkColumnNames, inlineFks } = parseClauseList(clauses, tableName);
    return { table: tableName, pkColumnNames, inlineFks };
  }
  function parse(rawText, existingTableNames = []) {
    const warnings = [];
    const text = stripComments(rawText || "");
    const statements = splitStatements(text);
    const knownNames = new Set(existingTableNames.map((n) => n.toUpperCase()));
    const tables = [];
    const fkCandidates = [];
    const pkUpdates = [];
    const tableComments = [];
    const columnComments = [];
    statements.forEach((stmt) => {
      if (/^CREATE\s+TABLE\b/i.test(stmt)) {
        const res = parseCreateTable(stmt, tables);
        if (res && res.inlineFks.length) fkCandidates.push(...res.inlineFks);
        return;
      }
      if (/^COMMENT\s+ON\s+TABLE\b/i.test(stmt)) {
        const c = parseCommentOnTable(stmt);
        if (c) tableComments.push(c);
        return;
      }
      if (/^COMMENT\s+ON\s+COLUMN\b/i.test(stmt)) {
        const c = parseCommentOnColumn(stmt);
        if (c) columnComments.push(c);
        return;
      }
      if (/^ALTER\s+TABLE\b\s*(?:"[^"]+"|`[^`]+`|[\w$#]+)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|[\w$#]+))?\s+ADD\s*\(/i.test(stmt)) {
        const res = parseAlterTableAddParen(stmt);
        if (res) {
          const t = tables.find((t2) => t2.name.toUpperCase() === res.table.toUpperCase());
          if (t) {
            res.pkColumnNames.forEach((pkName) => {
              const col = t.columns.find((c) => c.name.toUpperCase() === pkName);
              if (col) {
                col.pk = true;
                col.nullable = false;
              }
            });
          } else if (res.pkColumnNames.length) {
            pkUpdates.push({ table: res.table, columns: res.pkColumnNames });
          }
          fkCandidates.push(...res.inlineFks);
        } else {
          warnings.push("Unparsed ALTER TABLE ... ADD (...) clause: " + stmt.slice(0, 80));
        }
        return;
      }
      if (/^ALTER\s+TABLE\b[\s\S]*FOREIGN\s+KEY\b/i.test(stmt)) {
        const fk = parseAlterTableFk(stmt);
        if (fk) fkCandidates.push(fk);
        else warnings.push("Unparsed FOREIGN KEY clause: " + stmt.slice(0, 80));
        return;
      }
    });
    tableComments.forEach((c) => {
      const t = tables.find((t2) => t2.name.toUpperCase() === c.table.toUpperCase());
      if (t) t.comment = c.comment;
    });
    columnComments.forEach((c) => {
      const t = tables.find((t2) => t2.name.toUpperCase() === c.table.toUpperCase());
      const col = t && t.columns.find((col2) => col2.name.toUpperCase() === c.column.toUpperCase());
      if (col) col.comment = c.comment;
    });
    const relations = [];
    for (const fk of fkCandidates) {
      if (!fk.columns.length || !fk.refColumns.length) continue;
      const srcTable = tables.find((t) => t.name.toUpperCase() === fk.table.toUpperCase());
      const dstTable = tables.find((t) => t.name.toUpperCase() === fk.refTable.toUpperCase());
      const srcKnown = !!srcTable || knownNames.has(fk.table.toUpperCase());
      const dstKnown = !!dstTable || knownNames.has(fk.refTable.toUpperCase());
      if (!srcKnown || !dstKnown) {
        warnings.push("Skipped FK referencing unknown table: " + fk.table + " -> " + fk.refTable);
        continue;
      }
      if (fk.columns.length !== fk.refColumns.length) {
        warnings.push("Skipped FK on " + fk.table + " - column count mismatch with referenced key");
        continue;
      }
      if (srcTable) {
        fk.columns.forEach((colName) => {
          const srcCol = srcTable.columns.find((c) => c.name.toUpperCase() === colName.toUpperCase());
          if (srcCol) srcCol.fk = true;
        });
      }
      relations.push({
        sourceTable: srcTable ? srcTable.name : fk.table,
        sourceColumns: fk.columns,
        targetTable: dstTable ? dstTable.name : fk.refTable,
        targetColumns: fk.refColumns,
        name: fk.name || ""
      });
    }
    return { tables, relations, pkUpdates, warnings };
  }

  // src/ddlExtractSql.ts
  var DB_VENDORS = [
    { value: "oracle", label: "Oracle" },
    { value: "mysql", label: "MySQL / MariaDB" },
    { value: "postgres", label: "PostgreSQL" },
    { value: "mssql", label: "SQL Server" }
  ];
  function schemaOf(schema) {
    return schema.trim() || "<SCHEMA>";
  }
  var GENERATORS = {
    oracle(schema) {
      const s = schemaOf(schema);
      return `-- Run once. CREATE TABLE (with PK/FK/unique constraints) plus table and
-- column comments, each ';'-terminated so it pastes and imports cleanly.
SELECT DBMS_METADATA.GET_DDL('TABLE', TABLE_NAME, OWNER) || ';' AS ddl
FROM ALL_TABLES
WHERE OWNER = '${s}'
UNION ALL
SELECT TO_CLOB('COMMENT ON TABLE "' || OWNER || '"."' || TABLE_NAME || '" IS ''' || REPLACE(COMMENTS, '''', '''''') || ''';')
FROM ALL_TAB_COMMENTS
WHERE OWNER = '${s}' AND COMMENTS IS NOT NULL
UNION ALL
SELECT TO_CLOB('COMMENT ON COLUMN "' || OWNER || '"."' || TABLE_NAME || '"."' || COLUMN_NAME || '" IS ''' || REPLACE(COMMENTS, '''', '''''') || ''';')
FROM ALL_COL_COMMENTS
WHERE OWNER = '${s}' AND COMMENTS IS NOT NULL;`;
    },
    mysql(schema) {
      const s = schemaOf(schema);
      return `-- Run once. Reconstructs CREATE TABLE + PK, then FK constraints, then
-- table/column comments, all combined with UNION ALL.
SELECT CONCAT('CREATE TABLE "', c.TABLE_NAME, '" (',
    GROUP_CONCAT(CONCAT('"', c.COLUMN_NAME, '" ', c.COLUMN_TYPE, IF(c.IS_NULLABLE = 'NO', ' NOT NULL', '')) ORDER BY c.ORDINAL_POSITION SEPARATOR ', '),
    COALESCE(MAX(pk.clause), ''), ');') AS ddl
FROM INFORMATION_SCHEMA.COLUMNS c
LEFT JOIN (
  SELECT TABLE_NAME,
    CONCAT(', CONSTRAINT "', TABLE_NAME, '_PK" PRIMARY KEY (',
      GROUP_CONCAT(CONCAT('"', COLUMN_NAME, '"') ORDER BY ORDINAL_POSITION SEPARATOR ', '), ')') AS clause
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = '${s}' AND CONSTRAINT_NAME = 'PRIMARY'
  GROUP BY TABLE_NAME
) pk ON pk.TABLE_NAME = c.TABLE_NAME
WHERE c.TABLE_SCHEMA = '${s}'
GROUP BY c.TABLE_NAME
UNION ALL
SELECT CONCAT('ALTER TABLE "', k.TABLE_NAME, '" ADD CONSTRAINT "', k.CONSTRAINT_NAME, '" FOREIGN KEY (',
    GROUP_CONCAT(CONCAT('"', k.COLUMN_NAME, '"') ORDER BY k.ORDINAL_POSITION SEPARATOR ', '),
    ') REFERENCES "', MAX(k.REFERENCED_TABLE_NAME), '" (',
    GROUP_CONCAT(CONCAT('"', k.REFERENCED_COLUMN_NAME, '"') ORDER BY k.ORDINAL_POSITION SEPARATOR ', '), ');')
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
WHERE k.TABLE_SCHEMA = '${s}' AND k.REFERENCED_TABLE_NAME IS NOT NULL
GROUP BY k.TABLE_NAME, k.CONSTRAINT_NAME
UNION ALL
SELECT CONCAT('COMMENT ON TABLE "', TABLE_NAME, '" IS ''', REPLACE(TABLE_COMMENT, '''', ''''''), ''';')
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = '${s}' AND TABLE_COMMENT <> ''
UNION ALL
SELECT CONCAT('COMMENT ON COLUMN "', TABLE_NAME, '"."', COLUMN_NAME, '" IS ''', REPLACE(COLUMN_COMMENT, '''', ''''''), ''';')
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = '${s}' AND COLUMN_COMMENT <> '';`;
    },
    postgres(schema) {
      const s = schemaOf(schema);
      return `-- Run once. Reconstructs CREATE TABLE + PK, then FK constraints, then
-- table/column comments, all combined with UNION ALL.
SELECT 'CREATE TABLE "' || c.relname || '" (' ||
    string_agg('"' || a.attname || '" ' || format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END, ', ' ORDER BY a.attnum) ||
    COALESCE((SELECT ', CONSTRAINT "' || c.relname || '_PK" PRIMARY KEY (' ||
        string_agg('"' || pa.attname || '"', ', ' ORDER BY u.ord) || ')'
      FROM pg_constraint pc
      JOIN unnest(pc.conkey) WITH ORDINALITY u(attnum, ord) ON true
      JOIN pg_attribute pa ON pa.attrelid = pc.conrelid AND pa.attnum = u.attnum
      WHERE pc.contype = 'p' AND pc.conrelid = c.oid), '') || ');' AS ddl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = '${s}' AND c.relkind = 'r'
GROUP BY c.oid, c.relname
UNION ALL
SELECT 'ALTER TABLE "' || cl.relname || '" ADD CONSTRAINT "' || pc.conname || '" FOREIGN KEY (' ||
    (SELECT string_agg('"' || pa.attname || '"', ', ' ORDER BY u.ord)
     FROM unnest(pc.conkey) WITH ORDINALITY u(attnum, ord) JOIN pg_attribute pa ON pa.attrelid = pc.conrelid AND pa.attnum = u.attnum) ||
    ') REFERENCES "' || rf.relname || '" (' ||
    (SELECT string_agg('"' || pa.attname || '"', ', ' ORDER BY u.ord)
     FROM unnest(pc.confkey) WITH ORDINALITY u(attnum, ord) JOIN pg_attribute pa ON pa.attrelid = pc.confrelid AND pa.attnum = u.attnum) || ');'
FROM pg_constraint pc
JOIN pg_class cl ON cl.oid = pc.conrelid
JOIN pg_class rf ON rf.oid = pc.confrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
WHERE pc.contype = 'f' AND n.nspname = '${s}'
UNION ALL
SELECT 'COMMENT ON TABLE "' || c.relname || '" IS ''' || replace(d.description, '''', '''''') || ''';'
FROM pg_class c
JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = 0
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = '${s}'
UNION ALL
SELECT 'COMMENT ON COLUMN "' || c.relname || '"."' || a.attname || '" IS ''' || replace(d.description, '''', '''''') || ''';'
FROM pg_class c
JOIN pg_attribute a ON a.attrelid = c.oid
JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = a.attnum
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = '${s}';`;
    },
    mssql(schema) {
      const s = schemaOf(schema);
      return `-- Run once. Reconstructs CREATE TABLE + PK, then FK constraints, then
-- table/column comments, all combined with UNION ALL.
SELECT 'CREATE TABLE "' + c.TABLE_NAME + '" (' +
    STRING_AGG(CAST('"' + c.COLUMN_NAME + '" ' + c.DATA_TYPE +
        CASE
          WHEN c.CHARACTER_MAXIMUM_LENGTH = -1 THEN '(MAX)'
          WHEN c.CHARACTER_MAXIMUM_LENGTH IS NOT NULL THEN '(' + CAST(c.CHARACTER_MAXIMUM_LENGTH AS VARCHAR(12)) + ')'
          WHEN c.DATA_TYPE IN ('decimal','numeric') THEN '(' + CAST(c.NUMERIC_PRECISION AS VARCHAR(12)) + ',' + CAST(c.NUMERIC_SCALE AS VARCHAR(12)) + ')'
          ELSE ''
        END +
        CASE WHEN c.IS_NULLABLE = 'NO' THEN ' NOT NULL' ELSE '' END AS NVARCHAR(MAX)), ', ')
      WITHIN GROUP (ORDER BY c.ORDINAL_POSITION) +
    ISNULL((SELECT ', CONSTRAINT "' + c.TABLE_NAME + '_PK" PRIMARY KEY (' +
        STRING_AGG(CAST('"' + ku.COLUMN_NAME + '"' AS NVARCHAR(MAX)), ', ') WITHIN GROUP (ORDER BY ku.ORDINAL_POSITION) + ')'
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
      JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME AND tc.CONSTRAINT_SCHEMA = ku.CONSTRAINT_SCHEMA
      WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND ku.TABLE_SCHEMA = '${s}' AND ku.TABLE_NAME = c.TABLE_NAME), '') + ');' AS ddl
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_SCHEMA = '${s}'
GROUP BY c.TABLE_NAME
UNION ALL
SELECT 'ALTER TABLE "' + tp.name + '" ADD CONSTRAINT "' + fk.name + '" FOREIGN KEY (' +
    STRING_AGG(CAST('"' + cp.name + '"' AS NVARCHAR(MAX)), ', ') WITHIN GROUP (ORDER BY fkc.constraint_column_id) +
    ') REFERENCES "' + tr.name + '" (' +
    STRING_AGG(CAST('"' + cr.name + '"' AS NVARCHAR(MAX)), ', ') WITHIN GROUP (ORDER BY fkc.constraint_column_id) + ');'
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.tables tp ON tp.object_id = fk.parent_object_id
JOIN sys.tables tr ON tr.object_id = fk.referenced_object_id
JOIN sys.columns cp ON cp.object_id = fkc.parent_object_id AND cp.column_id = fkc.parent_column_id
JOIN sys.columns cr ON cr.object_id = fkc.referenced_object_id AND cr.column_id = fkc.referenced_column_id
WHERE SCHEMA_NAME(tp.schema_id) = '${s}'
GROUP BY tp.name, fk.name, tr.name
UNION ALL
SELECT 'COMMENT ON TABLE "' + t.name + '" IS ''' + REPLACE(CAST(ep.value AS NVARCHAR(MAX)), '''', '''''') + ''';'
FROM sys.tables t
JOIN sys.extended_properties ep ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
WHERE SCHEMA_NAME(t.schema_id) = '${s}'
UNION ALL
SELECT 'COMMENT ON COLUMN "' + t.name + '"."' + c.name + '" IS ''' + REPLACE(CAST(ep.value AS NVARCHAR(MAX)), '''', '''''') + ''';'
FROM sys.tables t
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.extended_properties ep ON ep.major_id = t.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'
WHERE SCHEMA_NAME(t.schema_id) = '${s}';`;
    }
  };
  function generateExtractSql(vendor, schema) {
    return (GENERATORS[vendor] || GENERATORS.oracle)(schema);
  }

  // src/ddlImport.ts
  var IMPORT_START_X = 60;
  var IMPORT_START_Y = 60;
  var IMPORT_COLUMN_GAP = 60;
  var IMPORT_ROW_GAP = 60;
  var IMPORT_EXISTING_GAP = 80;
  function entityHeight2(entity) {
    return theme.headerHeight + entity.columns.length * theme.rowHeight;
  }
  function nextImportStartY() {
    if (!state.data.entities.length) return IMPORT_START_Y;
    return state.data.entities.reduce((maxY, entity) => {
      return Math.max(maxY, entity.y + entityHeight2(entity));
    }, IMPORT_START_Y) + IMPORT_EXISTING_GAP;
  }
  function importColumnCount(tableCount) {
    return Math.max(1, Math.floor(Math.sqrt(Math.max(tableCount, 1))));
  }
  function createImportLayout(tableCount) {
    const columnCount = importColumnCount(tableCount);
    const nextYByColumn = Array.from({ length: columnCount }, () => nextImportStartY());
    let nextColumn = 0;
    return (entity) => {
      const column = nextColumn;
      const x = IMPORT_START_X + column * (theme.entityWidth + IMPORT_COLUMN_GAP);
      const y = nextYByColumn[column];
      nextYByColumn[column] = y + entityHeight2(entity) + IMPORT_ROW_GAP;
      nextColumn = (nextColumn + 1) % columnCount;
      return { x, y };
    };
  }
  function importParsedResult(result) {
    const nameToEntityId = {};
    state.data.entities.forEach((e) => {
      nameToEntityId[e.name.toUpperCase()] = e.id;
    });
    const existingTableNames = new Set(Object.keys(nameToEntityId));
    const newTableCount = result.tables.filter((table) => !existingTableNames.has(table.name.toUpperCase())).length;
    const nextImportPosition = createImportLayout(newTableCount);
    result.tables.forEach((table) => {
      const upper = table.name.toUpperCase();
      const existingId = nameToEntityId[upper];
      const columns = table.columns.map((c) => Object.assign({}, c, { isSystem: false, systemColId: null }));
      if (existingId) {
        const entity = state.getEntity(existingId);
        entity.name = table.name;
        entity.comment = table.comment || entity.comment;
        entity.columns = columns;
        state.applySystemColumnsToEntity(entity);
      } else {
        const entity = { id: nextId("ent"), name: table.name, comment: table.comment || "", x: 0, y: 0, columns, headerColor: null };
        state.applySystemColumnsToEntity(entity);
        const pos = nextImportPosition(entity);
        entity.x = pos.x;
        entity.y = pos.y;
        state.addEntity(entity);
        nameToEntityId[upper] = entity.id;
      }
    });
    result.pkUpdates.forEach((upd) => {
      const entityId = nameToEntityId[upd.table.toUpperCase()];
      if (!entityId) return;
      const entity = state.getEntity(entityId);
      upd.columns.forEach((colName) => {
        const col = entity.columns.find((c) => c.name.toUpperCase() === colName.toUpperCase());
        if (col) {
          col.pk = true;
          col.nullable = false;
        }
      });
    });
    let created = 0;
    result.relations.forEach((rel) => {
      const sourceId = nameToEntityId[rel.sourceTable.toUpperCase()];
      const targetId = nameToEntityId[rel.targetTable.toUpperCase()];
      if (!sourceId || !targetId) return;
      const sourceEntity = state.getEntity(sourceId);
      const targetEntity = state.getEntity(targetId);
      const columnPairs = [];
      for (let i = 0; i < rel.sourceColumns.length; i++) {
        const sourceCol = sourceEntity.columns.find((c) => c.name.toUpperCase() === rel.sourceColumns[i].toUpperCase());
        const targetCol = targetEntity.columns.find((c) => c.name.toUpperCase() === rel.targetColumns[i].toUpperCase());
        if (!sourceCol || !targetCol) {
          columnPairs.length = 0;
          break;
        }
        columnPairs.push({ sourceColumnId: sourceCol.id, targetColumnId: targetCol.id });
      }
      if (!columnPairs.length) return;
      if (state.relationExistsWithPairs(columnPairs)) return;
      columnPairs.forEach((p) => {
        const c = sourceEntity.columns.find((c2) => c2.id === p.sourceColumnId);
        if (c) c.fk = true;
      });
      state.addRelation({
        id: nextId("rel"),
        name: rel.name || "",
        logicalName: "",
        sourceEntityId: sourceId,
        targetEntityId: targetId,
        columnPairs,
        sourceCardinality: DEFAULT_SOURCE_CARDINALITY,
        targetCardinality: DEFAULT_TARGET_CARDINALITY
      });
      created++;
    });
    state.emit("change");
    return { tableCount: result.tables.length, relationCount: created };
  }
  var STEP_LABELS = [
    { key: "plan", label: "1. Plan" },
    { key: "execute", label: "2. Execute" },
    { key: "result", label: "3. Result" }
  ];
  function stepsHtml(current2) {
    const idx = STEP_LABELS.findIndex((s) => s.key === current2);
    return '<div class="wizard-steps">' + STEP_LABELS.map((s, i) => {
      const cls = i === idx ? "active" : i < idx ? "done" : "";
      const sep = i < STEP_LABELS.length - 1 ? '<span class="wizard-step-sep">&rarr;</span>' : "";
      return '<span class="wizard-step ' + cls + '" data-step="' + s.key + '">' + s.label + "</span>" + sep;
    }).join("") + "</div>";
  }
  function open4() {
    let mode = "sql";
    let vendor = "oracle";
    let schema = "";
    let ddlText = "";
    let parseResult = null;
    let applied = false;
    let appliedRelationCount = 0;
    function wireStepNav(body) {
      const chips = Array.from(body.querySelectorAll(".wizard-step.done"));
      chips.forEach((chip) => {
        const step = chip.dataset.step;
        chip.addEventListener("click", () => goToStep(step));
      });
    }
    function goToStep(step) {
      if (step === "plan") renderPlan("right");
      else if (step === "execute") renderExecute("right");
    }
    function renderPlan(direction = "left") {
      const body = document.createElement("div");
      body.innerHTML = stepsHtml("plan") + '<div class="wizard-plan-choices"><button type="button" class="wizard-plan-card" data-mode="sql"><div><strong>DDL SQL Import</strong><p class="hint">Generate a catalog-extraction SQL script for your DB vendor, run it there, then paste the resulting DDL text.</p></div><span class="wizard-plan-arrow">&rsaquo;</span></button><button type="button" class="wizard-plan-card" data-mode="file"><div><strong>File Import</strong><p class="hint">Choose or drag &amp; drop a .sql/.txt file that already contains DDL statements.</p></div><span class="wizard-plan-arrow">&rsaquo;</span></button></div>';
      Array.from(body.querySelectorAll(".wizard-plan-card")).forEach((card) => {
        card.addEventListener("click", () => {
          mode = card.dataset.mode;
          renderExecute("left");
        });
      });
      wireStepNav(body);
      modal.transition({ title: "Import", width: "640px", body, actions: [] }, direction);
    }
    function renderExecuteSql(direction = "left") {
      const body = document.createElement("div");
      body.innerHTML = stepsHtml("execute") + '<div class="ddl-extract-controls"><label>DB vendor<br><select class="f-extract-vendor">' + DB_VENDORS.map((v) => '<option value="' + v.value + '"' + (v.value === vendor ? " selected" : "") + ">" + escapeHtml(v.label) + "</option>").join("") + '</select></label><label>Schema / owner<br><input type="text" class="f-extract-schema" placeholder="e.g. APP_OWNER" value="' + escapeHtml(schema) + '"></label><button type="button" class="btn f-extract-copy">Copy SQL</button></div><textarea class="f-extract-sql" rows="9" readonly></textarea><p class="hint">Run the SQL above against your database, then paste the resulting DDL text below.</p><textarea class="f-ddl-text" rows="9" placeholder="CREATE TABLE ...">' + escapeHtml(ddlText) + '</textarea><div class="ddl-warnings"></div>';
      const vendorSelect = body.querySelector(".f-extract-vendor");
      const schemaInput = body.querySelector(".f-extract-schema");
      const extractSqlEl = body.querySelector(".f-extract-sql");
      const copyBtn = body.querySelector(".f-extract-copy");
      const textarea = body.querySelector(".f-ddl-text");
      const warningsEl = body.querySelector(".ddl-warnings");
      function updateSql() {
        extractSqlEl.value = generateExtractSql(vendor, schema);
      }
      updateSql();
      vendorSelect.addEventListener("change", () => {
        vendor = vendorSelect.value;
        updateSql();
      });
      schemaInput.addEventListener("input", () => {
        schema = schemaInput.value;
        updateSql();
      });
      copyBtn.addEventListener("click", () => copyToClipboard(extractSqlEl.value));
      textarea.addEventListener("input", () => {
        ddlText = textarea.value;
      });
      wireStepNav(body);
      modal.transition({
        title: "Import",
        width: "820px",
        body,
        actions: [
          { label: "Back", onClick: () => renderPlan("right") },
          { label: "Next", variant: "primary", onClick: () => tryParseAndAdvance(warningsEl) }
        ]
      }, direction);
    }
    function renderExecuteFile(direction = "left") {
      const body = document.createElement("div");
      body.innerHTML = stepsHtml("execute") + '<div class="ddl-dropzone"><p>Drag &amp; drop a .sql/.txt file here, or</p><button type="button" class="btn f-dropzone-browse">Choose file</button><input type="file" class="f-ddl-file" accept=".sql,.txt" style="display:none"><p class="hint f-dropzone-filename"></p></div><textarea class="f-ddl-text" rows="12" placeholder="File contents will appear here - you can also edit directly">' + escapeHtml(ddlText) + '</textarea><div class="ddl-warnings"></div>';
      const dropzone = body.querySelector(".ddl-dropzone");
      const browseBtn = body.querySelector(".f-dropzone-browse");
      const fileInput2 = body.querySelector(".f-ddl-file");
      const filenameEl = body.querySelector(".f-dropzone-filename");
      const textarea = body.querySelector(".f-ddl-text");
      const warningsEl = body.querySelector(".ddl-warnings");
      function loadFile(file) {
        readFileAsText(file).then((text) => {
          ddlText = text;
          textarea.value = text;
          filenameEl.textContent = "Loaded: " + file.name;
        });
      }
      browseBtn.addEventListener("click", () => fileInput2.click());
      fileInput2.addEventListener("change", () => {
        const file = fileInput2.files && fileInput2.files[0];
        if (file) loadFile(file);
      });
      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
      });
      dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
      dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) loadFile(file);
      });
      textarea.addEventListener("input", () => {
        ddlText = textarea.value;
      });
      wireStepNav(body);
      modal.transition({
        title: "Import",
        width: "700px",
        body,
        actions: [
          { label: "Back", onClick: () => renderPlan("right") },
          { label: "Next", variant: "primary", onClick: () => tryParseAndAdvance(warningsEl) }
        ]
      }, direction);
    }
    function renderExecute(direction = "left") {
      if (mode === "sql") renderExecuteSql(direction);
      else renderExecuteFile(direction);
    }
    function tryParseAndAdvance(warningsEl) {
      if (!ddlText.trim()) {
        warningsEl.innerHTML = '<div class="warn-line">Paste or load some DDL text first.</div>';
        return;
      }
      const result = parse(ddlText, state.data.entities.map((e) => e.name));
      if (!result.tables.length && !result.relations.length && !result.pkUpdates.length) {
        warningsEl.innerHTML = '<div class="warn-line">No CREATE TABLE statements were recognized.</div>';
        return;
      }
      parseResult = result;
      applied = false;
      renderResult("left");
    }
    function renderResult(direction = "left", animate = true) {
      const result = parseResult;
      const tableItems = result.tables.map(
        (t) => '<li class="import-result-item">' + escapeHtml(t.name) + ' <span class="hint">(' + t.columns.length + " column" + (t.columns.length === 1 ? "" : "s") + ")</span></li>"
      ).join("");
      const relationItems = result.relations.map(
        (r) => '<li class="import-result-item">' + escapeHtml(r.sourceTable) + "." + escapeHtml(r.sourceColumns.join(", ")) + " &rarr; " + escapeHtml(r.targetTable) + "." + escapeHtml(r.targetColumns.join(", ")) + (r.name ? ' <span class="hint">(' + escapeHtml(r.name) + ")</span>" : "") + "</li>"
      ).join("");
      const body = document.createElement("div");
      body.innerHTML = stepsHtml("result") + '<p class="hint">' + (applied ? "Imported " + result.tables.length + " table(s) and " + appliedRelationCount + " relation(s)." : "Review what will be imported, then choose Apply.") + '</p><div class="import-result-section"><h4>Tables (' + result.tables.length + ")</h4>" + (tableItems ? '<ul class="import-result-list">' + tableItems + "</ul>" : '<p class="hint">None</p>') + '</div><div class="import-result-section"><h4>Constraints / relations (' + result.relations.length + ")</h4>" + (relationItems ? '<ul class="import-result-list">' + relationItems + "</ul>" : '<p class="hint">None</p>') + "</div>" + (result.warnings.length ? '<div class="ddl-warnings">' + result.warnings.map((w) => '<div class="warn-line">' + escapeHtml(w) + "</div>").join("") + "</div>" : "");
      wireStepNav(body);
      const opts = {
        title: "Import",
        width: "700px",
        body,
        actions: applied ? [{ label: "Close", variant: "primary", onClick: () => modal.close() }] : [
          { label: "Back", onClick: () => renderExecute("right") },
          { label: "Apply", variant: "primary", onClick: () => {
            const summary = importParsedResult(result);
            appliedRelationCount = summary.relationCount;
            applied = true;
            renderResult("left", false);
          } }
        ]
      };
      if (animate) modal.transition(opts, direction);
      else modal.open(opts);
    }
    renderPlan();
  }
  var ddlImport = { open: open4, importParsedResult };

  // src/pngExport.ts
  var MARGIN = 50;
  var PIXEL_RATIO = 2;
  function exportColors(options) {
    if (options && options.darkMode) {
      return {
        background: "#0b1120",
        bodyBg: "#111827",
        border: "#475569",
        rowAlt: "#172033",
        pkBg: "#172554",
        systemBg: "#2f260f",
        systemText: "#facc15",
        text: "#dbe4f0",
        subtext: "#94a3b8",
        relationLabelBg: "#0f172a",
        relationIdentifying: "#f87171",
        relationNonIdentifying: "#94a3b8"
      };
    }
    return {
      background: "#ffffff",
      bodyBg: theme.colors.bodyBg,
      border: theme.colors.border,
      rowAlt: theme.colors.rowAlt,
      pkBg: theme.colors.pkBg,
      systemBg: theme.colors.systemBg,
      systemText: theme.colors.systemText,
      text: theme.colors.text,
      subtext: theme.colors.subtext,
      relationLabelBg: theme.colors.relationLabelBg,
      relationIdentifying: "#1d4ed8",
      relationNonIdentifying: "#64748b"
    };
  }
  function rowBackground(col, idx, colors) {
    if (col.isSystem) return colors.systemBg;
    if (col.pk) return colors.pkBg;
    if (idx % 2 === 1) return colors.rowAlt;
    return colors.bodyBg;
  }
  function bounds() {
    const entities = state.data.entities;
    if (!entities.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x, y, w, h) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    };
    entities.forEach((e) => {
      const box = entityRenderer.getEntityBox(e.id);
      grow(box.x, box.y, box.w, box.h);
    });
    document.querySelectorAll("#relation-svg .relation").forEach((g) => {
      try {
        const b = g.getBBox();
        if (b.width || b.height) grow(b.x, b.y, b.width, b.height);
      } catch (e) {
      }
    });
    return { minX: minX - MARGIN, minY: minY - MARGIN, maxX: maxX + MARGIN, maxY: maxY + MARGIN };
  }
  function bezierPointAt2(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
    return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
  }
  function sideDir2(side) {
    switch (side) {
      case "left":
        return { x: -1, y: 0 };
      case "right":
        return { x: 1, y: 0 };
      case "top":
        return { x: 0, y: -1 };
      case "bottom":
        return { x: 0, y: 1 };
    }
  }
  function pointOnSide2(box, side, t) {
    switch (side) {
      case "left":
        return { x: box.x, y: box.y + box.h * t };
      case "right":
        return { x: box.x + box.w, y: box.y + box.h * t };
      case "top":
        return { x: box.x + box.w * t, y: box.y };
      case "bottom":
        return { x: box.x + box.w * t, y: box.y + box.h };
    }
  }
  function computeEndpoints2(aBox, aRowY, bBox, bRowY, isSelf, aAnchor, bAnchor) {
    if (isSelf) {
      const aPt2 = aAnchor ? pointOnSide2(aBox, aAnchor.side, aAnchor.t) : { x: aBox.x, y: aRowY };
      const bPt2 = bAnchor ? pointOnSide2(bBox, bAnchor.side, bAnchor.t) : { x: bBox.x, y: bRowY };
      return { aPt: aPt2, bPt: bPt2, aSide: aAnchor ? aAnchor.side : "left", bSide: bAnchor ? bAnchor.side : "left" };
    }
    const aCenterX = aBox.x + aBox.w / 2, bCenterX = bBox.x + bBox.w / 2;
    let autoASide, autoBSide;
    if (aCenterX <= bCenterX) {
      autoASide = "right";
      autoBSide = "left";
    } else {
      autoASide = "left";
      autoBSide = "right";
    }
    const aSide = aAnchor ? aAnchor.side : autoASide;
    const bSide = bAnchor ? bAnchor.side : autoBSide;
    const aPt = aAnchor ? pointOnSide2(aBox, aAnchor.side, aAnchor.t) : { x: autoASide === "right" ? aBox.x + aBox.w : aBox.x, y: aRowY };
    const bPt = bAnchor ? pointOnSide2(bBox, bAnchor.side, bAnchor.t) : { x: autoBSide === "right" ? bBox.x + bBox.w : bBox.x, y: bRowY };
    return { aPt, bPt, aSide, bSide };
  }
  var MARKER_CLEARANCE2 = 32;
  function markerAnchor2(edge, side) {
    const dir = sideDir2(side);
    return { x: edge.x + dir.x * MARKER_CLEARANCE2, y: edge.y + dir.y * MARKER_CLEARANCE2 };
  }
  function segIntersectsBox2(p1, p2, box, pad) {
    const left = box.x + pad, right = box.x + box.w - pad, top = box.y + pad, bottom = box.y + box.h - pad;
    if (right <= left || bottom <= top) return false;
    if (p1.y === p2.y) {
      if (p1.y <= top || p1.y >= bottom) return false;
      return Math.max(p1.x, p2.x) > left && Math.min(p1.x, p2.x) < right;
    }
    if (p1.x === p2.x) {
      if (p1.x <= left || p1.x >= right) return false;
      return Math.max(p1.y, p2.y) > top && Math.min(p1.y, p2.y) < bottom;
    }
    return false;
  }
  function drawCrowFoot(ctx2, point, side) {
    const dir = sideDir2(side);
    const perp = { x: -dir.y, y: dir.x };
    const forward = { x: point.x + dir.x * 12, y: point.y + dir.y * 12 };
    [-8, 8].forEach((off2) => {
      ctx2.beginPath();
      ctx2.moveTo(point.x + perp.x * off2, point.y + perp.y * off2);
      ctx2.lineTo(forward.x, forward.y);
      ctx2.stroke();
    });
  }
  function drawBar(ctx2, point, side, distance) {
    const dir = sideDir2(side);
    const perp = { x: -dir.y, y: dir.x };
    const cx = point.x + dir.x * distance, cy = point.y + dir.y * distance;
    ctx2.beginPath();
    ctx2.moveTo(cx - perp.x * 8, cy - perp.y * 8);
    ctx2.lineTo(cx + perp.x * 8, cy + perp.y * 8);
    ctx2.stroke();
  }
  function drawCircle(ctx2, point, side, distance, colors) {
    const dir = sideDir2(side);
    ctx2.beginPath();
    ctx2.arc(point.x + dir.x * distance, point.y + dir.y * distance, 6, 0, Math.PI * 2);
    ctx2.fillStyle = colors.bodyBg;
    ctx2.fill();
    ctx2.stroke();
  }
  function drawCardinalityMarker(ctx2, point, side, cardinality, colors) {
    switch (cardinality) {
      case "one":
        drawBar(ctx2, point, side, 9);
        drawBar(ctx2, point, side, 15);
        break;
      case "zero-or-one":
        drawBar(ctx2, point, side, 9);
        drawCircle(ctx2, point, side, 17, colors);
        break;
      case "zero-or-many":
        drawCrowFoot(ctx2, point, side);
        drawCircle(ctx2, point, side, 16, colors);
        break;
      case "one-or-many":
        drawCrowFoot(ctx2, point, side);
        drawBar(ctx2, point, side, 12);
        break;
      case "many":
      default:
        drawCrowFoot(ctx2, point, side);
        break;
    }
  }
  function isIdentifying2(relation) {
    return relation.columnPairs.every((p) => {
      const col = state.getColumn(relation.sourceEntityId, p.sourceColumnId);
      return !!col && col.pk;
    });
  }
  function drawRelation(ctx2, relation, colors) {
    const aBox = entityRenderer.getEntityBox(relation.sourceEntityId);
    const bBox = entityRenderer.getEntityBox(relation.targetEntityId);
    if (!aBox || !bBox) return;
    const firstPair = relation.columnPairs[0];
    if (!firstPair) return;
    const aRow = entityRenderer.getColumnRowCenter(relation.sourceEntityId, firstPair.sourceColumnId);
    const bRow = entityRenderer.getColumnRowCenter(relation.targetEntityId, firstPair.targetColumnId);
    if (!aRow || !bRow) return;
    const geom = computeEndpoints2(aBox, aRow.y, bBox, bRow.y, relation.sourceEntityId === relation.targetEntityId, relation.sourceAnchor, relation.targetAnchor);
    const markerA = markerAnchor2(geom.aPt, geom.aSide);
    const markerB = markerAnchor2(geom.bPt, geom.bSide);
    const dirA = sideDir2(geom.aSide), dirB = sideDir2(geom.bSide);
    const dist = Math.max(Math.hypot(markerB.x - markerA.x, markerB.y - markerA.y) * 0.5, 50);
    const identifying = isIdentifying2(relation);
    ctx2.strokeStyle = identifying ? colors.relationIdentifying : colors.relationNonIdentifying;
    ctx2.lineWidth = 2.5;
    ctx2.setLineDash(identifying ? [] : [6, 4]);
    ctx2.beginPath();
    ctx2.moveTo(geom.aPt.x, geom.aPt.y);
    ctx2.lineTo(markerA.x, markerA.y);
    const isSelf = relation.sourceEntityId === relation.targetEntityId;
    const isOpposite = dirA.x === -dirB.x && dirA.y === -dirB.y;
    const arcMidAngle = (from, to, ccw) => {
      let e = to;
      if (!ccw) {
        while (e < from) e += Math.PI * 2;
      } else {
        while (e > from) e -= Math.PI * 2;
      }
      return (from + e) / 2;
    };
    const angleDist = (a, b) => {
      const d = Math.abs(a - b) % (Math.PI * 2);
      return Math.min(d, Math.PI * 2 - d);
    };
    let mid;
    if (isSelf && geom.aSide === geom.bSide) {
      const chord = Math.hypot(markerB.x - markerA.x, markerB.y - markerA.y);
      const r = Math.max(chord / 2, 40);
      const chordMidX = (markerA.x + markerB.x) / 2, chordMidY = (markerA.y + markerB.y) / 2;
      const centerOffset = Math.sqrt(Math.max(r * r - chord / 2 * (chord / 2), 0));
      const center = { x: chordMidX + dirA.x * centerOffset, y: chordMidY + dirA.y * centerOffset };
      const farPoint = { x: chordMidX + dirA.x * r, y: chordMidY + dirA.y * r };
      const startAngle = Math.atan2(markerA.y - center.y, markerA.x - center.x);
      const endAngle = Math.atan2(markerB.y - center.y, markerB.x - center.x);
      const farAngle = Math.atan2(farPoint.y - center.y, farPoint.x - center.x);
      const useCcw = angleDist(arcMidAngle(startAngle, endAngle, true), farAngle) < angleDist(arcMidAngle(startAngle, endAngle, false), farAngle);
      ctx2.arc(center.x, center.y, r, startAngle, endAngle, useCcw);
      mid = farPoint;
    } else if (isSelf && !isOpposite) {
      const FIXED_R = 60;
      const chord = Math.hypot(markerB.x - markerA.x, markerB.y - markerA.y);
      const r = Math.max(FIXED_R, chord / 2);
      const chordMidX = (markerA.x + markerB.x) / 2, chordMidY = (markerA.y + markerB.y) / 2;
      const centerOffset = Math.sqrt(Math.max(r * r - chord / 2 * (chord / 2), 0));
      const chordDirX = (markerB.x - markerA.x) / chord, chordDirY = (markerB.y - markerA.y) / chord;
      const perpX = -chordDirY, perpY = chordDirX;
      const center1 = { x: chordMidX + perpX * centerOffset, y: chordMidY + perpY * centerOffset };
      const center2 = { x: chordMidX - perpX * centerOffset, y: chordMidY - perpY * centerOffset };
      const boxCenter = { x: aBox.x + aBox.w / 2, y: aBox.y + aBox.h / 2 };
      const center = Math.hypot(center1.x - boxCenter.x, center1.y - boxCenter.y) < Math.hypot(center2.x - boxCenter.x, center2.y - boxCenter.y) ? center1 : center2;
      const startAngle = Math.atan2(markerA.y - center.y, markerA.x - center.x);
      const endAngle = Math.atan2(markerB.y - center.y, markerB.x - center.x);
      const midCcw = { a: arcMidAngle(startAngle, endAngle, true) }, midCw = { a: arcMidAngle(startAngle, endAngle, false) };
      const pCcw = { x: center.x + r * Math.cos(midCcw.a), y: center.y + r * Math.sin(midCcw.a) };
      const pCw = { x: center.x + r * Math.cos(midCw.a), y: center.y + r * Math.sin(midCw.a) };
      const useCcw = Math.hypot(pCcw.x - boxCenter.x, pCcw.y - boxCenter.y) > Math.hypot(pCw.x - boxCenter.x, pCw.y - boxCenter.y);
      ctx2.arc(center.x, center.y, r, startAngle, endAngle, useCcw);
      mid = { x: (markerA.x + markerB.x) / 2, y: (markerA.y + markerB.y) / 2 };
    } else if (state.data.lineStyle === "angular") {
      const stubA = { x: markerA.x + dirA.x * dist, y: markerA.y + dirA.y * dist };
      const stubB = { x: markerB.x + dirB.x * dist, y: markerB.y + dirB.y * dist };
      const aHorizontal = geom.aSide === "left" || geom.aSide === "right";
      const bHorizontal = geom.bSide === "left" || geom.bSide === "right";
      if (aHorizontal && bHorizontal) {
        const opposite = dirA.x === -dirB.x;
        const facingToward = dirA.x * (markerB.x - markerA.x) >= 0;
        if (opposite && !facingToward) {
          const midY = (markerA.y + markerB.y) / 2;
          ctx2.lineTo(markerA.x, midY);
          ctx2.lineTo(markerB.x, midY);
          mid = { x: (markerA.x + markerB.x) / 2, y: midY };
        } else {
          const midX = (stubA.x + stubB.x) / 2;
          ctx2.lineTo(midX, markerA.y);
          ctx2.lineTo(midX, markerB.y);
          mid = { x: midX, y: (markerA.y + markerB.y) / 2 };
        }
      } else if (!aHorizontal && !bHorizontal) {
        const opposite = dirA.y === -dirB.y;
        const facingToward = dirA.y * (markerB.y - markerA.y) >= 0;
        if (opposite && !facingToward) {
          const midX = (markerA.x + markerB.x) / 2;
          ctx2.lineTo(midX, markerA.y);
          ctx2.lineTo(midX, markerB.y);
          mid = { x: midX, y: (markerA.y + markerB.y) / 2 };
        } else {
          const midY = (stubA.y + stubB.y) / 2;
          ctx2.lineTo(markerA.x, midY);
          ctx2.lineTo(markerB.x, midY);
          mid = { x: (markerA.x + markerB.x) / 2, y: midY };
        }
      } else {
        const corner1 = aHorizontal ? { x: markerB.x, y: markerA.y } : { x: markerA.x, y: markerB.y };
        const corner2 = aHorizontal ? { x: markerA.x, y: markerB.y } : { x: markerB.x, y: markerA.y };
        const clean = (corner) => {
          const pts = [geom.aPt, markerA, corner, markerB, geom.bPt];
          for (let i = 0; i < pts.length - 1; i++) {
            if (segIntersectsBox2(pts[i], pts[i + 1], aBox, 1) || segIntersectsBox2(pts[i], pts[i + 1], bBox, 1)) return false;
          }
          return true;
        };
        const bend = !clean(corner1) && clean(corner2) ? corner2 : corner1;
        ctx2.lineTo(bend.x, bend.y);
        mid = bend;
      }
      ctx2.lineTo(markerB.x, markerB.y);
    } else {
      const c1 = { x: markerA.x + dirA.x * dist, y: markerA.y + dirA.y * dist };
      const c2 = { x: markerB.x + dirB.x * dist, y: markerB.y + dirB.y * dist };
      ctx2.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, markerB.x, markerB.y);
      mid = bezierPointAt2(markerA, c1, c2, markerB, 0.5);
    }
    ctx2.lineTo(geom.bPt.x, geom.bPt.y);
    ctx2.stroke();
    ctx2.setLineDash([]);
    drawCardinalityMarker(ctx2, geom.aPt, geom.aSide, sourceCardinalityOf(relation), colors);
    drawCardinalityMarker(ctx2, geom.bPt, geom.bSide, targetCardinalityOf(relation), colors);
    const labelText = state.data.designMode === "logical" && relation.logicalName ? relation.logicalName : relation.name;
    if (labelText) {
      ctx2.font = "11px " + theme.fontFamily;
      const textWidth = ctx2.measureText(labelText).width;
      ctx2.fillStyle = colors.relationLabelBg;
      ctx2.fillRect(mid.x - textWidth / 2 - 4, mid.y - 10, textWidth + 8, 16);
      ctx2.fillStyle = colors.text;
      ctx2.textAlign = "center";
      ctx2.fillText(labelText, mid.x, mid.y + 2);
      ctx2.textAlign = "left";
    }
  }
  function drawEntity(ctx2, entity, colors) {
    const box = entityRenderer.getEntityBox(entity.id);
    ctx2.fillStyle = entity.headerColor || theme.colors.headerBg;
    ctx2.fillRect(box.x, box.y, box.w, theme.headerHeight);
    ctx2.fillStyle = theme.colors.headerText;
    ctx2.font = "bold 13px " + theme.fontFamily;
    ctx2.textBaseline = "middle";
    ctx2.fillText(entityRenderer.displayName(entity), box.x + 8, box.y + theme.headerHeight / 2 + 1, box.w - 16);
    entity.columns.forEach((col, idx) => {
      const rowY = box.y + theme.headerHeight + idx * theme.rowHeight;
      ctx2.fillStyle = rowBackground(col, idx, colors);
      ctx2.fillRect(box.x, rowY, box.w, theme.rowHeight);
      const flag = col.isSystem ? "S" : col.pk && col.fk ? "P/F" : col.pk ? "PK" : col.fk ? "FK" : "";
      if (flag) {
        ctx2.font = "bold 10px " + theme.fontFamily;
        ctx2.fillStyle = colors.subtext;
        ctx2.fillText(flag, box.x + 6, rowY + theme.rowHeight / 2 + 1);
      }
      ctx2.font = "12px " + theme.fontFamily;
      ctx2.fillStyle = col.isSystem ? colors.systemText : colors.text;
      ctx2.fillText(entityRenderer.displayColumnName(col), box.x + 30, rowY + theme.rowHeight / 2 + 1, box.w - 100);
      ctx2.font = "11px " + theme.fontFamily;
      ctx2.fillStyle = colors.subtext;
      ctx2.textAlign = "right";
      ctx2.fillText(entityRenderer.displayColumnDataType(col) + (col.nullable ? "" : " *"), box.x + box.w - 6, rowY + theme.rowHeight / 2 + 1, 90);
      ctx2.textAlign = "left";
    });
    ctx2.strokeStyle = colors.border;
    ctx2.lineWidth = 1;
    ctx2.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
  }
  function renderDataUrl(options) {
    const b = bounds();
    if (!b) return null;
    const colors = exportColors(options);
    const width = b.maxX - b.minX, height = b.maxY - b.minY;
    const canvas = document.createElement("canvas");
    canvas.width = width * PIXEL_RATIO;
    canvas.height = height * PIXEL_RATIO;
    const ctx2 = canvas.getContext("2d");
    ctx2.scale(PIXEL_RATIO, PIXEL_RATIO);
    ctx2.translate(-b.minX, -b.minY);
    ctx2.fillStyle = colors.background;
    ctx2.fillRect(b.minX, b.minY, width, height);
    state.data.relations.forEach((r) => drawRelation(ctx2, r, colors));
    state.data.entities.forEach((e) => drawEntity(ctx2, e, colors));
    return canvas.toDataURL("image/png");
  }
  function exportPng() {
    const url = renderDataUrl();
    if (!url) {
      window.alert("Nothing to export - add a table first.");
      return;
    }
    downloadDataUrl(url, "erd-diagram.png");
  }
  var pngExport = { exportPng, renderDataUrl };

  // src/exportWizard.ts
  var STEP_LABELS2 = [
    { key: "plan", label: "1. Plan" },
    { key: "execute", label: "2. Execute" },
    { key: "result", label: "3. Result" }
  ];
  function stepsHtml2(current2) {
    const idx = STEP_LABELS2.findIndex((s) => s.key === current2);
    return '<div class="wizard-steps">' + STEP_LABELS2.map((s, i) => {
      const cls = i === idx ? "active" : i < idx ? "done" : "";
      const sep = i < STEP_LABELS2.length - 1 ? '<span class="wizard-step-sep">&rarr;</span>' : "";
      return '<span class="wizard-step ' + cls + '" data-step="' + s.key + '">' + s.label + "</span>" + sep;
    }).join("") + "</div>";
  }
  function open5() {
    if (!state.data.entities.length) {
      window.alert("There are no tables to export.");
      return;
    }
    let format = "sql";
    let vendor = "oracle";
    let includeDrop = false;
    let includeFk = true;
    let owner = "";
    let ownerOn = false;
    let tablespace = "";
    let tablespaceOn = false;
    let indexTablespace = "";
    let indexTablespaceOn = false;
    let selectedIds = state.data.entities.map((e) => e.id);
    let pngDarkMode = appTheme.isDark();
    function wireStepNav(body) {
      Array.from(body.querySelectorAll(".wizard-step.done")).forEach((chip) => {
        const step = chip.dataset.step;
        chip.addEventListener("click", () => {
          if (step === "plan") renderPlan("right");
          else if (step === "execute") renderExecute("right");
        });
      });
    }
    function bulkOptions() {
      return {
        vendor,
        owner: ownerOn ? owner.trim() || void 0 : void 0,
        tablespace: tablespaceOn ? tablespace.trim() || void 0 : void 0,
        indexTablespace: indexTablespaceOn ? indexTablespace.trim() || void 0 : void 0,
        includeDrop,
        includeFk
      };
    }
    function renderPlan(direction = "left") {
      const body = document.createElement("div");
      body.innerHTML = stepsHtml2("plan") + '<div class="wizard-plan-choices"><button type="button" class="wizard-plan-card" data-format="sql"><div><strong>SQL (DDL) export</strong><p class="hint">Generate CREATE TABLE / constraint / comment statements for a chosen DB vendor.</p></div><span class="wizard-plan-arrow">&rsaquo;</span></button><button type="button" class="wizard-plan-card" data-format="png"><div><strong>PNG image</strong><p class="hint">Render the current diagram to a downloadable PNG snapshot.</p></div><span class="wizard-plan-arrow">&rsaquo;</span></button></div>';
      Array.from(body.querySelectorAll(".wizard-plan-card")).forEach((card) => {
        card.addEventListener("click", () => {
          format = card.dataset.format;
          renderExecute("left");
        });
      });
      wireStepNav(body);
      modal.transition({ title: "Export", width: "640px", body, actions: [] }, direction);
    }
    function renderExecute(direction = "left") {
      if (format === "png") renderExecutePng(direction);
      else renderExecuteSql(direction);
    }
    function renderExecutePng(direction) {
      const body = document.createElement("div");
      body.innerHTML = stepsHtml2("execute") + '<p class="hint">A PNG snapshot of the whole diagram (' + state.data.entities.length + " table" + (state.data.entities.length === 1 ? "" : "s") + ') will be rendered at 2&times; resolution.</p><label class="col-check-row ddl-export-fk-toggle"><input type="checkbox" class="f-png-dark-mode"' + (pngDarkMode ? " checked" : "") + '> Export as dark mode PNG</label><p class="hint">Continue to preview and download it.</p>';
      const darkToggle = body.querySelector(".f-png-dark-mode");
      darkToggle.addEventListener("change", () => {
        pngDarkMode = darkToggle.checked;
      });
      wireStepNav(body);
      modal.transition({
        title: "Export",
        width: "640px",
        body,
        actions: [
          { label: "Back", onClick: () => renderPlan("right") },
          { label: "Next", variant: "primary", onClick: () => renderResult("left") }
        ]
      }, direction);
    }
    function renderExecuteSql(direction) {
      const entities = state.data.entities;
      const selected = new Set(selectedIds);
      const body = document.createElement("div");
      body.innerHTML = stepsHtml2("execute") + '<label class="ddl-export-vendor-row">DB vendor<select class="f-ddl-vendor">' + DB_VENDORS.map((v) => '<option value="' + v.value + '"' + (v.value === vendor ? " selected" : "") + ">" + escapeHtml(v.label) + "</option>").join("") + '</select></label><label class="col-check-row ddl-export-fk-toggle"><input type="checkbox" class="f-ddl-include-drop"' + (includeDrop ? " checked" : "") + '> Include DROP TABLE statements</label><label class="col-check-row ddl-export-fk-toggle"><input type="checkbox" class="f-ddl-include-fk"' + (includeFk ? " checked" : "") + '> Include FK constraints (ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ...)</label><div class="col-check-row ddl-export-fk-toggle ddl-export-ts-row"><span class="ddl-export-ts-pair"><label><input type="checkbox" class="f-ddl-include-owner"' + (ownerOn ? " checked" : "") + '> Owner</label><input type="text" class="f-ddl-owner-input" placeholder="e.g. SCOTT" value="' + escapeHtml(owner) + '"' + (ownerOn ? "" : " disabled") + '></span><span class="ddl-export-ts-pair"><label><input type="checkbox" class="f-ddl-include-tablespace"' + (tablespaceOn ? " checked" : "") + '> Tablespace</label><input type="text" class="f-ddl-tablespace-input" placeholder="e.g. USERS" value="' + escapeHtml(tablespace) + '"' + (tablespaceOn ? "" : " disabled") + '></span><span class="ddl-export-ts-pair"><label><input type="checkbox" class="f-ddl-include-idx-tablespace"' + (indexTablespaceOn ? " checked" : "") + '> Index Tablespace</label><input type="text" class="f-ddl-idx-tablespace-input" placeholder="e.g. INDX" value="' + escapeHtml(indexTablespace) + '"' + (indexTablespaceOn ? "" : " disabled") + '></span></div><div class="ddl-export-list"><label class="col-check-row ddl-export-select-all"><input type="checkbox" class="f-ddl-select-all"> Select All</label>' + entities.map(
        (e) => '<label class="col-check-row"><input type="checkbox" class="f-ddl-check" value="' + e.id + '"' + (selected.has(e.id) ? " checked" : "") + "> " + escapeHtml(e.name) + "</label>"
      ).join("") + "</div>";
      const vendorSelect = body.querySelector(".f-ddl-vendor");
      const dropToggle = body.querySelector(".f-ddl-include-drop");
      const fkToggle = body.querySelector(".f-ddl-include-fk");
      const ownerToggle = body.querySelector(".f-ddl-include-owner");
      const ownerInput = body.querySelector(".f-ddl-owner-input");
      const tsToggle = body.querySelector(".f-ddl-include-tablespace");
      const tsInput = body.querySelector(".f-ddl-tablespace-input");
      const idxToggle = body.querySelector(".f-ddl-include-idx-tablespace");
      const idxInput = body.querySelector(".f-ddl-idx-tablespace-input");
      const checks = Array.from(body.querySelectorAll(".f-ddl-check"));
      const selectAll = body.querySelector(".f-ddl-select-all");
      function syncSelectAll() {
        const n = checks.filter((c) => c.checked).length;
        selectAll.checked = n === checks.length;
        selectAll.indeterminate = n > 0 && n < checks.length;
      }
      syncSelectAll();
      vendorSelect.addEventListener("change", () => {
        vendor = vendorSelect.value;
      });
      dropToggle.addEventListener("change", () => {
        includeDrop = dropToggle.checked;
      });
      fkToggle.addEventListener("change", () => {
        includeFk = fkToggle.checked;
      });
      ownerToggle.addEventListener("change", () => {
        ownerOn = ownerToggle.checked;
        ownerInput.disabled = !ownerOn;
        if (ownerOn) ownerInput.focus();
      });
      ownerInput.addEventListener("input", () => {
        owner = ownerInput.value;
      });
      tsToggle.addEventListener("change", () => {
        tablespaceOn = tsToggle.checked;
        tsInput.disabled = !tablespaceOn;
        if (tablespaceOn) tsInput.focus();
      });
      tsInput.addEventListener("input", () => {
        tablespace = tsInput.value;
      });
      idxToggle.addEventListener("change", () => {
        indexTablespaceOn = idxToggle.checked;
        idxInput.disabled = !indexTablespaceOn;
        if (indexTablespaceOn) idxInput.focus();
      });
      idxInput.addEventListener("input", () => {
        indexTablespace = idxInput.value;
      });
      selectAll.addEventListener("change", () => {
        checks.forEach((c) => {
          c.checked = selectAll.checked;
        });
        selectAll.indeterminate = false;
        selectedIds = checks.filter((c) => c.checked).map((c) => c.value);
      });
      checks.forEach((c) => c.addEventListener("change", () => {
        syncSelectAll();
        selectedIds = checks.filter((x) => x.checked).map((x) => x.value);
      }));
      wireStepNav(body);
      modal.transition({
        title: "Export",
        width: "820px",
        body,
        actions: [
          { label: "Back", onClick: () => renderPlan("right") },
          { label: "Next", variant: "primary", onClick: () => {
            if (!selectedIds.length) {
              window.alert("Select at least one table to export.");
              return;
            }
            renderResult("left");
          } }
        ]
      }, direction);
    }
    function renderResult(direction = "left") {
      if (format === "png") renderResultPng(direction);
      else renderResultSql(direction);
    }
    function renderResultPng(direction) {
      const dataUrl = pngExport.renderDataUrl({ darkMode: pngDarkMode });
      const body = document.createElement("div");
      body.innerHTML = stepsHtml2("result") + (dataUrl ? '<p class="hint">Preview of the rendered diagram:</p><div class="export-png-preview"><img src="' + dataUrl + '" alt="Diagram preview"></div>' : '<p class="hint">Nothing to render.</p>');
      wireStepNav(body);
      const actions = [{ label: "Back", onClick: () => renderExecute("right") }];
      if (dataUrl) actions.push({ label: "Download PNG", variant: "primary", onClick: () => downloadDataUrl(dataUrl, "erd-diagram.png") });
      modal.transition({ title: "Export", width: "700px", body, actions }, direction);
    }
    function renderResultSql(direction) {
      const ddl = ddlExport.generateBulkDdl(selectedIds, bulkOptions());
      const body = document.createElement("div");
      body.innerHTML = stepsHtml2("result") + '<p class="hint">' + selectedIds.length + " table(s), " + DB_VENDORS.filter((v) => v.value === vendor)[0].label + ' dialect.</p><textarea class="f-ddl-output" rows="18" readonly></textarea>';
      body.querySelector(".f-ddl-output").value = ddl;
      wireStepNav(body);
      modal.transition({
        title: "Export",
        width: "760px",
        body,
        actions: [
          { label: "Back", onClick: () => renderExecute("right") },
          { label: "Copy to clipboard", variant: "primary", onClick: () => copyToClipboard(ddl) }
        ]
      }, direction);
    }
    renderPlan();
  }
  var exportWizard = { open: open5 };

  // src/modalSystemColumns.ts
  var draft2 = [];
  var gridBody2;
  var dragIndex2 = null;
  var dragMoved2 = false;
  var CELL_FIELDS = ["name", "comment", "logicalDataType", "physicalDataType", "defaultValue"];
  var CELL_CLASSES = ["f-name", "f-comment", "f-logical-type", "f-physical-type", "f-default"];
  var selAnchor2 = null;
  var selFocus2 = null;
  var isSelecting2 = false;
  function newDef() {
    return { id: "", name: "NEW_COLUMN", dataType: "VARCHAR2(50)", logicalDataType: "VARCHAR(50)", physicalDataType: "VARCHAR2(50)", comment: "", defaultValue: "" };
  }
  function setDefField(def, field, value) {
    if (field === "logicalDataType") setLogicalDataType(def, value);
    else if (field === "physicalDataType") setPhysicalDataType(def, value);
    else def[field] = value;
  }
  function renderRow2(def, idx) {
    const tr = document.createElement("tr");
    tr.className = "col-row" + (dragIndex2 === idx ? " dragging" : "");
    tr.innerHTML = '<td class="col-handle-cell"><span class="drag-handle" title="Drag to reorder">\u22EE\u22EE</span></td><td class="col-order">' + (idx + 1) + '</td><td><input type="text" class="f-name" value="' + escapeHtml(def.name) + '"></td><td><input type="text" class="f-comment" value="' + escapeHtml(def.comment || "") + '"></td><td><input type="text" class="f-logical-type" list="logical-type-datalist" value="' + escapeHtml(logicalDataType(def)) + '"></td><td><input type="text" class="f-physical-type" list="physical-type-datalist" value="' + escapeHtml(physicalDataType(def)) + '"></td><td><input type="text" class="f-default" value="' + escapeHtml(def.defaultValue || "") + '"></td><td><button type="button" class="btn-icon btn-del-sys" title="Remove">\u2715</button></td>';
    tr.querySelector(".f-name").addEventListener("input", (e) => {
      def.name = e.target.value;
    });
    tr.querySelector(".f-comment").addEventListener("input", (e) => {
      def.comment = e.target.value;
    });
    tr.querySelector(".f-logical-type").addEventListener("input", (e) => {
      setLogicalDataType(def, e.target.value);
    });
    tr.querySelector(".f-physical-type").addEventListener("input", (e) => {
      setPhysicalDataType(def, e.target.value);
    });
    tr.querySelector(".f-default").addEventListener("input", (e) => {
      def.defaultValue = e.target.value;
    });
    tr.querySelector(".btn-del-sys").addEventListener("click", () => {
      draft2 = draft2.filter((d) => d !== def);
      renderGrid2();
    });
    const handle = tr.querySelector(".drag-handle");
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      dragIndex2 = idx;
      dragMoved2 = false;
      document.addEventListener("mousemove", onDragMove2);
      document.addEventListener("mouseup", onDragEnd2);
    });
    return tr;
  }
  function onDragMove2(e) {
    if (dragIndex2 === null) return;
    const rows = Array.prototype.slice.call(gridBody2.querySelectorAll("tr"));
    const overRow = rows.find((r) => {
      const rect = r.getBoundingClientRect();
      return e.clientY >= rect.top && e.clientY <= rect.bottom;
    });
    if (!overRow) return;
    const overIndex = rows.indexOf(overRow);
    if (overIndex === -1 || overIndex === dragIndex2) return;
    const moved = draft2.splice(dragIndex2, 1)[0];
    draft2.splice(overIndex, 0, moved);
    dragIndex2 = overIndex;
    dragMoved2 = true;
    renderGrid2();
  }
  function onDragEnd2() {
    const moved = dragMoved2;
    dragIndex2 = null;
    dragMoved2 = false;
    document.removeEventListener("mousemove", onDragMove2);
    document.removeEventListener("mouseup", onDragEnd2);
    if (moved) renderGrid2();
  }
  function cellInput2(row, col) {
    const tr = gridBody2.querySelectorAll("tr")[row];
    if (!tr) return null;
    return tr.querySelector("." + CELL_CLASSES[col]);
  }
  function cellIndexOf2(input) {
    const tr = input.closest("tr");
    if (!tr) return null;
    const rows = Array.prototype.slice.call(gridBody2.querySelectorAll("tr"));
    const row = rows.indexOf(tr);
    const col = CELL_CLASSES.findIndex((cls) => input.classList.contains(cls));
    if (row === -1 || col === -1) return null;
    return { row, col };
  }
  function rangeBounds2() {
    if (!selAnchor2 || !selFocus2) return null;
    return {
      r0: Math.min(selAnchor2.row, selFocus2.row),
      r1: Math.max(selAnchor2.row, selFocus2.row),
      c0: Math.min(selAnchor2.col, selFocus2.col),
      c1: Math.max(selAnchor2.col, selFocus2.col)
    };
  }
  function refreshSelectionHighlight2() {
    gridBody2.querySelectorAll(".cell-selected").forEach((el2) => el2.classList.remove("cell-selected"));
    const b = rangeBounds2();
    if (!b) return;
    for (let r = b.r0; r <= b.r1; r++) {
      for (let c = b.c0; c <= b.c1; c++) {
        const input = cellInput2(r, c);
        if (input) input.classList.add("cell-selected");
      }
    }
  }
  function onGridMouseDown2(e) {
    const input = e.target.closest("input");
    if (!input) return;
    const idx = cellIndexOf2(input);
    if (!idx) return;
    isSelecting2 = true;
    selAnchor2 = idx;
    selFocus2 = idx;
    refreshSelectionHighlight2();
  }
  function onGridMouseOver2(e) {
    if (!isSelecting2) return;
    const input = e.target.closest("input");
    if (!input) return;
    const idx = cellIndexOf2(input);
    if (!idx) return;
    selFocus2 = idx;
    refreshSelectionHighlight2();
  }
  function onGridMouseUp2() {
    isSelecting2 = false;
  }
  function onGridCopy2(e) {
    if (!document.contains(gridBody2)) return;
    const active2 = document.activeElement;
    if (!active2 || !gridBody2.contains(active2)) return;
    const b = rangeBounds2();
    if (!b) return;
    if (b.r0 === b.r1 && b.c0 === b.c1 && active2 instanceof HTMLInputElement && active2.selectionStart !== active2.selectionEnd) return;
    const lines = [];
    for (let r = b.r0; r <= b.r1; r++) {
      const vals = [];
      for (let c = b.c0; c <= b.c1; c++) vals.push((cellInput2(r, c) || { value: "" }).value);
      lines.push(vals.join("	"));
    }
    e.clipboardData.setData("text/plain", lines.join("\n"));
    e.preventDefault();
  }
  function onGridPaste2(e) {
    if (!document.contains(gridBody2)) return;
    const active2 = document.activeElement;
    if (!active2 || !gridBody2.contains(active2)) return;
    const anchor = active2 instanceof HTMLInputElement ? cellIndexOf2(active2) : null;
    if (!anchor) return;
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    if (!text) return;
    const rawLines = text.replace(/\r/g, "").split("\n");
    if (rawLines.length && rawLines[rawLines.length - 1] === "") rawLines.pop();
    const grid = rawLines.map((line) => line.split("	"));
    const isSingleValue = grid.length <= 1 && grid[0].length <= 1;
    if (isSingleValue && active2 instanceof HTMLInputElement && active2.selectionStart !== active2.selectionEnd) return;
    e.preventDefault();
    let maxCol = 0;
    grid.forEach((vals, rOffset) => {
      const def = draft2[anchor.row + rOffset];
      if (!def) return;
      vals.forEach((val, cOffset) => {
        const c = anchor.col + cOffset;
        if (c >= CELL_FIELDS.length) return;
        maxCol = Math.max(maxCol, c);
        setDefField(def, CELL_FIELDS[c], val);
      });
    });
    selAnchor2 = anchor;
    selFocus2 = { row: Math.min(anchor.row + grid.length - 1, draft2.length - 1), col: Math.min(maxCol, CELL_FIELDS.length - 1) };
    renderGrid2();
    refreshSelectionHighlight2();
  }
  function onModalKeydown2(e) {
    if (!document.contains(gridBody2)) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      const b = rangeBounds2();
      if (!b || b.r0 === b.r1 && b.c0 === b.c1) return;
      e.preventDefault();
      for (let r = b.r0; r <= b.r1; r++) {
        const def = draft2[r];
        if (!def) continue;
        for (let c = b.c0; c <= b.c1; c++) setDefField(def, CELL_FIELDS[c], "");
      }
      renderGrid2();
      refreshSelectionHighlight2();
    }
  }
  function renderGrid2() {
    gridBody2.innerHTML = "";
    draft2.forEach((def, idx) => gridBody2.appendChild(renderRow2(def, idx)));
  }
  function cleanupGridListeners2() {
    document.removeEventListener("mouseup", onGridMouseUp2);
    document.removeEventListener("copy", onGridCopy2);
    document.removeEventListener("paste", onGridPaste2);
    document.removeEventListener("keydown", onModalKeydown2);
    selAnchor2 = null;
    selFocus2 = null;
  }
  function open6() {
    draft2 = JSON.parse(JSON.stringify(state.data.systemColumns));
    const body = document.createElement("div");
    body.innerHTML = '<p class="hint">System columns are appended to every table (shown in yellow) - e.g. CREATED_BY, CREATED_DATE.</p><datalist id="logical-type-datalist">' + dataTypeSuggestions("logical").map((t) => '<option value="' + t + '">').join("") + '</datalist><datalist id="physical-type-datalist">' + dataTypeSuggestions("physical").map((t) => '<option value="' + t + '">').join("") + '</datalist><table class="col-grid"><thead><tr><th></th><th>#</th><th>Name</th><th>Comment</th><th>Logical type</th><th>Physical type</th><th>Default</th><th></th></tr></thead><tbody></tbody></table><button type="button" class="btn btn-add-sys">+ Add system column</button>';
    const table = body.querySelector(".col-grid");
    gridBody2 = table.querySelector("tbody");
    renderGrid2();
    table.addEventListener("mousedown", onGridMouseDown2);
    table.addEventListener("mouseover", onGridMouseOver2);
    document.addEventListener("mouseup", onGridMouseUp2);
    document.addEventListener("copy", onGridCopy2);
    document.addEventListener("paste", onGridPaste2);
    document.addEventListener("keydown", onModalKeydown2);
    body.querySelector(".btn-add-sys").addEventListener("click", () => {
      draft2.push(newDef());
      renderGrid2();
    });
    modal.open({
      title: "System columns",
      width: "840px",
      body,
      onClose: cleanupGridListeners2,
      actions: [
        { label: "Cancel", onClick: () => modal.close() },
        { label: "Apply to all tables", variant: "primary", onClick: () => {
          state.setSystemColumns(draft2.filter((d) => d.name.trim()));
          modal.close();
        } }
      ]
    });
  }
  var modalSystemColumns = { open: open6 };

  // src/menuBar.ts
  var barEl;
  var openState = null;
  var MENUS = [
    {
      title: "Project",
      items: [
        { label: "Open\u2026", onClick: () => jsonIO.importJson() },
        { label: "Save\u2026", shortcut: "Ctrl+S", onClick: () => jsonIO.exportJson() },
        { separator: true },
        { label: "System columns", onClick: () => modalSystemColumns.open() },
        { separator: true },
        { label: "Close", onClick: closeProject }
      ]
    },
    {
      title: "Edit",
      items: [
        { label: "Undo", shortcut: "Ctrl+Z", disabled: () => !history2.canUndo(), onClick: () => history2.undo() },
        { label: "Redo", shortcut: "Ctrl+Y", disabled: () => !history2.canRedo(), onClick: () => history2.redo() }
      ]
    },
    {
      title: "View",
      items: [
        { label: "Logical", checked: () => state.data.designMode === "logical", onClick: () => state.setDesignMode("logical") },
        { label: "Physical", checked: () => state.data.designMode === "physical", onClick: () => state.setDesignMode("physical") },
        { separator: true },
        { label: "Reset view", onClick: () => viewport.resetView() },
        { label: "Minimap", checked: () => state.data.minimapVisible, onClick: () => state.toggleMinimap() },
        { label: "Dark mode", checked: () => appTheme.isDark(), onClick: () => appTheme.toggle() },
        { separator: true },
        { label: "Curved lines", checked: () => state.data.lineStyle === "curved", onClick: () => state.setLineStyle("curved") },
        { label: "Angular lines", checked: () => state.data.lineStyle === "angular", onClick: () => state.setLineStyle("angular") }
      ]
    },
    { title: "Import", onClick: () => ddlImport.open() },
    { title: "Export", onClick: () => exportWizard.open() }
  ];
  function closeProject() {
    if (!state.data.entities.length && !state.data.relations.length) return;
    if (!window.confirm("Close the current project? All tables and relations will be removed. System column definitions are kept.")) return;
    state.data.entities = [];
    state.data.relations = [];
    state.clearSelection();
    state.emit("change");
  }
  function closeMenu() {
    if (!openState) return;
    openState.panel.remove();
    openState.trigger.classList.remove("menu-title-open");
    openState = null;
    document.removeEventListener("mousedown", onOutside);
    document.removeEventListener("keydown", onKeydown4);
  }
  function onOutside(e) {
    if (!openState) return;
    if (openState.panel.contains(e.target) || openState.trigger.contains(e.target)) return;
    closeMenu();
  }
  function onKeydown4(e) {
    if (e.key === "Escape") closeMenu();
  }
  function buildPanel(entry) {
    const panel = document.createElement("div");
    panel.className = "menu-dropdown";
    (entry.items || []).forEach((item) => {
      if (item.separator) {
        panel.appendChild(document.createElement("div")).className = "menu-dropdown-sep";
        return;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      const disabled = item.disabled ? item.disabled() : false;
      btn.className = "menu-dropdown-item" + (disabled ? " disabled" : "");
      const checked = item.checked ? item.checked() : false;
      btn.innerHTML = '<span class="menu-item-check">' + (checked ? "\u2713" : "") + '</span><span class="menu-item-label"></span><span class="menu-item-shortcut">' + (item.shortcut || "") + "</span>";
      btn.querySelector(".menu-item-label").textContent = item.label || "";
      if (!disabled && item.onClick) {
        btn.addEventListener("click", () => {
          const fn = item.onClick;
          closeMenu();
          fn();
        });
      }
      panel.appendChild(btn);
    });
    return panel;
  }
  function openDropdown(entry, trigger) {
    closeMenu();
    const panel = buildPanel(entry);
    const rect = trigger.getBoundingClientRect();
    panel.style.left = rect.left + "px";
    panel.style.top = rect.bottom + "px";
    document.body.appendChild(panel);
    trigger.classList.add("menu-title-open");
    openState = { entry, trigger, panel };
    setTimeout(() => {
      document.addEventListener("mousedown", onOutside);
      document.addEventListener("keydown", onKeydown4);
    }, 0);
  }
  function onSaveShortcut(e) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
    if (document.querySelector(".modal-overlay")) return;
    e.preventDefault();
    jsonIO.exportJson();
  }
  function init9() {
    barEl = document.getElementById("menu-bar");
    if (!barEl) return;
    document.addEventListener("keydown", onSaveShortcut);
    MENUS.forEach((entry) => {
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "menu-title";
      trigger.textContent = entry.title;
      if (entry.items) {
        trigger.addEventListener("click", () => {
          if (openState && openState.entry === entry) {
            closeMenu();
            return;
          }
          openDropdown(entry, trigger);
        });
        trigger.addEventListener("mouseenter", () => {
          if (openState && openState.entry !== entry) openDropdown(entry, trigger);
        });
      } else {
        trigger.classList.add("menu-title-action");
        trigger.addEventListener("click", () => {
          closeMenu();
          entry.onClick && entry.onClick();
        });
      }
      barEl.appendChild(trigger);
    });
  }
  var menuBar = { init: init9 };

  // src/minimap.ts
  var MAX_W = 220;
  var MAX_H = 160;
  var PAD = 8;
  var containerEl;
  var canvasEl;
  var ctx;
  var mapping = null;
  function contentBounds() {
    const entities = state.data.entities;
    if (!entities.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    entities.forEach((e) => {
      const b = entityRenderer.getEntityBox(e.id);
      if (!b) return;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    });
    if (!isFinite(minX)) return null;
    return { x: minX, y: minY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) };
  }
  function draw() {
    if (!state.data.minimapVisible) {
      containerEl.style.display = "none";
      return;
    }
    const bounds2 = contentBounds();
    if (!bounds2) {
      containerEl.style.display = "none";
      return;
    }
    containerEl.style.display = "";
    const innerW = MAX_W - PAD * 2, innerH = MAX_H - PAD * 2;
    const scale = Math.min(innerW / bounds2.w, innerH / bounds2.h);
    const drawnW = bounds2.w * scale, drawnH = bounds2.h * scale;
    const offX = PAD + (innerW - drawnW) / 2;
    const offY = PAD + (innerH - drawnH) / 2;
    mapping = { minX: bounds2.x, minY: bounds2.y, scale, offX, offY };
    const dpr = window.devicePixelRatio || 1;
    if (canvasEl.width !== MAX_W * dpr || canvasEl.height !== MAX_H * dpr) {
      canvasEl.width = MAX_W * dpr;
      canvasEl.height = MAX_H * dpr;
      canvasEl.style.width = MAX_W + "px";
      canvasEl.style.height = MAX_H + "px";
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, MAX_W, MAX_H);
    state.data.entities.forEach((e) => {
      const b = entityRenderer.getEntityBox(e.id);
      if (!b) return;
      const x = offX + (b.x - bounds2.x) * scale;
      const y = offY + (b.y - bounds2.y) * scale;
      const w = Math.max(b.w * scale, 2), h = Math.max(b.h * scale, 2);
      ctx.fillStyle = e.headerColor || theme.colors.headerBg;
      ctx.fillRect(x, y, w, h);
    });
    const vr = viewport.visibleWorldRect();
    let rx = offX + (vr.x - bounds2.x) * scale;
    let ry = offY + (vr.y - bounds2.y) * scale;
    let rw = vr.w * scale, rh = vr.h * scale;
    const rx2 = Math.min(MAX_W, rx + rw), ry2 = Math.min(MAX_H, ry + rh);
    rx = Math.max(0, rx);
    ry = Math.max(0, ry);
    rw = Math.max(0, rx2 - rx);
    rh = Math.max(0, ry2 - ry);
    ctx.strokeStyle = theme.colors.relationStrokeHover || "#2563eb";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx + 0.5, ry + 0.5, Math.max(rw - 1, 0), Math.max(rh - 1, 0));
    ctx.fillStyle = "rgba(37, 99, 235, 0.12)";
    ctx.fillRect(rx, ry, rw, rh);
  }
  function recenterFromEvent(e) {
    if (!mapping) return;
    const rect = canvasEl.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const wx = mapping.minX + (mx - mapping.offX) / mapping.scale;
    const wy = mapping.minY + (my - mapping.offY) / mapping.scale;
    viewport.centerOnWorld(wx, wy);
  }
  function onMouseDown2(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    recenterFromEvent(e);
    const move = (ev) => recenterFromEvent(ev);
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }
  function onClick2(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  function init10() {
    containerEl = document.getElementById("minimap");
    canvasEl = containerEl.querySelector("canvas");
    ctx = canvasEl.getContext("2d");
    canvasEl.addEventListener("mousedown", onMouseDown2);
    containerEl.addEventListener("click", onClick2);
    state.on("change", draw);
    state.on("move", draw);
    viewport.onViewChange(draw);
    draw();
  }
  var minimap = { init: init10 };

  // src/defaultDiagram.ts
  var defaultDiagram = { "entities": [{ "id": "ent_mr2wskb3_4", "name": "regions", "comment": "", "x": 891, "y": 430, "columns": [{ "id": "col_mr2wskb2_2", "name": "region_id", "dataType": "NUMBER", "comment": "", "pk": true, "fk": false, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wskb3_3", "name": "region_name", "dataType": "VARCHAR2(25)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wskb3_5", "name": "reg_id", "dataType": "VARCHAR2(50)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_7", "defaultValue": "" }, { "id": "col_mr2wskb3_6", "name": "reg_date", "dataType": "DATE", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_8", "defaultValue": "SYSDATE" }, { "id": "col_mr2wskb3_7", "name": "upd_id", "dataType": "VARCHAR2(50)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_9", "defaultValue": "" }, { "id": "col_mr2wskb3_8", "name": "upd_date", "dataType": "DATE", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_a", "defaultValue": "SYSDATE" }], "headerColor": "#dc2626" }, { "id": "ent_mr2wssxq_c", "name": "countries", "comment": "", "x": 479, "y": 474, "columns": [{ "id": "col_mr2wst6v_h", "name": "country_id", "dataType": "CHAR(2)", "comment": "", "pk": true, "fk": false, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wst6v_i", "name": "country_name", "dataType": "VARCHAR2(40)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wst6v_j", "name": "region_id", "dataType": "NUMBER", "comment": "", "pk": false, "fk": true, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wst6v_k", "name": "reg_id", "dataType": "VARCHAR2(50)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_7", "defaultValue": "" }, { "id": "col_mr2wst6v_l", "name": "reg_date", "dataType": "DATE", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_8", "defaultValue": "SYSDATE" }, { "id": "col_mr2wst6v_m", "name": "upd_id", "dataType": "VARCHAR2(50)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_9", "defaultValue": "" }, { "id": "col_mr2wst6v_n", "name": "upd_date", "dataType": "DATE", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_a", "defaultValue": "SYSDATE" }], "headerColor": "#7c3aed" }, { "id": "ent_mr2wsy0h_u", "name": "locations", "comment": "", "x": 128, "y": 401, "columns": [{ "id": "col_mr2wsy0h_o", "name": "location_id", "dataType": "NUMBER(4)", "comment": "", "pk": true, "fk": false, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wsy0h_p", "name": "street_address", "dataType": "VARCHAR2(40)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wsy0h_q", "name": "postal_code", "dataType": "VARCHAR2(12)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wsy0h_r", "name": "city", "dataType": "VARCHAR2(30)", "comment": "", "pk": false, "fk": false, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wsy0h_s", "name": "state_province", "dataType": "VARCHAR2(25)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wsy0h_t", "name": "country_id", "dataType": "CHAR(2)", "comment": "", "pk": false, "fk": true, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wsy0h_v", "name": "reg_id", "dataType": "VARCHAR2(50)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_7", "defaultValue": "" }, { "id": "col_mr2wsy0h_w", "name": "reg_date", "dataType": "DATE", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_8", "defaultValue": "SYSDATE" }, { "id": "col_mr2wsy0h_x", "name": "upd_id", "dataType": "VARCHAR2(50)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_9", "defaultValue": "" }, { "id": "col_mr2wsy0h_y", "name": "upd_date", "dataType": "DATE", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_a", "defaultValue": "SYSDATE" }], "headerColor": "#db2777" }, { "id": "ent_mr2wt3ml_13", "name": "departments", "comment": "", "x": -251, "y": 277, "columns": [{ "id": "col_mr2wt3ml_z", "name": "department_id", "dataType": "NUMBER(4)", "comment": "", "pk": true, "fk": false, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wt3ml_10", "name": "department_name", "dataType": "VARCHAR2(30)", "comment": "", "pk": false, "fk": false, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wt3ml_11", "name": "manager_id", "dataType": "NUMBER(6)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wt3ml_12", "name": "location_id", "dataType": "NUMBER(4)", "comment": "", "pk": false, "fk": true, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wt3ml_14", "name": "reg_id", "dataType": "VARCHAR2(50)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_7", "defaultValue": "" }, { "id": "col_mr2wt3ml_15", "name": "reg_date", "dataType": "DATE", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_8", "defaultValue": "SYSDATE" }, { "id": "col_mr2wt3ml_16", "name": "upd_id", "dataType": "VARCHAR2(50)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_9", "defaultValue": "" }, { "id": "col_mr2wt3ml_17", "name": "upd_date", "dataType": "DATE", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_a", "defaultValue": "SYSDATE" }], "headerColor": "#0891b2" }, { "id": "ent_mr2wtal3_1c", "name": "jobs", "comment": "", "x": 54, "y": -181, "columns": [{ "id": "col_mr2wtal3_18", "name": "job_id", "dataType": "VARCHAR2(10)", "comment": "", "pk": true, "fk": false, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wtal3_19", "name": "job_title", "dataType": "VARCHAR2(35)", "comment": "", "pk": false, "fk": false, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wtal3_1a", "name": "min_salary", "dataType": "NUMBER(6)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wtal3_1b", "name": "max_salary", "dataType": "NUMBER(6)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wtal3_1d", "name": "reg_id", "dataType": "VARCHAR2(50)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_7", "defaultValue": "" }, { "id": "col_mr2wtal3_1e", "name": "reg_date", "dataType": "DATE", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_8", "defaultValue": "SYSDATE" }, { "id": "col_mr2wtal3_1f", "name": "upd_id", "dataType": "VARCHAR2(50)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_9", "defaultValue": "" }, { "id": "col_mr2wtal3_1g", "name": "upd_date", "dataType": "DATE", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_a", "defaultValue": "SYSDATE" }], "headerColor": "#2d6cdf" }, { "id": "ent_mr2wtg2r_1s", "name": "employees", "comment": "", "x": 531, "y": -118, "columns": [{ "id": "col_mr2wtg2q_1h", "name": "employee_id", "dataType": "NUMBER(6)", "comment": "", "pk": true, "fk": false, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr30pndl_7", "name": "department_name", "dataType": "VARCHAR2(30)", "comment": "", "pk": true, "fk": false, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr30vdtw_1", "name": "departments_department_name", "dataType": "VARCHAR2(30)", "comment": "", "pk": true, "fk": false, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wtg2q_1i", "name": "first_name", "dataType": "VARCHAR2(20)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wtg2q_1j", "name": "last_name", "dataType": "VARCHAR2(25)", "comment": "", "pk": false, "fk": false, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wtg2q_1k", "name": "email", "dataType": "VARCHAR2(25)", "comment": "", "pk": false, "fk": false, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wtg2q_1l", "name": "phone_number", "dataType": "VARCHAR2(20)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wtg2q_1m", "name": "hire_date", "dataType": "DATE", "comment": "", "pk": false, "fk": false, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wtg2q_1n", "name": "job_id", "dataType": "VARCHAR2(10)", "comment": "", "pk": false, "fk": true, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wtg2q_1o", "name": "salary", "dataType": "NUMBER(8,2)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wtg2q_1p", "name": "commission_pct", "dataType": "NUMBER(2,2)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wtg2q_1q", "name": "manager_id", "dataType": "NUMBER(6)", "comment": "", "pk": false, "fk": true, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wtg2q_1r", "name": "department_id", "dataType": "NUMBER(4)", "comment": "", "pk": false, "fk": true, "nullable": true, "isSystem": false, "systemColId": null }, { "id": "col_mr2wtg2r_1t", "name": "reg_id", "dataType": "VARCHAR2(50)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_7", "defaultValue": "" }, { "id": "col_mr2wtg2r_1u", "name": "reg_date", "dataType": "DATE", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_8", "defaultValue": "SYSDATE" }, { "id": "col_mr2wtg2r_1v", "name": "upd_id", "dataType": "VARCHAR2(50)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_9", "defaultValue": "" }, { "id": "col_mr2wtg2r_1w", "name": "upd_date", "dataType": "DATE", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_a", "defaultValue": "SYSDATE" }], "headerColor": "#d97706" }, { "id": "ent_mr2wuflq_2c", "name": "job_history", "comment": "", "x": -362, "y": -115, "columns": [{ "id": "col_mr2wuflo_27", "name": "employee_id", "dataType": "NUMBER(6)", "comment": "", "pk": true, "fk": true, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wuflo_28", "name": "start_date", "dataType": "DATE", "comment": "", "pk": true, "fk": false, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wuflo_29", "name": "end_date", "dataType": "DATE", "comment": "", "pk": false, "fk": false, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wuflo_2a", "name": "job_id", "dataType": "VARCHAR2(10)", "comment": "", "pk": false, "fk": true, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wuflo_2b", "name": "department_id", "dataType": "NUMBER(4)", "comment": "", "pk": false, "fk": true, "nullable": false, "isSystem": false, "systemColId": null }, { "id": "col_mr2wuflq_2d", "name": "reg_id", "dataType": "VARCHAR2(50)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_7", "defaultValue": "" }, { "id": "col_mr2wuflq_2e", "name": "reg_date", "dataType": "DATE", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_8", "defaultValue": "SYSDATE" }, { "id": "col_mr2wuflq_2f", "name": "upd_id", "dataType": "VARCHAR2(50)", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_9", "defaultValue": "" }, { "id": "col_mr2wuflq_2g", "name": "upd_date", "dataType": "DATE", "comment": "", "pk": false, "fk": false, "nullable": true, "isSystem": true, "systemColId": "sysdef_mr2qgha0_a", "defaultValue": "SYSDATE" }], "headerColor": "#475569" }], "relations": [{ "id": "rel_mr2wvddr_2h", "name": "", "logicalName": "", "sourceEntityId": "ent_mr2wuflq_2c", "targetEntityId": "ent_mr2wtal3_1c", "columnPairs": [{ "sourceColumnId": "col_mr2wuflo_2a", "targetColumnId": "col_mr2wtal3_18" }], "sourceCardinality": "one-or-many", "targetCardinality": "one", "sourceAnchor": { "side": "top", "t": 0.7387175105398075 }, "targetAnchor": { "side": "left", "t": 0.1556587091069849 } }, { "id": "rel_mr2wvx8y_2i", "name": "", "logicalName": "", "sourceEntityId": "ent_mr2wuflq_2c", "targetEntityId": "ent_mr2wtg2r_1s", "columnPairs": [{ "sourceColumnId": "col_mr2wuflo_27", "targetColumnId": "col_mr2wtg2q_1h" }], "sourceCardinality": "one-or-many", "targetCardinality": "one", "sourceAnchor": { "side": "right", "t": 0.8610111843739122 }, "targetAnchor": { "side": "left", "t": 0.5754926348969941 } }, { "id": "rel_mr2wwc4w_2j", "name": "", "logicalName": "", "sourceEntityId": "ent_mr2wuflq_2c", "targetEntityId": "ent_mr2wt3ml_13", "columnPairs": [{ "sourceColumnId": "col_mr2wuflo_2b", "targetColumnId": "col_mr2wt3ml_z" }], "sourceCardinality": "one-or-many", "targetCardinality": "one", "sourceAnchor": { "side": "left", "t": 0.9130674835511132 }, "targetAnchor": { "side": "left", "t": 0.19309969170898783 } }, { "id": "rel_mr2x4w1g_1", "name": "", "logicalName": "", "sourceEntityId": "ent_mr2wt3ml_13", "targetEntityId": "ent_mr2wsy0h_u", "columnPairs": [{ "sourceColumnId": "col_mr2wt3ml_12", "targetColumnId": "col_mr2wsy0h_o" }], "sourceCardinality": "one-or-many", "targetCardinality": "one", "sourceAnchor": { "side": "right", "t": 0.6684985784670882 }, "targetAnchor": { "side": "left", "t": 0.27138338485046926 } }, { "id": "rel_mr2x52nv_2", "name": "", "logicalName": "", "sourceEntityId": "ent_mr2wssxq_c", "targetEntityId": "ent_mr2wskb3_4", "columnPairs": [{ "sourceColumnId": "col_mr2wst6v_j", "targetColumnId": "col_mr2wskb2_2" }], "sourceCardinality": "one-or-many", "targetCardinality": "one", "sourceAnchor": { "side": "right", "t": 0.6144646598823501 } }, { "id": "rel_mr2x59tc_3", "name": "", "logicalName": "", "sourceEntityId": "ent_mr2wsy0h_u", "targetEntityId": "ent_mr2wssxq_c", "columnPairs": [{ "sourceColumnId": "col_mr2wsy0h_t", "targetColumnId": "col_mr2wst6v_h" }], "sourceCardinality": "one-or-many", "targetCardinality": "one" }, { "id": "rel_mr2x6det_4", "name": "", "logicalName": "", "sourceEntityId": "ent_mr2wtg2r_1s", "targetEntityId": "ent_mr2wtal3_1c", "columnPairs": [{ "sourceColumnId": "col_mr2wtg2q_1n", "targetColumnId": "col_mr2wtal3_18" }], "sourceCardinality": "one-or-many", "targetCardinality": "one", "sourceAnchor": { "side": "left", "t": 0.9092965077907411 }, "targetAnchor": { "side": "right", "t": 0.32511185682326615 } }, { "id": "rel_mr2x7dnf_6", "name": "", "logicalName": "", "sourceEntityId": "ent_mr2wtg2r_1s", "targetEntityId": "ent_mr2wtg2r_1s", "columnPairs": [{ "sourceColumnId": "col_mr2wtg2q_1q", "targetColumnId": "col_mr2wtg2q_1h" }], "sourceCardinality": "one-or-many", "targetCardinality": "one", "sourceAnchor": { "side": "left", "t": 0.23978852428680006 }, "targetAnchor": { "side": "top", "t": 0.2742030255218774 } }, { "id": "rel_mr34rr9l_1", "name": "", "logicalName": "", "sourceEntityId": "ent_mr2wtg2r_1s", "targetEntityId": "ent_mr2wt3ml_13", "columnPairs": [{ "sourceColumnId": "col_mr2wtg2q_1r", "targetColumnId": "col_mr2wt3ml_z" }], "sourceCardinality": "one-or-many", "targetCardinality": "one", "sourceAnchor": { "side": "left", "t": 0.7597586489446285 }, "targetAnchor": { "side": "right", "t": 0.3850693630864877 } }], "systemColumns": [{ "id": "sysdef_mr2qgha0_7", "name": "reg_id", "dataType": "VARCHAR2(50)", "comment": "" }, { "id": "sysdef_mr2qgha0_8", "name": "reg_date", "dataType": "DATE", "comment": "", "defaultValue": "SYSDATE" }, { "id": "sysdef_mr2qgha0_9", "name": "upd_id", "dataType": "VARCHAR2(50)", "comment": "" }, { "id": "sysdef_mr2qgha0_a", "name": "upd_date", "dataType": "DATE", "comment": "", "defaultValue": "SYSDATE" }], "view": { "scale": 0.8627002288329519, "x": 652.8604118993135, "y": 223.1487414187643 }, "designMode": "physical", "lineStyle": "angular", "minimapVisible": true };

  // src/main.ts
  var clipboard = [];
  var pasteCount = 0;
  function copySelected() {
    const ids = state.data.selectedEntityIds;
    if (!ids.length) return;
    clipboard = ids.map((id) => state.getEntity(id)).filter((e) => !!e).map((e) => JSON.parse(JSON.stringify(e)));
    pasteCount = 0;
  }
  function uniqueEntityName(base) {
    const names = new Set(state.data.entities.map((e) => e.name.toUpperCase()));
    let candidate = base + "_COPY";
    let n = 2;
    while (names.has(candidate.toUpperCase())) {
      candidate = base + "_COPY" + n;
      n++;
    }
    return candidate;
  }
  function pasteClipboard() {
    if (!clipboard.length) return;
    pasteCount++;
    const off2 = 24 * pasteCount;
    const newIds = [];
    clipboard.forEach((src) => {
      const columns = src.columns.map((c) => Object.assign({}, c, { id: nextId("col") }));
      const entity = {
        id: nextId("ent"),
        name: uniqueEntityName(src.name),
        comment: src.comment,
        x: src.x + off2,
        y: src.y + off2,
        headerColor: src.headerColor,
        columns
      };
      state.addEntity(entity);
      newIds.push(entity.id);
    });
    state.selectEntities(newIds);
  }
  function deleteSelected() {
    if (state.data.selectedEntityIds.length) {
      state.data.selectedEntityIds.slice().forEach((id) => state.removeEntity(id));
      state.clearSelection();
      return;
    }
    const sel = state.data.selected;
    if (!sel) return;
    if (sel.type === "entity") {
      state.removeEntity(sel.id);
    } else if (sel.type === "relation") {
      relationInteraction.remove(sel.id);
    }
    state.clearSelection();
  }
  function onKeydown5(e) {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (document.querySelector(".modal-overlay")) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelected();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === "c" && state.data.selectedEntityIds.length) {
        e.preventDefault();
        copySelected();
      } else if (k === "v" && clipboard.length) {
        e.preventDefault();
        pasteClipboard();
      } else if (k === "a" && state.data.entities.length) {
        e.preventDefault();
        state.selectEntities(state.data.entities.map((en) => en.id));
      }
    }
  }
  function isOnEntityOrRelation(target) {
    return !!closest(target, (el2) => el2.classList && (el2.classList.contains("entity") || el2.classList.contains("relation")));
  }
  function onCanvasBackgroundClick(e) {
    if (isOnEntityOrRelation(e.target)) return;
    state.clearSelection();
  }
  function onCanvasBackgroundContextMenu(e) {
    if (isOnEntityOrRelation(e.target)) return;
    e.preventDefault();
    const worldPos = viewport.screenToWorld(e.clientX, e.clientY);
    contextMenu.showForCanvas(worldPos, e.clientX, e.clientY);
  }
  function init11() {
    if (!state.load()) state.replaceAll(defaultDiagram);
    history2.init();
    const viewportEl2 = document.getElementById("canvas-viewport");
    const transformEl2 = document.getElementById("canvas-transform");
    const entityLayer = document.getElementById("entity-layer");
    const svg = document.getElementById("relation-svg");
    viewport.init(viewportEl2, transformEl2);
    entityRenderer.init(entityLayer);
    entityDrag.init(entityLayer);
    relationRenderer.init(svg);
    toolbar.init();
    menuBar.init();
    minimap.init();
    search.init();
    viewportEl2.addEventListener("click", onCanvasBackgroundClick);
    viewportEl2.addEventListener("contextmenu", onCanvasBackgroundContextMenu);
    document.addEventListener("keydown", onKeydown5);
    const hint = document.getElementById("empty-hint");
    const syncHint = () => {
      hint.style.display = state.data.entities.length ? "none" : "";
    };
    syncHint();
    state.on("change", syncHint);
  }
  document.addEventListener("DOMContentLoaded", init11);
})();
