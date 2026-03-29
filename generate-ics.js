// generate-ics.js — Lit Firebase et génère calendar.ics
// Exécuté automatiquement par GitHub Actions à chaque push

const https = require('https');
const fs = require('fs');

const FIREBASE_URL = process.env.FIREBASE_DATABASE_URL; // ex: https://saxophone-competences-default-rtdb.europe-west1.firebasedatabase.app
const FIREBASE_SECRET = process.env.FIREBASE_SECRET;    // clé d'accès Firebase

const EVT_EMOJIS = { cours: '🎵', examen: '🎓', concert: '🎤' };

function pad(n) { return String(n).padStart(2, '0'); }

function fmtISO(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function icsEscape(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function addHour(t) {
  const [h, m] = t.split(':').map(Number);
  return pad(Math.min(h + 1, 23)) + ':' + pad(m);
}

function buildICS(events) {
  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Saxophone Compétences//Agenda//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Saxophone — Agenda',
    'X-WR-TIMEZONE:Europe/Paris',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];

  for (const evt of events) {
    const d = evt.date.replace(/-/g, '');
    let dtStart, dtEnd;

    if (evt.timeStart) {
      dtStart = d + 'T' + evt.timeStart.replace(':', '') + '00';
      const endTime = evt.timeEnd || addHour(evt.timeStart);
      dtEnd = d + 'T' + endTime.replace(':', '') + '00';
    } else {
      dtStart = d;
      const nd = new Date(evt.date + 'T12:00:00');
      nd.setDate(nd.getDate() + 1);
      dtEnd = fmtISO(nd).replace(/-/g, '');
    }

    const emoji = EVT_EMOJIS[evt.type || 'cours'] || '';
    const summary = emoji + ' ' + evt.title;

    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + (evt.id || ('evt' + Date.now())) + '@saxophone-competences');
    lines.push('DTSTAMP:' + now);
    if (evt.timeStart) {
      lines.push('DTSTART;TZID=Europe/Paris:' + dtStart);
      lines.push('DTEND;TZID=Europe/Paris:' + dtEnd);
    } else {
      lines.push('DTSTART;VALUE=DATE:' + dtStart);
      lines.push('DTEND;VALUE=DATE:' + dtEnd);
    }
    lines.push('SUMMARY:' + icsEscape(summary));
    if (evt.lieu)  lines.push('LOCATION:' + icsEscape(evt.lieu));
    if (evt.note)  lines.push('DESCRIPTION:' + icsEscape(evt.note));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function fetchFirebase() {
  return new Promise((resolve, reject) => {
    const auth = FIREBASE_SECRET ? `?auth=${FIREBASE_SECRET}` : '';
    const url = `${FIREBASE_URL}/sax_agenda_v1.json${auth}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed) { resolve([]); return; }
          const events = Array.isArray(parsed)
            ? parsed.filter(Boolean)
            : Object.values(parsed).filter(Boolean);
          resolve(events);
        } catch (e) {
          reject(new Error('Parse error: ' + e.message));
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('📅 Génération du calendrier ICS...');

  if (!FIREBASE_URL) {
    console.error('❌ FIREBASE_DATABASE_URL manquant');
    process.exit(1);
  }

  const events = await fetchFirebase();
  console.log(`✓ ${events.length} événement(s) récupéré(s) depuis Firebase`);

  const ics = buildICS(events);
  fs.writeFileSync('calendar.ics', ics, 'utf8');
  console.log('✓ calendar.ics généré (' + ics.length + ' bytes)');
}

main().catch(err => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});
