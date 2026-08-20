import PDFDocument from 'pdfkit';
import { query } from '../../db/pool.js';

export async function buildCsv() {
  const { rows } = await query(
    `SELECT tracking_id, category, severity, status, location_label,
            lat, lng, is_anonymous, created_at, resolved_at,
            CASE WHEN resolved_at IS NOT NULL
                 THEN ROUND(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60.0)::int
                 ELSE NULL END AS response_minutes
       FROM incidents
       ORDER BY created_at DESC`
  );
  const header = [
    'tracking_id','category','severity','status','location','lat','lng',
    'anonymous','created_at','resolved_at','response_minutes',
  ];
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(',')];
  for (const r of rows) lines.push(header.map((h) => escape(r[h])).join(','));
  return lines.join('\n');
}

export async function generatePdf() {
  const { rows } = await query(
    `SELECT tracking_id, category, severity, status, location_label, created_at, resolved_at
       FROM incidents
       ORDER BY created_at DESC LIMIT 200`
  );
  const metrics = await query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status='resolved')::int AS resolved,
            COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60.0) FILTER (WHERE resolved_at IS NOT NULL), 0)::float AS avg_min
       FROM incidents`
  );

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('Smart Campus Emergency Response', { align: 'left' });
    doc.fontSize(10).fillColor('#666').text(`Generated ${new Date().toISOString()}`);
    doc.moveDown();
    const m = metrics.rows[0];
    doc.fillColor('#000').fontSize(12);
    doc.text(`Total incidents:   ${m.total}`);
    doc.text(`Resolved:          ${m.resolved}`);
    doc.text(`Avg response time: ${Math.round(m.avg_min)} minutes`);
    doc.moveDown();

    doc.fontSize(14).text('Incidents');
    doc.moveDown(0.5);
    doc.fontSize(9);
    for (const r of rows) {
      doc.fillColor('#000').text(
        `${r.tracking_id}  •  ${r.category}  •  ${r.severity}  •  ${r.status}  •  ${r.location_label || '-'}`
      );
      doc.fillColor('#666').text(`   ${new Date(r.created_at).toISOString()}`);
      doc.moveDown(0.2);
    }
    doc.end();
  });
}
