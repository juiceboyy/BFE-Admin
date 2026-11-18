/**
 * NLCIUS / Peppol BIS Billing 3.0 (UBL 2.1) XML generator.
 * Builds EN 16931 compliant e-invoices with embedded PDF attachments.
 */

import {
    escapeXml,
    round2,
    formatMoney,
    addDaysIso,
    normalizePeppolParticipant,
    parseDutchCityLine,
    blobToBase64,
    downloadUblXml
} from './peppol-helpers.js';

export { normalizePeppolParticipant, parseDutchCityLine, blobToBase64, downloadUblXml };

const SUPPLIER = {
    name: 'Big Fish Entertainment',
    contactName: 'Ronald van Holst',
    street: 'Kortlandpad 62',
    postalZone: '2729DN',
    city: 'Zoetermeer',
    countryCode: 'NL',
    phone: '06 2888 4143',
    kvk: '34393338',
    vatId: 'NL001638587B88',
    iban: 'NL47INGB0005023386'
};

function mapVatCategory(btwRate) {
    if (String(btwRate).toLowerCase() === 'vrijgesteld') {
        return { id: 'E', percent: 0, exemptionReason: 'Vrijgesteld van btw' };
    }
    const numRate = Number(btwRate);
    if (numRate === 0) {
        return { id: 'Z', percent: 0, exemptionReason: '' };
    }
    return { id: 'S', percent: numRate === 9 ? 9 : 21, exemptionReason: '' };
}

function buildPartyXml(tagName, party) {
    const contactBlock = party.contactName || party.phone
        ? `<cac:Contact>${party.contactName ? `<cbc:Name>${escapeXml(party.contactName)}</cbc:Name>` : ''}${party.phone ? `<cbc:Telephone>${escapeXml(party.phone)}</cbc:Telephone>` : ''}</cac:Contact>`
        : '';

    const taxSchemeBlock = party.vatId
        ? `<cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(party.vatId)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
        : '';

    return `  <${tagName}>
    <cac:Party>
      <cbc:EndpointID schemeID="${escapeXml(party.schemeId)}">${escapeXml(party.endpointId)}</cbc:EndpointID>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${escapeXml(party.schemeId)}">${escapeXml(party.endpointId)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXml(party.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(party.street)}</cbc:StreetName>
        <cbc:CityName>${escapeXml(party.city)}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(party.postalZone)}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>${escapeXml(party.countryCode || 'NL')}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      ${taxSchemeBlock}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(party.name)}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="${escapeXml(party.schemeId)}">${escapeXml(party.endpointId)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
      ${contactBlock}
    </cac:Party>
  </${tagName}>`;
}

/**
 * Builds an EN 16931 / Peppol BIS Billing 3.0 UBL 2.1 Invoice XML string.
 * @param {Object} config
 * @returns {string}
 */
export function buildPeppolUblXml(config) {
    const {
        factuurNummer,
        invoiceDate,
        dueDateDays = 15,
        buyerReference,
        orderReference,
        clientInfo,
        items = [],
        pdfBase64 = '',
        pdfFileName = '',
        note = ''
    } = config;

    const participant = normalizePeppolParticipant(clientInfo?.peppolId);
    if (!participant.isValid) {
        throw new Error(participant.reason || 'Ongeldig Peppol OIN / ID.');
    }

    const cleanBuyerRef = String(buyerReference || '').trim();
    const cleanOrderRef = String(orderReference || cleanBuyerRef).trim();
    if (!cleanBuyerRef) {
        throw new Error('Een inkooporder- of referentienummer (BuyerReference) is verplicht.');
    }

    const dueDate = addDaysIso(invoiceDate, dueDateDays);
    const { postalZone: custPostal, cityName: custCity } = parseDutchCityLine(clientInfo?.city);

    const taxGroups = new Map();
    let lineExtensionTotal = 0;

    const linesXml = items.map((item, idx) => {
        const lineAmount = round2(item.amount);
        lineExtensionTotal = round2(lineExtensionTotal + lineAmount);
        const cat = mapVatCategory(item.btwRate);
        const groupKey = `${cat.id}:${cat.percent}`;

        if (!taxGroups.has(groupKey)) {
            taxGroups.set(groupKey, { ...cat, taxableAmount: 0 });
        }
        const grp = taxGroups.get(groupKey);
        grp.taxableAmount = round2(grp.taxableAmount + lineAmount);

        const fullDesc = String(item.desc || '').trim();
        const shortName = (fullDesc.split(/\r?\n/)[0] || `Regel ${idx + 1}`).slice(0, 100);

        return `  <cac:InvoiceLine>
    <cbc:ID>${idx + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">${formatMoney(lineAmount)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Description>${escapeXml(fullDesc)}</cbc:Description>
      <cbc:Name>${escapeXml(shortName)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${cat.id}</cbc:ID>
        <cbc:Percent>${cat.percent}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="EUR">${formatMoney(lineAmount)}</cbc:PriceAmount>
      <cbc:BaseQuantity unitCode="C62">1</cbc:BaseQuantity>
    </cac:Price>
  </cac:InvoiceLine>`;
    }).join('\n');

    let totalTaxAmount = 0;
    const taxSubtotalsXml = Array.from(taxGroups.values()).map(grp => {
        const taxAmt = round2(grp.taxableAmount * (grp.percent / 100));
        totalTaxAmount = round2(totalTaxAmount + taxAmt);
        const reasonTag = grp.exemptionReason
            ? `\n        <cbc:TaxExemptionReason>${escapeXml(grp.exemptionReason)}</cbc:TaxExemptionReason>`
            : '';

        return `    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">${formatMoney(grp.taxableAmount)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">${formatMoney(taxAmt)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${grp.id}</cbc:ID>
        <cbc:Percent>${grp.percent}</cbc:Percent>${reasonTag}
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`;
    }).join('\n');

    const taxInclusiveTotal = round2(lineExtensionTotal + totalTaxAmount);
    const noteXml = note && String(note).trim()
        ? `  <cbc:Note>${escapeXml(String(note).trim())}</cbc:Note>\n`
        : '';

    const pdfAttachmentXml = pdfBase64
        ? `  <cac:AdditionalDocumentReference>
    <cbc:ID>${escapeXml(factuurNummer)}</cbc:ID>
    <cbc:DocumentDescription>Visuele weergave factuur (PDF)</cbc:DocumentDescription>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="${escapeXml(pdfFileName || `${factuurNummer}.pdf`)}">${pdfBase64}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>\n`
        : '';

    const supplierXml = buildPartyXml('cac:AccountingSupplierParty', {
        schemeId: '0106',
        endpointId: SUPPLIER.kvk,
        name: SUPPLIER.name,
        street: SUPPLIER.street,
        city: SUPPLIER.city,
        postalZone: SUPPLIER.postalZone,
        countryCode: SUPPLIER.countryCode,
        vatId: SUPPLIER.vatId,
        contactName: SUPPLIER.contactName,
        phone: SUPPLIER.phone
    });

    const customerXml = buildPartyXml('cac:AccountingCustomerParty', {
        schemeId: participant.schemeId,
        endpointId: participant.endpointId,
        name: clientInfo?.name || '',
        street: clientInfo?.address || '',
        city: custCity,
        postalZone: custPostal,
        countryCode: 'NL',
        vatId: '',
        contactName: clientInfo?.attention || '',
        phone: ''
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(factuurNummer)}</cbc:ID>
  <cbc:IssueDate>${escapeXml(invoiceDate)}</cbc:IssueDate>
  <cbc:DueDate>${escapeXml(dueDate)}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
${noteXml}  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${escapeXml(cleanBuyerRef)}</cbc:BuyerReference>
  <cac:OrderReference>
    <cbc:ID>${escapeXml(cleanOrderRef)}</cbc:ID>
  </cac:OrderReference>
${pdfAttachmentXml}${supplierXml}
${customerXml}
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cbc:PaymentID>${escapeXml(factuurNummer)}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${SUPPLIER.iban}</cbc:ID>
      <cbc:Name>${escapeXml(SUPPLIER.contactName)}</cbc:Name>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:PaymentTerms>
    <cbc:Note>Te betalen binnen ${dueDateDays} dagen na ontvangst factuur.</cbc:Note>
  </cac:PaymentTerms>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">${formatMoney(totalTaxAmount)}</cbc:TaxAmount>
${taxSubtotalsXml}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${formatMoney(lineExtensionTotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${formatMoney(lineExtensionTotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${formatMoney(taxInclusiveTotal)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">${formatMoney(taxInclusiveTotal)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${linesXml}
</Invoice>
`;
}
