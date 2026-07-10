import { initLessonsInvoices } from './invoices-lessons.js';
import { initStudioInvoices } from './invoices-studio.js';
import { initManualInvoices } from './invoices-manual.js';

export function initInvoicesModule() {
    // Initialize MZO Lessons Invoicing
    initLessonsInvoices();

    // Initialize Studio Rent Invoicing
    initStudioInvoices();

    // Initialize Manual Invoicing
    initManualInvoices();
}
