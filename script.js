// Optional shared default: set this to your public Worker URL after deployment.
// This URL is not a secret. Never put a Gemini API key here.
const DEFAULT_AI_ENDPOINT = '';
const CDN = 'https://cdn.jsdelivr.net';
const $ = id => document.getElementById(id);
const form = $('tailor-form');
const resume = $('resume');
const job = $('job');
let busy = false;
let importing = false;
let snapshot = null;
let endpoint = DEFAULT_AI_ENDPOINT;
try { endpoint = localStorage.getItem('resumematch-endpoint') || endpoint; } catch { /* Storage may be disabled. */ }
$('endpoint').value = endpoint;
const scripts = new Map();
function loadScript(url, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!scripts.has(url)) scripts.set(url, new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.crossOrigin = 'anonymous';
    script.onload = () => window[globalName] ? resolve(window[globalName]) : reject(new Error('Document library did not initialize.'));
    script.onerror = () => { script.remove(); scripts.delete(url); reject(new Error('Could not load a document library. Check your internet connection and try again.')); };
    document.head.append(script);
  }));
  return scripts.get(url);
}
function validateEndpoint(value) {
  const url = new URL(value.trim());
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use the root HTTPS Worker URL, with no path, query, or credentials.');
  return url.origin;
}
function connectionState() {
  $('connection-dot').classList.toggle('connected', Boolean(endpoint));
  $('connection-summary').textContent = endpoint ? 'URL saved · ready to connect' : 'One-time setup';
}
connectionState();
$('save-connection').addEventListener('click', () => {
  try {
    if (!$('endpoint').value.trim()) {
      endpoint = DEFAULT_AI_ENDPOINT;
      try { localStorage.removeItem('resumematch-endpoint'); } catch { /* Optional storage. */ }
      $('connection-status').textContent = 'Saved connection removed.';
      connectionState();
      return;
    }
    endpoint = validateEndpoint($('endpoint').value);
    let saved = true;
    try { localStorage.setItem('resumematch-endpoint', endpoint); } catch { saved = false; }
    $('endpoint').value = endpoint;
    $('connection-status').textContent = saved ? 'URL saved. Connection will be checked when you tailor your resume.' : 'URL set for this session. Browser storage is unavailable.';
    connectionState();
  } catch (error) { $('connection-status').textContent = error.message || 'Enter a valid Worker URL.'; }
});
function setStatus(message, isError = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', isError);
  $('status').setAttribute('role', isError ? 'alert' : 'status');
}
function updateInputs() {
  $('resume-count').textContent = `${resume.value.length.toLocaleString()} characters`;
  $('job-count').textContent = `${job.value.length.toLocaleString()} characters`;
  $('stale-notice').hidden = !snapshot || (snapshot.resume === resume.value && snapshot.job === job.value);
}
function inputsChanged() { $('privacy-confirmed').checked = false; updateInputs(); }
resume.addEventListener('input', inputsChanged);
job.addEventListener('input', inputsChanged);
function setBusy(value) {
  busy = value;
  $('tailor-button').disabled = value || importing;
  $('tailor-button').textContent = value ? 'Analyzing & checking facts…' : 'Analyze & tailor resume ↗';
  form.setAttribute('aria-busy', String(value));
}
async function extractPdf(buffer) {
  const pdfjs = await import(`${CDN}/npm/pdfjs-dist@5.4.624/build/pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${CDN}/npm/pdfjs-dist@5.4.624/build/pdf.worker.min.mjs`;
  const task = pdfjs.getDocument({ data: buffer, isEvalSupported: false });
  let pdf;
  try {
    pdf = await task.promise;
    if (pdf.numPages > 30) throw new Error('Please use a resume with 30 pages or fewer.');
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let text = ''; let lastY = null;
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 3 && !text.endsWith('\n')) text += '\n';
        text += item.str;
        text += item.hasEOL ? '\n' : ' ';
        lastY = y;
      }
      pages.push(text.replace(/ +\n/g, '\n').trim());
      page.cleanup();
    }
    return pages.join('\n\n');
  } catch (error) {
    if (error.name === 'PasswordException') throw new Error('This PDF is password-protected. Upload an unlocked copy or paste the text.');
    throw error;
  } finally { await task.destroy(); }
}
async function importFile(file) {
  if (!file || busy || importing) return;
  const extension = file.name.split('.').pop().toLowerCase();
  if (!['pdf', 'docx'].includes(extension)) { $('import-status').textContent = 'Choose a PDF or DOCX file. Older .doc files are not supported.'; return; }
  if (file.size > 5 * 1024 * 1024) { $('import-status').textContent = 'Choose a file smaller than 5 MB.'; return; }
  importing = true;
  $('tailor-button').disabled = true;
  resume.readOnly = true;
  $('resume-file').disabled = true;
  $('import-status').textContent = 'Reading your resume in this browser…';
  try {
    const buffer = await file.arrayBuffer();
    let text;
    if (extension === 'pdf') text = await extractPdf(buffer);
    else {
      const mammoth = await loadScript(`${CDN}/npm/mammoth@1.11.0/mammoth.browser.min.js`, 'mammoth');
      text = (await mammoth.extractRawText({ arrayBuffer: buffer })).value;
    }
    text = text.replace(/\r\n?/g, '\n').trim();
    if (text.length < 50) throw new Error('Not enough text could be extracted. Scanned PDFs need OCR first; paste the resume text instead.');
    if (text.length > 24000) throw new Error('This document exceeds 24,000 characters. Paste a shorter resume instead; nothing was truncated.');
    resume.value = text;
    $('privacy-confirmed').checked = false;
    $('file-label').textContent = file.name;
    $('import-status').textContent = 'Text extracted. Check the reading order, names, dates, and bullet points before tailoring.';
    updateInputs();
  } catch (error) { $('import-status').textContent = error.message || 'This file could not be read. Try another file or paste your text.'; }
  finally {
    importing = false;
    resume.readOnly = false;
    $('resume-file').disabled = false;
    $('resume-file').value = '';
    $('tailor-button').disabled = busy;
  }
}
$('resume-file').addEventListener('change', event => importFile(event.target.files[0]));
for (const eventName of ['dragenter', 'dragover']) $('dropzone').addEventListener(eventName, event => { event.preventDefault(); $('dropzone').classList.add('dragging'); });
for (const eventName of ['dragleave', 'drop']) $('dropzone').addEventListener(eventName, event => { event.preventDefault(); $('dropzone').classList.remove('dragging'); });
$('dropzone').addEventListener('drop', event => {
  if (event.dataTransfer.files.length !== 1) { $('import-status').textContent = 'Please upload one resume at a time.'; return; }
  importFile(event.dataTransfer.files[0]);
});
function makeElement(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function renderResults(data, inputs) {
  // Render all user/AI content as text, never HTML.
  $('score').textContent = data.score;
  const names = { keywords: 'Keyword coverage', qualifications: 'Required qualifications', experience: 'Relevant experience' };
  $('breakdown').replaceChildren();
  for (const [key, category] of Object.entries(data.categories)) {
    const row = makeElement('div', undefined, 'breakdown-row');
    row.append(makeElement('span', `${names[key]} · ${category.weight}%`), makeElement('span', category.total ? `${category.met}/${category.total} evidenced` : 'Not specified · excluded'));
    const meter = makeElement('div', undefined, 'meter');
    const fill = makeElement('span'); fill.style.width = `${category.total ? category.met / category.total * 100 : 0}%`; meter.append(fill);
    $('breakdown').append(row, meter);
  }
  for (const [id, present] of [['present-keywords', true], ['missing-keywords', false]]) {
    const items = data.keywords.filter(item => item.present === present);
    $(id).replaceChildren(...items.map(item => {
      const chip = makeElement('span', item.term, 'chip');
      if (present && item.supported === false) chip.textContent += ' · no credit';
      chip.title = item.evidence || (present ? 'A mention alone does not establish proficiency.' : 'This term is not present in the original resume.');
      return chip;
    }));
    if (!items.length) $(id).append(makeElement('span', present ? 'No matching keywords found.' : 'No missing keywords identified.', 'field-note'));
    $(present ? 'present-count' : 'missing-count').textContent = `(${items.length})`;
  }
  $('requirements').replaceChildren();
  for (const item of data.requirements) {
    const row = makeElement('div', undefined, 'requirement');
    row.append(makeElement('span', { met: 'Met', partial: 'Partial · no credit', not_evidenced: 'Not evidenced' }[item.status], `badge ${item.status}`));
    const content = makeElement('div');
    content.append(makeElement('strong', item.requirement), makeElement('p', item.explanation));
    if (item.evidence) content.append(makeElement('blockquote', `Resume: “${item.evidence}”`));
    const source = makeElement('details');
    source.append(makeElement('summary', 'Job description source'), makeElement('p', item.job_quote));
    content.append(source); row.append(content); $('requirements').append(row);
  }
  if (!data.requirements.length) $('requirements').append(makeElement('p', 'No explicit qualification or experience requirements were identified. The score uses keyword coverage only.', 'section-help'));
  snapshot = inputs;
  $('original').value = inputs.resume;
  $('tailored').value = data.tailored_resume;
  $('results').hidden = false;
  $('empty-results').hidden = true;
  $('download-status').textContent = '';
  updateInputs();
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function validResult(data) {
  return Number.isInteger(data.score) && data.score >= 0 && data.score <= 100 && typeof data.tailored_resume === 'string' && data.tailored_resume.trim() && data.tailored_resume.length <= 40000 && Array.isArray(data.keywords) && data.keywords.every(item => typeof item.term === 'string' && typeof item.present === 'boolean') && Array.isArray(data.requirements) && data.requirements.every(item => ['met', 'partial', 'not_evidenced'].includes(item.status) && ['requirement', 'evidence', 'explanation', 'job_quote'].every(key => typeof item[key] === 'string')) && ['keywords', 'qualifications', 'experience'].every(key => {
    const item = data.categories?.[key]; return item && Number.isInteger(item.met) && Number.isInteger(item.total) && item.met >= 0 && item.total >= item.met && item.weight > 0;
  });
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || importing || !form.reportValidity()) return;
  if (!endpoint) {
    setStatus('Connect your secure AI function below to start tailoring.', true);
    $('connection').open = true;
    $('connection').scrollIntoView({ behavior: 'smooth' });
    $('endpoint').focus({ preventScroll: true });
    return;
  }
  try { endpoint = validateEndpoint(endpoint); } catch { setStatus('The saved AI function URL is invalid. Update it in AI connection.', true); return; }
  if (resume.value.trim().length < 50 || job.value.trim().length < 50) { setStatus('Please provide at least 50 characters of resume and job description text.', true); return; }
  const inputs = { resume: resume.value, job: job.value };
  setBusy(true);
  setStatus('Finding relevant requirements, tailoring your wording, and checking facts. This can take up to three minutes.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 170000);
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ resume: inputs.resume, job_description: inputs.job, privacy_confirmed: $('privacy-confirmed').checked }), signal: controller.signal });
    let data;
    try { data = await response.json(); } catch { throw new Error('The function did not return JSON. Check that the URL points to your deployed Worker.'); }
    if (!response.ok) throw new Error(data.error || `The AI function returned an error (${response.status}).`);
    if (!validResult(data)) throw new Error('The AI function returned an invalid report. No results were changed.');
    renderResults(data, inputs);
    setStatus('Your analysis is ready. Review the evidence and every line of the tailored resume before downloading.');
  } catch (error) {
    setStatus(error.name === 'AbortError' ? 'The request timed out. Please try again in a moment.' : error instanceof TypeError ? 'Could not connect to the AI function. Check its URL, your connection, and the Worker’s ALLOWED_ORIGINS setting.' : error.message, true);
  } finally { clearTimeout(timer); setBusy(false); }
});
$('compare').addEventListener('click', () => {
  const comparing = $('compare').getAttribute('aria-pressed') !== 'true';
  $('compare').setAttribute('aria-pressed', String(comparing));
  $('compare').textContent = comparing ? 'Hide original' : 'Compare original';
  $('original-column').hidden = !comparing;
  $('editors').classList.toggle('comparing', comparing);
});
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const headingPattern = /^(summary|professional summary|profile|professional profile|experience|work experience|professional experience|employment history|education|skills|technical skills|core skills|certifications|projects|publications|awards|volunteering|volunteer experience|languages|interests|additional information|achievements):?$/i;
function resumeLines() { return $('tailored').value.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').trim().split('\n'); }
async function exportDocx() {
  const docx = await import(`${CDN}/npm/docx@9.5.1/dist/index.mjs`);
  const lines = resumeLines();
  const children = lines.map((line, index) => {
    const heading = headingPattern.test(line.trim());
    return new docx.Paragraph({
      children: [new docx.TextRun({ text: line, bold: index === 0 || heading, size: index === 0 ? 34 : heading ? 24 : 21, font: 'Arial' })],
      spacing: { after: line.trim() ? 70 : 30, before: heading ? 140 : 0, line: 280 },
      keepNext: heading || index === 0,
    });
  });
  const doc = new docx.Document({ creator: 'ResumeMatch', title: 'Tailored resume', styles: { default: { document: { run: { font: 'Arial', size: 21 } } } }, sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children }] });
  download(await docx.Packer.toBlob(doc), 'ResumeMatch-resume.docx');
}
async function exportPdf() {
  const [pdfLib, fontkit] = await Promise.all([
    loadScript(`${CDN}/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js`, 'PDFLib'),
    loadScript(`${CDN}/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js`, 'fontkit'),
  ]);
  const fontResponse = await fetch(`${CDN}/gh/notofonts/noto-fonts@v20201206-phase3/hinted/ttf/NotoSans/NotoSans-Regular.ttf`);
  if (!fontResponse.ok) throw new Error('The PDF font could not load. Check your connection and try again.');
  const pdf = await pdfLib.PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await fontResponse.arrayBuffer(), { subset: true });
  const supported = new Set(font.getCharacterSet());
  const text = $('tailored').value;
  if ([...text].some(char => !/\s/.test(char) && !supported.has(char.codePointAt(0)))) throw new Error('The PDF font cannot display one or more characters. Remove decorative symbols or use DOCX for full character support.');
  let page; let y;
  const margin = 50; const width = 612 - margin * 2;
  const addPage = () => { page = pdf.addPage([612, 792]); y = 742; };
  addPage();
  for (const [index, raw] of resumeLines().entries()) {
    if (!raw.trim()) { y -= 7; continue; }
    const heading = headingPattern.test(raw.trim());
    const size = index === 0 ? 18 : heading ? 12 : 10.5;
    const height = size * 1.5;
    if (heading) {
      if (y < margin + height * 3) addPage();
      y -= 7;
    }
    // Wrap by glyph width, including long links/words without spaces.
    const wrapped = []; let line = '';
    for (const token of raw.split(/(\s+)/)) {
      if (!token) continue;
      if (font.widthOfTextAtSize(line + token, size) <= width) { line += token; continue; }
      if (line.trim()) { wrapped.push(line.trimEnd()); line = ''; }
      if (/^\s+$/.test(token)) continue;
      for (const char of token) {
        if (font.widthOfTextAtSize(line + char, size) > width && line) { wrapped.push(line); line = ''; }
        line += char;
      }
    }
    if (line.trim()) wrapped.push(line.trimEnd());
    for (const lineText of wrapped) {
      if (y - height < margin) addPage();
      page.drawText(lineText, { x: margin, y: y - size, size, font, color: pdfLib.rgb(0.12, 0.12, 0.12) });
      y -= height;
    }
    y -= 3;
  }
  pdf.setTitle('Tailored resume'); pdf.setCreator('ResumeMatch');
  download(new Blob([await pdf.save()], { type: 'application/pdf' }), 'ResumeMatch-resume.pdf');
}
async function runExport(type) {
  if (!$('tailored').value.trim()) { $('download-status').textContent = 'Add resume text before downloading.'; return; }
  const buttons = [$('download-docx'), $('download-pdf')]; buttons.forEach(button => { button.disabled = true; });
  $('download-status').textContent = `Preparing your ${type.toUpperCase()}…`;
  try {
    if (type === 'docx') await exportDocx(); else await exportPdf();
    $('download-status').textContent = 'Your download is ready.';
  } catch (error) { $('download-status').textContent = error.message || 'The download could not be created. Please try again.'; }
  finally { buttons.forEach(button => { button.disabled = false; }); }
}
$('download-docx').addEventListener('click', () => runExport('docx'));
$('download-pdf').addEventListener('click', () => runExport('pdf'));
updateInputs();
