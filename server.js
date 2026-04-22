const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const ARCHIVE_DIR = path.join(__dirname, 'admin_archive');
const ARCHIVE_ROOT = path.resolve(ARCHIVE_DIR);

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(ARCHIVE_DIR)) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

// Configure storage: prefer S3 when credentials present, otherwise local disk
let upload;
let useS3 = false;
let s3 = null;
let AWS = null;
if (process.env.S3_BUCKET && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  AWS = require('aws-sdk');
  const multerS3 = require('multer-s3');
  AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
  s3 = new AWS.S3();
  useS3 = true;
  const s3storage = multerS3({
    s3,
    bucket: process.env.S3_BUCKET,
    acl: 'private',
    key: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.originalname}`)
  });
  upload = multer({ storage: s3storage });
} else {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.originalname}`)
  });
  upload = multer({ storage });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Simple CORS to allow mobile devices and other origins to post reports
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function getIncidentPath(incident) {
  const date = new Date(incident.reportedAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${month}-${day}-${String(year).slice(-2)}`;
  return path.join(DATA_DIR, String(year), dateStr, `incident-${incident.id}.json`);
}

function getArchivePath(incident) {
  const date = new Date(incident.reportedAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${month}-${day}-${String(year).slice(-2)}`;
  return path.join(ARCHIVE_DIR, String(year), dateStr, `incident-${incident.id}.json`);
}

function getArchiveKey(incident) {
  const date = new Date(incident.reportedAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${month}-${day}-${String(year).slice(-2)}`;
  return `${year}/${dateStr}/incident-${incident.id}.json`;
}

function archiveIncident(incident) {
  if (useS3 && s3) {
    const key = getArchiveKey(incident);
    return s3.putObject({ Bucket: process.env.S3_BUCKET, Key: key, Body: JSON.stringify(incident, null, 2), ContentType: 'application/json' }).promise();
  }
  const archivePath = getArchivePath(incident);
  const dir = path.dirname(archivePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(archivePath, JSON.stringify(incident, null, 2), 'utf8');
}

function saveIncident(incident) {
  const filePath = getIncidentPath(incident);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(incident, null, 2), 'utf8');
  if (incident.status && incident.status.toLowerCase() === 'resolved') {
    archiveIncident(incident);
  }
}

function isActiveIncident(incident) {
  if (!incident.status) return true;
  if (incident.status.toLowerCase() !== 'resolved') return true;
  if (!incident.resolvedAt) return true;
  const resolvedTime = new Date(incident.resolvedAt).getTime();
  return Date.now() - resolvedTime < 2 * 60 * 60 * 1000;
}

function loadAllIncidents() {
  const incidents = [];
  if (!fs.existsSync(DATA_DIR)) return incidents;

  const years = fs.readdirSync(DATA_DIR);
  for (const year of years) {
    const yearPath = path.join(DATA_DIR, year);
    if (!fs.statSync(yearPath).isDirectory()) continue;
    const dates = fs.readdirSync(yearPath);
    for (const date of dates) {
      const datePath = path.join(yearPath, date);
      if (!fs.statSync(datePath).isDirectory()) continue;
      const files = fs.readdirSync(datePath);
      for (const file of files) {
        if (file.startsWith('incident-') && file.endsWith('.json')) {
          const filePath = path.join(datePath, file);
          try {
            const incident = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            incidents.push(incident);
          } catch (e) {
            console.error(`Error loading ${filePath}:`, e);
          }
        }
      }
    }
  }
  return incidents.sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt));
}

function nextId(incidents) {
  return incidents.length === 0 ? 1 : Math.max(...incidents.map((i) => i.id)) + 1;
}

app.get('/api/incidents', (req, res) => {
  const incidents = loadAllIncidents().filter(isActiveIncident);
  res.json(incidents);
});

app.post('/api/report', upload.array('mediaFiles', 5), (req, res) => {
  const incidents = loadAllIncidents();
  const incident = {
    id: nextId(incidents),
    reportedAt: new Date().toISOString(),
    reporterName: req.body.reporterName || 'Anonymous',
    role: req.body.role || 'Citizen',
    brgy: req.body.brgy || 'Unknown',
    incidentType: req.body.incidentType || 'Other',
    description: req.body.description || '',
    severity: req.body.severity || 'Grey',
    latitude: req.body.latitude || '',
    longitude: req.body.longitude || '',
    locationNotes: req.body.locationNotes || '',
    victimInfo: req.body.victimInfo || '',
    emergencyMode: req.body.emergencyMode === 'true',
    offlineFallback: req.body.offlineFallback === 'true',
    status: 'Not yet assessed',
    adminLogs: [],
    mediaFiles: req.files ? req.files.map((file) => {
      // file from disk will have .filename; multer-s3 will have .key and possibly .location
      if (useS3 && file.key) {
        return {
          filename: file.key,
          originalname: file.originalname,
          url: `/api/uploads/signed?key=${encodeURIComponent(file.key)}`,
          s3: { bucket: process.env.S3_BUCKET, key: file.key }
        };
      }
      return {
        filename: file.filename,
        originalname: file.originalname,
        url: `/uploads/${file.filename}`
      };
    }) : []
  };
  incidents.push(incident);
  saveIncident(incident);
  res.json({ success: true, incident });
});

app.post('/api/admin/log', (req, res) => {
  const incidents = loadAllIncidents();
  const incident = incidents.find((item) => item.id === Number(req.body.incidentId));
  if (!incident) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  const note = {
    createdAt: new Date().toISOString(),
    adminName: req.body.adminName || 'Admin',
    severity: req.body.severity || incident.severity,
    status: req.body.status || incident.status,
    note: req.body.note || ''
  };
  incident.severity = note.severity;
  incident.status = note.status;
  if (note.status.toLowerCase() === 'resolved' && !incident.resolvedAt) {
    incident.resolvedAt = note.createdAt;
  }
  incident.adminLogs.push(note);
  saveIncident(incident);
  res.json({ success: true, incident });
});

// Mark an incident as viewed/under review by an admin (no admin log created)
app.post('/api/admin/view', (req, res) => {
  const incidents = loadAllIncidents();
  const incident = incidents.find((item) => item.id === Number(req.body.incidentId));
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  const current = (incident.status || '').toLowerCase();
  if (current === 'resolved') return res.json({ success: true, incident });
  if (!incident.status || current === 'not yet assessed') {
    incident.status = 'Under review';
    saveIncident(incident);
  }
  res.json({ success: true, incident });
});

app.get('/api/archive/tree', (req, res) => {
  const relPath = req.query.path || '';
  const safePath = path.normalize(relPath).replace(/^\.\.\/|^\.\.\\/g, '').replace(/^\/|^\\/, '').replace(/\\/g, '/');
  if (useS3 && s3) {
    // list prefixes (directories) and objects under the given prefix
    const prefix = safePath ? `${safePath.replace(/\\/g, '/')}/` : '';
    const params = { Bucket: process.env.S3_BUCKET, Prefix: prefix, Delimiter: '/' };
    s3.listObjectsV2(params, (err, data) => {
      if (err) return res.status(500).json({ error: 'Unable to list archive' });
      const items = [];
      if (data.CommonPrefixes) {
        data.CommonPrefixes.forEach(cp => {
          const name = cp.Prefix.replace(prefix, '').replace(/\/$/, '');
          items.push({ name, isDirectory: true, path: `${(prefix || '')}${name}`.replace(/\/$/, '') });
        });
      }
      if (data.Contents) {
        data.Contents.forEach(obj => {
          if (obj.Key === prefix) return; // skip folder placeholder
          const name = obj.Key.split('/').pop();
          items.push({ name, isDirectory: false, path: obj.Key });
        });
      }
      items.sort((a, b) => (a.isDirectory === b.isDirectory) ? a.name.localeCompare(b.name) : (a.isDirectory ? -1 : 1));
      res.json(items);
    });
    return;
  }
  const rootPath = path.resolve(ARCHIVE_ROOT, safePath);
  if ((rootPath !== ARCHIVE_ROOT && !rootPath.startsWith(`${ARCHIVE_ROOT}${path.sep}`)) || !fs.existsSync(rootPath)) {
    return res.status(400).json({ error: 'Invalid archive path' });
  }
  const items = fs.readdirSync(rootPath, { withFileTypes: true })
    .map((dirent) => ({
      name: dirent.name,
      isDirectory: dirent.isDirectory(),
      path: path.join(safePath, dirent.name).replace(/\\/g, '/'),
    }))
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  res.json(items);
});

app.get('/api/archive/file', (req, res) => {
  const relPath = req.query.path;
  if (!relPath) {
    return res.status(400).json({ error: 'Missing file path' });
  }
  const safePath = path.normalize(relPath).replace(/^\.\.\/|^\.\.\\/g, '').replace(/^\/|^\\/, '').replace(/\\/g, '/');
  if (useS3 && s3) {
    const key = safePath;
    const params = { Bucket: process.env.S3_BUCKET, Key: key };
    s3.getObject(params, (err, data) => {
      if (err) return res.status(404).json({ error: 'File not found' });
      res.setHeader('Content-Type', 'application/json');
      res.send(data.Body.toString('utf8'));
    });
    return;
  }
  const filePath = path.resolve(ARCHIVE_ROOT, safePath);
  if ((filePath !== ARCHIVE_ROOT && !filePath.startsWith(`${ARCHIVE_ROOT}${path.sep}`)) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(filePath);
});

app.delete('/api/incidents/:id', (req, res) => {
  const id = Number(req.params.id);
  const incidents = loadAllIncidents();
  const incident = incidents.find((item) => item.id === id);
  if (!incident) {
    return res.status(404).json({ error: 'Incident not found' });
  }

  // Prevent deleting incidents that have been assessed/contain admin logs
  if (incident.adminLogs && incident.adminLogs.length > 0) {
    return res.status(400).json({ error: 'Cannot delete an incident that has admin logs/assessments' });
  }

  const incidentPath = getIncidentPath(incident);
  if (fs.existsSync(incidentPath)) {
    fs.unlinkSync(incidentPath);
  }

  if (useS3 && s3) {
    const key = getArchiveKey(incident);
    s3.deleteObject({ Bucket: process.env.S3_BUCKET, Key: key }, () => {});
  } else {
    const archivePath = getArchivePath(incident);
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }
  }

  res.json({ success: true });
});

app.get('/api/brgy/:brgy/incidents', (req, res) => {
  const incidents = loadAllIncidents();
  const brgyIncidents = incidents.filter(inc => inc.brgy.toLowerCase() === req.params.brgy.toLowerCase());
  res.json(brgyIncidents);
});

// Provide signed URL for S3 stored uploads (admin/mobile can request)
app.get('/api/uploads/signed', (req, res) => {
  const key = req.query.key;
  if (!key) return res.status(400).json({ error: 'Missing key' });
  if (!useS3 || !s3) return res.status(404).json({ error: 'S3 not enabled' });
  const params = { Bucket: process.env.S3_BUCKET, Key: key, Expires: 60 * 5 };
  const url = s3.getSignedUrl('getObject', params);
  res.redirect(url);
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tupi DRRM Prototype running at http://0.0.0.0:${PORT}`);
});
