/***********
 * CONFIGURAÇÕES
 ***********/
const MAP_CENTER = [-23.0333, -45.55]; // Centro inicial genérico
const LOCALSTORAGE_KEY = 'cc_user_events_v2';

/***********
 * INICIALIZAÇÃO DO MAPA
 ***********/
const map = L.map('map', { zoomControl: true }).setView(MAP_CENTER, 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(map);

// Ícone personalizado para pontos de reciclagem
const recycleIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/726/726623.png",
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -28]
});

/***********
 * CARREGAMENTO DE EVENTOS
 ***********/
function loadLocalEvents() {
  const raw = localStorage.getItem(LOCALSTORAGE_KEY);
  try {
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Erro ao parsear eventos locais', e);
    return [];
  }
}

function saveLocalEvents(arr) {
  localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(arr));
}

function isFuture(dateStr) {
  if (!dateStr) return false;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d >= now;
}

// Renderiza lista de eventos
async function renderEvents() {
  const container = document.getElementById('eventsList');
  container.innerHTML = '';
  const local = loadLocalEvents().filter(ev => isFuture(ev.date));
  const publicEvents = await fetchPublicEventsFiltered();
  const merged = [...local, ...publicEvents].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));

  if (merged.length === 0) {
    container.innerHTML = `<div class="empty">Nenhum evento encontrado para os próximos períodos. Seja o primeiro a sugerir um evento!</div>`;
    return;
  }

  merged.forEach(ev => {
    const div = document.createElement('div');
    div.className = 'event-item';
    div.innerHTML = `<div>
      <div style="font-weight:600">${escapeHtml(ev.name || ev.title || 'Evento')}</div>
      <div class="event-meta">${escapeHtml(ev.date || ev.startDate || '')} • ${escapeHtml(ev.location || ev.address || ev.place || '')}</div>
      <div style="margin-top:6px;color:var(--muted);font-size:13px">${escapeHtml(ev.desc || ev.shortDescription || '')}</div>
    </div>`;
    container.appendChild(div);

    if (ev.lat && ev.lng) {
      L.marker([ev.lat, ev.lng], { opacity: 0.95 }).addTo(map)
        .bindPopup(`<strong>${escapeHtml(ev.name || ev.title)}</strong><br>${escapeHtml(ev.location || '')}`);
    }
  });
}

async function fetchPublicEventsFiltered() {
  try {
    const url = 'https://mapas.cultura.gov.br/api/event/find?@type=json&limit=10';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('não ok');
    const data = await resp.json();
    const results = [];
    for (const ev of data || []) {
      let date = ev.startDate || ev.date || ev.eventDate || '';
      let lat = null, lng = null, location = '';
      if (ev.location && ev.location.point) {
        lat = ev.location.point.lat;
        lng = ev.location.point.lng;
        location = ev.location.name || ev.location.address || '';
      }
      if (!lat && ev.latitude && ev.longitude) { lat = ev.latitude; lng = ev.longitude; }
      if (date && isFuture(date)) {
        results.push({ title: ev.name || ev.title || '', date, shortDescription: ev.shortDescription || ev.description || '', lat, lng, location });
      }
    }
    return results;
  } catch (err) {
    console.warn('fetchPublicEventsFiltered falhou:', err);
    return [];
  }
}

/***********
 * BUSCAR PEVs PRÓXIMOS
 ***********/
async function fetchNearbyPoints(lat, lng) {
  const url = `https://overpass-api.de/api/interpreter?data=[out:json];node(around:5000,${lat},${lng})[amenity=recycling];out;`;
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    const list = document.getElementById("nearbyPointsList");
    if (list) list.innerHTML = "";

    if (!data.elements.length) {
      if (list) list.innerHTML = "<li class='empty'>Nenhum PEV encontrado nas proximidades.</li>";
      return;
    }

    data.elements.forEach(p => {
      const name = p.tags.name || "PEV - Ponto de Coleta";
      const marker = L.marker([p.lat, p.lon], { icon: recycleIcon }).addTo(map)
        .bindPopup(`<strong>${name}</strong><br>${p.tags.recycling_type || "Reciclagem Geral"}`);

      if (list) {
        const li = document.createElement("li");
        li.textContent = name;
        li.onclick = () => {
          map.flyTo([p.lat, p.lon], 16);
          marker.openPopup();
        };
        list.appendChild(li);
      }
    });
  } catch (e) {
    console.warn("Erro ao buscar pontos de coleta:", e);
  }
}

/***********
 * MODAL DE SUGESTÃO
 ***********/
const suggestModal = document.getElementById('suggestModal');
const openSuggestBtn = document.getElementById('openSuggestBtn');
const cancelSuggest = document.getElementById('cancelSuggest');
const saveSuggest = document.getElementById('saveSuggest');

openSuggestBtn.addEventListener('click', () => openModal());
cancelSuggest.addEventListener('click', () => closeModal());

suggestModal.addEventListener('click', (e) => { if (e.target === suggestModal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function openModal() {
  suggestModal.classList.add('show');
  suggestModal.setAttribute('aria-hidden', 'false');
  document.getElementById('evName').focus();
}
function closeModal() {
  suggestModal.classList.remove('show');
  suggestModal.setAttribute('aria-hidden', 'true');
}

saveSuggest.addEventListener('click', () => {
  const name = document.getElementById('evName').value.trim();
  const date = document.getElementById('evDate').value;
  const location = document.getElementById('evPlace').value.trim();
  const desc = document.getElementById('evDesc').value.trim();

  if (!name || !date || !location) {
    alert('Preencha nome, data e local do evento.');
    return;
  }

  const lat = MAP_CENTER[0] + (Math.random() - 0.5) * 0.02;
  const lng = MAP_CENTER[1] + (Math.random() - 0.5) * 0.02;

  const arr = loadLocalEvents();
  arr.push({ name, date, location, desc, lat, lng });
  saveLocalEvents(arr);
  closeModal();
  document.getElementById('evName').value = '';
  document.getElementById('evDate').value = '';
  document.getElementById('evPlace').value = '';
  document.getElementById('evDesc').value = '';
  renderEvents();
  alert('Evento sugerido com sucesso — obrigado pela colaboração!');
});

/***********
 * GEOLOCALIZAÇÃO
 ***********/
document.getElementById('locateBtn').addEventListener('click', () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      map.setView([lat, lng], 14);
      L.circle([lat, lng], { radius: 50, color: '#2f9e63', fillColor: '#2f9e63', fillOpacity: 0.12 }).addTo(map);
      L.marker([lat, lng]).addTo(map).bindPopup('<strong>Você está aqui</strong>').openPopup();

      // Busca pontos de coleta próximos ao usuário
      fetchNearbyPoints(lat, lng);
    }, () => alert('Não foi possível obter sua localização.'));
  } else alert('Geolocalização não suportada.');
});

/***********
 * HELPERS
 ***********/
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

// Render inicial
(async function init() {
  const container = document.getElementById('eventsList');
  container.innerHTML = '<div class="empty">Carregando eventos...</div>';
  await renderEvents();
})();
