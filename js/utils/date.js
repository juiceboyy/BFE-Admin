/**
 * js/utils/date.js
 * Bevat datum-gerelateerde hulpfuncties voor de boekhouding.
 */

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

export function getTargetDateInfo() {
    const now = new Date();
    let targetMonthIndex = now.getMonth() - 1;
    let targetYear = now.getFullYear();

    if (targetMonthIndex < 0) {
        targetMonthIndex = 11;
        targetYear -= 1;
    }

    const prevMonthIndex = targetMonthIndex === 0 ? 11 : targetMonthIndex - 1;

    return {
        targetSheet: `${MONTH_NAMES[targetMonthIndex]} Inkoop`,
        prevSheet: `${MONTH_NAMES[prevMonthIndex]} Inkoop`,
        targetYear: targetYear,
        targetMonthNum: targetMonthIndex + 1
    };
}

export function isDateValidForPeriod(dateStr, targetYear, targetMonthNum) {
    if (!dateStr) return true;
    const [year, month] = dateStr.split('-');
    return parseInt(year, 10) === targetYear && parseInt(month, 10) === targetMonthNum;
}
