import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '../domain';

// Color Palette for MedSync Brand
const PRIMARY_COLOR: [number, number, number] = [15, 118, 110]; // #0f766e (Teal 700)
const SLATE_DARK: [number, number, number] = [30, 41, 59];     // #1e293b (Slate 800)
const SLATE_MUTED: [number, number, number] = [100, 116, 139]; // #64748b (Slate 500)
const BORDER_COLOR: [number, number, number] = [226, 232, 240]; // #e2e8f0 (Slate 200)

export interface ClinicBrandInfo {
  name: string;
  branches: string;
  phone: string;
  generatedBy?: string;
}

const DEFAULT_CLINIC: ClinicBrandInfo = {
  name: 'MedSync Multi-Specialty Clinic',
  branches: 'Colombo Main · Kandy Central · Galle South',
  phone: '+94 11 234 5678 / +94 81 234 5678',
  generatedBy: 'MedSync Staff System',
};

function addHeader(doc: jsPDF, title: string, subtitle?: string, clinic: ClinicBrandInfo = DEFAULT_CLINIC): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Top Accent Bar
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, pageWidth, 5, 'F');

  // Clinic Title & Subtitle
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...SLATE_DARK);
  doc.text(clinic.name, 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_MUTED);
  doc.text(clinic.branches, 14, 21);
  doc.text(`Phone: ${clinic.phone}`, 14, 25);

  // Document Title on the Right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text(title.toUpperCase(), pageWidth - 14, 16, { align: 'right' });

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...SLATE_MUTED);
    doc.text(subtitle, pageWidth - 14, 22, { align: 'right' });
  }

  // Generation timestamp
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated: ${dateStr}`, pageWidth - 14, 27, { align: 'right' });

  // Divider Line
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.6);
  doc.line(14, 31, pageWidth - 14, 31);

  return 36; // Next Y coordinate
}

function addFooter(doc: jsPDF) {
  const pageCount = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.4);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_MUTED);
    doc.text('MedSync Clinic Appointment and Treatment Management System (CATMS) · Confidential', 14, pageHeight - 7);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
  }
}

// ============================================================================
// 1. PAYMENT RECEIPT PDF (Downloaded immediately after payment)
// ============================================================================

export interface PaymentReceiptPdfData {
  receiptNumber: string;
  paidAt: string;
  invoiceNumber: string;
  appointmentNumber?: string;
  patientName: string;
  patientNumber?: string;
  payerType: 'Patient' | 'Insurer';
  insuranceClaimNumber?: string;
  insuranceProviderName?: string;
  paymentMethod: string;
  referenceNumber?: string | null;
  paymentAmount: number | string;
  subtotalAmount: number | string;
  approvedInsuranceAmount?: number | string;
  patientLiabilityAmount?: number | string;
  patientPaidAmountTotal?: number | string;
  remainingBalanceDue?: number | string;
  cashierName?: string;
  branchName?: string;
}

export function downloadPaymentReceiptPdf(data: PaymentReceiptPdfData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const startY = addHeader(doc, 'Official Receipt', `Receipt No: ${data.receiptNumber}`);

  // Info Box / Meta Grid
  doc.setFillColor(248, 250, 252); // Slate 50
  doc.roundedRect(14, startY, 182, 36, 2, 2, 'F');
  doc.setDrawColor(...BORDER_COLOR);
  doc.roundedRect(14, startY, 182, 36, 2, 2, 'S');

  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_MUTED);
  doc.text('PATIENT DETAILS', 18, startY + 6);
  doc.text('PAYMENT METADATA', 105, startY + 6);

  // Patient Info Column
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...SLATE_DARK);
  doc.text(data.patientName, 18, startY + 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_MUTED);
  if (data.patientNumber) doc.text(`Patient ID: ${data.patientNumber}`, 18, startY + 18);
  doc.text(`Invoice Ref: ${data.invoiceNumber}`, 18, startY + 23);
  if (data.branchName) doc.text(`Branch: ${data.branchName}`, 18, startY + 28);

  // Payment Metadata Column
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_DARK);
  doc.text(`Receipt Date: ${new Date(data.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 105, startY + 13);
  doc.text(`Payer Category: ${data.payerType}`, 105, startY + 18);
  doc.text(`Payment Method: ${data.paymentMethod}`, 105, startY + 23);
  if (data.referenceNumber) doc.text(`Reference / Txn: ${data.referenceNumber}`, 105, startY + 28);
  else if (data.insuranceClaimNumber) doc.text(`Claim: ${data.insuranceClaimNumber} (${data.insuranceProviderName || 'Insurer'})`, 105, startY + 28);

  // Financial Breakdown Table
  const subtotal = Number(data.subtotalAmount || 0);
  const insuranceApproved = Number(data.approvedInsuranceAmount || 0);
  const patientLiability = Number(data.patientLiabilityAmount || subtotal - insuranceApproved);
  const amountPaidNow = Number(data.paymentAmount || 0);
  const remaining = Number(data.remainingBalanceDue ?? Math.max(0, patientLiability - (Number(data.patientPaidAmountTotal || 0))));

  autoTable(doc, {
    startY: startY + 42,
    head: [['Description / Financial Ledger Item', 'Amount (LKR)']],
    body: [
      ['Gross Invoice Subtotal', formatCurrency(subtotal)],
      ['Approved Health Insurance Coverage', insuranceApproved > 0 ? `- ${formatCurrency(insuranceApproved)}` : '0.00 LKR'],
      ['Net Patient Liability', formatCurrency(patientLiability)],
      ['AMOUNT PAID IN THIS TRANSACTION', formatCurrency(amountPaidNow)],
      ['Outstanding Balance Remaining After Payment', formatCurrency(remaining)],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: PRIMARY_COLOR,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9.5,
    },
    bodyStyles: {
      textColor: SLATE_DARK,
      fontSize: 9,
      cellPadding: 3.5,
    },
    columnStyles: {
      0: { cellWidth: 125 },
      1: { cellWidth: 57, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (hookData) => {
      // Highlight amount paid row
      if (hookData.section === 'body' && hookData.row.index === 3) {
        hookData.cell.styles.fillColor = [240, 253, 244]; // Green 50
        hookData.cell.styles.textColor = [21, 128, 61];   // Green 700
        hookData.cell.styles.fontStyle = 'bold';
      }
      // Highlight remaining row
      if (hookData.section === 'body' && hookData.row.index === 4) {
        hookData.cell.styles.fillColor = remaining <= 0 ? [240, 253, 244] : [254, 242, 242];
        hookData.cell.styles.textColor = remaining <= 0 ? [21, 128, 61] : [185, 28, 28];
        hookData.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Status Badge
  const isSettled = remaining <= 0;
  doc.setFillColor(isSettled ? 220 : 254, isSettled ? 252 : 243, isSettled ? 231 : 199);
  doc.roundedRect(14, finalY, 65, 12, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(isSettled ? 22 : 180, isSettled ? 101 : 83, isSettled ? 52 : 9);
  doc.text(isSettled ? '✓ INVOICE SETTLED IN FULL' : '⚠ PARTIAL PAYMENT APPLIED', 18, finalY + 7.5);

  // Cashier verification text
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_MUTED);
  doc.text(`Authorized Cashier: ${data.cashierName || 'MedSync Billing Officer'}`, 14, finalY + 22);
  doc.text('This is an official system-generated voucher confirming receipt of funds into clinic accounts.', 14, finalY + 26);
  doc.text('Thank you for trusting MedSync Multi-Specialty Clinic.', 14, finalY + 30);

  // Cashier signature box on right
  doc.setDrawColor(...BORDER_COLOR);
  doc.line(135, finalY + 24, 190, finalY + 24);
  doc.text('Authorized Signature & Stamp', 142, finalY + 28);

  addFooter(doc);
  doc.save(`MedSync_Receipt_${data.receiptNumber}.pdf`);
}

// ============================================================================
// 2. ADMIN MONTHLY PAYMENT COLLECTIONS AUDIT REPORT
// ============================================================================

export interface MonthlyPaymentRow {
  receiptNumber: string;
  paidAt: string;
  invoiceNumber: string;
  patientName: string;
  payerType: 'Patient' | 'Insurer';
  paymentMethod: string;
  referenceNumber?: string | null;
  amount: number | string;
  status: string;
}

export function downloadMonthlyPaymentReportPdf(
  payments: MonthlyPaymentRow[],
  monthLabel: string = 'Current Month',
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const startY = addHeader(doc, 'Collections Report', `Monthly Payment Ledger: ${monthLabel}`);

  const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const patientTotal = payments.filter((p) => p.payerType === 'Patient').reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const insurerTotal = payments.filter((p) => p.payerType === 'Insurer').reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // Top KPI Summary Cards
  const cardWidth = 60;
  const cardHeight = 16;
  const cards = [
    { title: 'TOTAL REALIZED COLLECTIONS', value: formatCurrency(totalAmount), bg: [240, 253, 250], fg: PRIMARY_COLOR },
    { title: 'PATIENT DIRECT PAYMENTS', value: formatCurrency(patientTotal), bg: [248, 250, 252], fg: SLATE_DARK },
    { title: 'INSURANCE SETTLEMENTS', value: formatCurrency(insurerTotal), bg: [248, 250, 252], fg: SLATE_DARK },
    { title: 'TOTAL TRANSACTIONS', value: `${payments.length} Receipts`, bg: [248, 250, 252], fg: SLATE_DARK },
  ];

  cards.forEach((c, idx) => {
    const x = 14 + idx * (cardWidth + 8);
    doc.setFillColor(c.bg[0], c.bg[1], c.bg[2]);
    doc.roundedRect(x, startY, cardWidth, cardHeight, 1.5, 1.5, 'F');
    doc.setDrawColor(...BORDER_COLOR);
    doc.roundedRect(x, startY, cardWidth, cardHeight, 1.5, 1.5, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...SLATE_MUTED);
    doc.text(c.title, x + 4, startY + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(c.fg[0], c.fg[1], c.fg[2]);
    doc.text(c.value, x + 4, startY + 11.5);
  });

  const tableRows = payments.map((p) => [
    p.receiptNumber,
    new Date(p.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    p.invoiceNumber,
    p.patientName,
    p.payerType,
    p.paymentMethod,
    p.referenceNumber || '—',
    formatCurrency(Number(p.amount)),
    p.status,
  ]);

  autoTable(doc, {
    startY: startY + 22,
    head: [['Receipt #', 'Date', 'Invoice #', 'Patient Name', 'Payer', 'Method', 'Reference', 'Amount (LKR)', 'Status']],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: PRIMARY_COLOR,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      textColor: SLATE_DARK,
      fontSize: 8,
      cellPadding: 2.5,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 28 },
      1: { cellWidth: 22 },
      2: { cellWidth: 24 },
      3: { cellWidth: 46 },
      4: { cellWidth: 22 },
      5: { cellWidth: 24 },
      6: { cellWidth: 40 },
      7: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
      8: { cellWidth: 24, halign: 'center' },
    },
  });

  addFooter(doc);
  doc.save(`MedSync_Monthly_Collections_${monthLabel.replace(/\s+/g, '_')}.pdf`);
}

// ============================================================================
// 3. DOCTOR / CLINICIANS PERFORMANCE & REVENUE REPORT (Weekly / Period)
// ============================================================================

export interface DoctorRevenueRow {
  doctor: string;
  specialty?: string;
  branch?: string;
  invoices?: number;
  gross: number;
  collected: number;
}

export function downloadDoctorRevenueReportPdf(
  rows: DoctorRevenueRow[],
  periodLabel: string = 'Current Period',
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const startY = addHeader(doc, 'Doctor Revenue', `Period: ${periodLabel}`);

  const totalGross = rows.reduce((sum, r) => sum + r.gross, 0);
  const totalCollected = rows.reduce((sum, r) => sum + r.collected, 0);
  const collectionRate = totalGross > 0 ? Math.round((totalCollected / totalGross) * 100) : 100;

  autoTable(doc, {
    startY: startY + 4,
    head: [['Clinician / Doctor Name', 'Specialty', 'Branch', 'Gross Billed', 'Realized Collections', 'Yield']],
    body: rows.map((r) => [
      r.doctor,
      r.specialty || 'Specialist',
      r.branch || 'Clinic-Wide',
      formatCurrency(r.gross),
      formatCurrency(r.collected),
      r.gross > 0 ? `${Math.round((r.collected / r.gross) * 100)}%` : '100%',
    ]),
    foot: [
      ['TOTALS', '—', '—', formatCurrency(totalGross), formatCurrency(totalCollected), `${collectionRate}%`],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: PRIMARY_COLOR,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: SLATE_DARK,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      textColor: SLATE_DARK,
      fontSize: 8.5,
      cellPadding: 3,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { cellWidth: 32 },
      2: { cellWidth: 30 },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 18, halign: 'center' },
    },
  });

  addFooter(doc);
  doc.save(`MedSync_Clinicians_Revenue_${periodLabel.replace(/\s+/g, '_')}.pdf`);
}

// ============================================================================
// 4. PATIENT OUTSTANDING BALANCES / DEBTORS REPORT ("Patients report like how much")
// ============================================================================

export interface PatientBalanceRow {
  patient: string;
  invoiceNumber: string;
  subtotal: number;
  insuranceCovered: number;
  patientLiability: number;
  amountPaid: number;
  outstanding: number;
  branch?: string;
}

export function downloadPatientBalancesReportPdf(rows: PatientBalanceRow[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const startY = addHeader(doc, 'Debtor Report', 'Patients with Outstanding Balances');

  const totalOutstanding = rows.reduce((sum, r) => sum + r.outstanding, 0);
  const totalLiability = rows.reduce((sum, r) => sum + r.patientLiability, 0);

  // Stat banner
  doc.setFillColor(254, 242, 242); // Red 50
  doc.roundedRect(14, startY + 2, 182, 14, 1.5, 1.5, 'F');
  doc.setDrawColor(254, 202, 202);
  doc.roundedRect(14, startY + 2, 182, 14, 1.5, 1.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(185, 28, 28);
  doc.text(`TOTAL CLINIC OUTSTANDING DUES: ${formatCurrency(totalOutstanding)}`, 18, startY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_MUTED);
  doc.text(`Total Patients with Unsettled Liability: ${rows.length} | Gross Billed Liability: ${formatCurrency(totalLiability)}`, 18, startY + 12.5);

  autoTable(doc, {
    startY: startY + 20,
    head: [['Patient Name', 'Invoice #', 'Branch', 'Subtotal', 'Insurance', 'Liability', 'Paid', 'Due Balance']],
    body: rows.map((r) => [
      r.patient,
      r.invoiceNumber,
      r.branch || 'Colombo',
      formatCurrency(r.subtotal),
      formatCurrency(r.insuranceCovered),
      formatCurrency(r.patientLiability),
      formatCurrency(r.amountPaid),
      formatCurrency(r.outstanding),
    ]),
    foot: [
      ['TOTAL RECEIVABLES', '—', '—', '—', '—', formatCurrency(totalLiability), '—', formatCurrency(totalOutstanding)],
    ],
    theme: 'striped',
    headStyles: {
      fillColor: [185, 28, 28], // Dark Red header
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [185, 28, 28],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      textColor: SLATE_DARK,
      fontSize: 8,
      cellPadding: 2.5,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 38 },
      1: { cellWidth: 20 },
      2: { cellWidth: 22 },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 20, halign: 'right' },
      6: { cellWidth: 20, halign: 'right' },
      7: { cellWidth: 22, halign: 'right', fontStyle: 'bold', textColor: [185, 28, 28] },
    },
  });

  addFooter(doc);
  doc.save('MedSync_Patient_Outstanding_Balances.pdf');
}

// ============================================================================
// 5. BRANCH APPOINTMENT SUMMARY REPORT (Manager & Admin)
// ============================================================================

export interface BranchAppointmentRow {
  branch: string;
  scheduled: number;
  completed: number;
  cancelled: number;
  total: number;
}

export function downloadBranchAppointmentsReportPdf(
  rows: BranchAppointmentRow[],
  dateLabel: string = 'Today',
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const startY = addHeader(doc, 'Branch Summary', `Daily Appointments: ${dateLabel}`);

  const totalSched = rows.reduce((s, r) => s + r.scheduled, 0);
  const totalComp = rows.reduce((s, r) => s + r.completed, 0);
  const totalCanc = rows.reduce((s, r) => s + r.cancelled, 0);
  const grandTotal = totalSched + totalComp + totalCanc;

  autoTable(doc, {
    startY: startY + 4,
    head: [['Clinic Branch', 'Scheduled', 'Completed', 'Cancelled', 'Total Visits', 'Completion %']],
    body: rows.map((r) => [
      r.branch,
      String(r.scheduled),
      String(r.completed),
      String(r.cancelled),
      String(r.total),
      r.total > 0 ? `${Math.round((r.completed / r.total) * 100)}%` : '0%',
    ]),
    foot: [
      ['TOTALS', String(totalSched), String(totalComp), String(totalCanc), String(grandTotal), grandTotal > 0 ? `${Math.round((totalComp / grandTotal) * 100)}%` : '0%'],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: PRIMARY_COLOR,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: SLATE_DARK,
      fontStyle: 'bold',
      fontSize: 9,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60 },
      1: { cellWidth: 24, halign: 'center' },
      2: { cellWidth: 24, halign: 'center' },
      3: { cellWidth: 24, halign: 'center' },
      4: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 25, halign: 'center' },
    },
  });

  addFooter(doc);
  doc.save(`MedSync_Branch_Appointments_${dateLabel.replace(/\s+/g, '_')}.pdf`);
}

// ============================================================================
// 6. TREATMENT COUNTS REPORT (Manager & Admin)
// ============================================================================

export interface TreatmentCountRow {
  category: string;
  count: number;
}

export function downloadTreatmentCountsReportPdf(
  rows: TreatmentCountRow[],
  periodLabel: string = 'Current Period',
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const startY = addHeader(doc, 'Treatments Summary', `Delivered Care by Category: ${periodLabel}`);

  const totalTreatments = rows.reduce((s, r) => s + r.count, 0);

  autoTable(doc, {
    startY: startY + 4,
    head: [['Treatment Catalogue Category', 'Delivered Procedures / Visits', 'Share %']],
    body: rows.map((r) => [
      r.category,
      String(r.count),
      totalTreatments > 0 ? `${Math.round((r.count / totalTreatments) * 100)}%` : '0%',
    ]),
    foot: [
      ['TOTAL DELIVERED SERVICES', String(totalTreatments), '100%'],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: PRIMARY_COLOR,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: SLATE_DARK,
      fontStyle: 'bold',
      fontSize: 9,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 90 },
      1: { cellWidth: 45, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 47, halign: 'center' },
    },
  });

  addFooter(doc);
  doc.save(`MedSync_Treatments_${periodLabel.replace(/\s+/g, '_')}.pdf`);
}

// ============================================================================
// 7. INSURANCE COVERAGE VS OUT-OF-POCKET MIX REPORT
// ============================================================================

export interface InsuranceCoverageRow {
  month: string;
  approvedInsurance: number;
  insurerReceipts: number;
  patientReceipts: number;
}

export function downloadInsuranceCoverageReportPdf(rows: InsuranceCoverageRow[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const startY = addHeader(doc, 'Coverage Mix', 'Insurance vs. Out-of-Pocket Receipts');

  autoTable(doc, {
    startY: startY + 4,
    head: [['Report Month', 'Approved Insurance (LKR)', 'Insurer Receipts (LKR)', 'Patient Cash/Card (LKR)', 'Total Inflow (LKR)']],
    body: rows.map((r) => [
      r.month,
      formatCurrency(r.approvedInsurance),
      formatCurrency(r.insurerReceipts),
      formatCurrency(r.patientReceipts),
      formatCurrency(r.insurerReceipts + r.patientReceipts),
    ]),
    theme: 'grid',
    headStyles: {
      fillColor: PRIMARY_COLOR,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 32 },
      1: { cellWidth: 36, halign: 'right' },
      2: { cellWidth: 36, halign: 'right' },
      3: { cellWidth: 40, halign: 'right' },
      4: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
    },
  });

  addFooter(doc);
  doc.save('MedSync_Insurance_Coverage_Mix.pdf');
}
