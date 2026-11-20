export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1122;
export const A4_LOCK_HEIGHT_PX = 1120;
export const A4_SAFE_CONTENT_PX = 1116;
export const SCALE_CONFIRM_THRESHOLD = 0.85;

const COMPRESSION_TIERS = ['s1a', 's1b', 's1c', 's2a', 's2b', 's2c', 's3a', 's3b'];

const P = '[data-pdf-part="page"]';
const T = (step) => `${P}[data-fit-steps~="${step}"]`;

/**
 * Returns cumulative CSS rules for progressive single-page PDF fitting.
 * Stage 0 (no data-fit-steps) leaves the default invoice layout untouched.
 * @returns {string}
 */
export function getPdfFitStylesheet() {
    return `
${P}, ${P} * { box-sizing: border-box; }

${T('s1a')} { padding: 16mm !important; }
${T('s1a')} [data-pdf-part="header"] { margin-bottom: 32px !important; }
${T('s1a')} [data-pdf-part="address"] { margin-bottom: 26px !important; }
${T('s1a')} [data-pdf-part="title"] { margin-bottom: 28px !important; padding: 10px 0 !important; }
${T('s1a')} [data-pdf-part="items-wrap"] { margin-bottom: 20px !important; }
${T('s1a')} [data-pdf-part="summary-wrap"] { margin-top: 16px !important; margin-bottom: 16px !important; }
${T('s1a')} [data-pdf-part="amare"] { margin-top: 16px !important; margin-bottom: 16px !important; }
${T('s1a')} [data-pdf-part="notes"],
${T('s1a')} [data-pdf-part="signature"] { margin-top: 12px !important; margin-bottom: 10px !important; }
${T('s1a')} [data-pdf-part="footer"] { margin-top: 26px !important; padding-top: 12px !important; }

${T('s1b')} { padding: 14mm !important; }
${T('s1b')} [data-pdf-part="header"] { margin-bottom: 22px !important; }
${T('s1b')} [data-pdf-part="address"] { margin-bottom: 18px !important; }
${T('s1b')} [data-pdf-part="title"] { margin-bottom: 20px !important; padding: 8px 0 !important; }
${T('s1b')} [data-pdf-part="items-wrap"] { margin-bottom: 14px !important; padding-bottom: 8px !important; }
${T('s1b')} [data-pdf-part="summary-wrap"] { margin-top: 12px !important; margin-bottom: 12px !important; }
${T('s1b')} [data-pdf-part="amare"] { margin-top: 12px !important; margin-bottom: 12px !important; padding: 8px 12px !important; }
${T('s1b')} [data-pdf-part="notes"],
${T('s1b')} [data-pdf-part="signature"] { margin-top: 10px !important; margin-bottom: 8px !important; }
${T('s1b')} [data-pdf-part="footer"] { margin-top: 18px !important; padding-top: 10px !important; }

${T('s1c')} { padding: 12mm !important; }
${T('s1c')} [data-pdf-part="header"] { margin-bottom: 14px !important; }
${T('s1c')} [data-pdf-part="address"] { margin-bottom: 12px !important; }
${T('s1c')} [data-pdf-part="title"] { margin-bottom: 14px !important; padding: 6px 0 !important; }
${T('s1c')} [data-pdf-part="items-wrap"] { margin-bottom: 10px !important; padding-bottom: 6px !important; }
${T('s1c')} [data-pdf-part="summary-wrap"] { margin-top: 8px !important; margin-bottom: 8px !important; line-height: 1.45 !important; }
${T('s1c')} [data-pdf-part="amare"] { margin-top: 8px !important; margin-bottom: 8px !important; padding: 7px 10px !important; }
${T('s1c')} [data-pdf-part="notes"] { margin-top: 8px !important; margin-bottom: 6px !important; }
${T('s1c')} [data-pdf-part="signature"] { margin-top: 8px !important; margin-bottom: 6px !important; padding: 8px 12px !important; }
${T('s1c')} [data-pdf-part="footer"] { margin-top: 12px !important; padding-top: 8px !important; }

${T('s2a')} { line-height: 1.35 !important; }
${T('s2a')} [data-pdf-part="items-table"][data-table-type="lesgeven"],
${T('s2a')} [data-pdf-part="items-table"][data-table-type="lesgeven"] th,
${T('s2a')} [data-pdf-part="items-table"][data-table-type="lesgeven"] td { font-size: 11px !important; padding: 4px 5px !important; }
${T('s2a')} [data-pdf-part="items-table"][data-table-type="manual"],
${T('s2a')} [data-pdf-part="items-table"][data-table-type="rent"],
${T('s2a')} [data-pdf-part="items-table"][data-table-type="offerte"] { font-size: 12px !important; }
${T('s2a')} [data-pdf-part="items-table"][data-table-type="manual"] td,
${T('s2a')} [data-pdf-part="items-table"][data-table-type="rent"] td,
${T('s2a')} [data-pdf-part="items-table"][data-table-type="offerte"] td { font-size: 12px !important; padding: 6px 0 !important; line-height: 1.35 !important; }
${T('s2a')} [data-pdf-part="items-table"] th { padding-bottom: 6px !important; }
${T('s2a')} [data-pdf-part="totals-table"] td { padding-bottom: 3px !important; }
${T('s2a')} [data-pdf-part="totals-grand"] { font-size: 14px !important; }
${T('s2a')} [data-pdf-part="totals-grand"] td { padding: 6px 0 !important; }

${T('s2b')} { font-size: 12px !important; line-height: 1.3 !important; }
${T('s2b')} [data-pdf-part="items-table"][data-table-type="lesgeven"],
${T('s2b')} [data-pdf-part="items-table"][data-table-type="lesgeven"] th,
${T('s2b')} [data-pdf-part="items-table"][data-table-type="lesgeven"] td { font-size: 10px !important; padding: 3px 4px !important; }
${T('s2b')} [data-pdf-part="items-table"][data-table-type="manual"],
${T('s2b')} [data-pdf-part="items-table"][data-table-type="rent"],
${T('s2b')} [data-pdf-part="items-table"][data-table-type="offerte"] { font-size: 11px !important; }
${T('s2b')} [data-pdf-part="items-table"][data-table-type="manual"] td,
${T('s2b')} [data-pdf-part="items-table"][data-table-type="rent"] td,
${T('s2b')} [data-pdf-part="items-table"][data-table-type="offerte"] td { font-size: 11px !important; padding: 4px 0 !important; line-height: 1.3 !important; }
${T('s2b')} [data-pdf-part="summary-wrap"] { font-size: 12px !important; line-height: 1.35 !important; }
${T('s2b')} [data-pdf-part="footer"] { font-size: 11.5px !important; line-height: 1.4 !important; }
${T('s2b')} [data-pdf-part="amare"],
${T('s2b')} [data-pdf-part="notes"],
${T('s2b')} [data-pdf-part="signature"],
${T('s2b')} [data-pdf-part="signature-table"] { font-size: 10.5px !important; line-height: 1.35 !important; }

${T('s2c')} { font-size: 11.5px !important; line-height: 1.25 !important; }
${T('s2c')} [data-pdf-part="items-table"][data-table-type="lesgeven"],
${T('s2c')} [data-pdf-part="items-table"][data-table-type="lesgeven"] th,
${T('s2c')} [data-pdf-part="items-table"][data-table-type="lesgeven"] td { font-size: 9.5px !important; padding: 2px 4px !important; }
${T('s2c')} [data-pdf-part="items-table"][data-table-type="manual"],
${T('s2c')} [data-pdf-part="items-table"][data-table-type="rent"],
${T('s2c')} [data-pdf-part="items-table"][data-table-type="offerte"] { font-size: 10px !important; }
${T('s2c')} [data-pdf-part="items-table"][data-table-type="manual"] td,
${T('s2c')} [data-pdf-part="items-table"][data-table-type="rent"] td,
${T('s2c')} [data-pdf-part="items-table"][data-table-type="offerte"] td { font-size: 10px !important; padding: 3px 0 !important; line-height: 1.25 !important; }
${T('s2c')} [data-pdf-part="summary-wrap"] { font-size: 11.5px !important; line-height: 1.3 !important; }
${T('s2c')} [data-pdf-part="totals-table"] td { padding-bottom: 2px !important; }
${T('s2c')} [data-pdf-part="totals-grand"] { font-size: 13.5px !important; }
${T('s2c')} [data-pdf-part="totals-grand"] td { padding: 5px 0 !important; }
${T('s2c')} [data-pdf-part="footer"] { font-size: 11px !important; line-height: 1.35 !important; }
${T('s2c')} [data-pdf-part="amare"],
${T('s2c')} [data-pdf-part="notes"],
${T('s2c')} [data-pdf-part="signature"],
${T('s2c')} [data-pdf-part="signature-table"] { font-size: 10px !important; line-height: 1.3 !important; }
${T('s2c')} [data-pdf-part="amare"],
${T('s2c')} [data-pdf-part="signature"] { padding: 6px 10px !important; }

${T('s3a')} [data-pdf-part="logo"] { width: 110px !important; }
${T('s3a')} [data-pdf-part="logo-wrap"] { margin-top: 0 !important; }
${T('s3a')} [data-pdf-part="brand-title"] { font-size: 22px !important; margin-bottom: 6px !important; }
${T('s3a')} [data-pdf-part="brand-name"] { font-size: 12.5px !important; }
${T('s3a')} [data-pdf-part="brand-line"],
${T('s3a')} [data-pdf-part="brand-gap"] { font-size: 11.5px !important; margin-top: 1px !important; }
${T('s3a')} [data-pdf-part="brand-gap"] { margin-bottom: 6px !important; }
${T('s3a')} [data-pdf-part="brand-meta"] { font-size: 11px !important; margin-top: 1px !important; }
${T('s3a')} [data-pdf-part="address"],
${T('s3a')} [data-pdf-part="invoice-date"] { font-size: 12px !important; }
${T('s3a')} [data-pdf-part="recipient-name"] { font-size: 13px !important; }
${T('s3a')} [data-pdf-part="title-heading"] { font-size: 17px !important; }
${T('s3a')} [data-pdf-part="title-sub"] { font-size: 11px !important; margin-top: 2px !important; }

${T('s3b')} [data-pdf-part="logo"] { width: 88px !important; }
${T('s3b')} [data-pdf-part="brand-title"] { font-size: 19px !important; margin-bottom: 4px !important; }
${T('s3b')} [data-pdf-part="brand-name"] { font-size: 11.5px !important; }
${T('s3b')} [data-pdf-part="brand-line"],
${T('s3b')} [data-pdf-part="brand-gap"] { font-size: 10.5px !important; margin-top: 1px !important; }
${T('s3b')} [data-pdf-part="brand-gap"] { margin-bottom: 4px !important; }
${T('s3b')} [data-pdf-part="brand-meta"] { font-size: 10px !important; margin-top: 1px !important; }
${T('s3b')} [data-pdf-part="header"] { margin-bottom: 10px !important; }
${T('s3b')} [data-pdf-part="address"] { margin-bottom: 8px !important; font-size: 11.5px !important; }
${T('s3b')} [data-pdf-part="invoice-date"] { font-size: 11.5px !important; }
${T('s3b')} [data-pdf-part="recipient-name"] { font-size: 12px !important; }
${T('s3b')} [data-pdf-part="title"] { margin-bottom: 10px !important; padding: 4px 0 !important; }
${T('s3b')} [data-pdf-part="title-heading"] { font-size: 15.5px !important; }
${T('s3b')} [data-pdf-part="title-sub"] { font-size: 10.5px !important; }
${T('s3b')} [data-pdf-part="items-wrap"] { margin-bottom: 8px !important; padding-bottom: 4px !important; }
${T('s3b')} [data-pdf-part="summary-wrap"] { margin-top: 6px !important; margin-bottom: 6px !important; }
${T('s3b')} [data-pdf-part="footer"] { margin-top: 8px !important; padding-top: 6px !important; }
${T('s3b')} [data-pdf-part="signature-table"] td { padding-top: 3px !important; padding-bottom: 3px !important; }

${T('s4')} { width: ${A4_WIDTH_PX}px !important; padding: max(8mm, calc(12mm * var(--pdf-scale))) !important; font-size: calc(11.5px * var(--pdf-scale)) !important; line-height: 1.25 !important; }
${T('s4')} [data-pdf-part="header"] { margin-bottom: calc(10px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="logo"] { width: calc(88px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="brand-title"] { font-size: calc(19px * var(--pdf-scale)) !important; margin-bottom: calc(4px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="brand-name"] { font-size: calc(11.5px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="brand-line"],
${T('s4')} [data-pdf-part="brand-gap"] { font-size: calc(10.5px * var(--pdf-scale)) !important; margin-top: calc(1px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="brand-gap"] { margin-bottom: calc(4px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="brand-meta"] { font-size: calc(10px * var(--pdf-scale)) !important; margin-top: calc(1px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="address"] { margin-bottom: calc(8px * var(--pdf-scale)) !important; font-size: calc(11.5px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="invoice-date"] { font-size: calc(11.5px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="recipient-name"] { font-size: calc(12px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="title"] { margin-bottom: calc(10px * var(--pdf-scale)) !important; padding: calc(4px * var(--pdf-scale)) 0 !important; }
${T('s4')} [data-pdf-part="title-heading"] { font-size: calc(15.5px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="title-sub"] { font-size: calc(10.5px * var(--pdf-scale)) !important; margin-top: calc(2px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="items-wrap"] { margin-bottom: calc(8px * var(--pdf-scale)) !important; padding-bottom: calc(4px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="items-table"][data-table-type="lesgeven"],
${T('s4')} [data-pdf-part="items-table"][data-table-type="lesgeven"] th,
${T('s4')} [data-pdf-part="items-table"][data-table-type="lesgeven"] td { font-size: calc(9.5px * var(--pdf-scale)) !important; padding: calc(2px * var(--pdf-scale)) calc(4px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="items-table"][data-table-type="manual"],
${T('s4')} [data-pdf-part="items-table"][data-table-type="rent"],
${T('s4')} [data-pdf-part="items-table"][data-table-type="offerte"] { font-size: calc(10px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="items-table"][data-table-type="manual"] td,
${T('s4')} [data-pdf-part="items-table"][data-table-type="rent"] td,
${T('s4')} [data-pdf-part="items-table"][data-table-type="offerte"] td { font-size: calc(10px * var(--pdf-scale)) !important; padding: calc(3px * var(--pdf-scale)) 0 !important; line-height: 1.25 !important; }
${T('s4')} [data-pdf-part="items-table"] th { font-size: calc(9.5px * var(--pdf-scale)) !important; padding-bottom: calc(4px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="summary-wrap"] { margin-top: calc(6px * var(--pdf-scale)) !important; margin-bottom: calc(6px * var(--pdf-scale)) !important; font-size: calc(11.5px * var(--pdf-scale)) !important; line-height: 1.3 !important; }
${T('s4')} [data-pdf-part="totals-table"] td { padding-bottom: calc(2px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="totals-grand"] { font-size: calc(13.5px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="totals-grand"] td { padding: calc(5px * var(--pdf-scale)) 0 !important; }
${T('s4')} [data-pdf-part="amare"],
${T('s4')} [data-pdf-part="notes"],
${T('s4')} [data-pdf-part="signature"],
${T('s4')} [data-pdf-part="signature-table"] { font-size: calc(10px * var(--pdf-scale)) !important; line-height: 1.3 !important; }
${T('s4')} [data-pdf-part="amare"],
${T('s4')} [data-pdf-part="signature"] { margin-top: calc(8px * var(--pdf-scale)) !important; margin-bottom: calc(6px * var(--pdf-scale)) !important; padding: calc(6px * var(--pdf-scale)) calc(10px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="notes"] { margin-top: calc(8px * var(--pdf-scale)) !important; margin-bottom: calc(6px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="signature-title"] { font-size: calc(9.5px * var(--pdf-scale)) !important; margin-bottom: calc(4px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="signature-table"] td { padding-top: calc(3px * var(--pdf-scale)) !important; padding-bottom: calc(3px * var(--pdf-scale)) !important; }
${T('s4')} [data-pdf-part="footer"] { margin-top: calc(8px * var(--pdf-scale)) !important; padding-top: calc(6px * var(--pdf-scale)) !important; font-size: calc(11px * var(--pdf-scale)) !important; line-height: 1.35 !important; }
`.trim();
}

function lockA4Page(invoiceElement, iframe) {
    invoiceElement.style.width = `${A4_WIDTH_PX}px`;
    invoiceElement.style.height = `${A4_LOCK_HEIGHT_PX}px`;
    invoiceElement.style.minHeight = `${A4_LOCK_HEIGHT_PX}px`;
    invoiceElement.style.overflow = 'hidden';
    if (iframe) {
        iframe.style.width = `${A4_WIDTH_PX}px`;
        iframe.style.height = `${A4_LOCK_HEIGHT_PX}px`;
    }
}

/**
 * Progressively adapts an invoice DOM element to fit strictly on a single A4 page.
 * Must be called while invoiceElement is attached inside a visible/layouted iframe.
 * @param {HTMLElement} invoiceElement
 * @param {HTMLIFrameElement} [iframe]
 * @returns {{ width: number, height: number, scale: number, tier: string, measuredHeight: number }}
 */
export function fitInvoiceToSinglePage(invoiceElement, iframe) {
    let styleEl = invoiceElement.querySelector('style[data-pdf-fit-style]');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.dataset.pdfFitStyle = '';
        invoiceElement.prepend(styleEl);
    }
    styleEl.textContent = getPdfFitStylesheet();

    delete invoiceElement.dataset.fitSteps;
    invoiceElement.style.removeProperty('--pdf-scale');

    const contentRoot = invoiceElement.querySelector('[data-pdf-part="content-root"]');
    if (contentRoot) {
        contentRoot.style.transform = '';
        contentRoot.style.transformOrigin = '';
        contentRoot.style.width = '';
    }

    invoiceElement.style.width = `${A4_WIDTH_PX}px`;
    invoiceElement.style.minHeight = '0';
    invoiceElement.style.height = 'auto';
    invoiceElement.style.overflow = 'visible';
    if (iframe) {
        iframe.style.width = `${A4_WIDTH_PX}px`;
        iframe.style.height = '4000px';
    }

    let measuredHeight = invoiceElement.scrollHeight;
    if (measuredHeight <= A4_SAFE_CONTENT_PX) {
        lockA4Page(invoiceElement, iframe);
        return { width: A4_WIDTH_PX, height: A4_LOCK_HEIGHT_PX, scale: 1, tier: 'default', measuredHeight };
    }

    const appliedSteps = [];
    for (const tier of COMPRESSION_TIERS) {
        appliedSteps.push(tier);
        invoiceElement.dataset.fitSteps = appliedSteps.join(' ');
        measuredHeight = invoiceElement.scrollHeight;
        if (measuredHeight <= A4_SAFE_CONTENT_PX) {
            lockA4Page(invoiceElement, iframe);
            return { width: A4_WIDTH_PX, height: A4_LOCK_HEIGHT_PX, scale: 1, tier, measuredHeight };
        }
    }

    appliedSteps.push('s4');
    invoiceElement.dataset.fitSteps = appliedSteps.join(' ');

    let lo = 0.25;
    let hi = 1.0;
    for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        invoiceElement.style.setProperty('--pdf-scale', mid.toFixed(4));
        if (invoiceElement.scrollHeight <= A4_SAFE_CONTENT_PX) {
            lo = mid;
        } else {
            hi = mid;
        }
    }

    let scale = Math.max(0.25, lo - 0.005);
    invoiceElement.style.setProperty('--pdf-scale', scale.toFixed(4));
    measuredHeight = invoiceElement.scrollHeight;

    if (measuredHeight > A4_SAFE_CONTENT_PX && contentRoot) {
        const paddingOverhead = Math.max(0, measuredHeight - contentRoot.scrollHeight);
        const targetContentHeight = Math.max(200, A4_SAFE_CONTENT_PX - paddingOverhead - 4);
        const extraScale = Math.max(0.1, targetContentHeight / contentRoot.scrollHeight);
        contentRoot.style.transformOrigin = 'top left';
        contentRoot.style.transform = `scale(${extraScale.toFixed(4)})`;
        contentRoot.style.width = `${(100 / extraScale).toFixed(4)}%`;
        scale = scale * extraScale;
        measuredHeight = Math.ceil(contentRoot.scrollHeight * extraScale + paddingOverhead);
    }

    lockA4Page(invoiceElement, iframe);
    return {
        width: A4_WIDTH_PX,
        height: A4_LOCK_HEIGHT_PX,
        scale: Number(scale.toFixed(3)),
        tier: 's4',
        measuredHeight
    };
}
