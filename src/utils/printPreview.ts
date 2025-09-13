export function openPrintPreviewFromElementId(elementId: string, title = 'Aperçu') {
  const el = document.getElementById(elementId);
  if (!el) return;
  try {
    const content = el.innerHTML;
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    // remove preview buttons
    const buttons = doc.querySelectorAll('button');
    buttons.forEach(b => {
      if (b.textContent && b.textContent.toLowerCase().includes('aperçu')) b.remove();
    });

    const cleaned = doc.body.innerHTML;
    // remove layout classes that constrain width in print (e.g. Tailwind max-w-lg, mx-auto)
    const sanitized = cleaned.replace(/class=\"([^\"]*)\"/g, (_m, cls) => {
      const cleanedCls = cls.replace(/\bmax-w-[^\s]+\b/g, '').replace(/\bmx-auto\b/g, '').replace(/\bmax-w-full\b/g, '').replace(/\bprint:max-w-full\b/g, '');
      return `class="${cleanedCls.trim()}"`;
    });

    const style = `
      <style>
          @page { size: A4 portrait; margin: 12mm; }
          :root {
            --page-height: 297mm;
            --print-margin: 12mm;
            --cut-gap: 3mm;
            --printable-height: calc(var(--page-height) - (var(--print-margin) * 2));
            --receipt-height: calc((var(--printable-height) - var(--cut-gap)) / 2);
          }
          html,body { height: 100%; }
          body { font-family: 'Times New Roman', Times, serif; color: #111827; padding: 0; margin: 0; background: #ffffff; }
          /* force wrapper to exactly one A4 page and hide overflow to ensure two receipts render on the same page */
          .receipt-wrapper { width: 210mm; margin: 0 auto; padding: 0; box-sizing: border-box; height: var(--page-height); overflow: hidden; }
          .print-content { display: flex; flex-direction: column; gap: var(--cut-gap); box-sizing: border-box; height: 100%; }
          /* compute receipt height as half of the available wrapper height minus the cut gap */
          .receipt-compact { font-size: 10px; line-height: 1.15; font-family: 'Times New Roman', Times, serif; box-sizing: border-box; padding: 3mm; height: calc((100% - var(--cut-gap)) / 2); overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; }
          .receipt-compact + .receipt-compact { border-top: 1px dashed rgba(0,0,0,0.24); position: relative; }
          .receipt-compact + .receipt-compact::before { content: '\\2702'; position: absolute; top: -6mm; left: 50%; transform: translateX(-50%); background: white; padding: 0 6px; color: #444; font-size: 11px; }

          /* Four convocations per A4 (unchanged) */
          .print-four-per-page .convocation { height: 65mm; padding: 6mm; box-sizing: border-box; overflow: hidden; position: relative; }
          .print-four-per-page .convocation + .convocation { border-top: 1px dashed #444; margin-top: 4mm; padding-top: 4mm; position: relative; }
          .print-four-per-page .convocation + .convocation::before { content: '\\2702'; position: absolute; top: -9mm; left: 50%; transform: translateX(-50%); background: white; padding: 0 3px; color: #444; font-size: 10px; }

          /* constrain images inside a receipt so large logos don't overflow or push layout */
          img { max-width: 100%; height: auto; }
          .receipt-compact img { max-height: 24mm; max-width: 24mm; width: auto; height: auto; object-fit: contain; display: block; }
          .receipt-compact .logo, .receipt-compact img.logo { max-height: 24mm; max-width: 24mm; }
          h1,h2,h3 { color: #0f766e; margin: 0; }
          table { width: 100%; font-size: 9.5px; border-collapse: collapse; }
          th, td { padding: 3px 4px; text-align: left; }
          h1,h2,h3 { font-size: 13px; margin: 0; }

          /* tighten header block spacing */
          .receipt-compact .flex.items-center.space-x-2 { gap: 6px; }
          .receipt-compact .text-xs { font-size: 9px; }
          /* footer table should be borderless and clean */
          .footer-table td { border: none !important; background: transparent !important; padding: 6px 8px !important; }
          th { background: #f3f4f6; font-weight: 600; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .muted { color: #6b7280; font-size: 11px; margin-top: 12px; text-align: center; }
      </style>
    `;

  // preserve container classes for print mode (e.g. print-two-per-page)
  // Prefer the original element's className (el) because el.innerHTML doesn't include the element itself.
  // Also accept a data attribute 'data-print-two-up' used to request two-up printing.
  let containerClassName = '';
  if (el && el.getAttribute && el.getAttribute('data-print-two-up')) {
    containerClassName = (el.className ? el.className + ' ' : '') + 'print-two-per-page';
  } else {
    containerClassName = (el && el.className) ? el.className : (doc.body.firstElementChild && (doc.body.firstElementChild as Element).className ? (doc.body.firstElementChild as Element).className : '');
  }
  // If container requests two-up printing, duplicate the cleaned content so two copies appear stacked vertically.
  // Ensure each copy is wrapped in .receipt-compact so the print CSS for spacing/cut guides applies to each copy independently.
  // Build two-up content: wrap each copy in .receipt-compact and let CSS handle exact heights and gap.
  const contentSource = typeof sanitized !== 'undefined' ? sanitized : cleaned;
  const twoUpContent = containerClassName && containerClassName.includes('print-two-per-page') ? `<div class="print-content"><div class="receipt-compact">${contentSource}</div><div class="receipt-compact">${contentSource}</div></div>` : `<div class="print-content"><div class="receipt-compact">${contentSource}</div></div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>${style}</head><body><div class="receipt-wrapper ${containerClassName}"><div class="print-content">${twoUpContent}</div></div></body></html>`;

    const newWindow = window.open('', '_blank');
    if (!newWindow) return;
    newWindow.document.open();
    newWindow.document.write(html);
    newWindow.document.close();
    newWindow.focus();
    setTimeout(() => {
      try { newWindow.print(); } catch (e) { /* ignore */ }
    }, 300);
  } catch (e) {
    // fallback simple print
    const newWindow = window.open('', '_blank');
    if (!newWindow) return;
    newWindow.document.open();
    newWindow.document.write('<html><head><title>' + title + '</title></head><body>' + el.innerHTML + '</body></html>');
    newWindow.document.close();
    newWindow.print();
  }
}
