const map = L.map('map').setView([14.552, 120.998], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);
const incidentPanel = document.getElementById('incidentPanel');
const incidentInfo = document.getElementById('incidentInfo');
const adminLogForm = document.getElementById('adminLogForm');
const incidentIdInput = document.getElementById('incidentId');
const adminStatusMessage = document.getElementById('adminStatusMessage');
const deleteIncidentButton = document.getElementById('deleteIncident');
const incidentList = document.getElementById('incidentList');
const archiveTree = document.getElementById('archiveTree');
const archiveContent = document.getElementById('archiveContent');
deleteIncidentButton.disabled = true;
const refreshArchive = document.getElementById('refreshArchive');
let archiveCurrentPath = '';

const colorMap = {
  Grey: '#777777',
  Green: '#2e8b57',
  Yellow: '#d4a017',
  Red: '#d62b23',
  Black: '#000000'
};

const markers = [];
let currentIncidents = [];

function createMarker(incident) {
  const marker = L.circleMarker([incident.latitude || 14.552, incident.longitude || 120.998], {
    radius: 12,
    color: colorMap[incident.severity] || '#777',
    fillColor: colorMap[incident.severity] || '#777',
    fillOpacity: 0.8,
    weight: 2
  }).addTo(map);
  marker.on('click', () => showIncidentDetails(incident));
  marker.bindPopup(`<strong>${incident.incidentType}</strong><br/>${incident.brgy} - ${incident.status}`);
  markers.push(marker);
}

function clearMarkers() {
  markers.forEach(marker => {
    marker.remove();
  });
  markers.length = 0;
}

function renderIncidents(incidents) {
  clearMarkers();
  incidents.forEach(createMarker);
}

function renderIncidentList(incidents) {
  incidentList.innerHTML = '';
  incidents.forEach(incident => {
    const item = document.createElement('div');
    item.className = 'incident-item';
    item.innerHTML = `
      <strong>${incident.incidentType}</strong><br/>
      ${incident.brgy} - ${incident.status}<br/>
      <small>${new Date(incident.reportedAt).toLocaleDateString()}</small>
    `;
    item.addEventListener('click', () => {
      document.querySelectorAll('.incident-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      showIncidentDetails(incident);
      map.setView([incident.latitude || 14.552, incident.longitude || 120.998], 15);
    });
    incidentList.appendChild(item);
  });
}

function renderArchiveList(items) {
  archiveTree.innerHTML = '';
  if (!Array.isArray(items) || items.length === 0) {
    archiveTree.innerHTML = '<div class="status">No archived evidence files yet.</div>';
    return;
  }
  if (archiveCurrentPath) {
    const backPath = archiveCurrentPath.split('/').slice(0, -1).join('/');
    const backButton = document.createElement('button');
    backButton.textContent = '⬅ Back';
    backButton.addEventListener('click', () => loadArchive(backPath));
    backButton.className = 'action-btn';
    archiveTree.appendChild(backButton);
  }
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'archive-item';
    const title = document.createElement('div');
    title.textContent = item.isDirectory ? `📁 ${item.name}` : `📄 ${item.name}`;
    const action = document.createElement('button');
    action.textContent = item.isDirectory ? 'Open' : 'View';
    action.addEventListener('click', () => {
      if (item.isDirectory) {
        loadArchive(item.path);
      } else {
        openArchiveFile(item.path);
      }
    });
    row.appendChild(title);
    row.appendChild(action);
    archiveTree.appendChild(row);
  });
}

async function loadArchive(path = '') {
  archiveCurrentPath = path;
  try {
    const response = await fetch(`/api/archive/tree?path=${encodeURIComponent(path)}`);
    const items = await response.json();
    if (!response.ok || !Array.isArray(items)) {
      const message = items && items.error ? items.error : 'Unable to load archive.';
      archiveTree.innerHTML = `<div class="status">${message}</div>`;
      archiveContent.textContent = '';
      return;
    }
    renderArchiveList(items);
    archiveContent.textContent = 'Select a file to preview its contents.';
  } catch (error) {
    archiveTree.innerHTML = '<div class="status">Unable to load archive.</div>';
    archiveContent.textContent = '';
  }
}

async function openArchiveFile(path) {
  try {
    const response = await fetch(`/api/archive/file?path=${encodeURIComponent(path)}`);
    if (!response.ok) {
      archiveContent.textContent = 'Unable to load file.';
      return;
    }
    const text = await response.text();
    archiveContent.textContent = text;
  } catch (error) {
    archiveContent.textContent = 'Unable to load file.';
  }
}

refreshArchive.addEventListener('click', () => loadArchive(archiveCurrentPath));

async function loadIncidents() {
  const response = await fetch('/api/incidents');
  const incidents = await response.json();
  currentIncidents = incidents;
  renderIncidents(incidents);
  renderIncidentList(incidents);
}

deleteIncidentButton.addEventListener('click', async () => {
  const incidentId = deleteIncidentButton.dataset.incidentId;
  console.log('Delete button clicked for incident:', incidentId);
  if (!incidentId) {
    console.log('No incident ID set');
    return;
  }
  if (!confirm('Delete this incident permanently?')) {
    console.log('Delete cancelled by user');
    return;
  }

  console.log('Sending DELETE request for incident:', incidentId);
  const response = await fetch(`/api/incidents/${incidentId}`, { method: 'DELETE' });
  const result = await response.json();
  console.log('Delete response:', response.status, result);

  if (result.success) {
    adminStatusMessage.textContent = 'Incident deleted successfully.';
    incidentPanel.classList.add('hidden');
    currentIncidents = currentIncidents.filter((incident) => incident.id !== Number(incidentId));
    renderIncidents(currentIncidents);
    renderIncidentList(currentIncidents);
    deleteIncidentButton.disabled = true;
    deleteIncidentButton.dataset.incidentId = '';
    setTimeout(() => { adminStatusMessage.textContent = ''; }, 4000);
  } else {
    adminStatusMessage.textContent = result.error || 'Unable to delete the incident.';
  }
});

async function showIncidentDetails(incident) {
  incidentPanel.classList.remove('hidden');
  incidentIdInput.value = incident.id;
  deleteIncidentButton.dataset.incidentId = incident.id;

  // disable delete when incident already has admin logs (assessed)
  deleteIncidentButton.disabled = incident.adminLogs && incident.adminLogs.length > 0;

  // If this incident is not yet assessed, mark it as Under review on the server
  const statusLower = (incident.status || '').toLowerCase();
  if (!incident.status || statusLower === 'not yet assessed') {
    try {
      const resp = await fetch('/api/admin/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId: incident.id })
      });
      const result = await resp.json();
      if (result && result.success && result.incident) {
        incident = result.incident;
      }
    } catch (e) {
      console.warn('Unable to mark as under review', e);
    }
  }

  incidentInfo.innerHTML = `
    <p><strong>ID:</strong> ${incident.id}</p>
    <p><strong>Type:</strong> ${incident.incidentType}</p>
    <p><strong>Role:</strong> ${incident.role}</p>
    <p><strong>Barangay:</strong> ${incident.brgy}</p>
    <p><strong>Severity:</strong> ${incident.severity}</p>
    <p><strong>Status:</strong> ${incident.status}</p>
    <p><strong>Location:</strong> ${incident.latitude || 'unknown'}, ${incident.longitude || 'unknown'}</p>
    <p><strong>Description:</strong> ${incident.description}</p>
    <p><strong>Victim info:</strong> ${incident.victimInfo}</p>
    <p><strong>Location notes:</strong> ${incident.locationNotes}</p>
    <p><strong>Reported at:</strong> ${new Date(incident.reportedAt).toLocaleString()}</p>
    <p><strong>Media files:</strong> ${incident.mediaFiles.length ? incident.mediaFiles.map((file) => `<a target="_blank" href="${file.url}">${file.originalname}</a>`).join('<br/>') : 'None'}</p>
    <p><strong>Admin logs:</strong></p>
    ${incident.adminLogs && incident.adminLogs.length ? incident.adminLogs.map((log) => `<div style="background:#f4f6f8;padding:8px;border-radius:8px;margin:6px 0;"><strong>${log.severity}</strong> ${log.status}<br/>${log.note}<br/><em>${new Date(log.createdAt).toLocaleString()} by ${log.adminName}</em></div>`).join('') : '<div>No logs yet.</div>'}
  `;
}

adminLogForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  adminStatusMessage.textContent = 'Saving admin log...';
  const payload = {
    incidentId: incidentIdInput.value,
    adminName: document.getElementById('adminName').value,
    severity: document.getElementById('adminSeverity').value,
    status: document.getElementById('adminStatus').value,
    note: document.getElementById('adminNote').value
  };

  const response = await fetch('/api/admin/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (result.success) {
    adminStatusMessage.textContent = 'Admin log saved successfully.';
    setTimeout(() => { adminStatusMessage.textContent = ''; }, 4000);
    showIncidentDetails(result.incident);
    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) layer.remove();
    });
    loadIncidents();
  } else {
    adminStatusMessage.textContent = 'Unable to save admin log.';
  }
});

loadIncidents();
loadArchive();
