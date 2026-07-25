const path = require('path');
const PDFDocument = require('pdfkit');

const GOLD = '#d9ac5e';
const PURPLE_DEEP = '#24093f';
const INK = '#2a1a45';
const INK_DIM = '#695e80';

const FONT_DIR = path.join(__dirname, 'fonts');

/**
 * pdfkit has no real Unicode bidi algorithm - its `features: ['rtla']` option only
 * does Hebrew/Arabic presentation-form glyph shaping for a SINGLE script run. Feeding
 * it a string that mixes Hebrew words with a numeric/Latin run (e.g. "יום חמישי,
 * 3.9.2026") silently scrambles the numbers (verified empirically: "3.9.2026" came out
 * as "6202.9.3"). The reliable fix is to never hand it mixed-script strings - draw the
 * Hebrew run and the LTR run as two separate calls, right-aligned, with the LTR run
 * sitting to the visual LEFT of the Hebrew run (matching real Hebrew typesetting of a
 * trailing date/number). Pure-Hebrew-only or pure-LTR-only strings render fine as-is.
 */
function drawMixedRight(doc, hebrewPart, ltrPart, x, y, width, font, size, color) {
  doc.font(font).fontSize(size).fillColor(color);
  const sep = hebrewPart && ltrPart ? ' ' : '';
  const hebW = hebrewPart ? doc.widthOfString(hebrewPart, { features: ['rtla'] }) : 0;
  const ltrW = ltrPart ? doc.widthOfString(ltrPart) : 0;
  const sepW = sep ? doc.widthOfString(sep) : 0;
  const totalW = hebW + sepW + ltrW;
  let cursor = x + width - totalW;
  if (hebrewPart) {
    doc.text(hebrewPart, cursor, y, { features: ['rtla'], lineBreak: false });
    cursor += hebW + sepW;
  }
  if (ltrPart) {
    doc.text(ltrPart, cursor, y, { lineBreak: false });
  }
}

/**
 * Builds a one-page PDF ticket for "סמינר להיות מותג" and resolves to a Buffer.
 * NOTE: the venue address is intentionally left as a placeholder line - there is no
 * exact street address anywhere in the real page content to pull from (only "בני ברק"
 * at the city level). Do not fill in a guessed address; get the real one from Maya
 * before this goes out to real customers.
 */
function buildTicketPdf({ fullName, ticketType, orderId, isCouple }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('Assistant', path.join(FONT_DIR, 'Assistant-Regular.ttf'));
    doc.registerFont('Assistant-Bold', path.join(FONT_DIR, 'Assistant-Bold.ttf'));

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const left = 60;
    const right = pageW - 60;
    const colW = right - left;

    // top banner
    doc.rect(0, 0, pageW, 170).fill(PURPLE_DEEP);
    doc.fillColor(GOLD).font('Assistant-Bold').fontSize(28)
      .text('סמינר להיות מותג', 0, 55, { align: 'center', width: pageW, features: ['rtla'] });
    doc.fillColor('#ffffff').font('Assistant').fontSize(13)
      .text('כרטיס כניסה', 0, 100, { align: 'center', width: pageW, features: ['rtla'] });
    doc.fillColor('rgba(255,255,255,0.75)').fontSize(11)
      .text('עם מאיה קיסלב', 0, 122, { align: 'center', width: pageW, features: ['rtla'] });

    let y = 210;
    function labelLine(label) {
      doc.fillColor(INK_DIM).font('Assistant').fontSize(10)
        .text(label, left, y, { width: colW, align: 'right', features: ['rtla'] });
      y += 16;
    }
    function row(label, hebrewPart, ltrPart) {
      labelLine(label);
      drawMixedRight(doc, hebrewPart, ltrPart, left, y, colW, 'Assistant-Bold', 15, INK);
      y += 34;
    }

    row('שם', fullName || '-', '');
    row('תאריך', 'יום חמישי,', '3.9.2026');
    row('שעה', '', '15:30–21:00');
    row('מיקום', 'בני ברק - הכתובת המדויקת תישלח בהודעה נפרדת סמוך לאירוע', '');
    row('סוג כרטיס', isCouple ? 'כרטיס זוגי' : (ticketType || 'כרטיס יחיד'), '');
    if (orderId) row('מספר הזמנה', '', orderId);

    doc.moveTo(left, y).lineTo(right, y).strokeColor('#e5ddf0').stroke();
    y += 24;
    doc.fillColor(INK_DIM).font('Assistant').fontSize(10).text(
      'שאלות לפני האירוע? אפשר לכתוב בוואטסאפ או במייל - נשמח לעזור.',
      left, y, { width: colW, align: 'right', features: ['rtla'] }
    );

    // bottom gold strip
    doc.rect(0, pageH - 14, pageW, 14).fill(GOLD);

    doc.end();
  });
}

module.exports = { buildTicketPdf };
