const state = {
  options: {},
  dashboard: null,
  gisConfig: null,
  gisLayers: {},
  visibleLayers: {}
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || payload.error || "请求失败");
  }
  return payload;
}

function setStatus(ok, text) {
  $("#dbDot").className = `dot ${ok ? "ok" : "bad"}`;
  $("#dbStatus").textContent = text;
}

function setFormMessage(text, ok = true) {
  const el = $("#formMessage");
  el.textContent = text;
  el.className = `message ${ok ? "ok" : "bad"}`;
}

function setGisMessage(text, ok = true) {
  const el = $("#gisMessage");
  el.textContent = text;
  el.className = `message ${ok ? "ok" : "bad"}`;
}

function optionLabel(item, key, fallback) {
  return item[key] || item[fallback] || "";
}

function fillSelects() {
  $$("select[data-options]").forEach((select) => {
    const list = state.options[select.dataset.options] || [];
    const valueKey = select.dataset.value;
    const labelKey = select.dataset.label;
    const selected = select.value;
    const required = select.hasAttribute("required");
    select.innerHTML = required ? "" : '<option value="">不选择</option>';
    list.forEach((item) => {
      const option = document.createElement("option");
      option.value = item[valueKey];
      option.textContent = `${item[valueKey]} · ${optionLabel(item, labelKey, valueKey)}`;
      select.appendChild(option);
    });
    if (selected) select.value = selected;
  });
}

function renderDashboard(data) {
  state.dashboard = data;
  $("#metricLines").textContent = data.summary.line_count;
  $("#metricSegments").textContent = data.summary.segment_count;
  $("#metricEvents").textContent = data.summary.event_count;
  $("#metricCases").textContent = data.summary.case_count;
  $("#metricObservations").textContent = data.summary.observation_count;

  const max = Math.max(1, ...data.byDomain.map((row) => row.case_count));
  const names = { track: "轨道", bridge: "桥梁", interface: "接口" };
  $("#domainBars").innerHTML = data.byDomain.map((row) => {
    const width = Math.max(4, Math.round((row.case_count / max) * 100));
    return `
      <div class="bar-row">
        <span>${names[row.disease_domain] || row.disease_domain}</span>
        <div class="bar-track"><div class="bar-fill ${row.disease_domain}" style="width:${width}%"></div></div>
        <strong>${row.case_count}</strong>
      </div>
    `;
  }).join("");

  $("#caseRows").innerHTML = data.recentCases.length
    ? data.recentCases.map((row) => `
        <tr>
          <td>${row.case_code}</td>
          <td>${row.disease_type_code} · ${row.disease_type_name}</td>
          <td>${row.status || ""}</td>
          <td>${row.severity_level || ""}</td>
          <td>${formatChainage(row.start_chainage_m, row.end_chainage_m)}</td>
          <td>${row.latest_event_date || ""}</td>
          <td>${row.observation_count}</td>
        </tr>
      `).join("")
    : '<tr><td colspan="7">暂无病害实例。</td></tr>';
}

function renderDictionary() {
  const domainName = { track: "轨道", bridge: "桥梁", interface: "接口" };
  $("#dictionaryGrid").innerHTML = (state.options.diseaseTypes || []).map((item) => `
    <article class="dict-item">
      <strong>${item.type_code} · ${item.standard_name}</strong>
      <span>${domainName[item.disease_domain] || item.disease_domain}</span>
    </article>
  `).join("");
}

function formatChainage(start, end) {
  if (start === null && end === null) return "";
  if (end === null || start === end) return start ?? "";
  return `${start} - ${end}`;
}

function formToJson(form) {
  const data = {};
  new FormData(form).forEach((value, key) => {
    data[key] = value;
  });
  form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    data[input.name] = input.checked;
  });
  return data;
}

function fillGisConfig(config) {
  const form = $("#gisConfigForm");
  if (!form || !config) return;
  form.projected_srid.value = config.projected_srid ?? "";
  form.railway_crs_note.value = config.railway_crs_note ?? "";
  form.file_storage_root.value = config.file_storage_root ?? "";
}

function fillGisLayerSelect() {
  const select = $("#geometryLayerSelect");
  if (!select) return;
  const current = select.value;
  select.innerHTML = "";
  Object.entries(state.gisLayers).forEach(([key, layer]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = `${layer.title} · ${key}`;
    select.appendChild(option);
  });
  if (current) select.value = current;
}

function collectCoords(input, output = []) {
  if (!Array.isArray(input)) return output;
  if (typeof input[0] === "number" && typeof input[1] === "number") {
    output.push([input[0], input[1]]);
    return output;
  }
  input.forEach((part) => collectCoords(part, output));
  return output;
}

function geometryParts(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Point") return [{ kind: "point", coords: [geometry.coordinates] }];
  if (geometry.type === "MultiPoint") return geometry.coordinates.map((coords) => ({ kind: "point", coords: [coords] }));
  if (geometry.type === "LineString") return [{ kind: "line", coords: geometry.coordinates }];
  if (geometry.type === "MultiLineString") return geometry.coordinates.map((coords) => ({ kind: "line", coords }));
  if (geometry.type === "Polygon") return geometry.coordinates.map((coords) => ({ kind: "line", coords }));
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flatMap((polygon) => polygon.map((coords) => ({ kind: "line", coords })));
  if (geometry.type === "GeometryCollection") return geometry.geometries.flatMap(geometryParts);
  return [];
}

function renderGis() {
  const map = $("#gisMap");
  if (!map) return;

  const palette = {
    railway_line: "#2f7d62",
    route_segment: "#34699a",
    curve_section: "#b6852d",
    bridge: "#7b4f9d",
    bridge_span: "#86633c",
    component: "#5c7880",
    disease_case: "#a34242",
    maintenance_event: "#4f6b4e"
  };

  const features = [];
  Object.entries(state.gisLayers).forEach(([key, layer]) => {
    if (state.visibleLayers[key] === false) return;
    layer.features.forEach((feature) => {
      features.push({ layerKey: key, layerTitle: layer.title, ...feature });
    });
  });

  const allCoords = features.flatMap((feature) => collectCoords(feature.geometry?.coordinates || []));
  if (!allCoords.length) {
    map.innerHTML = '<div class="map-empty">暂无空间几何。可在录入页或 GIS 页写入 GeoJSON/WKT。</div>';
    $("#mapExtentText").textContent = "暂无几何";
    renderLayerToggles();
    return;
  }

  const xs = allCoords.map((coord) => coord[0]);
  const ys = allCoords.map((coord) => coord[1]);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (minX === maxX) {
    minX -= 1;
    maxX += 1;
  }
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }

  const width = 1000;
  const height = 620;
  const pad = 42;
  const scale = Math.min((width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxY - minY));
  const project = ([x, y]) => [
    pad + (x - minX) * scale,
    height - pad - (y - minY) * scale
  ];

  const shapes = features.flatMap((feature) => {
    const color = palette[feature.layerKey] || "#29363a";
    return geometryParts(feature.geometry).map((part) => {
      if (part.kind === "point") {
        const [x, y] = project(part.coords[0]);
        return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="6" fill="${color}"><title>${feature.properties.code}</title></circle>`;
      }
      const points = part.coords.map(project).map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
      return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><title>${feature.properties.code}</title></polyline>`;
    });
  }).join("");

  map.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="GIS 空间图层">
      <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>
      ${shapes}
    </svg>
  `;
  $("#mapExtentText").textContent = `X ${minX.toFixed(3)} - ${maxX.toFixed(3)} / Y ${minY.toFixed(3)} - ${maxY.toFixed(3)}`;
  renderLayerToggles();
}

function renderLayerToggles() {
  const wrap = $("#layerToggles");
  if (!wrap) return;
  wrap.innerHTML = Object.entries(state.gisLayers).map(([key, layer]) => {
    const checked = state.visibleLayers[key] !== false ? "checked" : "";
    return `
      <label class="layer-toggle">
        <input type="checkbox" data-layer="${key}" ${checked} />
        ${layer.title} ${layer.features.length}
      </label>
    `;
  }).join("");
  wrap.querySelectorAll("input[data-layer]").forEach((input) => {
    input.addEventListener("change", () => {
      state.visibleLayers[input.dataset.layer] = input.checked;
      renderGis();
    });
  });
}

async function refreshGis() {
  const [config, layers] = await Promise.all([
    api("/api/gis/config"),
    api("/api/gis/layers")
  ]);
  state.gisConfig = config;
  state.gisLayers = layers.layers || {};
  Object.keys(state.gisLayers).forEach((key) => {
    if (!(key in state.visibleLayers)) state.visibleLayers[key] = true;
  });
  fillGisConfig(config.config);
  fillGisLayerSelect();
  renderGis();
}

async function refreshAll() {
  const [health, options, dashboard] = await Promise.all([
    api("/api/health"),
    api("/api/options"),
    api("/api/dashboard")
  ]);
  state.options = options;
  fillSelects();
  renderDictionary();
  renderDashboard(dashboard);
  $("#dbLine").textContent = `${health.db.database} · ${health.db.user} · PostGIS ${health.db.postgis}`;
  $("#mandatoryCount").textContent = health.acceptance.mandatory_type_count;
  $("#acceptanceText").textContent = health.acceptance.all_mandatory_active
    ? `强制字典已启用，轨道 ${health.acceptance.track_type_count}，桥梁 ${health.acceptance.bridge_type_count}，接口 ${health.acceptance.interface_type_count}`
    : "强制字典存在未启用项";
  setStatus(true, "数据库已连接");
  await refreshGis();
}

function bindNavigation() {
  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".nav-item").forEach((item) => item.classList.remove("active"));
      $$(".view").forEach((view) => view.classList.remove("active"));
      button.classList.add("active");
      $(`#${button.dataset.view}`).classList.add("active");
    });
  });

  $$(".segment-tab").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".segment-tab").forEach((item) => item.classList.remove("active"));
      $$(".data-form").forEach((form) => form.classList.remove("active"));
      button.classList.add("active");
      $(`#${button.dataset.form}`).classList.add("active");
      setFormMessage("");
    });
  });
}

function bindForms() {
  $$(".data-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      submit.disabled = true;
      try {
        await api(form.dataset.endpoint, {
          method: "POST",
          body: JSON.stringify(formToJson(form))
        });
        form.reset();
        setFormMessage("已保存，列表、选项和 GIS 图层已刷新。");
        await refreshAll();
      } catch (error) {
        setFormMessage(error.message, false);
      } finally {
        submit.disabled = false;
      }
    });
  });
}

function bindGisForms() {
  $("#refreshGisBtn").addEventListener("click", async () => {
    try {
      await refreshGis();
      setGisMessage("GIS 图层已刷新。");
    } catch (error) {
      setGisMessage(error.message, false);
    }
  });

  $("#gisConfigForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const row = await api("/api/gis/config", {
        method: "POST",
        body: JSON.stringify(formToJson(event.currentTarget))
      });
      fillGisConfig(row);
      setGisMessage("坐标系配置已保存。");
    } catch (error) {
      setGisMessage(error.message, false);
    }
  });

  $("#geometryAttachForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/gis/geometries", {
        method: "POST",
        body: JSON.stringify(formToJson(event.currentTarget))
      });
      event.currentTarget.reset();
      await refreshAll();
      setGisMessage("几何已写入 PostGIS，并已刷新地图。");
    } catch (error) {
      setGisMessage(error.message, false);
    }
  });
}

async function boot() {
  bindNavigation();
  bindForms();
  bindGisForms();
  $("#refreshBtn").addEventListener("click", refreshAll);
  try {
    await refreshAll();
  } catch (error) {
    setStatus(false, "数据库连接失败");
    $("#dbLine").textContent = error.message;
  }
  if (window.lucide) window.lucide.createIcons();
}

boot();
