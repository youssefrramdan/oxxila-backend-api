// src/utils/csvExport.js
export const CSV_BOM = '\uFEFF';

export const escapeCsvCell = (value) => {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};

export const buildCsv = (headers, rows) => {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
};

export const csvFilename = (prefix, start, end) => {
  const safeStart = String(start).slice(0, 10);
  const safeEnd = String(end).slice(0, 10);
  return `${prefix}-${safeStart}-to-${safeEnd}.csv`;
};

export const sendCsvResponse = (res, filename, headers, rows) => {
  const body = buildCsv(headers, rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(body);
};
